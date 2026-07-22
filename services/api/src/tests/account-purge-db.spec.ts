import { hashPassword } from '@vibecore/auth';
import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

import type { ErasureProof } from '../account-purge.js';
import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { PrismaApiStore } from '../prisma-store.js';

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
      const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
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
});
