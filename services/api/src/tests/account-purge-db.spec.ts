import { hashPassword } from '@vibecore/auth';
import { createDatabaseClient } from '@vibecore/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ErasureProof, PurgeStorageInventory } from '../account-purge.js';
import { eraseSubjectStorage } from '../account-storage-purge.js';
import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { PrismaApiStore } from '../prisma-store.js';

/*
 * Physical-erasure hook for these real-Postgres route tests. It drives the REAL
 * eraseProjectsStorage orchestration against in-memory fake storage seeded with
 * a bucket + workspace per project — so the route's fail-closed physical gate is
 * genuinely exercised (list → delete → verify 0) WITHOUT a live workspace-manager
 * / GCS. The SQL assertions below verify the row-level purge; the physical proof
 * has its own dedicated suites. Without this, the route's default eraser would
 * fetch a non-existent workspace-manager and (correctly) fail the purge closed.
 */
function verifiedPhysicalPurger() {
  return (inventory: PurgeStorageInventory) => {
    const buckets = new Map<string, string[]>();
    const pvcs = new Set<string>();
    let frozen = false;

    for (const id of inventory.bucketProjectIds) {
      buckets.set(id, ['seed-object.bin']);
    }

    const workspaceIds = inventory.workspaceProjectIds.map((id) => `ws-${id}`);

    for (const wsId of workspaceIds) {
      pvcs.add(wsId);
    }

    return eraseSubjectStorage(
      { bucketProjectIds: inventory.bucketProjectIds, workspaceIds },
      {
        writeBarrier: {
          async freeze() {
            frozen = true;
          },
        },
        objectStorage: {
          active: true,
          async bucketExists(projectId) {
            return buckets.has(projectId);
          },
          async listObjects(projectId) {
            return { objects: (buckets.get(projectId) ?? []).map((key) => ({ key })) };
          },
          async deleteBucket(projectId) {
            // Only allow deletion after the write barrier (reserve #1).
            if (frozen) {
              buckets.delete(projectId);
            }

            return { deleted: frozen, bucket: `vc-${projectId}` };
          },
        },
        workspaceVolumes: {
          async pvcExists(workspaceId) {
            return pvcs.has(workspaceId);
          },
          async deleteWorkspace(workspaceId) {
            if (frozen) {
              pvcs.delete(workspaceId);
            }
          },
        },
      },
    );
  };
}

/*
 * §16.12 purge executor — DURABLE proofs against a REAL Postgres. Gated on
 * DATABASE_URL like the other DB-backed suites (ledger-store-db.spec.ts):
 * runs in CI and locally against a migrated Postgres, silently skips otherwise.
 *
 * Proves, with real SQL state:
 *   (1) full account purge: data seeded across classes (session, org, project,
 *       import, AI conversation+message, usage event, audit trail) → deletion
 *       requested → grace window elapsed by REWRITING the requestedAt
 *       timestamp in the DB (never the clock) → worker route executed →
 *       per-class "0 rows remaining" SQL verification → erasure proof re-read
 *       from the AdminAuditLog table;
 *   (2) refusal while the window has not elapsed (negative);
 *   (3) idempotence: a re-run on a purged account is a no-op;
 *   (4) concurrency: two INDEPENDENT Prisma clients racing on the same user
 *       yield exactly one purge (advisory-lock serialization);
 *   (5) fail-closed retention: a posted double-entry ledger transaction
 *       (immutability triggers, mig 0078) survives the purge and is consigned.
 */

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

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const runDbTests = (await canReachDatabase()) ? describe : describe.skip;

const DAY = 24 * 60 * 60 * 1000;
const SECRET = 'purge-db-internal-secret';
const suffix = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// RR-CODEX-12: default lease timing for the purge tests. TTL is long enough that a
// loaded CI box can't stall the event loop past it (no spurious lease expiry);
// renewIntervalMs << ttlMs; grace guards clock lag on reclaim.
const TEST_LEASE = { ttlMs: 30_000, renewIntervalMs: 5_000, reclaimGraceMs: 1_000 };
// Short-TTL store used ONLY by T19 (which needs the erasure to outlast the TTL).
const SHORT_LEASE = { ttlMs: 600, renewIntervalMs: 100, reclaimGraceMs: 200 };
const newStore = (prisma: ReturnType<typeof createDatabaseClient>) =>
  new PrismaApiStore(prisma, undefined, TEST_LEASE);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Seed a user with rows in every purgeable class. Returns ids for later SQL checks. */
async function seedAccount(store: PrismaApiStore) {
  const tag = suffix();
  const user = await store.createUser({
    email: `purge-${tag}@example.com`,
    name: 'Purge Db',
    passwordHash: hashPassword('password123'),
  });
  await store.createSession({ userId: user.id, token: `tok-${tag}`, expiresAt: new Date(Date.now() + 3600_000) });

  const org = await store.createOrganization({ name: `Purge Org ${tag}`, slug: `purge-org-${tag}`, ownerUserId: user.id });
  const project = await store.createProject({ organizationId: org.id, name: `Secret ${tag}`, slug: `secret-${tag}` });
  const importJob = await store.createImportJob({ organizationId: org.id, actorUserId: user.id, provider: 'zip' });
  const conversation = await store.createAiConversation({ projectId: project.id, userId: user.id, title: 'chat' });
  await store.createAiMessage({ conversationId: conversation.id, role: 'user', content: 'hello purge' });
  await store.recordUsageEvent({ organizationId: org.id, userId: user.id, type: 'ai.tokens', quantity: 7 });
  await store.recordAudit({
    actorUserId: user.id,
    action: 'project.created',
    resourceType: 'project',
    resourceId: project.id,
    ipAddress: '203.0.113.9',
    metadata: { name: `Secret ${tag}` },
  });

  return { user, org, project, importJob, conversation, tag };
}

/** Mark deletion requested, then rewind requestedAt IN THE DB (never the clock). */
async function requestElapsedDeletion(store: PrismaApiStore, userId: string, daysAgo = 15) {
  const user = (await store.findUserById(userId))!;
  const requestedAt = new Date(Date.now() - daysAgo * DAY).toISOString();
  await store.updateUser({
    userId,
    preferences: { ...(user.preferences ?? {}), accountDeletion: { requestedAt } },
  });
  await store.mutateSystemSettingIds('account.pendingDeletionUserIds', { add: userId });
}

