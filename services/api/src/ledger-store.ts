/**
 * Durable canonical double-entry ledger store (C1 / P0-V3-12).
 *
 * A dedicated store class over the real Prisma client — it is the SOURCE OF TRUTH
 * for balances, superseding the mutable `CreditWallet.balanceCents`. Every posted
 * transaction is validated to balance (I-LED-1) BEFORE it is written; posted
 * transactions/entries are immutable at the DB level (migration 0078 triggers);
 * corrections are new reversing transactions (I-LED-3). The reservation lifecycle
 * (durable, survives a process restart) posts balanced transactions at each step.
 */

import { Prisma, type DatabaseClient } from '@vibecore/database';

import {
  LedgerError,
  assertWithinHardLimit,
  normalizeCurrency,
  validateBalanced,
  type LedgerEntryInput,
} from './ledger-core.js';
import {
  deriveCompensationEntries,
  releaseEntries,
  reserveEntries,
  settleEntries,
  type ReservationAccounts,
} from './ledger-reservation.js';

/** Prisma unique-constraint violation, checked structurally (P7 error typing). */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

export type LedgerAccountType = 'ASSET' | 'LIABILITY' | 'REVENUE' | 'EXPENSE' | 'EQUITY';

/** Canonical account keys + their accounting type. */
export const LEDGER_ACCOUNTS: Record<string, LedgerAccountType> = {
  user_credits: 'LIABILITY',
  reserved: 'LIABILITY',
  revenue: 'REVENUE',
  tax_payable: 'LIABILITY',
  provider_cost: 'EXPENSE',
  fx_clearing: 'LIABILITY',
  fx_rounding: 'REVENUE',
  refunds: 'EXPENSE',
};

export interface PostTransactionInput {
  organizationId: string;
  reason: string;
  entries: LedgerEntryInput[];
  idempotencyKey?: string;
  reversalOfId?: string;
  rateCardVersion?: number;
  metadata?: Record<string, unknown>;
}

export class LedgerStore {
  constructor(private readonly db: DatabaseClient) {}

  /** Idempotently resolve an account for (org, key, currency). */
  async getOrCreateAccount(
    organizationId: string,
    key: string,
    currency: string,
  ): Promise<{ id: string; type: LedgerAccountType }> {
    const type = LEDGER_ACCOUNTS[key];

    if (!type) {
      throw new LedgerError(`Unknown ledger account key "${key}"`, 'LEDGER_UNKNOWN_ACCOUNT');
    }

    const cur = normalizeCurrency(currency);

    const existing = await this.db.ledgerAccount.findUnique({
      where: { organizationId_key_currency: { organizationId, key, currency: cur } },
    });

    if (existing) {
      return { id: existing.id, type: existing.type as LedgerAccountType };
    }

    try {
      const created = await this.db.ledgerAccount.create({
        data: { organizationId, key, type, currency: cur },
      });
      return { id: created.id, type };
    } catch (error) {
      // Lost a create race — re-read.
      if (isUniqueViolation(error)) {
        const row = await this.db.ledgerAccount.findUniqueOrThrow({
          where: { organizationId_key_currency: { organizationId, key, currency: cur } },
        });
        return { id: row.id, type: row.type as LedgerAccountType };
      }

      throw error;
    }
  }

