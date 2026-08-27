import { createDatabaseClient, Prisma } from '@vibecore/database';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { PrismaApiStore } from '../prisma-store.js';
import { LedgerStore } from '../ledger-store.js';

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

const runDbTests = (await canReachDatabase()) ? describe.sequential : describe.skip;

function marker() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const CLASSIFIER_ROUTING = {
  mode: 'economy',
  highEffort: true,
  turbo: false,
  lineKey: 'classifier',
  routingCardVersion: 1,
  source: 'classifier',
  costInMillicentsPerM: 100_000,
  costOutMillicentsPerM: 500_000,
} as const;

const CLASSIFIER_ROUTING_SELECTION = {
  mode: CLASSIFIER_ROUTING.mode,
  highEffort: CLASSIFIER_ROUTING.highEffort,
  turbo: CLASSIFIER_ROUTING.turbo,
  lineKey: CLASSIFIER_ROUTING.lineKey,
  routingCardVersion: CLASSIFIER_ROUTING.routingCardVersion,
  source: CLASSIFIER_ROUTING.source,
} as const;

function applicationRequestHash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function createClaimedCanonicalRun(
  store: PrismaApiStore,
  input: { organizationId: string; userId: string; projectId: string; requestId: string; owner?: string },
) {
  const reservation = await store.reserveCanonicalUserSpend({
    organizationId: input.organizationId,
    userId: input.userId,
    projectId: input.projectId,
    idempotencyKey: input.requestId,
    maxAmountCents: 10,
    expiresInMs: 60 * 60_000,
    requestHash: applicationRequestHash(input.requestId),
    enforceUserSpendLimit: false,
  });
  const claim = await store.claimCanonicalAiExecution({
    reservationId: reservation.id,
    organizationId: input.organizationId,
    userId: input.userId,
    projectId: input.projectId,
    requestId: input.requestId,
    claimOwnerId: input.owner ?? `${input.requestId}:owner:1`,
    claimLeaseMs: 15_000,
  });
  return { reservation, claim };
}

async function recordExactClassifier(
  store: PrismaApiStore,
  input: {
    reservationId: string;
    organizationId: string;
    userId: string;
    projectId: string;
    requestId: string;
    executionToken: string;
  },
) {
  await store.markCanonicalPlatformAiUsageStarted({
    ...input,
    callId: 'classifier',
    provider: 'anthropic',
    model: 'claude-test',
    maxInputTokens: 2_000,
    maxOutputTokens: 50,
    maxCostCents: 1,
    agentRouting: CLASSIFIER_ROUTING,
    reconcileAfterMs: 5 * 60_000,
  });
  return store.recordCanonicalPlatformAiUsage({
    ...input,
    call: {
      callId: 'classifier',
      kind: 'classifier',
      billedToUser: false,
      projectId: input.projectId,
      provider: 'anthropic',
      model: 'claude-test',
      inputTokens: 2_000,
      outputTokens: 50,
      costCents: 1,
      reason: 'chat.completion.operator',
    },
    outcome: 'hard',
    agentRouting: { ...CLASSIFIER_ROUTING_SELECTION, escalated: true },
  });
}

async function settleCanonicalMain(
  store: PrismaApiStore,
  input: {
    reservationId: string;
    organizationId: string;
    userId: string;
    projectId: string;
    requestId: string;
    executionToken: string;
  },
) {
  await store.markCanonicalUserSpendStarted({ ...input, reconcileAfterMs: 2 * 60 * 60_000 });
  return store.commitCanonicalUserSpendBatch({
    ...input,
    calls: [
      {
        callId: 'main',
        kind: 'main',
        projectId: input.projectId,
        provider: 'anthropic',
        model: 'claude-test',
        inputTokens: 10,
        outputTokens: 5,
        costCents: 1,
        reason: 'chat.completion',
      },
    ],
  });
}