runDbTests('account purge — durable proofs (real Postgres)', () => {
  // The reconciler is GLOBAL (reclaims every expired plan), so leftover PurgePlan /
  // PurgeFreeze rows from a prior test would pollute the reconcile-count assertions.
  // Isolate each test with a clean plan/freeze table.
  beforeEach(async () => {
    const p = createDatabaseClient();

    try {
      await p.purgeFreeze.deleteMany({});
      await p.purgePlan.deleteMany({});
      await p.purgeReceipt.deleteMany({});
    } finally {
      await p.$disconnect();
    }
  });

  it('(2 NEGATIVE first) refuses while the grace window has not elapsed', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = newStore(prisma);
      const { user } = await seedAccount(store);
      await requestElapsedDeletion(store, user.id, 2); // only 2 days in

      const result = await store.purgeUserAccount({ userId: user.id });
      expect(result.outcome).toBe('not_due');

      // Untouched: session + conversation still present in SQL.
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
      expect(await prisma.aiConversation.count({ where: { userId: user.id } })).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(1+3) purges for real, verifies 0 rows per class in SQL, persists a re-readable proof, then no-ops', async () => {
    const previousSecret = process.env.INTERNAL_API_SHARED_SECRET;
    process.env.INTERNAL_API_SHARED_SECRET = SECRET;
    const prisma = createDatabaseClient();

    try {
      const store = newStore(prisma);
      const app = await buildApiApp({
        store,
        emailProvider: new QuietEmailProvider(),
        accountStoragePurger: verifiedPhysicalPurger(),
      });
      const { user, org, project, importJob, conversation } = await seedAccount(store);
      await requestElapsedDeletion(store, user.id);

      const res = await app.inject({
        method: 'POST',
        url: '/internal/account-purge',
        headers: { authorization: `Bearer ${SECRET}` },
        payload: { enabled: true, userId: user.id },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ready: 1, purged: 1, failed: 0 });

      // ---- per-class SQL verification: 0 rows remaining ----
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
      expect(await prisma.aiConversation.count({ where: { userId: user.id } })).toBe(0);
      expect(await prisma.aiMessage.count({ where: { conversationId: conversation.id } })).toBe(0);
      expect(await prisma.project.count({ where: { id: project.id } })).toBe(0);
      expect(await prisma.importJob.count({ where: { id: importJob.id } })).toBe(0);
      expect(await prisma.organizationMember.count({ where: { userId: user.id } })).toBe(0);
      expect(await prisma.apiKey.count({ where: { userId: user.id } })).toBe(0);
      expect(await prisma.oAuthConnection.count({ where: { userId: user.id } })).toBe(0);

      // ---- anonymized, not deleted ----
      const tombstone = await prisma.user.findUnique({ where: { id: user.id } });
      expect(tombstone).toBeTruthy();
      expect(tombstone!.email).toBe(`purged-${user.id}@erased.invalid`);
      expect(tombstone!.name).toBeNull();
      expect(tombstone!.passwordHash).toBeNull();

      const orgShell = await prisma.organization.findUnique({ where: { id: org.id } });
      expect(orgShell!.name).toBe('Purged account');
      expect(orgShell!.slug).toBe(`purged-${org.id}`);

      // Financial record retained (7-year fail-closed), detached from the user.
      const usage = await prisma.usageEvent.findMany({ where: { organizationId: org.id } });
      expect(usage.length).toBe(1);
      expect(usage[0]!.userId).toBeNull();

      // Audit trail redacted in place, rows preserved.
      const audits = await prisma.auditLog.findMany({ where: { actorUserId: user.id } });
      expect(audits.length).toBeGreaterThanOrEqual(1);

      for (const row of audits) {
        expect(row.ipAddress).toBeNull();
        expect((row.metadata as { redacted?: boolean }).redacted).toBe(true);
      }

      // ---- the proof, re-read from the DB ----
      const proofRow = await prisma.adminAuditLog.findFirst({
        where: { action: 'account.purge_completed', metadata: { path: ['userId'], equals: user.id } },
        orderBy: { createdAt: 'desc' },
      });
      expect(proofRow).toBeTruthy();

      const proof = (proofRow!.metadata as unknown as { proof: ErasureProof }).proof;
      expect(proof.kind).toBe('account-erasure-proof');
      expect(proof.verifiedZeroRemaining).toBe(true);
      expect(proof.classes.filter((c) => c.action === 'deleted').every((c) => c.remainingAfterPurge === 0)).toBe(true);
      expect(proof.exceptions.some((e) => e.dataClass === 'financial_records')).toBe(true);

      // ---- (3) idempotence: re-run is a proven no-op ----
      const again = await store.purgeUserAccount({ userId: user.id });
      expect(again.outcome).toBe('already_purged');

      const proofCount = await prisma.adminAuditLog.count({
        where: { action: 'account.purge_completed', metadata: { path: ['userId'], equals: user.id } },
      });
      expect(proofCount).toBe(1);
    } finally {
      process.env.INTERNAL_API_SHARED_SECRET = previousSecret;
      await prisma.$disconnect();
    }
  });

  it('(4) two INDEPENDENT clients racing on the same user yield exactly one purge', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();

    try {
      const storeA = newStore(prismaA);
      const storeB = newStore(prismaB);
      const { user } = await seedAccount(storeA);
      await requestElapsedDeletion(storeA, user.id);

      const [a, b] = await Promise.all([
        storeA.purgeUserAccount({ userId: user.id }),
        storeB.purgeUserAccount({ userId: user.id }),
      ]);
      expect([a.outcome, b.outcome].sort()).toEqual(['already_purged', 'purged']);

      // Single tombstone; the account was erased once.
      expect(await prismaA.session.count({ where: { userId: user.id } })).toBe(0);
    } finally {
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('(5) a POSTED ledger transaction survives the purge (mig 0078 immutability) and is consigned', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = newStore(prisma);
      const { user, org } = await seedAccount(store);

      // Post a balanced double-entry transaction for the user's org.
      const account = await prisma.ledgerAccount.create({
        data: { organizationId: org.id, key: 'user_credits', type: 'LIABILITY', currency: 'usd' },
      });
      const contra = await prisma.ledgerAccount.create({
        data: { organizationId: org.id, key: 'revenue', type: 'REVENUE', currency: 'usd' },
      });
      const posted = await prisma.ledgerTransaction.create({
        data: {
          organizationId: org.id,
          reason: 'purge.test',
          entries: {
            create: [
              { accountId: account.id, direction: 'DEBIT', amountMinor: 100n, currency: 'usd' },
              { accountId: contra.id, direction: 'CREDIT', amountMinor: 100n, currency: 'usd' },
            ],
          },
        },
      });

      await requestElapsedDeletion(store, user.id);
      const result = await store.purgeUserAccount({ userId: user.id });
      expect(result.outcome).toBe('purged');

      if (result.outcome === 'purged') {
        const ledger = result.proof.classes.find((entry) => entry.dataClass === 'ledger')!;
        expect(ledger.action).toBe('retained');
        expect(ledger.reason).toBe('ledger_immutable_posted_entries_mig0078');
        expect(ledger.models.LedgerTransaction).toBe(1);
        expect(result.proof.exceptions.some((e) => e.dataClass === 'ledger')).toBe(true);
      }

      // The posted transaction is still there…
      expect(await prisma.ledgerTransaction.count({ where: { id: posted.id } })).toBe(1);

      // …and the DB trigger still refuses a DELETE outright.
      await expect(prisma.ledgerTransaction.delete({ where: { id: posted.id } })).rejects.toThrow(/append-only/);
    } finally {
      await prisma.$disconnect();
    }
  });

  /*
   * RR-09 — the topology GUARANTEE is acquired BEFORE the irreversible external
   * erasure: membership + object storage are frozen and the authoritative
   * sole/shared topology is recorded atomically under the advisory lock. So the
   * deletion only ever touches buckets that are sole UNDER THE LOCK, membership
   * cannot flip while the erasure runs, and the freeze is released on every exit.
   * The `eraseStorage` hook is the during-erasure window (it runs after the
   * guarantee, before the finalize tx), so membership mutations attempted inside
   * it must be refused.
   */

  const MEMBERSHIP_FREEZE_LOCK = 'purge:membership-freeze';
  type Db = ReturnType<typeof createDatabaseClient>;

  // RR-1bd27929: a resource is frozen iff >= 1 PurgeFreeze row references it.
  async function membershipFrozen(prisma: Db, orgId: string): Promise<boolean> {
    return (await prisma.purgeFreeze.count({ where: { resourceType: 'membership', resourceId: orgId } })) > 0;
  }

  async function objectStorageFrozen(prisma: Db, projectId: string): Promise<boolean> {
    return (await prisma.purgeFreeze.count({ where: { resourceType: 'objectStorage', resourceId: projectId } })) > 0;
  }

  async function planFor(prisma: Db, userId: string) {
    return prisma.purgePlan.findFirst({ where: { userId } });
  }

  // Seed a PurgePlan (+ its PurgeFreeze rows) directly — models a crashed/abandoned
  // run. `leaseExpiresAt` in the past = reclaimable by the reconciler.
  async function seedPlan(
    prisma: Db,
    userId: string,
    orgIds: string[],
    projectIds: string[],
    opts?: { leaseExpiresAt?: Date; ownerToken?: string },
  ) {
    const plan = await prisma.purgePlan.create({
      data: {
        userId,
        ownerToken: opts?.ownerToken ?? `token-${suffix()}`,
        leaseExpiresAt: opts?.leaseExpiresAt ?? new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    const rows = [
      ...orgIds.map((id) => ({ planId: plan.id, resourceType: 'membership', resourceId: id })),
      ...projectIds.map((id) => ({ planId: plan.id, resourceType: 'objectStorage', resourceId: id })),
    ];

    if (rows.length > 0) {
      await prisma.purgeFreeze.createMany({ data: rows });
    }

    return plan;
  }

  async function makeShared(store: PrismaApiStore, prisma: ReturnType<typeof createDatabaseClient>, orgId: string, ownerUserId: string) {
    const owner = (await prisma.organizationMember.findFirst({ where: { organizationId: orgId, userId: ownerUserId } }))!;
    const co = await store.createUser({
      email: `co-${suffix()}@example.com`,
      name: 'Co Member',
      passwordHash: hashPassword('password123'),
    });
    await prisma.organizationMember.create({ data: { organizationId: orgId, userId: co.id, roleId: owner.roleId } });

    return co;
  }

  it('(6) sole→shared: a bucket shared under the guarantee is NEVER erased (bucket survives)', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = newStore(prisma);
      const { user, org, project } = await seedAccount(store);
      await makeShared(store, prisma, org.id, user.id); // org is SHARED at guarantee time
      await requestElapsedDeletion(store, user.id);

      let captured: PurgeStorageInventory | undefined;
      const eraseStorage = async (inv: PurgeStorageInventory) => {
        captured = inv;

        return { classes: [], verified: true };
      };

      const result = await store.purgeUserAccount({ userId: user.id }, { eraseStorage });
      expect(result.outcome).toBe('purged');

      // The shared org's bucket is NEVER handed to the erasure → never deleted.
      expect(captured!.bucketProjectIds).not.toContain(project.id);
      // The shared org + its project survive (retained for the co-member).
      expect(await prisma.project.count({ where: { id: project.id } })).toBe(1);
      expect(await prisma.organization.count({ where: { id: org.id } })).toBe(1);
      // No residual freeze after the successful purge.
      expect(await objectStorageFrozen(prisma, project.id)).toBe(false);
      expect(await membershipFrozen(prisma, org.id)).toBe(false);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(7) shared→sole is PREVENTED: a co-member cannot leave while the org is purge-frozen', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = newStore(prisma);
      const { user, org } = await seedAccount(store);
      const co = await makeShared(store, prisma, org.id, user.id);
      await requestElapsedDeletion(store, user.id);

      let leaveError: unknown;
      const eraseStorage = async () => {
        // Co-member tries to leave during the erasure → must be REFUSED.
        leaveError = await store
          .removeMember(org.id, co.id)
          .then(() => null)
          .catch((e) => e);

        return { classes: [], verified: true };
      };

      const result = await store.purgeUserAccount({ userId: user.id }, { eraseStorage });
      expect(result.outcome).toBe('purged');
      expect(String(leaveError)).toMatch(/MEMBERSHIP_FROZEN_FOR_PURGE/);
      // The leave was blocked → the co-member is still a member.
      expect(await prisma.organizationMember.count({ where: { organizationId: org.id, userId: co.id } })).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(8) sole→shared is PREVENTED: a new member cannot join while the org is purge-frozen', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = newStore(prisma);
      const { user, org, project } = await seedAccount(store); // SOLE org
      const joiner = await store.createUser({
        email: `join-${suffix()}@example.com`,
        name: 'Late Joiner',
        passwordHash: hashPassword('password123'),
      });
      await requestElapsedDeletion(store, user.id);

      let joinError: unknown;
      let captured: PurgeStorageInventory | undefined;
      const eraseStorage = async (inv: PurgeStorageInventory) => {
        captured = inv;
        joinError = await store
          .addMember({ organizationId: org.id, userId: joiner.id, roleKey: 'member' })
          .then(() => null)
          .catch((e) => e);

        return { classes: [], verified: true };
      };

      const result = await store.purgeUserAccount({ userId: user.id }, { eraseStorage });
      expect(result.outcome).toBe('purged');
      expect(String(joinError)).toMatch(/MEMBERSHIP_FROZEN_FOR_PURGE/);
      // The join was blocked → the sole bucket was correctly in the erase set.
      expect(captured!.bucketProjectIds).toContain(project.id);
      expect(await prisma.organizationMember.count({ where: { organizationId: org.id, userId: joiner.id } })).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(9) NO residual freeze after a FAILED purge (guaranteed release on throw)', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = newStore(prisma);
      const { user, org, project } = await seedAccount(store);
      await requestElapsedDeletion(store, user.id);

      // Physical erasure reports NOT verified → the purge throws fail-closed.
      const eraseStorage = async () => ({ classes: [], verified: false });

      await expect(store.purgeUserAccount({ userId: user.id }, { eraseStorage })).rejects.toThrow(
        /ACCOUNT_PURGE_PHYSICAL_INCOMPLETE/,
      );

      // RR-09 (6): both freeze sets released, plan cleared — nothing left behind.
      expect(await membershipFrozen(prisma, org.id)).toBe(false);
      expect(await objectStorageFrozen(prisma, project.id)).toBe(false);
      expect(await planFor(prisma, user.id)).toBeNull();
      // The org is writable again: a member can join now that the freeze is gone.
      const joiner = await store.createUser({
        email: `after-${suffix()}@example.com`,
        name: 'After',
        passwordHash: hashPassword('password123'),
      });
      await expect(store.addMember({ organizationId: org.id, userId: joiner.id, roleKey: 'member' })).resolves.toBeTruthy();
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(10) reconciler releases a freeze left behind by a crashed run (recoverable state machine)', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = newStore(prisma);
      const { user, org, project } = await seedAccount(store);

      // Simulate a crash mid-erasure: an ABANDONED plan (lease already expired) +
      // its freeze rows persisted but never released.
      await seedPlan(prisma, user.id, [org.id], [project.id], { leaseExpiresAt: new Date(Date.now() - 60_000) });

      // The org is frozen — a join is refused…
      const joiner = await store.createUser({
        email: `recon-${suffix()}@example.com`,
        name: 'Recon',
        passwordHash: hashPassword('password123'),
      });
      await expect(store.addMember({ organizationId: org.id, userId: joiner.id, roleKey: 'member' })).rejects.toThrow(
        /MEMBERSHIP_FROZEN_FOR_PURGE/,
      );

      // …until the reconciler releases the stale freeze.
      const { reconciled } = await store.reconcilePurgeFreezes();
      expect(reconciled).toBeGreaterThanOrEqual(1);
      expect(await membershipFrozen(prisma, org.id)).toBe(false);
      expect(await objectStorageFrozen(prisma, project.id)).toBe(false);
      expect(await planFor(prisma, user.id)).toBeNull();
      await expect(store.addMember({ organizationId: org.id, userId: joiner.id, roleKey: 'member' })).resolves.toBeTruthy();
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(11) CODEX-10: a join in the read→freeze window is reflected in the plan (bucket excluded, never erased)', async () => {
    const prisma = createDatabaseClient(); // seed + assertions
    const prismaA = createDatabaseClient(); // the racing mutation: holds the freeze-set lock FIRST
    const prismaB = createDatabaseClient(); // the purge
    const prismaC = createDatabaseClient(); // pg_locks poller

    const MEMBERSHIP_LOCK = MEMBERSHIP_FREEZE_LOCK;

    try {
      const store = newStore(prisma);
      const storeB = newStore(prismaB);
      const { user, org, project } = await seedAccount(store); // SOLE org + bucket
      const owner = (await prisma.organizationMember.findFirst({
        where: { organizationId: org.id, userId: user.id },
      }))!;
      const joiner = await store.createUser({
        email: `race-${suffix()}@example.com`,
        name: 'Racer',
        passwordHash: hashPassword('password123'),
      });
      await requestElapsedDeletion(store, user.id);

      /*
       * Connection A grabs the SAME membership freeze-set advisory lock the
       * guarantee needs, BEFORE the purge starts, then — on signal — adds a member
       * and commits. This is exactly "a mutation that slipped into the read→freeze
       * window". Because the guarantee now takes that lock BEFORE reading topology,
       * the purge blocks until A commits, so A's join is REFLECTED in the topology.
       */
      let signalHeld!: () => void;
      const held = new Promise<void>((resolve) => (signalHeld = resolve));
      let go!: () => void;
      const proceed = new Promise<void>((resolve) => (go = resolve));

      const aTx = prismaA.$transaction(
        async (txA) => {
          await txA.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', MEMBERSHIP_LOCK);
          signalHeld();
          await proceed;
          await txA.organizationMember.create({
            data: { organizationId: org.id, userId: joiner.id, roleId: owner.roleId },
          });
        },
        { timeout: 30_000 },
      );

      await held; // A now holds the freeze-set lock

      let captured: PurgeStorageInventory | undefined;
      const bPurge = storeB.purgeUserAccount(
        { userId: user.id },
        {
          eraseStorage: async (inv: PurgeStorageInventory) => {
            captured = inv;

            return { classes: [], verified: true };
          },
        },
      );

      // Wait until the purge is BLOCKED on the membership advisory lock — proving it
      // takes that lock BEFORE reading topology (the CODEX-10 fix). Without the fix
      // the purge would read topology first and would NOT block here.
      let blocked = false;

      for (let i = 0; i < 200 && !blocked; i++) {
        const rows = (await prismaC.$queryRawUnsafe(
          `SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`,
        )) as Array<{ n: number }>;
        blocked = (rows[0]?.n ?? 0) >= 1;

        if (!blocked) {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }

      expect(blocked).toBe(true);

      go(); // let A insert the member + commit + release the lock
      await aTx;
      const result = await bPurge;

      // The join committed just before the freeze IS reflected: the org is shared
      // under the guarantee → its bucket is NEVER handed to eraseStorage.
      expect(result.outcome).toBe('purged');
      expect(captured!.bucketProjectIds).not.toContain(project.id);
      expect(await prisma.project.count({ where: { id: project.id } })).toBe(1); // bucket/project survive
      // No residual freeze after the successful purge.
      expect(await membershipFrozen(prisma, org.id)).toBe(false);
      expect(await objectStorageFrozen(prisma, project.id)).toBe(false);
    } finally {
      await Promise.allSettled([
        prisma.$disconnect(),
        prismaA.$disconnect(),
        prismaB.$disconnect(),
        prismaC.$disconnect(),
      ]);
    }
  });

  /*
   * RR-1bd27929 — MULTI-PLAN SAFETY. Freezes are per-plan rows, so releasing one
   * plan never lifts a freeze another live plan owns; the reconciler reclaims ONLY
   * lease-expired plans, via CAS, touching just that plan's rows.
   */

  it('(15) two plans sharing an org: releasing one keeps the org frozen until the LAST plan releases', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = newStore(prisma);
      const { user, org } = await seedAccount(store);
      const co = await makeShared(store, prisma, org.id, user.id); // org SHARED (user + co)

      // Plan B: a SECOND concurrent purge (co's), blocked in erase → a live plan
      // that also freezes this org. Modelled by its persisted plan + freeze row.
      const planB = await seedPlan(prisma, co.id, [org.id], []);

      // Plan A: user's REAL purge runs to completion (org is shared → no bucket);
      // its release must delete ONLY plan A's rows.
      await requestElapsedDeletion(store, user.id);
      const result = await store.purgeUserAccount(
        { userId: user.id },
        { eraseStorage: async () => ({ classes: [], verified: true }) },
      );
      expect(result.outcome).toBe('purged');

      // Plan A released, but plan B still freezes the org → STILL frozen.
      expect(await planFor(prisma, user.id)).toBeNull(); // A gone
      expect(await membershipFrozen(prisma, org.id)).toBe(true); // B's row remains
      // …and a join stays REFUSED while >= 1 plan freezes the org.
      const joiner = await store.createUser({
        email: `j15-${suffix()}@example.com`,
        name: 'J15',
        passwordHash: hashPassword('password123'),
      });
      await expect(store.addMember({ organizationId: org.id, userId: joiner.id, roleKey: 'member' })).rejects.toThrow(
        /MEMBERSHIP_FROZEN_FOR_PURGE/,
      );

      // The freeze disappears ONLY after the LAST plan (B) releases.
      await prisma.purgePlan.delete({ where: { id: planB.id } }); // cascade removes B's rows
      expect(await membershipFrozen(prisma, org.id)).toBe(false);
      await expect(store.addMember({ organizationId: org.id, userId: joiner.id, roleKey: 'member' })).resolves.toBeTruthy();
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(16) reconciler NEVER reclaims a live plan (valid lease), even one blocked in erasure', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = newStore(prisma);
      const { user, org, project } = await seedAccount(store);

      // Plan B holds a VALID lease (its owner is blocked in a slow eraseStorage).
      const planB = await seedPlan(prisma, user.id, [org.id], [project.id], {
        leaseExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      // A different executor runs the reconciler: it must touch NOTHING.
      const { reconciled } = await store.reconcilePurgeFreezes();
      expect(reconciled).toBe(0);
      expect(await prisma.purgePlan.findUnique({ where: { id: planB.id } })).not.toBeNull();
      expect(await membershipFrozen(prisma, org.id)).toBe(true);
      expect(await objectStorageFrozen(prisma, project.id)).toBe(true);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(17) reconciler reclaims an ABANDONED plan via CAS, releasing ONLY its resources', async () => {
    const prismaX = createDatabaseClient();
    const prismaY = createDatabaseClient();

    try {
      const storeX = newStore(prismaX);
      const storeY = newStore(prismaY);
      const { user, org, project } = await seedAccount(storeX);
      const other = await makeShared(storeX, prismaX, org.id, user.id); // shares org with a live plan

      // Abandoned plan (expired lease) freezing org + project.
      const abandoned = await seedPlan(prismaX, user.id, [org.id], [project.id], {
        leaseExpiresAt: new Date(Date.now() - 60_000),
      });
      // A concurrent LIVE plan (valid lease) that ALSO freezes the same org.
      const live = await seedPlan(prismaX, other.id, [org.id], [], {
        leaseExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      // Two executors reconcile concurrently. Attribute reclaims to the SPECIFIC
      // plan (pollution-proof): the abandoned plan is reclaimed EXACTLY once (one CAS
      // winner), and the LIVE plan is never reclaimed by either.
      const [rx, ry] = await Promise.all([storeX.reconcilePurgeFreezes(), storeY.reconcilePurgeFreezes()]);
      const reclaimedIds = [...rx.reclaimedPlanIds, ...ry.reclaimedPlanIds];
      expect(reclaimedIds.filter((id) => id === abandoned.id)).toEqual([abandoned.id]); // exactly one winner
      expect(reclaimedIds).not.toContain(live.id); // live plan never reclaimed

      // The abandoned plan + its OWN rows are gone…
      expect(await prismaX.purgePlan.findUnique({ where: { id: abandoned.id } })).toBeNull();
      expect(await objectStorageFrozen(prismaX, project.id)).toBe(false); // was only the abandoned plan's
      // …but the concurrent LIVE plan is untouched, so the org stays frozen.
      expect(await prismaX.purgePlan.findUnique({ where: { id: live.id } })).not.toBeNull();
      expect(await membershipFrozen(prismaX, org.id)).toBe(true);
    } finally {
      await Promise.allSettled([prismaX.$disconnect(), prismaY.$disconnect()]);
    }
  });

  it('(18) atomic release: a failed plan-delete keeps BOTH freezes + plan recoverable; reprise idempotent; no OTHER plan touched', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = newStore(prisma);
      const { user, org, project } = await seedAccount(store);
      await requestElapsedDeletion(store, user.id);

      // A DIFFERENT plan (distinct owner) on other resources — must remain
      // untouched throughout. Distinct owner so planFor(user.id) resolves only the
      // crashed purge plan, not this one.
      const otherUser = await store.createUser({
        email: `other18-${suffix()}@example.com`,
        name: 'Other18',
        passwordHash: hashPassword('password123'),
      });
      const otherOrg = await store.createOrganization({
        name: `Other ${suffix()}`,
        slug: `other-${suffix()}`,
        ownerUserId: otherUser.id,
      });
      const otherProject = await store.createProject({
        organizationId: otherOrg.id,
        name: 'OtherP',
        slug: `otherp-${suffix()}`,
      });
      const otherPlan = await seedPlan(prisma, otherUser.id, [otherOrg.id], [otherProject.id], {
        leaseExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      // RR-CODEX-14 (P7): the release is a SINGLE atomic delete of the plan (freezes
      // cascade). Fail that delete → the plan + BOTH its freezes remain (no partial
      // thaw) and are recoverable; the spy then delegates so recovery works.
      const realDeleteMany = prisma.purgePlan.deleteMany.bind(prisma.purgePlan);
      let failedOnce = false;
      const spy = vi
        .spyOn(prisma.purgePlan, 'deleteMany')
        .mockImplementation((async (args: Parameters<typeof realDeleteMany>[0]) => {
          if (!failedOnce) {
            failedOnce = true;
            throw new Error('boom: release plan-delete failed');
          }

          return realDeleteMany(args);
        }) as typeof realDeleteMany);

      // Physical erase fails → purge throws → release runs and its atomic delete fails.
      await expect(
        store.purgeUserAccount({ userId: user.id }, { eraseStorage: async () => ({ classes: [], verified: false }) }),
      ).rejects.toThrow(/ACCOUNT_PURGE_PHYSICAL_INCOMPLETE/);

      const plan = await planFor(prisma, user.id);
      // ATOMIC: BOTH freezes still up (never a partial thaw), plan KEPT (recoverable).
      expect(await membershipFrozen(prisma, org.id)).toBe(true);
      expect(await objectStorageFrozen(prisma, project.id)).toBe(true);
      expect(plan).not.toBeNull();
      // The OTHER plan's freezes are completely untouched.
      expect(await membershipFrozen(prisma, otherOrg.id)).toBe(true);
      expect(await objectStorageFrozen(prisma, otherProject.id)).toBe(true);
      expect(await prisma.purgePlan.findUnique({ where: { id: otherPlan.id } })).not.toBeNull();

      // Recovery: expire the crashed plan's lease → reconciler reclaims it (specific id).
      await prisma.purgePlan.update({ where: { id: plan!.id }, data: { leaseExpiresAt: new Date(Date.now() - 60_000) } });
      const r1 = await store.reconcilePurgeFreezes();
      expect(r1.reclaimedPlanIds).toContain(plan!.id);
      expect(await objectStorageFrozen(prisma, project.id)).toBe(false); // zero residual freeze
      expect(await membershipFrozen(prisma, org.id)).toBe(false);
      expect(await planFor(prisma, user.id)).toBeNull();

      // Idempotent reprise: the crashed plan is not re-reclaimed, and the OTHER plan
      // (still live) is STILL untouched.
      const r2 = await store.reconcilePurgeFreezes();
      expect(r2.reclaimedPlanIds).not.toContain(plan!.id);
      expect(await prisma.purgePlan.findUnique({ where: { id: otherPlan.id } })).not.toBeNull();
      expect(await membershipFrozen(prisma, otherOrg.id)).toBe(true);

      spy.mockRestore();
    } finally {
      await prisma.$disconnect();
    }
  });

  /*
   * RR-CODEX-12 — LIVE LEASE + SAFE RECLAIM + VERIFIED CLEANUP. Short TTL /
   * heartbeat via newStore(TEST_LEASE). All deterministic on real Postgres.
   */

  it('(19) erasure longer than the TTL: heartbeat renews, a concurrent reconciler reclaims NOTHING', async () => {
    const prisma = createDatabaseClient();
    const prismaR = createDatabaseClient(); // the concurrent reconciler

    try {
      // Short TTL so the erasure (below) genuinely outlasts the initial lease; the
      // background heartbeat must renew it throughout.
      const store = new PrismaApiStore(prisma, undefined, SHORT_LEASE);
      const reconciler = new PrismaApiStore(prismaR, undefined, SHORT_LEASE);
      const { user, org, project } = await seedAccount(store);
      await requestElapsedDeletion(store, user.id);

      let reclaimedDuring = -1;
      let frozenDuring = false;
      const eraseStorage = async (_inv: PurgeStorageInventory, guard?: () => Promise<void>) => {
        await guard?.(); // before "delete 1"
        // Block well past the initial TTL (600ms). The background heartbeat (every
        // 100ms) must keep the lease alive throughout.
        await sleep(900);
        // Mid-erasure, a DIFFERENT worker runs the reconciler: it must reclaim
        // NOTHING (the lease is live), and the freeze must still be up.
        reclaimedDuring = (await reconciler.reconcilePurgeFreezes()).reconciled;
        frozenDuring =
          (await membershipFrozen(prisma, org.id)) && (await objectStorageFrozen(prisma, project.id));
        await guard?.(); // before "delete 2" — lease still valid → passes
        return { classes: [], verified: true };
      };

      const result = await store.purgeUserAccount({ userId: user.id }, { eraseStorage });

      expect(result.outcome).toBe('purged');
      expect(reclaimedDuring).toBe(0); // reconciler reclaimed nothing mid-erasure
      expect(frozenDuring).toBe(true); // freeze active until the very end
      // After success: freeze released, plan gone.
      expect(await planFor(prisma, user.id)).toBeNull();
      expect(await membershipFrozen(prisma, org.id)).toBe(false);
    } finally {
      await Promise.allSettled([prisma.$disconnect(), prismaR.$disconnect()]);
    }
  }, 20_000);

  it('(20) dead owner: lease expired, two concurrent reconcilers → exactly one wins, cleanup confirmed', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();

    try {
      const storeA = newStore(prismaA);
      const storeB = newStore(prismaB);
      const { user, org, project } = await seedAccount(storeA);

      // Dead owner: an abandoned plan whose lease expired well beyond the grace.
      const plan = await seedPlan(prismaA, user.id, [org.id], [project.id], {
        leaseExpiresAt: new Date(Date.now() - 10_000),
      });

      const [ra, rb] = await Promise.all([storeA.reconcilePurgeFreezes(), storeB.reconcilePurgeFreezes()]);
      // Pollution-proof "exactly one wins": the dead owner's plan is reclaimed by
      // EXACTLY one of the two reconcilers (CAS), never both.
      // Pollution-proof "exactly one wins": the dead owner's plan is reclaimed by
      // EXACTLY one of the two reconcilers (CAS), never both.
      const reclaimedIds = [...ra.reclaimedPlanIds, ...rb.reclaimedPlanIds];
      expect(reclaimedIds.filter((id) => id === plan.id)).toEqual([plan.id]);

      // Confirmed cleanup: plan + freezes verifiably gone (the winner only counts
      // it after this very check).
      expect(await prismaA.purgePlan.findUnique({ where: { id: plan.id } })).toBeNull();
      expect(await membershipFrozen(prismaA, org.id)).toBe(false);
      expect(await objectStorageFrozen(prismaA, project.id)).toBe(false);
    } finally {
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('(21) renewal vs reclaim race → exactly one CAS winner (owner keeps a valid lease, or stops)', async () => {
    const prismaO = createDatabaseClient(); // owner renewing
    const prismaR = createDatabaseClient(); // reconciler reclaiming

    try {
      const storeO = newStore(prismaO);
      const reconciler = newStore(prismaR);
      const { user, org } = await seedAccount(storeO);

      // A plan whose lease has just expired past grace (so the reconciler considers
      // it) at version 0 — the owner tries to renew at the same instant.
      const plan = await seedPlan(prismaO, user.id, [org.id], [], {
        leaseExpiresAt: new Date(Date.now() - 10_000),
      });

      const [renewed, recon] = await Promise.all([
        storeO.renewPurgeLease(plan.id, plan.ownerToken, plan.version),
        reconciler.reconcilePurgeFreezes(),
      ]);

      const renewWon = renewed !== null;
      const reconWon = recon.reconciled === 1;
      expect(renewWon).not.toBe(reconWon); // EXACTLY one CAS winner

      if (renewWon) {
        // Owner continues with a VALID lease; plan is still ACTIVE and frozen.
        const p = (await prismaO.purgePlan.findUnique({ where: { id: plan.id } }))!;
        expect(p).not.toBeNull();
        expect(p.status).toBe('ACTIVE');
        expect(p.leaseExpiresAt.getTime()).toBeGreaterThan(Date.now());
        expect(await membershipFrozen(prismaO, org.id)).toBe(true);
      } else {
        // Reconciler won: plan gone, freeze released → the owner (renew=null) stops
        // before any further deletion.
        expect(await prismaO.purgePlan.findUnique({ where: { id: plan.id } })).toBeNull();
        expect(await membershipFrozen(prismaO, org.id)).toBe(false);
      }
    } finally {
      await Promise.allSettled([prismaO.$disconnect(), prismaR.$disconnect()]);
    }
  });

  it('(22) lease lost mid-erasure: after 1 resource, NO further delete, NO tombstone, recoverable', async () => {
    const prisma = createDatabaseClient();

    try {
      // A store whose heartbeat interval is far longer than this test, so the
      // background renewal never fires (and can't race the in-test mutation). The
      // lease stays valid on its own; we trigger the loss DETERMINISTICALLY by
      // CAS-claiming the plan (RECLAIMING) mid-erasure.
      const store = new PrismaApiStore(prisma, undefined, {
        ttlMs: 60_000,
        renewIntervalMs: 60_000,
        reclaimGraceMs: 100,
      });
      const { user, org, project } = await seedAccount(store);
      // A second sole org+project so the erasure has TWO buckets (two deletes).
      const org2 = await store.createOrganization({
        name: `Org2 ${suffix()}`,
        slug: `org2-${suffix()}`,
        ownerUserId: user.id,
      });
      const project2 = await store.createProject({ organizationId: org2.id, name: 'P2', slug: `p2-${suffix()}` });
      await requestElapsedDeletion(store, user.id);

      let deletes = 0;
      const eraseStorage = async (_inv: PurgeStorageInventory, guard?: () => Promise<void>) => {
        await guard?.();
        deletes += 1; // "delete 1"
        // The owner LOSES the lease mid-erasure: a reconciler CAS-claimed the plan
        // (ACTIVE→RECLAIMING, version bumped). This defeats the still-running
        // heartbeat (its next renew CAS requires status=ACTIVE + the old version →
        // fails → lease lost) AND the guard (validatePurgeLease requires ACTIVE).
        // The guard before "delete 2" must abort.
        const plan = (await planFor(prisma, user.id))!;
        await prisma.purgePlan.update({
          where: { id: plan.id },
          data: { status: 'RECLAIMING', version: { increment: 1 } },
        });
        await guard?.(); // "delete 2" precondition → MUST throw (lease lost)
        deletes += 1;
        return { classes: [], verified: true };
      };

      await expect(store.purgeUserAccount({ userId: user.id }, { eraseStorage })).rejects.toThrow(
        /ACCOUNT_PURGE_LEASE_LOST/,
      );

      expect(deletes).toBe(1); // stopped before the 2nd irreversible delete
      // NO tombstone — the account is still recoverable / re-queued (still ready_to_purge).
      const after = await prisma.user.findUnique({ where: { id: user.id } });
      expect(
        (after!.preferences as { accountDeletion?: { purgedAt?: string } }).accountDeletion?.purgedAt,
      ).toBeUndefined();
      // Not anonymized (no tombstone): email untouched, name preserved.
      expect(after!.email).not.toContain('erased.invalid');
      expect(after!.name).not.toBeNull();
      // Recoverable + no residual freeze: the finally's release cleaned up THIS
      // owner's plan + freezes (ownerToken-scoped), and the account stays queued.
      expect(await membershipFrozen(prisma, org2.id)).toBe(false);
      expect(await objectStorageFrozen(prisma, project.id)).toBe(false);
      void project2;
    } finally {
      await prisma.$disconnect();
    }
  }, 20_000);

  it('(23) two workers, same user, real erase path → exactly one plan, one physical execution, one tombstone', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();

    try {
      const storeA = newStore(prismaA);
      const storeB = newStore(prismaB);
      const { user } = await seedAccount(storeA); // sole org + bucket
      await requestElapsedDeletion(storeA, user.id);

      let executions = 0;
      const eraseStorage = async (_inv: PurgeStorageInventory, guard?: () => Promise<void>) => {
        executions += 1;
        await guard?.();
        await sleep(200); // hold the plan so the other worker sees it live and is refused
        return { classes: [], verified: true };
      };

      const [a, b] = await Promise.allSettled([
        storeA.purgeUserAccount({ userId: user.id }, { eraseStorage }),
        storeB.purgeUserAccount({ userId: user.id }, { eraseStorage }),
      ]);

      const purged = [a, b].filter((r) => r.status === 'fulfilled' && r.value.outcome === 'purged').length;
      const refused = [a, b].filter(
        (r) => r.status === 'rejected' && /PURGE_ALREADY_ACTIVE/.test(String(r.reason)),
      ).length;
      expect(purged).toBe(1); // exactly one purge
      expect(refused).toBe(1); // the other worker was refused (singleton)
      expect(executions).toBe(1); // exactly ONE physical execution

      // Exactly one plan ever, now released; one tombstone + a verified proof.
      expect(await prismaA.purgePlan.count({ where: { userId: user.id } })).toBe(0);
      const tomb = await prismaA.user.findUnique({ where: { id: user.id } });
      expect(tomb!.email).toContain('@erased.invalid');
      // The single purge returned a verified erasure proof (the AdminAuditLog row is
      // persisted by the /internal/account-purge ROUTE, not the store method).
      const winner = [a, b].find((r) => r.status === 'fulfilled' && r.value.outcome === 'purged');
      expect(winner?.status === 'fulfilled' && winner.value.outcome === 'purged' && winner.value.proof.verifiedZeroRemaining).toBe(
        true,
      );
    } finally {
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  }, 20_000);

  it('(24) reconciler cleanup failure: reconciled stays 0, plan RECLAIMING+recoverable, second pass finishes', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = newStore(prisma);
      const { user, org, project } = await seedAccount(store);
      const plan = await seedPlan(prisma, user.id, [org.id], [project.id], {
        leaseExpiresAt: new Date(Date.now() - 10_000),
      });

      // Inject a cleanup failure on the reconciler's FIRST purgePlan.deleteMany (the
      // atomic claim+delete). It throws once, then delegates to the real method.
      const realDeleteMany = prisma.purgePlan.deleteMany.bind(prisma.purgePlan);
      let failedOnce = false;
      const spy = vi
        .spyOn(prisma.purgePlan, 'deleteMany')
        .mockImplementation((async (args: Parameters<typeof realDeleteMany>[0]) => {
          if (!failedOnce) {
            failedOnce = true;
            throw new Error('boom: reconciler cleanup failed');
          }

          return realDeleteMany(args);
        }) as typeof realDeleteMany);

      const r1 = await store.reconcilePurgeFreezes();
      expect(r1.reconciled).toBe(0); // cleanup failed → NOT counted as success

      // The plan is durably RECLAIMING (recoverable), and the freeze is still up.
      const reclaiming = await prisma.purgePlan.findUnique({ where: { id: plan.id } });
      expect(reclaiming).not.toBeNull();
      expect(reclaiming!.status).toBe('RECLAIMING');
      expect(await membershipFrozen(prisma, org.id)).toBe(true);

      // Second pass finishes cleanly. The spy now delegates to the real deleteMany
      // (it only fails its FIRST call) — we intentionally do NOT mockRestore(), which
      // would break the Prisma proxy-based delegate method.
      const r2 = await store.reconcilePurgeFreezes();
      expect(r2.reconciled).toBe(1);
      expect(await prisma.purgePlan.findUnique({ where: { id: plan.id } })).toBeNull();
      expect(await membershipFrozen(prisma, org.id)).toBe(false);
    } finally {
      await prisma.$disconnect();
    }
  });

  /*
   * RR-CODEX-14 — deterministic race tests for the v4 corrections.
   */

  it('(25) P2 reclaim race: heartbeat renews PRECISELY between read and delete → 2nd purge REFUSED, no 2nd erasure', async () => {
    const prisma = createDatabaseClient();
    const renewClient = createDatabaseClient(); // the "old owner heartbeat" connection

    try {
      const store = newStore(prisma);
      const { user, org, project } = await seedAccount(store);
      await requestElapsedDeletion(store, user.id);

      // An ABANDONED plan (version 0, lease expired beyond grace) that the new
      // acquirer will try to reclaim.
      const abandoned = await seedPlan(prisma, user.id, [org.id], [project.id], {
        leaseExpiresAt: new Date(Date.now() - 10_000),
        ownerToken: 'old-owner',
      });

      // The seam: PRECISELY between the acquirer's read of the existing plan and its
      // conditional reclaim delete, the OLD owner's heartbeat renews the plan (bumps
      // version + pushes the lease to the future) on a separate connection.
      store.purgeTestHooks = {
        onExistingPlanRead: async () => {
          await renewClient.purgePlan.updateMany({
            where: { id: abandoned.id, version: 0 },
            data: { version: { increment: 1 }, leaseExpiresAt: new Date(Date.now() + 30 * 60 * 1000) },
          });
        },
      };

      let executions = 0;
      const eraseStorage = async () => {
        executions += 1;
        return { classes: [], verified: true };
      };

      // The conditional reclaim (version=0) now matches 0 rows (heartbeat bumped to 1)
      // → the acquirer STOPS, never starting a 2nd physical erasure.
      await expect(store.purgeUserAccount({ userId: user.id }, { eraseStorage })).rejects.toThrow(
        /PURGE_ALREADY_ACTIVE/,
      );
      expect(executions).toBe(0); // NO second physical erasure
      // The renewed plan survives (owner 'old-owner', version 1) — never delete-by-id'd.
      const survivor = await prisma.purgePlan.findUnique({ where: { id: abandoned.id } });
      expect(survivor).not.toBeNull();
      expect(survivor!.ownerToken).toBe('old-owner');
      expect(survivor!.version).toBe(1);
    } finally {
      await Promise.allSettled([prisma.$disconnect(), renewClient.$disconnect()]);
    }
  });

  it('(26) P5: transferProject is REFUSED while the project storage is frozen by a purge', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = newStore(prisma);
      const { user, org, project } = await seedAccount(store);
      const targetOrg = await store.createOrganization({
        name: `Target ${suffix()}`,
        slug: `target-${suffix()}`,
        ownerUserId: user.id,
      });

      // Freeze the project's object storage (as an in-flight purge would).
      await seedPlan(prisma, user.id, [], [project.id], {
        leaseExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      // A transfer that would move the (sole-org) project into another org mid-erasure
      // is REFUSED — it can't strand/destroy a bucket that would change ownership.
      await expect(
        store.transferProject({ projectId: project.id, targetOrganizationId: targetOrg.id }),
      ).rejects.toThrow(/PROJECT_FROZEN_FOR_PURGE/);
      // Still in the source org.
      expect((await prisma.project.findUnique({ where: { id: project.id } }))!.organizationId).toBe(org.id);

      // Unfreeze → the transfer works again (the block is conditional, not a wall).
      await prisma.purgeFreeze.deleteMany({ where: { resourceType: 'objectStorage', resourceId: project.id } });
      await store.transferProject({ projectId: project.id, targetOrganizationId: targetOrg.id });
      expect((await prisma.project.findUnique({ where: { id: project.id } }))!.organizationId).toBe(targetOrg.id);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(27) P6 via the REAL route: a purged account whose receipt is missing is KEPT in the queue (missingReceipt=1, no remove) — every queue-removal is receipt-gated', async () => {
    const previousSecret = process.env.INTERNAL_API_SHARED_SECRET;
    process.env.INTERNAL_API_SHARED_SECRET = SECRET;
    const prisma = createDatabaseClient();

    try {
      const store = newStore(prisma);
      const app = await buildApiApp({
        store,
        emailProvider: new QuietEmailProvider(),
        accountStoragePurger: verifiedPhysicalPurger(),
      });
      const { user } = await seedAccount(store);
      await requestElapsedDeletion(store, user.id);

      // (a) A real purge through the route: tombstone + receipt written atomically,
      // and the id leaves the pending queue BECAUSE the receipt exists.
      const first = await app.inject({
        method: 'POST',
        url: '/internal/account-purge',
        headers: { authorization: `Bearer ${SECRET}` },
        payload: { enabled: true, userId: user.id },
      });
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({ purged: 1, missingReceipt: 0 });
      expect(await store.hasPurgeReceipt(user.id)).toBe(true);

      // (b) Now DELETE the receipt (models a receipt lost / never persisted) and
      // put the purged id back on the queue, then re-run the REAL route. The account
      // is in the `purged` pre-state, so the executor takes the pre-state removal path.
      await prisma.purgeReceipt.delete({ where: { userId: user.id } });
      await store.mutateSystemSettingIds('account.pendingDeletionUserIds', { add: user.id });

      // Watch every queue mutation during the 2nd run: there must be NO remove(user.id).
      const mutateSpy = vi.spyOn(store, 'mutateSystemSettingIds');

      const second = await app.inject({
        method: 'POST',
        url: '/internal/account-purge',
        headers: { authorization: `Bearer ${SECRET}` },
        payload: { enabled: true, userId: user.id },
      });
      expect(second.statusCode).toBe(200);

      // The purge is NOT treated as complete: missingReceipt counted, id NOT removed.
      expect(second.json()).toMatchObject({ alreadyPurged: 1, missingReceipt: 1 });

      // No mutateSystemSettingIds(..., { remove: user.id }) was issued for this user.
      const removedThisUser = mutateSpy.mock.calls.some(
        ([key, patch]) =>
          key === 'account.pendingDeletionUserIds' &&
          (patch as { remove?: string }).remove === user.id,
      );
      expect(removedThisUser).toBe(false);

      // And the id is STILL present in the pending queue (surfaced, not forgotten).
      const settings = await store.listSystemSettings();
      const pending = settings.find((s) => s.key === 'account.pendingDeletionUserIds');
      expect(((pending?.value as unknown[]) ?? []).includes(user.id)).toBe(true);
    } finally {
      process.env.INTERNAL_API_SHARED_SECRET = previousSecret;
      await prisma.$disconnect();
    }
  });

  it('(27b) P6 negative: a PurgeReceipt.upsert failure ROLLS BACK the whole tombstone tx (no anonymization, id stays queued, failed=1)', async () => {
    const previousSecret = process.env.INTERNAL_API_SHARED_SECRET;
    process.env.INTERNAL_API_SHARED_SECRET = SECRET;
    const prisma = createDatabaseClient();

    try {
      const store = newStore(prisma);
      const app = await buildApiApp({
        store,
        emailProvider: new QuietEmailProvider(),
        accountStoragePurger: verifiedPhysicalPurger(),
      });
      const { user, project, conversation } = await seedAccount(store);
      await requestElapsedDeletion(store, user.id);
      const originalEmail = user.email;

      /*
       * Inject a failure on the receipt write INSIDE the interactive tombstone tx.
       * We wrap $transaction and hand the callback a proxied tx whose
       * `purgeReceipt.upsert` throws — so the receipt (written in the SAME tx as the
       * tombstone, P6) fails and Prisma rolls the ENTIRE tx back. The receipt gate is
       * only meaningful if a receipt that can't be written can never leave a stamped
       * tombstone behind.
       */
      const realTransaction = prisma.$transaction.bind(prisma);
      vi.spyOn(prisma, '$transaction').mockImplementation(((arg: unknown, opts: unknown) => {
        if (typeof arg === 'function') {
          return realTransaction(async (tx: Record<string, any>) => {
            const proxied = new Proxy(tx, {
              get(target, prop, receiver) {
                if (prop === 'purgeReceipt') {
                  return {
                    upsert: async () => {
                      throw new Error('boom: receipt upsert failed');
                    },
                  };
                }

                return Reflect.get(target, prop, receiver);
              },
            });

            return (arg as (client: unknown) => unknown)(proxied);
          }, opts as never);
        }

        return realTransaction(arg as never, opts as never);
      }) as never);

      const res = await app.inject({
        method: 'POST',
        url: '/internal/account-purge',
        headers: { authorization: `Bearer ${SECRET}` },
        payload: { enabled: true, userId: user.id },
      });
      expect(res.statusCode).toBe(200);
      // The purge FAILED (fail-closed) — not purged, counted as failed.
      expect(res.json()).toMatchObject({ purged: 0, failed: 1 });

      // ROLLBACK proven: the tombstone was NOT stamped — the user is untouched.
      const stillThere = await prisma.user.findUnique({ where: { id: user.id } });
      expect(stillThere!.email).toBe(originalEmail); // NOT purged-<id>@erased.invalid
      expect(stillThere!.passwordHash).not.toBeNull();
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
      expect(await prisma.aiConversation.count({ where: { id: conversation.id } })).toBe(1);
      expect(await prisma.project.count({ where: { id: project.id } })).toBe(1);

      // No receipt, and the id is STILL queued for a retry (fail-closed).
      expect(await store.hasPurgeReceipt(user.id)).toBe(false);
      const settings = await store.listSystemSettings();
      const pending = settings.find((s) => s.key === 'account.pendingDeletionUserIds');
      expect(((pending?.value as unknown[]) ?? []).includes(user.id)).toBe(true);
    } finally {
      process.env.INTERNAL_API_SHARED_SECRET = previousSecret;
      await prisma.$disconnect();
    }
  });

});
