import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

import { DurableImportCreditLedger } from '../import-billing-durable.js';
import { LedgerError } from '../ledger-core.js';
import { LedgerStore } from '../ledger-store.js';

/*
 * FIX-FORWARD PROOFS against a REAL Postgres for the expert's refusal of
 * PR #27 (import safety billing) and PR #28 (double-entry ledger store).
 * Gated on DATABASE_URL like the other DB-backed suites.
 *
 * PR #27 (durable, org-scoped, serialized, owned):
 *  A1 the same idempotency key in TWO organizations → two independent reservations;
 *  A2 two CONCURRENT reserves for the same (org, key), separate connections →
 *     exactly ONE `created: true`;
 *  A3 a reservation written by client A is visible/settleable via client B
 *     (durability across process boundaries);
 *  A4 ownership: another organization cannot settle or even read the reservation.
 *
 * PR #28 (atomicity, serialized hard limit, org/currency validation, derived
 * compensation):
 *  B1 concurrent double-commit → exactly ONE settle transaction; the state
 *     change and its entries are one DB transaction (no COMMITTED row without
 *     its settlement anywhere);
 *  B2 hard limit under CONCURRENCY: two reserves that each fit alone but not
 *     together → exactly one succeeds (FOR-UPDATE serialization);
 *  B3 a transaction whose entries point at another org's account — or at an
 *     account in a different currency — is REFUSED with NOTHING persisted;
 *  B4 compensation derives the tax split from the PERSISTED settle entries —
 *     the caller supplies nothing, and every account nets to zero.
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

const uniqueOrg = (tag: string) =>
  `org-fix-${tag}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const HOUR = () => new Date(Date.now() + 3600_000).toISOString();

runDbTests('PR #27 fix-forward — durable org-scoped import reservations (real Postgres)', () => {
  it('A1 — same key, two organizations → two INDEPENDENT reservations', async () => {
    const prisma = createDatabaseClient();

    try {
      const ledger = new DurableImportCreditLedger(prisma);
      const orgA = uniqueOrg('a1a');
      const orgB = uniqueOrg('a1b');

      const a = await ledger.reserve({ organizationId: orgA, key: 'shared-key', reservedCredits: 3 });
      const b = await ledger.reserve({ organizationId: orgB, key: 'shared-key', reservedCredits: 7 });

      expect(a.created).toBe(true);
      expect(b.created).toBe(true); // NOT a replay of org A's hold
      expect(a.reservation.organizationId).toBe(orgA);
      expect(b.reservation.organizationId).toBe(orgB);
      expect(a.reservation.reservedCredits).toBe(3);
      expect(b.reservation.reservedCredits).toBe(7);

      const rows = await prisma.ledgerReservation.findMany({
        where: { organizationId: { in: [orgA, orgB] }, idempotencyKey: 'shared-key' },
      });
      expect(rows).toHaveLength(2);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('A2 — two CONCURRENT reserves, same (org, key), separate connections → exactly ONE created', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();

    try {
      const org = uniqueOrg('a2');
      const ledgerA = new DurableImportCreditLedger(prismaA);
      const ledgerB = new DurableImportCreditLedger(prismaB);

      const [ra, rb] = await Promise.all([
        ledgerA.reserve({ organizationId: org, key: 'race-key', reservedCredits: 5 }),
        ledgerB.reserve({ organizationId: org, key: 'race-key', reservedCredits: 5 }),
      ]);

      /*
       * The DB unique (organizationId, idempotencyKey) is the serialization:
       * one creator, one replayer — never two holds.
       */
      expect([ra.created, rb.created].sort()).toEqual([false, true]);
      expect(await prismaA.ledgerReservation.count({ where: { organizationId: org } })).toBe(1);
    } finally {
      await prismaA.$disconnect();
      await prismaB.$disconnect();
    }
  });

  it('A3 — a reservation written by client A survives into client B (durable across restart)', async () => {
    const org = uniqueOrg('a3');

    const prismaA = createDatabaseClient();
    const ledgerA = new DurableImportCreditLedger(prismaA);
    const heldA = await ledgerA.reserve({ organizationId: org, key: 'restart-key', reservedCredits: 4 });
    await ledgerA.attachJob(org, 'restart-key', 'job-restart', heldA.reservation.version);
    await prismaA.$disconnect(); // "process death"

    const prismaB = createDatabaseClient();

    try {
      const ledgerB = new DurableImportCreditLedger(prismaB);
      const seen = await ledgerB.getByJob(org, 'job-restart');
      expect(seen?.state).toBe('RESERVED');
      expect(seen?.reservedCredits).toBe(4);

      const settled = await ledgerB.settleByJob(org, 'job-restart', true, 4);
      expect(settled.state).toBe('SETTLED');
      expect(settled.debitedCredits).toBe(4);
    } finally {
      await prismaB.$disconnect();
    }
  });

  it('A4 — ownership: another organization can neither settle nor read the reservation', async () => {
    const prisma = createDatabaseClient();

    try {
      const ledger = new DurableImportCreditLedger(prisma);
      const owner = uniqueOrg('a4o');
      const intruder = uniqueOrg('a4i');

      const heldOwner = await ledger.reserve({ organizationId: owner, key: 'owned-key', reservedCredits: 2 });
      await ledger.attachJob(owner, 'owned-key', 'job-owned', heldOwner.reservation.version);

      await expect(ledger.settleByJob(intruder, 'job-owned', true, 2)).rejects.toMatchObject({
        code: 'BILLING_RESERVATION_FOREIGN',
      });
      expect(await ledger.getByJob(intruder, 'job-owned')).toBeUndefined();

      // The owner's hold is untouched by the refused attempt.
      expect((await ledger.getByJob(owner, 'job-owned'))?.state).toBe('RESERVED');
    } finally {
      await prisma.$disconnect();
    }
  });
});