  /**
   * Post the validated entries INSIDE an already-open DB transaction. This is
   * the single write path every lifecycle method funnels through, so the
   * reservation state change and its entries always commit (or vanish) as ONE
   * unit — never a COMMITTED row without its settlement (expert defect #28-1).
   *
   * Validations, all BEFORE any write:
   *  - I-LED-1: debits == credits per currency (an unbalanced set never lands);
   *  - every account EXISTS, belongs to `input.organizationId`, and its stored
   *    currency matches the entry's currency (expert defect #28-3) — a caller
   *    can never post into another organization's books or mix currencies.
   */
  private async postEntriesInTrx(
    trx: Prisma.TransactionClient,
    input: PostTransactionInput,
  ): Promise<{ id: string; entryIds: string[] }> {
    validateBalanced(input.entries);

    const accountIds = [...new Set(input.entries.map((e) => e.accountId))];

    const accounts = await trx.ledgerAccount.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, organizationId: true, currency: true },
    });

    const byId = new Map(accounts.map((a) => [a.id, a]));

    for (const e of input.entries) {
      const account = byId.get(e.accountId);

      if (!account) {
        throw new LedgerError(`Ledger account ${e.accountId} does not exist`, 'LEDGER_ACCOUNT_NOT_FOUND');
      }

      if (account.organizationId !== input.organizationId) {
        throw new LedgerError(
          `Ledger account ${e.accountId} belongs to another organization — cross-organization posting refused`,
          'LEDGER_ACCOUNT_ORG_MISMATCH',
        );
      }

      if (account.currency !== normalizeCurrency(e.currency)) {
        throw new LedgerError(
          `Ledger account ${e.accountId} holds ${account.currency}, entry is ${normalizeCurrency(e.currency)} — currency mismatch refused`,
          'LEDGER_ACCOUNT_CURRENCY_MISMATCH',
        );
      }
    }

    const created = await trx.ledgerTransaction.create({
      data: {
        organizationId: input.organizationId,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey ?? null,
        reversalOfId: input.reversalOfId ?? null,
        rateCardVersion: input.rateCardVersion ?? null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    await trx.ledgerEntry.createMany({
      data: input.entries.map((e) => ({
        transactionId: created.id,
        accountId: e.accountId,
        direction: e.direction,
        amountMinor: e.amountMinor,
        currency: normalizeCurrency(e.currency),
      })),
    });

    const entries = await trx.ledgerEntry.findMany({ where: { transactionId: created.id }, select: { id: true } });

    return { id: created.id, entryIds: entries.map((x) => x.id) };
  }

  /**
   * Post a balanced transaction ATOMICALLY (standalone). Validates balance and
   * account ownership/currency BEFORE any write; idempotent on
   * (organizationId, idempotencyKey): a replay returns the existing transaction.
   */
  async postTransaction(input: PostTransactionInput): Promise<{ id: string; entryIds: string[]; replayed: boolean }> {
    // I-LED-1 — refuse an unbalanced transaction up front (before the trx).
    validateBalanced(input.entries);

    if (input.idempotencyKey) {
      const existing = await this.db.ledgerTransaction.findUnique({
        where: {
          organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey },
        },
        include: { entries: { select: { id: true } } },
      });

      if (existing) {
        return { id: existing.id, entryIds: existing.entries.map((e) => e.id), replayed: true };
      }
    }

    try {
      const tx = await this.db.$transaction(async (trx) => this.postEntriesInTrx(trx, input));

      return { ...tx, replayed: false };
    } catch (error) {
      if (isUniqueViolation(error) && input.idempotencyKey) {
        const row = await this.db.ledgerTransaction.findUniqueOrThrow({
          where: {
            organizationId_idempotencyKey: {
              organizationId: input.organizationId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          include: { entries: { select: { id: true } } },
        });
        return { id: row.id, entryIds: row.entries.map((e) => e.id), replayed: true };
      }

      throw error;
    }
  }

  /** Signed net balance (Σ DEBIT − Σ CREDIT) in minor units for an account. */
  async accountBalanceMinor(accountId: string, currency: string): Promise<bigint> {
    const cur = normalizeCurrency(currency);

    const rows = await this.db.ledgerEntry.findMany({
      where: { accountId, currency: cur },
      select: { direction: true, amountMinor: true },
    });

    let net = 0n;

    for (const r of rows) {
      net += r.direction === 'DEBIT' ? r.amountMinor : -r.amountMinor;
    }

    return net;
  }

  /** Resolve the standard reservation accounts for an org+currency. */
  private async reservationAccounts(organizationId: string, currency: string): Promise<ReservationAccounts> {
    const [userCredits, reserved, revenue, taxPayable] = await Promise.all([
      this.getOrCreateAccount(organizationId, 'user_credits', currency),
      this.getOrCreateAccount(organizationId, 'reserved', currency),
      this.getOrCreateAccount(organizationId, 'revenue', currency),
      this.getOrCreateAccount(organizationId, 'tax_payable', currency),
    ]);

    return {
      userCreditsAccountId: userCredits.id,
      reservedAccountId: reserved.id,
      revenueAccountId: revenue.id,
      taxPayableAccountId: taxPayable.id,
    };
  }

  /**
   * RESERVE — idempotent by (org, idempotencyKey). Optionally enforces a hard
   * limit on the org's total reserved balance BEFORE posting (I-LED-4): a reserve
   * that would breach it is refused whole, nothing posted.
   */
  async reserveUsage(input: {
    organizationId: string;
    idempotencyKey: string;
    operation: string;
    maxAmountMinor: bigint;
    currency?: string;
    expiresAt: string;
    userId?: string;
    importJobId?: string;
    rateCardVersion?: number;
    hardLimitMinor?: bigint;
  }): Promise<{ id: string; status: string; created: boolean }> {
    const currency = normalizeCurrency(input.currency ?? 'usd');

    const existing = await this.db.ledgerReservation.findUnique({
      where: {
        organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey },
      },
    });

    if (existing) {
      return { id: existing.id, status: existing.status, created: false };
    }

    // Account resolution is an idempotent upsert — safe outside the trx.
    const accounts = await this.reservationAccounts(input.organizationId, currency);

    try {
      const outcome = await this.db.$transaction(async (trx) => {
        /*
         * Hard limit (I-LED-4), SERIALIZED (expert defect #28-2): take a row
         * lock on the org's `reserved` account, THEN read its balance inside
         * the same transaction. Two concurrent reserves for the same org and
         * currency queue on this lock, so the second one sees the first one's
         * hold and is refused — the cap can no longer be overshot by a race.
         * The check-and-post is one unit: a refusal posts NOTHING.
         */
        if (input.hardLimitMinor !== undefined) {
          await trx.$queryRaw`SELECT id FROM "LedgerAccount" WHERE id = ${accounts.reservedAccountId} FOR UPDATE`;

          /*
           * EXPERT #39-3: re-check the idempotency key NOW THAT WE HOLD THE
           * LOCK, BEFORE any cap arithmetic. Two concurrent retries of the
           * SAME key can both miss the fast-path pre-check; the loser then
           * blocks on the lock until the winner's transaction commits — at
           * which point its hold EXISTS and would be counted as brand-new
           * consumption, wrongly refusing an idempotent replay with
           * LEDGER_HARD_LIMIT. Under the lock the winner's row is visible:
           * replay it instead of re-counting it.
           */
          const concurrent = await trx.ledgerReservation.findUnique({
            where: {
              organizationId_idempotencyKey: {
                organizationId: input.organizationId,
                idempotencyKey: input.idempotencyKey,
              },
            },
          });

          if (concurrent) {
            return { row: concurrent, created: false };
          }

          const rows = await trx.ledgerEntry.findMany({
            where: { accountId: accounts.reservedAccountId, currency },
            select: { direction: true, amountMinor: true },
          });

          let net = 0n;

          for (const r of rows) {
            net += r.direction === 'DEBIT' ? r.amountMinor : -r.amountMinor;
          }

          // reserved is a LIABILITY (normal CREDIT) → its "size" is −net.
          const projected = -net + input.maxAmountMinor;
          assertWithinHardLimit(projected, input.hardLimitMinor, 'reservation budget');
        }

        const created = await trx.ledgerReservation.create({
          data: {
            organizationId: input.organizationId,
            userId: input.userId ?? null,
            idempotencyKey: input.idempotencyKey,
            operation: input.operation,
            currency,
            maxAmountMinor: input.maxAmountMinor,
            rateCardVersion: input.rateCardVersion ?? null,
            importJobId: input.importJobId ?? null,
            expiresAt: new Date(input.expiresAt),
          },
        });

        /*
         * Same trx: the reservation row and its reserve entries land together
         * or not at all (expert defect #28-1 applies to reserve too).
         */
        const posted = await this.postEntriesInTrx(trx, {
          organizationId: input.organizationId,
          reason: 'reservation.reserve',
          idempotencyKey: `reserve:${created.id}`,
          rateCardVersion: input.rateCardVersion,
          entries: reserveEntries(accounts, input.maxAmountMinor, currency),
          metadata: { reservationId: created.id, operation: input.operation },
        });

        await trx.ledgerReservation.update({ where: { id: created.id }, data: { reserveTxId: posted.id } });

        return { row: created, created: true };
      });

      return { id: outcome.row.id, status: outcome.created ? 'ACTIVE' : outcome.row.status, created: outcome.created };
    } catch (error) {
      /*
       * Lost the (org, idempotencyKey) create race — the whole trx rolled
       * back (no orphan entries) and the winner's reservation is returned.
       */
      if (isUniqueViolation(error)) {
        const row = await this.db.ledgerReservation.findUniqueOrThrow({
          where: {
            organizationId_idempotencyKey: {
              organizationId: input.organizationId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        return { id: row.id, status: row.status, created: false };
      }

      throw error;
    }
  }

  /**
   * COMMIT — ACTIVE → COMMITTED. Settles the hold: recognises `committed`
   * (clamped to the ceiling) as revenue, refunds the unused remainder. Idempotent:
   * an already-committed reservation replays without a second settle.
   */
  async commitReservation(input: {
    reservationId: string;
    actualAmountMinor: bigint;
    taxMinor?: bigint;
  }): Promise<{ committedMinor: bigint; replayed: boolean }> {
    const reservation = await this.db.ledgerReservation.findUniqueOrThrow({ where: { id: input.reservationId } });

    if (reservation.status === 'COMMITTED') {
      return { committedMinor: reservation.committedMinor ?? 0n, replayed: true };
    }

    if (reservation.status !== 'ACTIVE') {
      throw new LedgerError(
        `Reservation ${input.reservationId} is ${reservation.status}, cannot commit`,
        'LEDGER_RESERVATION_NOT_ACTIVE',
      );
    }

    const committed =
      input.actualAmountMinor > reservation.maxAmountMinor ? reservation.maxAmountMinor : input.actualAmountMinor;

    const accounts = await this.reservationAccounts(reservation.organizationId, reservation.currency);

    /*
     * ONE DB transaction for the state change AND the settlement entries
     * (expert defect #28-1): the ACTIVE→COMMITTED compare-and-set and the
     * settle posting commit together or roll back together — a crash in
     * between can no longer leave a COMMITTED reservation with no settlement,
     * and a lost CAS writes NOTHING.
     */
    const posted = await this.db.$transaction(async (trx) => {
      const won = await trx.ledgerReservation.updateMany({
        where: { id: input.reservationId, status: 'ACTIVE' },
        data: { status: 'COMMITTED', committedMinor: committed, committedAt: new Date(), version: { increment: 1 } },
      });

      if (won.count !== 1) {
        return null; // lost the race — this trx has written nothing
      }

      const tx = await this.postEntriesInTrx(trx, {
        organizationId: reservation.organizationId,
        reason: 'reservation.settle',
        idempotencyKey: `settle:${reservation.id}`,
        rateCardVersion: reservation.rateCardVersion ?? undefined,
        entries: settleEntries(
          accounts,
          reservation.maxAmountMinor,
          committed,
          reservation.currency,
          input.taxMinor ?? 0n,
        ),
        metadata: {
          reservationId: reservation.id,
          committed: committed.toString(),
          tax: (input.taxMinor ?? 0n).toString(),
        },
      });

      await trx.ledgerReservation.update({ where: { id: reservation.id }, data: { settleTxId: tx.id } });

      return tx;
    });

    if (!posted) {
      const again = await this.db.ledgerReservation.findUniqueOrThrow({ where: { id: input.reservationId } });
      return { committedMinor: again.committedMinor ?? 0n, replayed: true };
    }

    return { committedMinor: committed, replayed: false };
  }

  /**
   * COMPENSATE — COMMITTED → COMPENSATED. Unwinds a committed reservation with a
   * REVERSE entry (refund to available credits), never mutating the settle. The
   * compensation transaction is linked to the settle via reversalOfId.
   *
   * The reversal — tax split included — is DERIVED from the PERSISTED settle
   * entries (expert defect #28-4 / I-LED-4): the caller supplies nothing. A
   * re-supplied `taxMinor` could diverge from what was actually booked; the
   * ledger itself is the only source the compensation trusts.
   */
  async compensateReservation(reservationId: string): Promise<{ compensated: boolean }> {
    const reservation = await this.db.ledgerReservation.findUniqueOrThrow({ where: { id: reservationId } });

    if (reservation.status === 'COMPENSATED') {
      return { compensated: false };
    }

    if (reservation.status !== 'COMMITTED') {
      throw new LedgerError(
        `Reservation ${reservationId} is ${reservation.status}, only a COMMITTED reservation is compensated`,
        'LEDGER_RESERVATION_NOT_COMMITTED',
      );
    }

    const committed = reservation.committedMinor ?? 0n;
    const accounts = await this.reservationAccounts(reservation.organizationId, reservation.currency);

    // Derive the reversal from what the settle ACTUALLY posted.
    const persistedSettle = reservation.settleTxId
      ? await this.db.ledgerEntry.findMany({
          where: { transactionId: reservation.settleTxId },
          select: { accountId: true, direction: true, amountMinor: true, currency: true },
        })
      : [];

    const entries = deriveCompensationEntries(persistedSettle, accounts);

    // One trx: CAS + reversal entries land together or not at all (#28-1).
    const won = await this.db.$transaction(async (trx) => {
      const cas = await trx.ledgerReservation.updateMany({
        where: { id: reservationId, status: 'COMMITTED' },
        data: {
          status: 'COMPENSATED',
          releasedAt: new Date(),
          releaseReason: 'compensation',
          version: { increment: 1 },
        },
      });

      if (cas.count !== 1) {
        return false;
      }

      if (entries.length > 0) {
        const posted = await this.postEntriesInTrx(trx, {
          organizationId: reservation.organizationId,
          reason: 'reservation.compensate',
          idempotencyKey: `compensate:${reservation.id}`,
          reversalOfId: reservation.settleTxId ?? undefined,
          entries,
          metadata: { reservationId: reservation.id, refunded: committed.toString(), derivedFromSettle: true },
        });
        await trx.ledgerReservation.update({ where: { id: reservation.id }, data: { compensateTxId: posted.id } });
      }

      return true;
    });

    return { compensated: won };
  }

  /**
   * RELEASE — ACTIVE → RELEASED (cancel/failure) or EXPIRED (timeout). Returns the
   * whole hold to available credits. No commit ⇒ no revenue was ever recognised.
   */
  /**
   * Release a hold (cancel/failure → RELEASED, timeout → EXPIRED), returning the
   * held credits. Fail-closed guards (expert V3 §C):
   *  - `requireExpiredBefore` (the reaper passes `now`): the CAS only fires when
   *    `expiresAt <= now` STILL holds — a concurrent revive that extended the
   *    expiry makes this match 0 rows, so a just-revived hold is never expired;
   *  - `expectedVersion` (the reaper passes the version it selected): the CAS
   *    pins that generation — any concurrent transition (revive/attach) bumped
   *    it and the CAS matches 0 rows.
   * The transition itself bumps `version`.
   */
  async releaseReservation(
    reservationId: string,
    reason: 'cancel' | 'failure' | 'timeout',
    opts: { requireExpiredBefore?: Date; expectedVersion?: number } = {},
  ): Promise<{ released: boolean }> {
    const reservation = await this.db.ledgerReservation.findUniqueOrThrow({ where: { id: reservationId } });

    if (reservation.status !== 'ACTIVE') {
      return { released: false };
    }

    const nextStatus = reason === 'timeout' ? 'EXPIRED' : 'RELEASED';
    const accounts = await this.reservationAccounts(reservation.organizationId, reservation.currency);

    // One trx: the state change and the hold-return entries are atomic (#28-1).
    const won = await this.db.$transaction(async (trx) => {
      const cas = await trx.ledgerReservation.updateMany({
        where: {
          id: reservationId,
          status: 'ACTIVE',
          ...(opts.requireExpiredBefore ? { expiresAt: { lte: opts.requireExpiredBefore } } : {}),
          ...(opts.expectedVersion !== undefined ? { version: opts.expectedVersion } : {}),
        },
        data: { status: nextStatus, releasedAt: new Date(), releaseReason: reason, version: { increment: 1 } },
      });

      if (cas.count !== 1) {
        return false;
      }

      await this.postEntriesInTrx(trx, {
        organizationId: reservation.organizationId,
        reason: `reservation.release.${reason}`,
        idempotencyKey: `release:${reservation.id}:v${reservation.version}`,
        entries: releaseEntries(accounts, reservation.maxAmountMinor, reservation.currency),
        metadata: { reservationId: reservation.id, reason, version: reservation.version },
      });

      return true;
    });

    return { released: won };
  }

  /**
   * ORPHAN RECOVERY (expert #39-1): revive a DEAD, NEVER-ATTACHED reservation
   * so the same idempotency key can complete after a crash between reserve()
   * and job creation/attach — instead of replying IMPORT_CREATE_IN_PROGRESS
   * forever. Two money-distinct cases, each atomic:
   *
   *  - stale ACTIVE (past `nowIso`, unattached): the hold entries are still
   *    posted — only the expiry is extended, no new entries;
   *  - EXPIRED / RELEASED (the release already returned the hold): CAS back
   *    to ACTIVE and RE-POST the reserve entries in the same transaction.
   *
   * A reservation that is attached to a job, committed, or still live is
   * NEVER revived — reviving a live hold would let a concurrent creator fork
   * a second job, the exact defect #27-2 fixed.
   */
  async reviveReservation(input: { reservationId: string; expiresAt: string; nowIso: string }): Promise<boolean> {
    const nextExpiry = new Date(input.expiresAt);

    /*
     * Case 1 — stale-ACTIVE unattached: hold intact, extend the expiry only.
     * BUMP `version` (expert V3 §C): a concurrent reaper that SELECTED this row
     * as expired pins the old version in its compare-and-set; the bump makes
     * that CAS match 0 rows, and the extended expiry ALSO fails the reaper's
     * `expiresAt <= now` guard — belt-and-suspenders, the reaper can no longer
     * flip a just-revived hold to EXPIRED.
     */
    const extended = await this.db.ledgerReservation.updateMany({
      where: {
        id: input.reservationId,
        status: 'ACTIVE',
        importJobId: null,
        expiresAt: { lt: new Date(input.nowIso) },
      },
      data: { expiresAt: nextExpiry, version: { increment: 1 } },
    });

    if (extended.count === 1) {
      return true;
    }

    const reservation = await this.db.ledgerReservation.findUnique({ where: { id: input.reservationId } });

    if (
      !reservation ||
      reservation.importJobId !== null ||
      (reservation.status !== 'EXPIRED' && reservation.status !== 'RELEASED')
    ) {
      return false;
    }

    const accounts = await this.reservationAccounts(reservation.organizationId, reservation.currency);

    // Case 2 — hold already returned: one trx re-arms the row AND re-posts it.
    return this.db.$transaction(async (trx) => {
      const cas = await trx.ledgerReservation.updateMany({
        where: { id: reservation.id, status: { in: ['EXPIRED', 'RELEASED'] }, importJobId: null },
        data: {
          status: 'ACTIVE',
          expiresAt: nextExpiry,
          releasedAt: null,
          releaseReason: null,
          version: { increment: 1 },
        },
      });

      if (cas.count !== 1) {
        return false;
      }

      const posted = await this.postEntriesInTrx(trx, {
        organizationId: reservation.organizationId,
        reason: 'reservation.revive',

        /*
         * Unique per revival: only the CAS winner reaches this post, and it
         * alone sets this exact expiry.
         */
        idempotencyKey: `reserve:${reservation.id}:${nextExpiry.getTime()}`,
        entries: reserveEntries(accounts, reservation.maxAmountMinor, reservation.currency),
        metadata: { reservationId: reservation.id, revived: true },
      });

      await trx.ledgerReservation.update({ where: { id: reservation.id }, data: { reserveTxId: posted.id } });

      return true;
    });
  }

  /**
   * Sweep ACTIVE reservations past expiry to EXPIRED + release their hold.
   * Each row is expired under the version + expiry it was SELECTED with
   * (expert V3 §C): if a revive extends the expiry and bumps the version
   * between the SELECT and the compare-and-set, the guarded CAS matches 0 rows
   * and the reaper leaves that (now live) hold alone — no lost-update.
   */
  async reapExpiredReservations(nowIso: string): Promise<string[]> {
    const now = new Date(nowIso);

    const due = await this.db.ledgerReservation.findMany({
      where: { status: 'ACTIVE', expiresAt: { lte: now } },
      select: { id: true, version: true },
    });

    const reaped: string[] = [];

    for (const { id, version } of due) {
      const { released } = await this.releaseReservation(id, 'timeout', {
        requireExpiredBefore: now,
        expectedVersion: version,
      });

      if (released) {
        reaped.push(id);
      }
    }

    return reaped;
  }

  async getReservation(id: string) {
    return this.db.ledgerReservation.findUnique({ where: { id } });
  }

  /** Persist a reconciliation run (OK or DISCREPANCY) for audit. */
  async recordReconciliationRun(input: {
    organizationId?: string;
    source: string;
    status: 'OK' | 'DISCREPANCY';
    discrepancyCount: number;
    discrepancies?: unknown;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string }> {
    const run = await this.db.ledgerReconciliationRun.create({
      data: {
        organizationId: input.organizationId ?? null,
        source: input.source,
        status: input.status,
        discrepancyCount: input.discrepancyCount,
        discrepancies: (input.discrepancies ?? undefined) as Prisma.InputJsonValue | undefined,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    return { id: run.id };
  }
}
