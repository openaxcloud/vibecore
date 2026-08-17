import { hashPassword } from '@vibecore/auth';
import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

import { eraseSubjectStorage } from '../account-storage-purge.js';
import { PrismaApiStore } from '../prisma-store.js';

/*
 * PR #52 — interleaving proofs for the expert reserves, on a REAL Postgres.
 *
 * These do NOT go through an injected eraser that installs its own guards (the
 * T22 trap): they drive the REAL `eraseSubjectStorage` / the REAL
 * `acquirePurgeGuarantee` / the REAL finalize transaction, and only the storage
 * PORTS are faked — so the guard under test is the production one, at its
 * production call site.
 *
 * Each race is made deterministic with a seam that fires exactly in the window
 * the reserve describes, and the competing mutation runs on a SECOND, fully
 * independent Prisma client (its own connection), so the interleaving is real
 * concurrency and not a same-transaction illusion.
 */

const TEST_LEASE = { ttlMs: 30 * 60 * 1000, renewIntervalMs: 5 * 60 * 1000, reclaimGraceMs: 0 };
const newStore = (prisma: ReturnType<typeof createDatabaseClient>) => new PrismaApiStore(prisma, undefined, TEST_LEASE);
const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function canReachDatabase() {
  if (!process.env.DATABASE_URL) {
    return false;
  }

  const prisma = createDatabaseClient();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

const dbReachable = await canReachDatabase();

async function seedSubject(store: PrismaApiStore) {
  const tag = suffix();

  const user = await store.createUser({
    email: `interleave-${tag}@example.com`,
    name: 'Interleave',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({
    name: `Interleave Org ${tag}`,
    slug: `interleave-org-${tag}`,
    ownerUserId: user.id,
  });
  const project = await store.createProject({
    organizationId: org.id,
    name: `Secret ${tag}`,
    slug: `secret-${tag}`,
  });

  return { user, org, project };
}

/*
 * `eraseStorage` as the route supplies it: it drives the REAL
 * `eraseSubjectStorage` and threads through the guard the STORE handed us — it
 * does NOT install a guard of its own (the T22 trap). Storage ports are fakes;
 * the lease logic under test is production code.
 */
function realErasureDep() {
  return async (
    inventory: { bucketProjectIds: string[]; workspaceProjectIds: string[] },
    guard?: () => Promise<void>,
  ) => {
    const outcome = await eraseSubjectStorage(
      {
        bucketProjectIds: inventory.bucketProjectIds,
        workspaceIds: inventory.workspaceProjectIds.map((id) => `ws-${id}`),
      },
      {
        guard,
        writeBarrier: { async freeze() {} },
        objectStorage: {
          active: true,
          async bucketExists() {
            return false;
          },
          async listObjects() {
            return { objects: [] };
          },
          async deleteBucket() {
            return { deleted: true, bucket: 'b' };
          },
        },
        workspaceVolumes: {
          async pvcExists() {
            return false;
          },
          async deleteWorkspace() {},
        },
      },
    );

    void outcome;

    return { classes: [], verified: true };
  };
}

describe.skipIf(!dbReachable)('PR #52 — interleaving proofs (real Postgres)', () => {
  /*
   * Reserve #3a / T21. The lease already lapsed, so renewal must be REFUSED —
   * a resurrection would revive an owner the workspace-manager already reports
   * dead, after its stale-freeze reconciler may have lifted the purge barrier.
   */
  it('T21 — renewing an ALREADY-EXPIRED lease returns null and leaves the row untouched', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = newStore(prisma);
      const { user } = await seedSubject(store);
      const expiredAt = new Date(Date.now() - 10_000);

      const plan = await prisma.purgePlan.create({
        data: { userId: user.id, ownerToken: `token-${suffix()}`, leaseExpiresAt: expiredAt },
      });

      const renewed = await store.renewPurgeLease(plan.id, plan.ownerToken, plan.version);

      expect(renewed).toBeNull();

      const after = (await prisma.purgePlan.findUnique({ where: { id: plan.id } }))!;

      expect(after.version).toBe(plan.version);
      expect(after.leaseExpiresAt.getTime()).toBe(expiredAt.getTime());
    } finally {
      await prisma.$disconnect();
    }
  });

  /*
   * Reserve #1. The guard must sit at the LINEARISATION POINT — after the reads,
   * immediately before the irreversible delete. We kill the lease DURING the
   * reads: a guard placed before them would not see the loss and would delete.
   */
  it('#1 — a lease lost DURING the reads aborts before any bucket or PVC is deleted', async () => {
    const prisma = createDatabaseClient();
    const other = createDatabaseClient();

    try {
      const store = newStore(prisma);
      const { user, project } = await seedSubject(store);

      const plan = await prisma.purgePlan.create({
        data: { userId: user.id, ownerToken: `token-${suffix()}`, leaseExpiresAt: new Date(Date.now() + 30 * 60_000) },
      });

      const calls: string[] = [];

      // Kill the lease from an INDEPENDENT connection, during the first read.
      const killLeaseOnce = (() => {
        let done = false;

        return async () => {
          if (done) {
            return;
          }

          done = true;
          await other.purgePlan.update({
            where: { id: plan.id },
            data: { leaseExpiresAt: new Date(Date.now() - 1000) },
          });
        };
      })();

      const guard = async () => {
        const row = await prisma.purgePlan.findFirst({
          where: { id: plan.id, ownerToken: plan.ownerToken, status: 'ACTIVE' },
        });

        if (!row || row.leaseExpiresAt.getTime() <= Date.now()) {
          throw new Error('PURGE_LEASE_LOST');
        }
      };

      const outcome = eraseSubjectStorage(
        { bucketProjectIds: [project.id], workspaceIds: [`ws-${project.id}`] },
        {
          guard,

          /*
           * A barrier must be present or the module fails closed to an empty
           * outcome and never reaches the reads we are exercising.
           */
          writeBarrier: { async freeze() {} },
          objectStorage: {
            active: true,
            async bucketExists() {
              calls.push('bucketExists');
              await killLeaseOnce();

              return true;
            },
            async listObjects() {
              calls.push('listObjects');

              return { objects: [{ key: 'secret.bin' }] };
            },
            async deleteBucket() {
              calls.push('deleteBucket');

              return { deleted: true, bucket: 'b' };
            },
          },
          workspaceVolumes: {
            async pvcExists() {
              calls.push('pvcExists');

              return true;
            },
            async deleteWorkspace() {
              calls.push('deleteWorkspace');
            },
          },
        },
      );

      await expect(outcome).rejects.toThrow(/PURGE_LEASE_LOST/);

      // The proof: the reads happened, the destructive calls did NOT.
      expect(calls).toContain('bucketExists');
      expect(calls).not.toContain('deleteBucket');
      expect(calls).not.toContain('deleteWorkspace');
    } finally {
      await prisma.$disconnect();
      await other.$disconnect();
    }
  });

  /*
   * Reserve #2. The inline reclaim reads the existing plan, then deletes it
   * conditionally. If the legitimate owner renews in between, the conditional
   * DELETE must match 0 rows and the acquisition must REFUSE — never delete a
   * renewed plan by id and start a second physical erasure.
   */
  it('#2 — an owner renewing between the read and the inline reclaim blocks the second purge', async () => {
    const prisma = createDatabaseClient();
    const other = createDatabaseClient();

    try {
      const store = newStore(prisma);
      const { user } = await seedSubject(store);

      // Expired well past the (zero) grace, so the reclaim WOULD fire unguarded.
      const plan = await prisma.purgePlan.create({
        data: { userId: user.id, ownerToken: `token-${suffix()}`, leaseExpiresAt: new Date(Date.now() - 60_000) },
      });

      const requestedAt = new Date(Date.now() - 60 * 24 * 3600_000).toISOString();
      await prisma.user.update({
        where: { id: user.id },
        data: { preferences: { accountDeletion: { requestedAt } } },
      });

      /*
       * The competing write is the owner's HEARTBEAT landing in the window: it
       * pushes the lease into the future and bumps the version, exactly what
       * renewPurgeLease does. We issue it as SQL from the other connection
       * rather than calling renewPurgeLease, because reserve #3a (already in
       * place) forbids reviving an ALREADY-EXPIRED lease — the two guards
       * compose, so the only way to model a LIVE owner racing a reclaim is the
       * write itself. What is under test here is the reclaim CAS, not the renew.
       */
      const renewedLease = new Date(Date.now() + 30 * 60_000);

      store.purgeTestHooks = {
        onExistingPlanRead: async () => {
          await other.purgePlan.update({
            where: { id: plan.id },
            data: { leaseExpiresAt: renewedLease, version: { increment: 1 } },
          });
        },
      };

      await expect(store.purgeUserAccount({ userId: user.id }, { eraseStorage: realErasureDep() })).rejects.toThrow(
        /PURGE_ALREADY_ACTIVE/,
      );

      /*
       * The renewal won: the plan is intact, unique, still the owner's, and the
       * conditional DELETE matched 0 rows instead of reclaiming a live plan.
       */
      const plans = await prisma.purgePlan.findMany({ where: { userId: user.id } });

      expect(plans).toHaveLength(1);
      expect(plans[0]!.id).toBe(plan.id);
      expect(plans[0]!.ownerToken).toBe(plan.ownerToken);
      expect(plans[0]!.version).toBe(plan.version + 1);
      expect(plans[0]!.leaseExpiresAt.getTime()).toBe(renewedLease.getTime());
    } finally {
      await prisma.$disconnect();
      await other.$disconnect();
    }
  });

  /*
   * Reserve #3b. Between the last guard and the COMMIT, nothing held the
   * PurgePlan row: a reconciler could steal the plan and the tombstone would
   * still be stamped. The finalize tx must re-check under a row lock held to
   * commit, so a loss in that window rolls the whole tx back — no tombstone, no
   * erasure proof, account left re-queued.
   */
  it('#3b — a lease lost after the last guard but before commit rolls back the tombstone', async () => {
    const prisma = createDatabaseClient();
    const other = createDatabaseClient();

    try {
      const store = newStore(prisma);
      const { user } = await seedSubject(store);

      const requestedAt = new Date(Date.now() - 60 * 24 * 3600_000).toISOString();
      await prisma.user.update({
        where: { id: user.id },
        data: { preferences: { accountDeletion: { requestedAt } } },
      });

      store.purgeTestHooks = {
        /*
         * Inside the finalize tx, after the guard, before the locked re-check:
         * an independent connection steals the plan.
         */
        onFinalizePreTombstone: async () => {
          await other.purgePlan.updateMany({
            where: { userId: user.id },
            data: { leaseExpiresAt: new Date(Date.now() - 1000), status: 'ABANDONED' },
          });
        },
      };

      await expect(store.purgeUserAccount({ userId: user.id }, { eraseStorage: realErasureDep() })).rejects.toThrow();

      // The tombstone was NOT stamped and the account is still purgeable.
      const after = (await prisma.user.findUnique({ where: { id: user.id } }))!;

      const deletion = ((after.preferences ?? {}) as Record<string, unknown>).accountDeletion as
        | { requestedAt?: string; purgedAt?: string }
        | undefined;

      expect(deletion?.purgedAt).toBeUndefined();
      expect(deletion?.requestedAt).toBe(requestedAt);
      expect(after.email).not.toMatch(/^deleted-/);
    } finally {
      await prisma.$disconnect();
      await other.$disconnect();
    }
  });
});