runDbTests(
  'PR #28 fix-forward — atomic settlement, serialized hard limit, validated accounts, derived compensation',
  () => {
    it('B1 — concurrent double-commit → ONE settle transaction; state+entries always land together', async () => {
      const prismaA = createDatabaseClient();
      const prismaB = createDatabaseClient();

      try {
        const org = uniqueOrg('b1');
        const storeA = new LedgerStore(prismaA);
        const storeB = new LedgerStore(prismaB);

        const r = await storeA.reserveUsage({
          organizationId: org,
          idempotencyKey: 'double-commit',
          operation: 'import',
          maxAmountMinor: 100n,
          expiresAt: HOUR(),
        });

        const [ca, cb] = await Promise.all([
          storeA.commitReservation({ reservationId: r.id, actualAmountMinor: 60n }),
          storeB.commitReservation({ reservationId: r.id, actualAmountMinor: 60n }),
        ]);

        // Exactly one real settle; the loser replays the same result.
        expect([ca.replayed, cb.replayed].sort()).toEqual([false, true]);
        expect(ca.committedMinor).toBe(60n);
        expect(cb.committedMinor).toBe(60n);

        const settles = await prismaA.ledgerTransaction.findMany({
          where: { organizationId: org, reason: 'reservation.settle' },
        });
        expect(settles).toHaveLength(1);

        /*
         * Single-transaction invariant: a COMMITTED reservation ALWAYS carries its
         * settlement pointer — there is no half-committed state to observe.
         */
        const broken = await prismaA.ledgerReservation.count({
          where: { organizationId: org, status: 'COMMITTED', settleTxId: null },
        });
        expect(broken).toBe(0);
      } finally {
        await prismaA.$disconnect();
        await prismaB.$disconnect();
      }
    });

    it('B2 — hard limit under CONCURRENCY: each fits alone, both together breach → exactly one refused', async () => {
      const prismaA = createDatabaseClient();
      const prismaB = createDatabaseClient();

      try {
        const org = uniqueOrg('b2');
        const storeA = new LedgerStore(prismaA);
        const storeB = new LedgerStore(prismaB);

        // Limit 100; each hold asks 70 — alone OK, together 140 > 100.
        const results = await Promise.allSettled([
          storeA.reserveUsage({
            organizationId: org,
            idempotencyKey: 'cap-a',
            operation: 'import',
            maxAmountMinor: 70n,
            expiresAt: HOUR(),
            hardLimitMinor: 100n,
          }),
          storeB.reserveUsage({
            organizationId: org,
            idempotencyKey: 'cap-b',
            operation: 'import',
            maxAmountMinor: 70n,
            expiresAt: HOUR(),
            hardLimitMinor: 100n,
          }),
        ]);

        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

        /*
         * The FOR-UPDATE lock serializes the two check-and-posts: the second one
         * SEES the first hold and is refused — the cap can no longer be overshot.
         */
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect((rejected[0].reason as LedgerError).code).toBe('LEDGER_HARD_LIMIT');

        // Exactly one hold posted; total reserved stays within the cap.
        expect(await prismaA.ledgerReservation.count({ where: { organizationId: org, status: 'ACTIVE' } })).toBe(1);
      } finally {
        await prismaA.$disconnect();
        await prismaB.$disconnect();
      }
    });

    it('B3 — an entry pointing at ANOTHER org’s account, or at a different-currency account, is refused with NOTHING persisted', async () => {
      const prisma = createDatabaseClient();

      try {
        const store = new LedgerStore(prisma);
        const orgA = uniqueOrg('b3a');
        const orgB = uniqueOrg('b3b');

        const mine = await store.getOrCreateAccount(orgA, 'user_credits', 'usd');
        const theirs = await store.getOrCreateAccount(orgB, 'revenue', 'usd');

        await expect(
          store.postTransaction({
            organizationId: orgA,
            reason: 'test.cross-org',
            entries: [
              { accountId: mine.id, direction: 'DEBIT', amountMinor: 10n, currency: 'usd' },
              { accountId: theirs.id, direction: 'CREDIT', amountMinor: 10n, currency: 'usd' },
            ],
          }),
        ).rejects.toMatchObject({ code: 'LEDGER_ACCOUNT_ORG_MISMATCH' });

        const mineEur = await store.getOrCreateAccount(orgA, 'revenue', 'eur');

        await expect(
          store.postTransaction({
            organizationId: orgA,
            reason: 'test.cross-currency',
            entries: [
              { accountId: mine.id, direction: 'DEBIT', amountMinor: 10n, currency: 'usd' },

              /*
               * Balanced per currency? usd 10 debit vs usd 10 credit — but the
               * TARGET ACCOUNT holds eur: the account/currency mismatch must veto.
               */
              { accountId: mineEur.id, direction: 'CREDIT', amountMinor: 10n, currency: 'usd' },
            ],
          }),
        ).rejects.toMatchObject({ code: 'LEDGER_ACCOUNT_CURRENCY_MISMATCH' });

        // Atomicity of the refusal: NOTHING was persisted by either attempt.
        expect(await prisma.ledgerTransaction.count({ where: { organizationId: orgA } })).toBe(0);
        expect(await prisma.ledgerEntry.count({ where: { account: { organizationId: orgA } } })).toBe(0);
      } finally {
        await prisma.$disconnect();
      }
    });

    it('B4 — compensation derives the tax split from the PERSISTED settle; every account nets to zero', async () => {
      const prisma = createDatabaseClient();

      try {
        const store = new LedgerStore(prisma);
        const org = uniqueOrg('b4');

        const r = await store.reserveUsage({
          organizationId: org,
          idempotencyKey: 'derived-comp',
          operation: 'import',
          maxAmountMinor: 100n,
          expiresAt: HOUR(),
        });

        // Settle 60 with 9 tax → persisted: revenue 51, tax 9, refund 40.
        await store.commitReservation({ reservationId: r.id, actualAmountMinor: 60n, taxMinor: 9n });

        // NO tax argument here — the reversal must derive 51/9 from the ledger.
        const comp = await store.compensateReservation(r.id);
        expect(comp.compensated).toBe(true);

        const row = await prisma.ledgerReservation.findUniqueOrThrow({ where: { id: r.id } });
        expect(row.status).toBe('COMPENSATED');
        expect(row.compensateTxId).not.toBeNull();

        const compensation = await prisma.ledgerTransaction.findUniqueOrThrow({
          where: { id: row.compensateTxId! },
          include: { entries: { include: { account: true } } },
        });

        // Linked to the settle it reverses, derived flag recorded.
        expect(compensation.reversalOfId).toBe(row.settleTxId);

        const byKey = (key: string, direction: 'DEBIT' | 'CREDIT') =>
          compensation.entries
            .filter((e) => e.account.key === key && e.direction === direction)
            .reduce((acc, e) => acc + e.amountMinor, 0n);

        expect(byKey('revenue', 'DEBIT')).toBe(51n); // derived, not re-supplied
        expect(byKey('tax_payable', 'DEBIT')).toBe(9n); // derived tax split
        expect(byKey('user_credits', 'CREDIT')).toBe(60n); // full committed refund

        // Money conservation: every account of the org nets to ZERO.
        const entries = await prisma.ledgerEntry.findMany({
          where: { account: { organizationId: org } },
          include: { account: true },
        });

        const nets = new Map<string, bigint>();

        for (const e of entries) {
          const previous = nets.get(e.account.key) ?? 0n;
          nets.set(e.account.key, previous + (e.direction === 'DEBIT' ? e.amountMinor : -e.amountMinor));
        }

        for (const [, net] of nets) {
          expect(net).toBe(0n);
        }
      } finally {
        await prisma.$disconnect();
      }
    });
  },
);

