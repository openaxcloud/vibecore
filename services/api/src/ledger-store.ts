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
  compensateEntries,
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
  async getOrCreateAccount(organizationId: string, key: string, currency: string): Promise<{ id: string; type: LedgerAccountType }> {
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
   * Post a balanced transaction ATOMICALLY. Validates debit==credit per currency
   * BEFORE any write (I-LED-1) — an unbalanced set never touches the DB. Idempotent
   * on (organizationId, idempotencyKey): a replay returns the existing transaction.
   */
  async postTransaction(input: PostTransactionInput): Promise<{ id: string; entryIds: string[]; replayed: boolean }> {
    // I-LED-1 — refuse an unbalanced transaction up front.
    validateBalanced(input.entries);

    if (input.idempotencyKey) {
      const existing = await this.db.ledgerTransaction.findUnique({
        where: { organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey } },
        include: { entries: { select: { id: true } } },
      });

      if (existing) {
        return { id: existing.id, entryIds: existing.entries.map((e) => e.id), replayed: true };
      }
    }

    try {
      const tx = await this.db.$transaction(async (trx) => {
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
      });

      return { ...tx, replayed: false };
    } catch (error) {
      if (isUniqueViolation(error) && input.idempotencyKey) {
        const row = await this.db.ledgerTransaction.findUniqueOrThrow({
          where: { organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey } },
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
      where: { organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey } },
    });

    if (existing) {
      return { id: existing.id, status: existing.status, created: false };
    }

    const accounts = await this.reservationAccounts(input.organizationId, currency);

    // Hard limit (I-LED-4): projected reserved balance must stay within the cap.
    if (input.hardLimitMinor !== undefined) {
      const reservedBalance = await this.accountBalanceMinor(accounts.reservedAccountId, currency);
      // reserved is a LIABILITY (normal CREDIT) → its "size" is −net (credits exceed debits).
      const projected = -reservedBalance + input.maxAmountMinor;
      assertWithinHardLimit(projected, input.hardLimitMinor, 'reservation budget');
    }

    let reservation;
    try {
      reservation = await this.db.ledgerReservation.create({
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
    } catch (error) {
      if (isUniqueViolation(error)) {
        const row = await this.db.ledgerReservation.findUniqueOrThrow({
          where: { organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey } },
        });
        return { id: row.id, status: row.status, created: false };
      }

      throw error;
    }

    const posted = await this.postTransaction({
      organizationId: input.organizationId,
      reason: 'reservation.reserve',
      idempotencyKey: `reserve:${reservation.id}`,
      rateCardVersion: input.rateCardVersion,
      entries: reserveEntries(accounts, input.maxAmountMinor, currency),
      metadata: { reservationId: reservation.id, operation: input.operation },
    });

    await this.db.ledgerReservation.update({ where: { id: reservation.id }, data: { reserveTxId: posted.id } });

    return { id: reservation.id, status: 'ACTIVE', created: true };
  }

  /** Atomic compare-and-set reservation transition. Returns true iff this caller won. */
  private async transition(id: string, from: string[], data: Prisma.LedgerReservationUpdateManyMutationInput): Promise<boolean> {
    const res = await this.db.ledgerReservation.updateMany({ where: { id, status: { in: from as never } }, data });
    return res.count === 1;
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
      throw new LedgerError(`Reservation ${input.reservationId} is ${reservation.status}, cannot commit`, 'LEDGER_RESERVATION_NOT_ACTIVE');
    }

    const committed = input.actualAmountMinor > reservation.maxAmountMinor ? reservation.maxAmountMinor : input.actualAmountMinor;
    const won = await this.transition(input.reservationId, ['ACTIVE'], {
      status: 'COMMITTED',
      committedMinor: committed,
      committedAt: new Date(),
    });

    if (!won) {
      const again = await this.db.ledgerReservation.findUniqueOrThrow({ where: { id: input.reservationId } });
      return { committedMinor: again.committedMinor ?? 0n, replayed: true };
    }

    const accounts = await this.reservationAccounts(reservation.organizationId, reservation.currency);
    const posted = await this.postTransaction({
      organizationId: reservation.organizationId,
      reason: 'reservation.settle',
      idempotencyKey: `settle:${reservation.id}`,
      rateCardVersion: reservation.rateCardVersion ?? undefined,
      entries: settleEntries(accounts, reservation.maxAmountMinor, committed, reservation.currency, input.taxMinor ?? 0n),
      metadata: { reservationId: reservation.id, committed: committed.toString(), tax: (input.taxMinor ?? 0n).toString() },
    });

    await this.db.ledgerReservation.update({ where: { id: reservation.id }, data: { settleTxId: posted.id } });

    return { committedMinor: committed, replayed: false };
  }

  /**
   * COMPENSATE — COMMITTED → COMPENSATED. Unwinds a committed reservation with a
   * REVERSE entry (refund to available credits), never mutating the settle. The
   * compensation transaction is linked to the settle via reversalOfId.
   */
  async compensateReservation(reservationId: string, taxMinor = 0n): Promise<{ compensated: boolean }> {
    const reservation = await this.db.ledgerReservation.findUniqueOrThrow({ where: { id: reservationId } });

    if (reservation.status === 'COMPENSATED') {
      return { compensated: false };
    }

    if (reservation.status !== 'COMMITTED') {
      throw new LedgerError(`Reservation ${reservationId} is ${reservation.status}, only a COMMITTED reservation is compensated`, 'LEDGER_RESERVATION_NOT_COMMITTED');
    }

    const committed = reservation.committedMinor ?? 0n;
    const won = await this.transition(reservationId, ['COMMITTED'], {
      status: 'COMPENSATED',
      releasedAt: new Date(),
      releaseReason: 'compensation',
    });

    if (!won) {
      return { compensated: false };
    }

    if (committed > 0n) {
      const accounts = await this.reservationAccounts(reservation.organizationId, reservation.currency);
      const posted = await this.postTransaction({
        organizationId: reservation.organizationId,
        reason: 'reservation.compensate',
        idempotencyKey: `compensate:${reservation.id}`,
        reversalOfId: reservation.settleTxId ?? undefined,
        entries: compensateEntries(accounts, committed, reservation.currency, taxMinor),
        metadata: { reservationId: reservation.id, refunded: committed.toString() },
      });
      await this.db.ledgerReservation.update({ where: { id: reservation.id }, data: { compensateTxId: posted.id } });
    }

    return { compensated: true };
  }

  /**
   * RELEASE — ACTIVE → RELEASED (cancel/failure) or EXPIRED (timeout). Returns the
   * whole hold to available credits. No commit ⇒ no revenue was ever recognised.
   */
  async releaseReservation(reservationId: string, reason: 'cancel' | 'failure' | 'timeout'): Promise<{ released: boolean }> {
    const reservation = await this.db.ledgerReservation.findUniqueOrThrow({ where: { id: reservationId } });

    if (reservation.status !== 'ACTIVE') {
      return { released: false };
    }

    const nextStatus = reason === 'timeout' ? 'EXPIRED' : 'RELEASED';
    const won = await this.transition(reservationId, ['ACTIVE'], {
      status: nextStatus,
      releasedAt: new Date(),
      releaseReason: reason,
    });

    if (!won) {
      return { released: false };
    }

    const accounts = await this.reservationAccounts(reservation.organizationId, reservation.currency);
    await this.postTransaction({
      organizationId: reservation.organizationId,
      reason: `reservation.release.${reason}`,
      idempotencyKey: `release:${reservation.id}`,
      entries: releaseEntries(accounts, reservation.maxAmountMinor, reservation.currency),
      metadata: { reservationId: reservation.id, reason },
    });

    return { released: true };
  }

  /** Sweep ACTIVE reservations past expiry to EXPIRED + release their hold. */
  async reapExpiredReservations(nowIso: string): Promise<string[]> {
    const due = await this.db.ledgerReservation.findMany({
      where: { status: 'ACTIVE', expiresAt: { lte: new Date(nowIso) } },
      select: { id: true },
    });

    const reaped: string[] = [];
    for (const { id } of due) {
      const { released } = await this.releaseReservation(id, 'timeout');
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