function executionMetadata(input: {
  reservationId: string;
  organizationId: string;
  userId: string;
  requestId: string;
  projectId: string;
  settleAfter: string;
  platformIntent?: boolean;
}) {
  const executionToken = `execution:${input.requestId}`;
  const executionRequestHash = createHash('sha256')
    .update(
      JSON.stringify({
        version: 1,
        reservationId: input.reservationId,
        organizationId: input.organizationId,
        userId: input.userId,
        projectId: input.projectId,
        requestId: input.requestId,
      }),
    )
    .digest('hex');
  const execution = {
    version: 1,
    state: input.platformIntent ? 'claimed' : 'started',
    requestHash: executionRequestHash,
    requestId: input.requestId,
    projectId: input.projectId,
    executionToken,
    startedAt: '2026-08-27T00:00:00.000Z',
    settleAfter: input.settleAfter,
  };

  const platform = {
    version: 1,
    reservationId: input.reservationId,
    organizationId: input.organizationId,
    userId: input.userId,
    requestId: input.requestId,
    executionToken,
    projectId: input.projectId,
    callId: `classifier:${input.requestId}`,
    provider: 'anthropic',
    model: 'claude-test',
    maxInputTokens: 12,
    maxOutputTokens: 1,
    maxCostCents: 3,
    agentRouting: {
      mode: 'economy',
      highEffort: false,
      turbo: false,
      lineKey: 'classifier',
      routingCardVersion: 1,
      source: 'classifier',
      costInMillicentsPerM: 100_000,
      costOutMillicentsPerM: 500_000,
    },
  };

  return {
    canonicalAiExecution: execution,
    ...(input.platformIntent
      ? {
          canonicalAiPlatformIntent: {
            ...platform,
            requestHash: createHash('sha256').update(JSON.stringify(platform)).digest('hex'),
            startedAt: '2026-08-27T00:00:00.000Z',
            settleAfter: input.settleAfter,
          },
        }
      : {}),
  };
}

async function createOrganization(store: PrismaApiStore, id: string) {
  await store.prisma.organization.create({
    data: { id, name: `Canonical reconciliation ${id}`, slug: id.toLowerCase().replace(/[^a-z0-9-]/g, '-') },
  });
}

async function cleanup(store: PrismaApiStore, organizationId: string) {
  await store.prisma.usageEvent.deleteMany({ where: { organizationId } });
  await store.prisma.agentCallLog.deleteMany({ where: { organizationId } });
  await store.prisma.aiCostLedger.deleteMany({ where: { organizationId } });
  await store.prisma.userSpendLimit.deleteMany({ where: { organizationId } });
  await store.prisma.ledgerReservation.deleteMany({ where: { organizationId } });
  // Posted ledger rows are intentionally append-only in PostgreSQL. The DB
  // specs use unique tenant ids and run in a disposable database instead of
  // weakening the production immutability trigger for cleanup.
  await store.prisma.organization.deleteMany({ where: { id: organizationId } });
}