runDbTests(
  'PR #39 fix-forward — orphan recovery, target compensation, idempotent retry under cap (real Postgres)',
  () => {
    it('C1 — EXPERT #39-3: two concurrent retries of the SAME key under a hard limit → both succeed, no false LEDGER_HARD_LIMIT', async () => {
      const prismaA = createDatabaseClient();
      const prismaB = createDatabaseClient();

      try {
        const org = uniqueOrg('c1');
        const storeA = new LedgerStore(prismaA);
        const storeB = new LedgerStore(prismaB);

        /*
         * Limit 100, hold 70: a SECOND hold would breach — but these two calls
         * are the SAME logical operation (idempotent retry), so both must pass.
         */
        const results = await Promise.allSettled([
          storeA.reserveUsage({
            organizationId: org,
            idempotencyKey: 'retry-under-cap',
            operation: 'import',
            maxAmountMinor: 70n,
            expiresAt: HOUR(),
            hardLimitMinor: 100n,
          }),
          storeB.reserveUsage({
            organizationId: org,
            idempotencyKey: 'retry-under-cap',
            operation: 'import',
            maxAmountMinor: 70n,
            expiresAt: HOUR(),
            hardLimitMinor: 100n,
          }),
        ]);

        // NO rejection: the post-lock re-check turns the loser into a replay.
        const rejected = results.filter((r) => r.status === 'rejected');
        expect(rejected).toHaveLength(0);

        const fulfilled = results.filter(
          (r): r is PromiseFulfilledResult<{ id: string; status: string; created: boolean }> =>
            r.status === 'fulfilled',
        );
        expect(fulfilled.map((r) => r.value.created).sort()).toEqual([false, true]);
        expect(new Set(fulfilled.map((r) => r.value.id)).size).toBe(1); // same hold

        expect(await prismaA.ledgerReservation.count({ where: { organizationId: org } })).toBe(1);
      } finally {
        await prismaA.$disconnect();
        await prismaB.$disconnect();
      }
    });

    it('A1 — EXPERT #39-1: an EXPIRED never-attached reservation is REVIVED by a retry of the same key (no eternal IMPORT_CREATE_IN_PROGRESS)', async () => {
      const prisma = createDatabaseClient();

      try {
        const org = uniqueOrg('rev1');
        const ledger = new DurableImportCreditLedger(prisma);
        const store = new LedgerStore(prisma);

        // Crash between reserve() and attachJob(): reserved, never attached.
        const first = await ledger.reserve({ organizationId: org, key: 'orphan-key', reservedCredits: 5 });
        expect(first.created).toBe(true);

        // The timeout sweep releases the dead hold (expiry recovery, step 1).
        const future = new Date(Date.now() + 2 * 3600_000).toISOString();
        const reaped = await store.reapExpiredReservations(future);
        expect(reaped.length).toBeGreaterThanOrEqual(1);

        const dead = await prisma.ledgerReservation.findUniqueOrThrow({
          where: { organizationId_idempotencyKey: { organizationId: org, idempotencyKey: 'orphan-key' } },
        });
        expect(dead.status).toBe('EXPIRED');
        expect(dead.importJobId).toBeNull();

        // The retry with the SAME key proceeds as creator (reprise, step 2)…
        const retry = await ledger.reserve({ organizationId: org, key: 'orphan-key', reservedCredits: 5 });
        expect(retry.created).toBe(true);
        expect(retry.reservation.state).toBe('RESERVED');

        // …and the revived hold attaches (at its bumped version) + settles normally.
        expect(await ledger.attachJob(org, 'orphan-key', 'job-revived', retry.reservation.version)).toBe('attached');

        const settled = await ledger.settleByJob(org, 'job-revived', true, 5);
        expect(settled.debitedCredits).toBe(5);

        /*
         * Money conservation across reserve→release→revive→settle: the reserved
         * account nets to zero once the revived hold is consumed.
         */
        const entries = await prisma.ledgerEntry.findMany({
          where: { account: { organizationId: org, key: 'reserved' } },
          select: { direction: true, amountMinor: true },
        });

        let net = 0n;

        for (const e of entries) {
          net += e.direction === 'DEBIT' ? e.amountMinor : -e.amountMinor;
        }
        expect(net).toBe(0n);
      } finally {
        await prisma.$disconnect();
      }
    });

    it('A2 — a stale-ACTIVE never-attached hold (sweeper not yet passed) is revived by expiry extension, without double-posting the hold', async () => {
      const prisma = createDatabaseClient();

      try {
        const org = uniqueOrg('rev2');
        const store = new LedgerStore(prisma);
        const ledger = new DurableImportCreditLedger(prisma);

        // Reserve with an ALREADY-PAST expiry, never attached (simulated crash).
        await store.reserveUsage({
          organizationId: org,
          idempotencyKey: 'stale-key',
          operation: 'import',
          maxAmountMinor: 5n,
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
        });

        const retry = await ledger.reserve({ organizationId: org, key: 'stale-key', reservedCredits: 5 });
        expect(retry.created).toBe(true); // revived as creator

        // Exactly ONE reserve posting — the extension did not double the hold.
        const reserveTxs = await prisma.ledgerTransaction.count({
          where: { organizationId: org, reason: { in: ['reservation.reserve', 'reservation.revive'] } },
        });
        expect(reserveTxs).toBe(1);
      } finally {
        await prisma.$disconnect();
      }
    });

    it('A3 — a LIVE unattached hold is NOT revivable (no second creator can fork)', async () => {
      const prisma = createDatabaseClient();

      try {
        const org = uniqueOrg('rev3');
        const ledger = new DurableImportCreditLedger(prisma);

        const first = await ledger.reserve({ organizationId: org, key: 'live-key', reservedCredits: 5 });
        expect(first.created).toBe(true);

        /*
         * Concurrent second request, winner not yet attached: must be a REPLAY,
         * never a revival — otherwise two creators would fork two jobs.
         */
        const second = await ledger.reserve({ organizationId: org, key: 'live-key', reservedCredits: 5 });
        expect(second.created).toBe(false);
      } finally {
        await prisma.$disconnect();
      }
    });
  },
);

