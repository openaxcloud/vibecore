import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

/* This DB suite is nested below API modules; Vitest does not map the app-only alias. */
// eslint-disable-next-line no-restricted-imports
import { reconcile, type ReconciliationLine } from '../ledger-reconciliation.js';
// eslint-disable-next-line no-restricted-imports
import { LedgerStore } from '../ledger-store.js';

/*
 * DURABLE ledger proofs against a REAL Postgres (the canonical double-entry
 * ledger, C1 / P0-V3-12). Gated on DATABASE_URL like the other DB-backed suites:
 * runs in CI (and locally against a migrated Postgres), silently skips otherwise.
 *
 * Proves: (1) a balanced transaction persists + an unbalanced one is refused;
 * (2) a reservation SURVIVES A RESTART (written by client A, read by an independent
 * client B); (3) compensation is a REVERSE ENTRY that nets every account to zero,
 * with the original settle byte-for-byte intact; (4) a past posted entry CANNOT be
 * mutated (DB trigger); (5) reconciliation detects a real discrepancy; (6) a hard
 * limit is refused whole (nothing posted).
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

const runDbTests = (await canReachDatabase()) ? describe : describe.skip;

const uniqueOrg = () => `org-ledger-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const HOUR = () => new Date(Date.now() + 3600_000).toISOString();

runDbTests('Canonical double-entry ledger — durable proofs (real Postgres)', () => {
  it('(1) posts a BALANCED transaction (persists) and REFUSES an unbalanced one', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new LedgerStore(prisma);
      const org = uniqueOrg();
      const a = await store.getOrCreateAccount(org, 'user_credits', 'usd');
      const b = await store.getOrCreateAccount(org, 'revenue', 'usd');

      const posted = await store.postTransaction({
        organizationId: org,
        reason: 'test.balanced',
        entries: [
          { accountId: a.id, direction: 'DEBIT', amountMinor: 100n, currency: 'usd' },
          { accountId: b.id, direction: 'CREDIT', amountMinor: 100n, currency: 'usd' },
        ],
      });
      expect(posted.entryIds).toHaveLength(2);
      expect(await store.accountBalanceMinor(a.id, 'usd')).toBe(100n);

      // Unbalanced → refused BEFORE any write.
      await expect(
        store.postTransaction({
          organizationId: org,
          reason: 'test.unbalanced',
          entries: [
            { accountId: a.id, direction: 'DEBIT', amountMinor: 100n, currency: 'usd' },
            { accountId: b.id, direction: 'CREDIT', amountMinor: 99n, currency: 'usd' },
          ],
        }),
      ).rejects.toThrow(/does not balance|LEDGER_UNBALANCED/);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(2) a reservation SURVIVES A RESTART: written by client A, read by independent client B', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();

    try {
      const storeA = new LedgerStore(prismaA);
      const storeB = new LedgerStore(prismaB);
      const org = uniqueOrg();

      const reservation = await storeA.reserveUsage({
        organizationId: org,
        idempotencyKey: 'import:job-1',
        operation: 'import',
        maxAmountMinor: 100n,
        expiresAt: HOUR(),
        importJobId: 'job-1',
      });
      expect(reservation.created).toBe(true);
      await storeA.commitReservation({ reservationId: reservation.id, actualAmountMinor: 70n });

      // Independent client (own pool) = simulated restart. It shares no in-memory state.
      const readBack = await storeB.getReservation(reservation.id);
      expect(readBack).toMatchObject({ id: reservation.id, status: 'COMMITTED', importJobId: 'job-1' });
      expect(readBack?.committedMinor).toBe(70n);

      // The ledger balances read through B prove the postings persisted too.
      const accounts = await storeB.getOrCreateAccount(org, 'revenue', 'usd');
      expect(await storeB.accountBalanceMinor(accounts.id, 'usd')).toBe(-70n); // revenue credited 70
    } finally {
      await prismaA.$disconnect();
      await prismaB.$disconnect();
    }
  });

  it('(3) COMPENSATION is a reverse entry: nets every account to zero, original settle INTACT', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new LedgerStore(prisma);
      const org = uniqueOrg();

      const r = await store.reserveUsage({
        organizationId: org,
        idempotencyKey: 'import:job-2',
        operation: 'import',
        maxAmountMinor: 100n,
        expiresAt: HOUR(),
      });
      await store.commitReservation({ reservationId: r.id, actualAmountMinor: 70n });

      const settle = await store.getReservation(r.id);
      const settleTxId = settle?.settleTxId as string;

      const settleEntriesBefore = await prisma.ledgerEntry.findMany({
        where: { transactionId: settleTxId },
        orderBy: { id: 'asc' },
      });

      await store.compensateReservation(r.id);

      // The settle transaction's entries are byte-for-byte unchanged.
      const settleEntriesAfter = await prisma.ledgerEntry.findMany({
        where: { transactionId: settleTxId },
        orderBy: { id: 'asc' },
      });
      expect(settleEntriesAfter).toEqual(settleEntriesBefore);

      // Every account for this org nets to ZERO after compensation.
      const accounts = await prisma.ledgerAccount.findMany({ where: { organizationId: org } });

      for (const acc of accounts) {
        const bal = await store.accountBalanceMinor(acc.id, acc.currency);
        expect(bal, `account ${acc.key} should net to zero`).toBe(0n);
      }

      // The compensation transaction is linked to the settle (reversalOfId).
      const comp = await store.getReservation(r.id);
      const compTx = await prisma.ledgerTransaction.findUnique({ where: { id: comp?.compensateTxId as string } });
      expect(compTx?.reversalOfId).toBe(settleTxId);
      expect(comp?.status).toBe('COMPENSATED');
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(4) a posted entry CANNOT be mutated (append-only DB trigger)', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new LedgerStore(prisma);
      const org = uniqueOrg();
      const a = await store.getOrCreateAccount(org, 'user_credits', 'usd');
      const b = await store.getOrCreateAccount(org, 'revenue', 'usd');

      const posted = await store.postTransaction({
        organizationId: org,
        reason: 'test.immutable',
        entries: [
          { accountId: a.id, direction: 'DEBIT', amountMinor: 100n, currency: 'usd' },
          { accountId: b.id, direction: 'CREDIT', amountMinor: 100n, currency: 'usd' },
        ],
      });

      // UPDATE a posted entry → refused by the DB itself.
      await expect(
        prisma.$executeRawUnsafe(`UPDATE "LedgerEntry" SET "amountMinor" = 999 WHERE id = '${posted.entryIds[0]}'`),
      ).rejects.toThrow(/append-only/);

      // DELETE the posted transaction → also refused.
      await expect(
        prisma.$executeRawUnsafe(`DELETE FROM "LedgerTransaction" WHERE id = '${posted.id}'`),
      ).rejects.toThrow(/append-only/);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(5) reconciliation DETECTS a discrepancy between the ledger and an external source', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new LedgerStore(prisma);
      const org = uniqueOrg();

      const r = await store.reserveUsage({
        organizationId: org,
        idempotencyKey: 'import:job-3',
        operation: 'import',
        maxAmountMinor: 100n,
        expiresAt: HOUR(),
      });
      await store.commitReservation({ reservationId: r.id, actualAmountMinor: 100n });

      // Ledger view: recognised revenue = 100.
      const revenue = await store.getOrCreateAccount(org, 'revenue', 'usd');
      const revenueMinor = -(await store.accountBalanceMinor(revenue.id, 'usd')); // credit balance
      const ledgerLines: ReconciliationLine[] = [{ key: `revenue:${org}`, amountMinor: revenueMinor, currency: 'usd' }];

      // External (Stripe) says 95 — a real 5-unit gap.
      const externalLines: ReconciliationLine[] = [{ key: `revenue:${org}`, amountMinor: 95n, currency: 'usd' }];

      const result = reconcile(ledgerLines, externalLines);
      expect(result.status).toBe('DISCREPANCY');
      expect(result.discrepancies[0]).toMatchObject({ kind: 'AMOUNT_MISMATCH', deltaMinor: 5n });

      const run = await store.recordReconciliationRun({
        organizationId: org,
        source: 'STRIPE',
        status: result.status,
        discrepancyCount: result.discrepancies.length,
        discrepancies: result.discrepancies.map((d) => ({
          ...d,
          ledgerMinor: d.ledgerMinor.toString(),
          externalMinor: d.externalMinor.toString(),
          deltaMinor: d.deltaMinor.toString(),
        })),
      });

      const persisted = await prisma.ledgerReconciliationRun.findUnique({ where: { id: run.id } });
      expect(persisted).toMatchObject({ status: 'DISCREPANCY', discrepancyCount: 1 });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(6) a HARD LIMIT is refused whole — nothing is posted past the safe boundary', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new LedgerStore(prisma);
      const org = uniqueOrg();

      // First reservation of 80 within a 100 cap.
      await store.reserveUsage({
        organizationId: org,
        idempotencyKey: 'k1',
        operation: 'import',
        maxAmountMinor: 80n,
        expiresAt: HOUR(),
        hardLimitMinor: 100n,
      });

      // A second reservation of 40 would push reserved to 120 > 100 → refused.
      await expect(
        store.reserveUsage({
          organizationId: org,
          idempotencyKey: 'k2',
          operation: 'import',
          maxAmountMinor: 40n,
          expiresAt: HOUR(),
          hardLimitMinor: 100n,
        }),
      ).rejects.toThrow(/LEDGER_HARD_LIMIT|limit breached/);

      // Nothing was posted for the refused reservation: it doesn't exist.
      const k2 = await prisma.ledgerReservation.findUnique({
        where: { organizationId_idempotencyKey: { organizationId: org, idempotencyKey: 'k2' } },
      });
      expect(k2).toBeNull();
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(neg) reserve idempotency — same key returns the SAME reservation, no double hold', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new LedgerStore(prisma);
      const org = uniqueOrg();

      const first = await store.reserveUsage({
        organizationId: org,
        idempotencyKey: 'dup',
        operation: 'import',
        maxAmountMinor: 50n,
        expiresAt: HOUR(),
      });
      const second = await store.reserveUsage({
        organizationId: org,
        idempotencyKey: 'dup',
        operation: 'import',
        maxAmountMinor: 50n,
        expiresAt: HOUR(),
      });
      expect(second.id).toBe(first.id);
      expect(second.created).toBe(false);

      // Exactly ONE reserve transaction exists (no double hold).
      const reserveTxs = await prisma.ledgerTransaction.count({
        where: { organizationId: org, reason: 'reservation.reserve' },
      });
      expect(reserveTxs).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(7) concurrent reserve and commit have exactly one hold and one atomic settlement', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();

    try {
      const org = uniqueOrg();
      const storeA = new LedgerStore(prismaA);
      const storeB = new LedgerStore(prismaB);

      const request = {
        organizationId: org,
        idempotencyKey: 'concurrent-reserve',
        operation: 'import',
        maxAmountMinor: 90n,
        expiresInMs: 60 * 60_000,
        requestHash: 'same-import-request',
      };

      const [left, right] = await Promise.all([storeA.reserveUsage(request), storeB.reserveUsage(request)]);

      expect(new Set([left.id, right.id]).size).toBe(1);
      expect([left.created, right.created].sort()).toEqual([false, true]);

      const [commitA, commitB] = await Promise.all([
        storeA.commitReservation({ reservationId: left.id, actualAmountMinor: 70n }),
        storeB.commitReservation({ reservationId: right.id, actualAmountMinor: 70n }),
      ]);
      expect([commitA.replayed, commitB.replayed].sort()).toEqual([false, true]);
      expect(
        await prismaA.ledgerTransaction.count({ where: { organizationId: org, reason: 'reservation.settle' } }),
      ).toBe(1);
      expect(
        await prismaA.ledgerReservation.count({
          where: { id: left.id, status: 'COMMITTED', settleTxId: { not: null } },
        }),
      ).toBe(1);
    } finally {
      await prismaA.$disconnect();
      await prismaB.$disconnect();
    }
  });

  it('(8) refuses idempotency-key reuse with another amount or transaction body', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new LedgerStore(prisma);
      const org = uniqueOrg();
      await store.reserveUsage({
        organizationId: org,
        idempotencyKey: 'request-fingerprint',
        operation: 'import',
        maxAmountMinor: 20n,
        expiresInMs: 60_000,
        requestHash: 'request-a',
      });
      await expect(
        store.reserveUsage({
          organizationId: org,
          idempotencyKey: 'request-fingerprint',
          operation: 'import',
          maxAmountMinor: 21n,
          expiresInMs: 60_000,
          requestHash: 'request-b',
        }),
      ).rejects.toMatchObject({ code: 'LEDGER_IDEMPOTENCY_CONFLICT' });

      const debit = await store.getOrCreateAccount(org, 'user_credits', 'usd');
      const credit = await store.getOrCreateAccount(org, 'revenue', 'usd');
      await store.postTransaction({
        organizationId: org,
        reason: 'fingerprinted.post',
        idempotencyKey: 'post-once',
        entries: [
          { accountId: debit.id, direction: 'DEBIT', amountMinor: 3n, currency: 'usd' },
          { accountId: credit.id, direction: 'CREDIT', amountMinor: 3n, currency: 'usd' },
        ],
      });
      await expect(
        store.postTransaction({
          organizationId: org,
          reason: 'fingerprinted.post',
          idempotencyKey: 'post-once',
          entries: [
            { accountId: debit.id, direction: 'DEBIT', amountMinor: 4n, currency: 'usd' },
            { accountId: credit.id, direction: 'CREDIT', amountMinor: 4n, currency: 'usd' },
          ],
        }),
      ).rejects.toMatchObject({ code: 'LEDGER_IDEMPOTENCY_CONFLICT' });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(9) PostgreSQL time, not a fast or slow API clock, decides reservation expiry', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new LedgerStore(prisma);
      const org = uniqueOrg();

      const reservation = await store.reserveUsage({
        organizationId: org,
        idempotencyKey: 'database-clock',
        operation: 'import',
        maxAmountMinor: 10n,
        expiresInMs: 60_000,
      });

      expect(await store.reapExpiredReservations('9999-12-31T23:59:59.999Z')).not.toContain(reservation.id);
      await prisma.$executeRaw`
        UPDATE "LedgerReservation"
        SET "expiresAt" = clock_timestamp() - interval '1 second'
        WHERE "id" = ${reservation.id}
      `;
      expect(await store.reapExpiredReservations('1970-01-01T00:00:00.000Z')).toContain(reservation.id);
      expect((await store.getReservation(reservation.id))?.status).toBe('EXPIRED');
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(10) validates account tenant and currency before persisting any transaction', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new LedgerStore(prisma);
      const orgA = uniqueOrg();
      const orgB = uniqueOrg();
      const accountA = await store.getOrCreateAccount(orgA, 'user_credits', 'usd');
      const foreign = await store.getOrCreateAccount(orgB, 'revenue', 'usd');
      const wrongCurrency = await store.getOrCreateAccount(orgA, 'revenue', 'eur');

      await expect(
        store.postTransaction({
          organizationId: orgA,
          reason: 'cross-tenant-refused',
          entries: [
            { accountId: accountA.id, direction: 'DEBIT', amountMinor: 5n, currency: 'usd' },
            { accountId: foreign.id, direction: 'CREDIT', amountMinor: 5n, currency: 'usd' },
          ],
        }),
      ).rejects.toMatchObject({ code: 'LEDGER_ACCOUNT_ORG_MISMATCH' });
      await expect(
        store.postTransaction({
          organizationId: orgA,
          reason: 'cross-currency-refused',
          entries: [
            { accountId: accountA.id, direction: 'DEBIT', amountMinor: 5n, currency: 'usd' },
            { accountId: wrongCurrency.id, direction: 'CREDIT', amountMinor: 5n, currency: 'usd' },
          ],
        }),
      ).rejects.toMatchObject({ code: 'LEDGER_ACCOUNT_CURRENCY_MISMATCH' });
      expect(await prisma.ledgerTransaction.count({ where: { organizationId: orgA } })).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  });
});