runDbTests('canonical AI reconciliation — PostgreSQL due ordering and durable recovery', () => {
  it('keeps the immutable T1 classifier receipt while T2 settles the user batch after lease takeover', async () => {
    const storeA = new PrismaApiStore(createDatabaseClient());
    const storeB = new PrismaApiStore(createDatabaseClient());
    const unique = marker();
    const organizationId = `reconcile-t1-t2-${unique}`;
    const userId = `user-${unique}`;
    const projectId = `project-${unique}`;
    const requestId = `request-${unique}`;

    try {
      await createOrganization(storeA, organizationId);
      const { reservation, claim: claimT1 } = await createClaimedCanonicalRun(storeA, {
        organizationId,
        userId,
        projectId,
        requestId,
      });
      await recordExactClassifier(storeA, {
        reservationId: reservation.id,
        organizationId,
        userId,
        projectId,
        requestId,
        executionToken: claimT1.executionToken,
      });
      const [exactLog] = await storeA.prisma.agentCallLog.findMany({ where: { organizationId } });
      expect(exactLog).toMatchObject({
        billedToUser: false,
        costMillicents: 225,
        marginMillicents: -225,
        source: 'classifier',
      });

      await storeA.prisma.$executeRaw(Prisma.sql`
        UPDATE "LedgerReservation"
        SET "metadata" = jsonb_set(
          "metadata",
          '{canonicalAiExecution,leaseExpiresAt}',
          to_jsonb(to_char(clock_timestamp() - interval '1 second', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
          false
        )
        WHERE "id" = ${reservation.id}
      `);
      const claimT2 = await storeB.claimCanonicalAiExecution({
        reservationId: reservation.id,
        organizationId,
        userId,
        projectId,
        requestId,
        claimOwnerId: `${requestId}:owner:2`,
        claimLeaseMs: 15_000,
      });
      expect(claimT2.executionToken).not.toBe(claimT1.executionToken);
      expect(claimT2.platformReceipt).toEqual({ state: 'exact', outcome: 'hard' });
      await settleCanonicalMain(storeB, {
        reservationId: reservation.id,
        organizationId,
        userId,
        projectId,
        requestId,
        executionToken: claimT2.executionToken,
      });

      const replay = await storeA.claimCanonicalAiExecution({
        reservationId: reservation.id,
        organizationId,
        userId,
        projectId,
        requestId,
        claimOwnerId: `${requestId}:owner:3`,
        claimLeaseMs: 15_000,
      });
      expect(replay).toMatchObject({
        replayed: true,
        executionToken: claimT2.executionToken,
        platformReceipt: { state: 'exact', outcome: 'hard' },
      });
      expect(await storeA.reconcileCanonicalUserSpend({ take: 100 })).toMatchObject({
        scanned: 0,
        manualRecovery: 0,
      });
      expect(await storeA.prisma.agentCallLog.count({ where: { organizationId } })).toBe(1);
      expect(await storeA.prisma.aiCostLedger.count({ where: { organizationId } })).toBe(2);
    } finally {
      await cleanup(storeA, organizationId).catch(() => undefined);
      await Promise.allSettled([storeA.disconnect(), storeB.disconnect()]);
    }
  });

  it('revives one exact expired turn across replicas, revalidates caps, and never revives cancellation', async () => {
    const storeA = new PrismaApiStore(createDatabaseClient());
    const storeB = new PrismaApiStore(createDatabaseClient());
    const ledgerA = new LedgerStore(storeA.prisma);
    const unique = marker();
    const organizationId = `reconcile-revive-${unique}`;
    const userId = `user-${unique}`;
    const projectId = `project-${unique}`;
    const requestId = `request-${unique}`;

    try {
      await createOrganization(storeA, organizationId);
      const reserveInput = {
        organizationId,
        userId,
        projectId,
        idempotencyKey: requestId,
        maxAmountCents: 10,
        expiresInMs: 60 * 60_000,
        requestHash: applicationRequestHash(requestId),
        enforceUserSpendLimit: false,
      } as const;
      const { reservation, claim } = await createClaimedCanonicalRun(storeA, {
        organizationId,
        userId,
        projectId,
        requestId,
      });
      await recordExactClassifier(storeA, {
        reservationId: reservation.id,
        organizationId,
        userId,
        projectId,
        requestId,
        executionToken: claim.executionToken,
      });
      await storeA.prisma.$executeRaw`
        UPDATE "LedgerReservation"
        SET "expiresAt" = clock_timestamp() - interval '1 second',
            "metadata" = jsonb_set(
              "metadata",
              '{canonicalAiExecution,leaseExpiresAt}',
              to_jsonb(to_char(clock_timestamp() - interval '1 second', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
              false
            )
        WHERE "id" = ${reservation.id}
      `;
      expect(await ledgerA.reapExpiredReservations()).toContain(reservation.id);
      expect((await storeA.prisma.ledgerReservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe(
        'EXPIRED',
      );

      const revived = await Promise.all([
        storeA.reserveCanonicalUserSpend(reserveInput),
        storeB.reserveCanonicalUserSpend(reserveInput),
      ]);
      expect(revived.map((result) => result.status)).toEqual(['ACTIVE', 'ACTIVE']);
      expect(
        await storeA.prisma.ledgerTransaction.count({
          where: { organizationId, reason: 'reservation.revive' },
        }),
      ).toBe(1);
      await expect(
        storeA.reserveCanonicalUserSpend({ ...reserveInput, requestHash: 'f'.repeat(64) }),
      ).rejects.toMatchObject({ code: 'LEDGER_IDEMPOTENCY_CONFLICT' });

      const cancelledId = `${requestId}:cancelled`;
      const cancelled = await storeA.reserveCanonicalUserSpend({
        ...reserveInput,
        idempotencyKey: cancelledId,
        requestHash: applicationRequestHash(cancelledId),
      });
      await ledgerA.releaseReservation(cancelled.id, 'cancel');
      const cancelledReplay = await storeA.reserveCanonicalUserSpend({
        ...reserveInput,
        idempotencyKey: cancelledId,
        requestHash: applicationRequestHash(cancelledId),
      });
      expect(cancelledReplay.status).toBe('RELEASED');

      const cappedId = `${requestId}:capped`;
      await storeA.prisma.user.create({
        data: { id: userId, email: `${userId}@canonical-reconciliation.invalid` },
      });
      await storeA.setUserSpendLimit({ organizationId, userId, limitCents: 20 });
      const cappedInput = {
        ...reserveInput,
        idempotencyKey: cappedId,
        requestHash: applicationRequestHash(cappedId),
        periodStart: new Date(Date.now() - 60_000).toISOString(),
        enforceUserSpendLimit: true,
      } as const;
      const capped = await storeA.reserveCanonicalUserSpend(cappedInput);
      await storeA.prisma.$executeRaw`
        UPDATE "LedgerReservation"
        SET "expiresAt" = clock_timestamp() - interval '1 second'
        WHERE "id" = ${capped.id}
      `;
      await ledgerA.reapExpiredReservations();
      await storeA.setUserSpendLimit({ organizationId, userId, limitCents: 5 });
      await expect(storeB.reserveCanonicalUserSpend(cappedInput)).rejects.toMatchObject({
        code: 'USER_SPEND_LIMIT_REACHED',
      });
    } finally {
      await cleanup(storeA, organizationId).catch(() => undefined);
      await storeA.prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
      await Promise.allSettled([storeA.disconnect(), storeB.disconnect()]);
    }
  });

  it(
    'backfills 101 healthy fractional receipts without starving the due platform recovery behind them',
    { timeout: 120_000 },
    async () => {
      const storeA = new PrismaApiStore(createDatabaseClient());
      const storeB = new PrismaApiStore(createDatabaseClient());
      const unique = marker();
      const organizationId = `reconcile-rolling-${unique}`;
      const orderingTime = new Date('2026-08-27T00:00:00.000Z');
      const legacyIds: string[] = [];

      try {
        await createOrganization(storeA, organizationId);
        for (let index = 0; index < 101; index += 1) {
          const requestId = `rolling-${unique}-${String(index).padStart(3, '0')}`;
          const userId = `rolling-user-${unique}`;
          const projectId = `rolling-project-${unique}`;
          const { reservation, claim } = await createClaimedCanonicalRun(storeA, {
            organizationId,
            userId,
            projectId,
            requestId,
          });
          await recordExactClassifier(storeA, {
            reservationId: reservation.id,
            organizationId,
            userId,
            projectId,
            requestId,
            executionToken: claim.executionToken,
          });
          await settleCanonicalMain(storeA, {
            reservationId: reservation.id,
            organizationId,
            userId,
            projectId,
            requestId,
            executionToken: claim.executionToken,
          });
          legacyIds.push(reservation.id);
        }
        await storeA.prisma.$executeRaw(Prisma.sql`
          UPDATE "LedgerReservation"
          SET "metadata" = "metadata" - 'canonicalAiReceiptIndex',
              "updatedAt" = ${orderingTime}
          WHERE "id" IN (${Prisma.join(legacyIds)})
        `);

        const databaseNow = new Date((await storeA.getDatabaseClock()).now);
        const due = new Date(databaseNow.getTime() - 60_000).toISOString();
        const dueId = `z-rolling-platform-due-${unique}`;
        await storeA.prisma.ledgerReservation.create({
          data: {
            id: dueId,
            organizationId,
            userId: `rolling-platform-user-${unique}`,
            idempotencyKey: `rolling-platform-due-${unique}`,
            requestHash: `rolling-platform-due-hash-${unique}`,
            operation: 'ai.chat',
            status: 'COMMITTED',
            maxAmountMinor: 0n,
            committedMinor: 0n,
            expiresAt: new Date(databaseNow.getTime() + 60 * 60_000),
            committedAt: databaseNow,
            metadata: executionMetadata({
              reservationId: dueId,
              organizationId,
              userId: `rolling-platform-user-${unique}`,
              requestId: `rolling-platform-due-${unique}`,
              projectId: `rolling-platform-project-${unique}`,
              settleAfter: due,
              platformIntent: true,
            }) as Prisma.InputJsonValue,
            createdAt: orderingTime,
            updatedAt: orderingTime,
          },
        });

        const first = await storeA.reconcileCanonicalUserSpend({ take: 100 });
        expect(first).toMatchObject({
          scanned: 100,
          manualRecovery: 0,
          recoveredPlatformAtCeiling: 0,
        });
        const second = await storeB.reconcileCanonicalUserSpend({ take: 100 });
        expect(second).toMatchObject({
          scanned: 2,
          manualRecovery: 0,
          recoveredPlatformAtCeiling: 1,
        });
        expect(await storeA.reconcileCanonicalUserSpend({ take: 100 })).toMatchObject({ scanned: 0 });
        expect(
          await storeA.prisma.agentCallLog.count({
            where: { organizationId, costMillicents: 225, source: 'classifier' },
          }),
        ).toBe(101);
        expect(
          await storeA.prisma.ledgerReservation.count({
            where: {
              id: { in: legacyIds },
              metadata: { path: ['canonicalAiReceiptIndex'], not: Prisma.JsonNull },
            },
          }),
        ).toBe(101);
      } finally {
        await cleanup(storeA, organizationId).catch(() => undefined);
        await Promise.allSettled([storeA.disconnect(), storeB.disconnect()]);
      }
    },
  );

  it('serializes revive, commit, reaper, and purge-fenced reconciliation without a PostgreSQL deadlock', async () => {
    const storeA = new PrismaApiStore(createDatabaseClient());
    const storeB = new PrismaApiStore(createDatabaseClient());
    const ledgerA = new LedgerStore(storeA.prisma);
    const ledgerB = new LedgerStore(storeB.prisma);
    const unique = marker();
    const organizationId = `reconcile-locks-${unique}`;
    const userId = `lock-user-${unique}`;
    const projectId = `lock-project-${unique}`;

    try {
      await createOrganization(storeA, organizationId);
      const reviveRequestId = `revive-race-${unique}`;
      const reviveInput = {
        organizationId,
        userId,
        projectId,
        idempotencyKey: reviveRequestId,
        maxAmountCents: 10,
        expiresInMs: 60 * 60_000,
        requestHash: applicationRequestHash(reviveRequestId),
        enforceUserSpendLimit: false,
      } as const;
      const reviveReservation = await storeA.reserveCanonicalUserSpend(reviveInput);
      await storeA.prisma.$executeRaw`
        UPDATE "LedgerReservation"
        SET "expiresAt" = clock_timestamp() - interval '1 second'
        WHERE "id" = ${reviveReservation.id}
      `;
      const reviveRace = await Promise.allSettled([
        ledgerA.reapExpiredReservations(),
        storeB.reserveCanonicalUserSpend(reviveInput),
      ]);
      expect(reviveRace.every((result) => result.status === 'fulfilled')).toBe(true);
      expect(
        (await storeA.prisma.ledgerReservation.findUniqueOrThrow({ where: { id: reviveReservation.id } })).status,
      ).toBe('ACTIVE');

      const commitReservation = await ledgerA.reserveUsage({
        organizationId,
        idempotencyKey: `commit-race-${unique}`,
        operation: 'import',
        maxAmountMinor: 10n,
        expiresInMs: 60 * 60_000,
      });
      await storeA.prisma.$executeRaw`
        UPDATE "LedgerReservation"
        SET "expiresAt" = clock_timestamp() - interval '1 second'
        WHERE "id" = ${commitReservation.id}
      `;
      const commitRace = await Promise.allSettled([
        ledgerA.commitReservation({ reservationId: commitReservation.id, actualAmountMinor: 5n }),
        ledgerB.reapExpiredReservations(),
      ]);
      for (const result of commitRace) {
        if (result.status === 'rejected') {
          expect(String((result.reason as { code?: unknown }).code)).not.toBe('40P01');
        }
      }
      expect(
        (await storeA.prisma.ledgerReservation.findUniqueOrThrow({ where: { id: commitReservation.id } })).status,
      ).toBe('EXPIRED');

      const dueRequestId = `purge-race-${unique}`;
      const { reservation: dueReservation, claim } = await createClaimedCanonicalRun(storeA, {
        organizationId,
        userId,
        projectId,
        requestId: dueRequestId,
      });
      await storeA.markCanonicalUserSpendStarted({
        reservationId: dueReservation.id,
        organizationId,
        userId,
        projectId,
        requestId: dueRequestId,
        executionToken: claim.executionToken,
        reconcileAfterMs: 60_000,
      });
      await storeA.prisma.$executeRaw(Prisma.sql`
        UPDATE "LedgerReservation"
        SET "expiresAt" = clock_timestamp() - interval '1 second',
            "metadata" = jsonb_set(
              "metadata",
              '{canonicalAiExecution,settleAfter}',
              to_jsonb(to_char(clock_timestamp() - interval '1 second', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
              false
            )
        WHERE "id" = ${dueReservation.id}
      `);

      let notifyPurgeFenceHeld!: () => void;
      let releasePurgeFence!: () => void;
      const purgeFenceHeld = new Promise<void>((resolve) => {
        notifyPurgeFenceHeld = resolve;
      });
      const continuePurge = new Promise<void>((resolve) => {
        releasePurgeFence = resolve;
      });
      const purgeOperation = storeB.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `account-purge:${userId}`);
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', 'account-purge:topology');
        notifyPurgeFenceHeld();
        await continuePurge;
        await ledgerB.releaseReservationInTransaction(tx, dueReservation.id, 'timeout');
      });
      await purgeFenceHeld;
      const reconciliation = storeA.reconcileCanonicalUserSpend({ take: 100 });
      await Promise.resolve();
      releasePurgeFence();
      const [reconciliationResult] = await Promise.all([reconciliation, purgeOperation]);
      expect(reconciliationResult).toMatchObject({ settled: 1, manualRecovery: 0 });
      expect(
        (await storeA.prisma.ledgerReservation.findUniqueOrThrow({ where: { id: dueReservation.id } })).status,
      ).toBe('COMMITTED');
    } finally {
      await cleanup(storeA, organizationId).catch(() => undefined);
      await Promise.allSettled([storeA.disconnect(), storeB.disconnect()]);
    }
  });

  it('skips 101 future STARTED rows and recovers one due COMMITTED platform intent across two clients', async () => {
    const storeA = new PrismaApiStore(createDatabaseClient());
    const storeB = new PrismaApiStore(createDatabaseClient());
    const unique = marker();
    const organizationId = `reconcile-future-${unique}`;
    const orderingTime = new Date('2026-08-27T00:00:00.000Z');

    try {
      await createOrganization(storeA, organizationId);
      const databaseNow = new Date((await storeA.getDatabaseClock()).now);
      const future = new Date(databaseNow.getTime() + 2 * 60 * 60_000).toISOString();
      const due = new Date(databaseNow.getTime() - 60_000).toISOString();
      await storeA.prisma.ledgerReservation.createMany({
        data: Array.from({ length: 101 }, (_, index) => ({
          id: `a-future-${unique}-${String(index).padStart(3, '0')}`,
          organizationId,
          userId: `future-user-${unique}`,
          idempotencyKey: `future-${unique}-${index}`,
          requestHash: `future-hash-${index}`,
          operation: 'ai.chat',
          status: 'ACTIVE' as const,
          maxAmountMinor: 10n,
          expiresAt: new Date(databaseNow.getTime() + 3 * 60 * 60_000),
          metadata: executionMetadata({
            reservationId: `a-future-${unique}-${String(index).padStart(3, '0')}`,
            organizationId,
            userId: `future-user-${unique}`,
            requestId: `future-request-${index}`,
            projectId: `future-project-${unique}`,
            settleAfter: future,
          }) as Prisma.InputJsonValue,
          createdAt: orderingTime,
          updatedAt: orderingTime,
        })),
      });
      await storeA.prisma.ledgerReservation.create({
        data: {
          id: `z-platform-due-${unique}`,
          organizationId,
          userId: `platform-user-${unique}`,
          idempotencyKey: `platform-due-${unique}`,
          requestHash: `platform-due-hash-${unique}`,
          operation: 'ai.chat',
          status: 'COMMITTED',
          maxAmountMinor: 0n,
          committedMinor: 0n,
          expiresAt: new Date(databaseNow.getTime() + 60 * 60_000),
          committedAt: databaseNow,
          metadata: executionMetadata({
            reservationId: `z-platform-due-${unique}`,
            organizationId,
            userId: `platform-user-${unique}`,
            requestId: `platform-due-${unique}`,
            projectId: `platform-project-${unique}`,
            settleAfter: due,
            platformIntent: true,
          }) as Prisma.InputJsonValue,
          createdAt: orderingTime,
          updatedAt: orderingTime,
        },
      });

      const results = await Promise.all([
        storeA.reconcileCanonicalUserSpend({ take: 100 }),
        storeB.reconcileCanonicalUserSpend({ take: 100 }),
      ]);
      expect(results.reduce((sum, result) => sum + result.recoveredPlatformAtCeiling, 0)).toBe(1);
      expect(results.reduce((sum, result) => sum + result.settled, 0)).toBe(0);
      expect(await storeA.prisma.aiCostLedger.count({ where: { organizationId } })).toBe(1);
      expect(
        await storeA.prisma.ledgerReservation.count({
          where: { organizationId, metadata: { path: ['canonicalAiManualRecovery'], not: Prisma.JsonNull } },
        }),
      ).toBe(0);
    } finally {
      await cleanup(storeA, organizationId).catch(() => undefined);
      await Promise.allSettled([storeA.disconnect(), storeB.disconnect()]);
    }
  });

  it('quarantines 101 canonical/noncanonical poison deadlines, then reaches the due row', async () => {
    const storeA = new PrismaApiStore(createDatabaseClient());
    const storeB = new PrismaApiStore(createDatabaseClient());
    const unique = marker();
    const organizationId = `reconcile-poison-${unique}`;
    const orderingTime = new Date('2026-08-27T00:00:00.000Z');

    try {
      await createOrganization(storeA, organizationId);
      const databaseNow = new Date((await storeA.getDatabaseClock()).now);
      const due = new Date(databaseNow.getTime() - 60_000).toISOString();
      await storeA.prisma.ledgerReservation.createMany({
        data: Array.from({ length: 101 }, (_, index) => ({
          id: `a-poison-${unique}-${String(index).padStart(3, '0')}`,
          organizationId,
          userId: `poison-user-${unique}`,
          idempotencyKey: `poison-${unique}-${index}`,
          requestHash: `poison-hash-${index}`,
          operation: 'ai.chat',
          status: 'ACTIVE' as const,
          maxAmountMinor: 10n,
          expiresAt: new Date(databaseNow.getTime() + 60 * 60_000),
          metadata: executionMetadata({
            reservationId: `a-poison-${unique}-${String(index).padStart(3, '0')}`,
            organizationId,
            userId: `poison-user-${unique}`,
            requestId: `poison-request-${index}`,
            projectId: `poison-project-${unique}`,
            settleAfter: index === 0 ? '2099-01-01T00:00:00+00:00' : 'not-a-database-deadline',
          }) as Prisma.InputJsonValue,
          createdAt: orderingTime,
          updatedAt: orderingTime,
        })),
      });
      await storeA.prisma.ledgerReservation.create({
        data: {
          id: `z-poison-platform-due-${unique}`,
          organizationId,
          userId: `poison-platform-user-${unique}`,
          idempotencyKey: `poison-platform-due-${unique}`,
          requestHash: `poison-platform-due-hash-${unique}`,
          operation: 'ai.chat',
          status: 'COMMITTED',
          maxAmountMinor: 0n,
          committedMinor: 0n,
          expiresAt: new Date(databaseNow.getTime() + 60 * 60_000),
          committedAt: databaseNow,
          metadata: executionMetadata({
            reservationId: `z-poison-platform-due-${unique}`,
            organizationId,
            userId: `poison-platform-user-${unique}`,
            requestId: `poison-platform-due-${unique}`,
            projectId: `poison-platform-project-${unique}`,
            settleAfter: due,
            platformIntent: true,
          }) as Prisma.InputJsonValue,
          createdAt: orderingTime,
          updatedAt: orderingTime,
        },
      });

      const first = await storeA.reconcileCanonicalUserSpend({ take: 100 });
      const second = await storeB.reconcileCanonicalUserSpend({ take: 100 });
      expect(first).toMatchObject({ scanned: 100, manualRecovery: 100, settled: 0 });
      expect(second).toMatchObject({ scanned: 2, manualRecovery: 1, recoveredPlatformAtCeiling: 1 });
      const [quarantined] = await storeA.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "count"
        FROM "LedgerReservation"
        WHERE "organizationId" = ${organizationId}
          AND jsonb_typeof("metadata"->'canonicalAiManualRecovery') = 'object'
      `);
      expect(Number(quarantined?.count ?? 0n)).toBe(101);
      expect(await storeA.prisma.aiCostLedger.count({ where: { organizationId } })).toBe(1);
    } finally {
      await cleanup(storeA, organizationId).catch(() => undefined);
      await Promise.allSettled([storeA.disconnect(), storeB.disconnect()]);
    }
  });

  it('backs off a transient FK failure and recovers after the durable DB-clock retry deadline', async () => {
    const storeA = new PrismaApiStore(createDatabaseClient());
    const storeB = new PrismaApiStore(createDatabaseClient());
    const unique = marker();
    const organizationId = `reconcile-retry-${unique}`;

    try {
      const databaseNow = new Date((await storeA.getDatabaseClock()).now);
      const due = new Date(databaseNow.getTime() - 60_000).toISOString();
      const reservationId = `retry-platform-due-${unique}`;
      await storeA.prisma.ledgerReservation.create({
        data: {
          id: reservationId,
          organizationId,
          userId: `retry-user-${unique}`,
          idempotencyKey: `retry-platform-${unique}`,
          requestHash: `retry-platform-hash-${unique}`,
          operation: 'ai.chat',
          status: 'COMMITTED',
          maxAmountMinor: 0n,
          committedMinor: 0n,
          expiresAt: new Date(databaseNow.getTime() + 60 * 60_000),
          committedAt: databaseNow,
          metadata: executionMetadata({
            reservationId,
            organizationId,
            userId: `retry-user-${unique}`,
            requestId: `retry-platform-${unique}`,
            projectId: `retry-project-${unique}`,
            settleAfter: due,
            platformIntent: true,
          }) as Prisma.InputJsonValue,
        },
      });

      await expect(storeA.reconcileCanonicalUserSpend({ take: 100 })).resolves.toMatchObject({
        scanned: 1,
        manualRecovery: 0,
        retryableFailures: 1,
      });
      const failed = await storeA.prisma.ledgerReservation.findUniqueOrThrow({ where: { id: reservationId } });
      expect(failed.metadata).toMatchObject({
        canonicalAiReconcileFailure: { attempts: 1, reason: expect.any(String), nextRetryAt: expect.any(String) },
      });
      expect(failed.metadata).not.toMatchObject({ canonicalAiManualRecovery: expect.anything() });

      await createOrganization(storeA, organizationId);
      const retryAt = new Date(databaseNow.getTime() - 1_000).toISOString();
      await storeA.prisma.$executeRaw(Prisma.sql`
        UPDATE "LedgerReservation"
        SET "metadata" = jsonb_set(
          "metadata",
          '{canonicalAiReconcileFailure,nextRetryAt}',
          to_jsonb(${retryAt}::text),
          false
        )
        WHERE "id" = ${reservationId}
      `);

      await expect(storeB.reconcileCanonicalUserSpend({ take: 100 })).resolves.toMatchObject({
        scanned: 1,
        recoveredPlatformAtCeiling: 1,
        manualRecovery: 0,
        retryableFailures: 0,
      });
      const recovered = await storeA.prisma.ledgerReservation.findUniqueOrThrow({ where: { id: reservationId } });
      expect(recovered.metadata).not.toMatchObject({ canonicalAiReconcileFailure: expect.anything() });
      expect(await storeA.prisma.aiCostLedger.count({ where: { organizationId } })).toBe(1);
    } finally {
      await cleanup(storeA, organizationId).catch(() => undefined);
      await Promise.allSettled([storeA.disconnect(), storeB.disconnect()]);
    }
  });

  it('quarantines a due platform intent with a missing authoritative hash before writing cost', async () => {
    const store = new PrismaApiStore(createDatabaseClient());
    const unique = marker();
    const organizationId = `reconcile-identity-${unique}`;
    const reservationId = `platform-identity-${unique}`;
    const userId = `identity-user-${unique}`;
    const requestId = `identity-request-${unique}`;
    const projectId = `identity-project-${unique}`;

    try {
      await createOrganization(store, organizationId);
      const databaseNow = new Date((await store.getDatabaseClock()).now);
      const metadata = executionMetadata({
        reservationId,
        organizationId,
        userId,
        requestId,
        projectId,
        settleAfter: new Date(databaseNow.getTime() - 60_000).toISOString(),
        platformIntent: true,
      }) as Record<string, unknown>;
      const platformIntent = metadata.canonicalAiPlatformIntent as Record<string, unknown>;
      delete platformIntent.requestHash;
      await store.prisma.ledgerReservation.create({
        data: {
          id: reservationId,
          organizationId,
          userId,
          idempotencyKey: `identity-${unique}`,
          requestHash: `identity-reservation-${unique}`,
          operation: 'ai.chat',
          status: 'COMMITTED',
          maxAmountMinor: 0n,
          committedMinor: 0n,
          committedAt: databaseNow,
          expiresAt: new Date(databaseNow.getTime() + 60 * 60_000),
          metadata: metadata as Prisma.InputJsonValue,
        },
      });

      await expect(store.reconcileCanonicalUserSpend({ take: 100 })).resolves.toMatchObject({
        scanned: 1,
        manualRecovery: 1,
        recoveredPlatformAtCeiling: 0,
      });
      expect(await store.prisma.aiCostLedger.count({ where: { organizationId } })).toBe(0);
      const quarantined = await store.prisma.ledgerReservation.findUniqueOrThrow({ where: { id: reservationId } });
      expect(quarantined.metadata).toMatchObject({
        canonicalAiManualRecovery: { reason: 'CANONICAL_AI_PLATFORM_INTENT_CORRUPT' },
      });
      await expect(store.reconcileCanonicalUserSpend({ take: 100 })).resolves.toMatchObject({ scanned: 0 });
    } finally {
      await cleanup(store, organizationId).catch(() => undefined);
      await store.disconnect();
    }
  });
});