runDbTests('PR #39 V3 §C — course reaper/revive/attach fermée (fail-closed, real Postgres)', () => {
  const PAST = () => new Date(Date.now() - 60_000).toISOString();
  const FUTURE = () => new Date(Date.now() + 3600_000).toISOString();

  it('C1 — interleaving EXACT: le reaper SÉLECTIONNE une expirée, un revive l’étend+bumpe la version, le CAS du reaper ÉCHOUE (reste ACTIVE)', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new LedgerStore(prisma);
      const org = uniqueOrg('v3c1');

      // Orphan: reserved with an ALREADY-PAST expiry, never attached (crash).
      const r = await store.reserveUsage({
        organizationId: org,
        idempotencyKey: 'race-key',
        operation: 'import',
        maxAmountMinor: 5n,
        expiresAt: PAST(),
      });

      // STEP 1 — the reaper SELECTS the due row (id + version it will pin).
      const now = new Date();

      const selected = await prisma.ledgerReservation.findMany({
        where: { status: 'ACTIVE', expiresAt: { lte: now } },
        select: { id: true, version: true },
      });

      const picked = selected.find((s) => s.id === r.id);
      expect(picked).toBeTruthy();

      const selectedVersion = picked!.version;

      /*
       * STEP 2 — a retry REVIVES it FIRST: extends expiry into the future,
       * bumps the version. Interleaved BEFORE the reaper's compare-and-set.
       */
      const revived = await store.reviveReservation({
        reservationId: r.id,
        expiresAt: FUTURE(),
        nowIso: now.toISOString(),
      });
      expect(revived).toBe(true);

      /*
       * STEP 3 — the reaper NOW applies its guarded CAS with the version it
       * selected + expiresAt<=now. Both guards fail → 0 rows → NOT expired.
       */
      const { released } = await store.releaseReservation(r.id, 'timeout', {
        requireExpiredBefore: now,
        expectedVersion: selectedVersion,
      });
      expect(released).toBe(false);

      const after = await prisma.ledgerReservation.findUniqueOrThrow({ where: { id: r.id } });
      expect(after.status).toBe('ACTIVE'); // survived the reaper
      expect(after.version).toBe(selectedVersion + 1); // the revive's bump
      expect(new Date(after.expiresAt).getTime()).toBeGreaterThan(now.getTime());

      /*
       * STEP 4/5 — the retry creates the job and attaches at the REVIVED
       * version → attaches to a LIVE hold (never to an expired one).
       */
      const ledger = new DurableImportCreditLedger(prisma);
      const attached = await ledger.attachJob(org, 'race-key', 'job-race', after.version);
      expect(attached).toBe('attached');

      const bound = await prisma.ledgerReservation.findUniqueOrThrow({ where: { id: r.id } });
      expect(bound.status).toBe('ACTIVE');
      expect(bound.importJobId).toBe('job-race');
    } finally {
      await prisma.$disconnect();
    }
  });

  it('C2 — fail-closed: attacher un job à une réservation DÉJÀ expirée par le reaper est REFUSÉ', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new LedgerStore(prisma);
      const ledger = new DurableImportCreditLedger(prisma);
      const org = uniqueOrg('v3c2');

      const r = await store.reserveUsage({
        organizationId: org,
        idempotencyKey: 'expired-key',
        operation: 'import',
        maxAmountMinor: 5n,
        expiresAt: PAST(),
      });

      const v0 = (await prisma.ledgerReservation.findUniqueOrThrow({ where: { id: r.id } })).version;

      // No revive this time: the reaper wins and expires it.
      const reaped = await store.reapExpiredReservations(new Date().toISOString());
      expect(reaped).toContain(r.id);
      expect((await prisma.ledgerReservation.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('EXPIRED');

      /*
       * A job MUST NOT attach to the expired hold — even at the version the
       * caller last saw (v0). Predicate requires status ACTIVE + expiresAt>now.
       */
      const attached = await ledger.attachJob(org, 'expired-key', 'job-late', v0);
      expect(attached).toBe('conflict');

      const row = await prisma.ledgerReservation.findUniqueOrThrow({ where: { id: r.id } });
      expect(row.importJobId).toBeNull(); // no job bound to an expired hold
    } finally {
      await prisma.$disconnect();
    }
  });

  it('C3 — fuzz concurrent: reaper vs revive lancés ensemble N fois → JAMAIS d’EXPIRED avec un job attaché', async () => {
    const prismaR = createDatabaseClient();
    const prismaV = createDatabaseClient();
    const prismaA = createDatabaseClient();

    try {
      const storeR = new LedgerStore(prismaR);
      const storeV = new LedgerStore(prismaV);
      const ledgerA = new DurableImportCreditLedger(prismaA);

      for (let i = 0; i < 12; i += 1) {
        const org = uniqueOrg(`v3c3-${i}`);

        const r = await storeR.reserveUsage({
          organizationId: org,
          idempotencyKey: `fuzz-${i}`,
          operation: 'import',
          maxAmountMinor: 3n,
          expiresAt: PAST(),
        });

        // Reaper and revive race on separate connections.
        await Promise.all([
          storeR.reapExpiredReservations(new Date().toISOString()),
          storeV.reviveReservation({ reservationId: r.id, expiresAt: FUTURE(), nowIso: new Date().toISOString() }),
        ]);

        const row = await prismaA.ledgerReservation.findUniqueOrThrow({ where: { id: r.id } });

        // Attempt an attach at the CURRENT version (what a retry would read).
        const attached = await ledgerA.attachJob(org, `fuzz-${i}`, `job-fuzz-${i}`, row.version);
        const final = await prismaA.ledgerReservation.findUniqueOrThrow({ where: { id: r.id } });

        /*
         * THE INVARIANT: a job is attached ONLY to a live (ACTIVE) hold. It is
         * never bound to an EXPIRED reservation — whichever way the race fell.
         */
        if (final.importJobId !== null) {
          expect(final.status).toBe('ACTIVE');
          expect(attached).toBe('attached');
        } else {
          // No attach ⇒ the hold was expired ⇒ attach correctly refused.
          expect(attached).toBe('conflict');
          expect(final.status).toBe('EXPIRED');
        }
      }
    } finally {
      await prismaR.$disconnect();
      await prismaV.$disconnect();
      await prismaA.$disconnect();
    }
  });
});
