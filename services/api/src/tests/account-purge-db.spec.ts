import { hashPassword } from '@vibecore/auth';
import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it, vi } from 'vitest';

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
  it('(2 NEGATIVE first) refuses while the grace window has not elapsed', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new PrismaApiStore(prisma);
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
      const store = new PrismaApiStore(prisma);
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
      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);
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
      const store = new PrismaApiStore(prisma);
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
      const store = new PrismaApiStore(prisma);
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
      const store = new PrismaApiStore(prisma);
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
      const store = new PrismaApiStore(prisma);
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
      const store = new PrismaApiStore(prisma);
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
      const store = new PrismaApiStore(prisma);
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
      const store = new PrismaApiStore(prisma);
      const storeB = new PrismaApiStore(prismaB);
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
      const store = new PrismaApiStore(prisma);
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
      const store = new PrismaApiStore(prisma);
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
      const storeX = new PrismaApiStore(prismaX);
      const storeY = new PrismaApiStore(prismaY);
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

      // Two executors reconcile concurrently → CAS ensures the abandoned plan is
      // reclaimed exactly ONCE (never double-reclaimed).
      const [rx, ry] = await Promise.all([storeX.reconcilePurgeFreezes(), storeY.reconcilePurgeFreezes()]);
      expect(rx.reconciled + ry.reconciled).toBe(1);

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

  it('(18) crash between the two thaws keeps the plan recoverable; reprise idempotent; no OTHER plan touched', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new PrismaApiStore(prisma);
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

      // Crash BETWEEN the two thaws: fail the object-storage thaw (2nd deleteMany).
      const realDeleteMany = prisma.purgeFreeze.deleteMany.bind(prisma.purgeFreeze);
      const spy = vi
        .spyOn(prisma.purgeFreeze, 'deleteMany')
        .mockImplementation((async (args: Parameters<typeof realDeleteMany>[0]) => {
          if ((args as { where?: { resourceType?: string } })?.where?.resourceType === 'objectStorage') {
            throw new Error('boom: object-storage thaw failed');
          }

          return realDeleteMany(args);
        }) as typeof realDeleteMany);

      // Physical erase fails → purge throws → release runs and crashes mid-thaw.
      await expect(
        store.purgeUserAccount({ userId: user.id }, { eraseStorage: async () => ({ classes: [], verified: false }) }),
      ).rejects.toThrow(/ACCOUNT_PURGE_PHYSICAL_INCOMPLETE/);

      const plan = await planFor(prisma, user.id);
      // Membership thawed, object-storage still frozen, plan KEPT (recoverable).
      expect(await membershipFrozen(prisma, org.id)).toBe(false);
      expect(await objectStorageFrozen(prisma, project.id)).toBe(true);
      expect(plan).not.toBeNull();
      // The OTHER plan's freezes are completely untouched.
      expect(await membershipFrozen(prisma, otherOrg.id)).toBe(true);
      expect(await objectStorageFrozen(prisma, otherProject.id)).toBe(true);
      expect(await prisma.purgePlan.findUnique({ where: { id: otherPlan.id } })).not.toBeNull();

      // Recovery: expire the crashed plan's lease → reconciler reclaims it.
      await prisma.purgePlan.update({ where: { id: plan!.id }, data: { leaseExpiresAt: new Date(Date.now() - 60_000) } });
      const r1 = await store.reconcilePurgeFreezes();
      expect(r1.reconciled).toBeGreaterThanOrEqual(1);
      expect(await objectStorageFrozen(prisma, project.id)).toBe(false); // zero residual freeze
      expect(await planFor(prisma, user.id)).toBeNull();

      // Idempotent reprise: a second reconcile changes nothing, and the OTHER plan
      // (still live) is STILL untouched.
      const r2 = await store.reconcilePurgeFreezes();
      expect(r2.reconciled).toBe(0);
      expect(await prisma.purgePlan.findUnique({ where: { id: otherPlan.id } })).not.toBeNull();
      expect(await membershipFrozen(prisma, otherOrg.id)).toBe(true);

      spy.mockRestore();
    } finally {
      await prisma.$disconnect();
    }
  });

});
