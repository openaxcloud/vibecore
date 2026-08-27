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

import { createHash } from 'node:crypto';

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

const RESERVATION_REVIVE_REASON = 'reservation.revive';

/** Prisma unique-constraint violation, checked structurally (P7 error typing). */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

function conflict(message: string, code: string): LedgerError {
  return Object.assign(new LedgerError(message, code), { statusCode: 409 });
}

async function databaseNow(trx: Prisma.TransactionClient): Promise<Date> {
  const rows = await trx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
  const value = rows[0]?.now;

  if (!(value instanceof Date)) {
    throw new LedgerError('PostgreSQL clock is unavailable', 'LEDGER_DATABASE_TIME_UNAVAILABLE');
  }

  return value;
}

function boundedDeadline(now: Date, durationMs: number): Date {
  if (!Number.isFinite(durationMs) || durationMs < 1_000 || durationMs > 7 * 24 * 60 * 60_000) {
    throw new LedgerError('Reservation duration is outside the supported range', 'LEDGER_BAD_EXPIRY');
  }

  return new Date(now.getTime() + Math.trunc(durationMs));
}

type ReservationRequest = {
  organizationId: string;
  idempotencyKey: string;
  operation: string;
  maxAmountMinor: bigint;
  currency: string;
  userId?: string;
  importJobId?: string;
  rateCardVersion?: number;
  requestHash?: string;
  enforceUserSpendLimit?: boolean;
  userSpendPeriodStart?: string;
};

function reservationRequestHash(input: ReservationRequest): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
        operation: input.operation,
        maxAmountMinor: input.maxAmountMinor.toString(),
        currency: normalizeCurrency(input.currency),
        userId: input.userId ?? null,
        importJobId: input.importJobId ?? null,
        rateCardVersion: input.rateCardVersion ?? null,
        upstreamRequestHash: input.requestHash ?? null,
        enforceUserSpendLimit: input.enforceUserSpendLimit ?? false,
        userSpendPeriodStart: input.userSpendPeriodStart ?? null,
      }),
    )
    .digest('hex');
}

function transactionRequestHash(input: PostTransactionInput): string {
  const entries = input.entries
    .map((entry) => ({
      accountId: entry.accountId,
      direction: entry.direction,
      amountMinor: entry.amountMinor.toString(),
      currency: normalizeCurrency(entry.currency),
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

  return createHash('sha256')
    .update(
      JSON.stringify({
        organizationId: input.organizationId,
        reason: input.reason,
        reversalOfId: input.reversalOfId ?? null,
        rateCardVersion: input.rateCardVersion ?? null,
        entries,
      }),
    )
    .digest('hex');
}

/** AI calls that may already have reached a provider are owned by their reconciler. */
function canonicalAiProviderMayHaveStarted(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return false;
  }
  const value = metadata as Record<string, unknown>;
  const execution = value.canonicalAiExecution;
  const batch = value.canonicalAiUsageBatch;
  const platformIntent = value.canonicalAiPlatformIntent;
  const platformReceipt = value.canonicalAiPlatformUsage;
  const executionState =
    execution !== null && typeof execution === 'object' && !Array.isArray(execution)
      ? (execution as Record<string, unknown>).state
      : undefined;
  return (
    executionState === 'started' ||
    executionState === 'received' ||
    (platformIntent !== null &&
      typeof platformIntent === 'object' &&
      !Array.isArray(platformIntent) &&
      !(platformReceipt !== null && typeof platformReceipt === 'object' && !Array.isArray(platformReceipt))) ||
    (batch !== null && typeof batch === 'object' && !Array.isArray(batch))
  );
}

/** An expired canonical hold is safe to reacquire only before user-billed work. */
function canonicalAiReservationCanRevive(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return true;
  }
  const value = metadata as Record<string, unknown>;
  const execution =
    value.canonicalAiExecution &&
    typeof value.canonicalAiExecution === 'object' &&
    !Array.isArray(value.canonicalAiExecution)
      ? (value.canonicalAiExecution as Record<string, unknown>)
      : undefined;
  const platformIntent = value.canonicalAiPlatformIntent;
  const platformReceipt = value.canonicalAiPlatformUsage;
  const batch = value.canonicalAiUsageBatch;
  const platformPending =
    platformIntent !== null &&
    typeof platformIntent === 'object' &&
    !Array.isArray(platformIntent) &&
    !(platformReceipt !== null && typeof platformReceipt === 'object' && !Array.isArray(platformReceipt));

  return (
    execution?.state !== 'started' &&
    execution?.state !== 'received' &&
    execution?.state !== 'settled' &&
    !platformPending &&
    !(batch !== null && typeof batch === 'object' && !Array.isArray(batch))
  );
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

export interface ReserveUsageInput {
  organizationId: string;
  idempotencyKey: string;
  operation: string;
  maxAmountMinor: bigint;
  currency?: string;
  expiresAt?: string;

  /** Prefer a duration: the deadline is then derived from PostgreSQL time. */
  expiresInMs?: number;
  userId?: string;
  importJobId?: string;
  rateCardVersion?: number;
  hardLimitMinor?: bigint;

  /**
   * Enterprise per-user cap. The current UserSpendLimit row and all canonical
   * reservations in this billing period are read under the same transaction
   * lock, so two API replicas cannot both authorize the last cents.
   */
  enforceUserSpendLimit?: boolean;
  userSpendPeriodStart?: string;

  /** Optional upstream request digest, incorporated into replay identity. */
  requestHash?: string;

  /**
   * Reacquire the same exact released request after a pre-provider crash. This
   * is intentionally opt-in and only supports canonical AI reservations whose
   * metadata proves that no user-billed provider call has started.
   */
  reviveReleasedReplay?: boolean;
}

export interface CommitReservationInput {
  reservationId: string;
  actualAmountMinor: bigint;
  taxMinor?: bigint;

  /** Billing adapters may fail closed instead of silently clamping an overage. */
  refuseOverage?: boolean;
}

export class LedgerStore {
  constructor(private readonly _db: DatabaseClient) {}

  /**
   * Acquire the global reservation-mutation prefix locks without locking the
   * reservation row yet. Callers that need a larger transaction must invoke
   * this before their own `FOR UPDATE`, preserving account -> reservation order.
   */
  async lockReservationBalanceInTransaction(
    trx: Prisma.TransactionClient,
    reservationId: string,
  ): Promise<void> {
    const preflight = await trx.ledgerReservation.findUniqueOrThrow({
      where: { id: reservationId },
      select: { organizationId: true, currency: true },
    });
    const accounts = await this._reservationAccountsInTrx(trx, preflight.organizationId, preflight.currency);
    await this._lockReservationBalance(trx, accounts.reservedAccountId);
  }

  private async _getOrCreateAccountInTrx(
    trx: Prisma.TransactionClient,
    organizationId: string,
    key: string,
    currency: string,
  ): Promise<{ id: string; type: LedgerAccountType }> {
    const type = LEDGER_ACCOUNTS[key];

    if (!type) {
      throw new LedgerError(`Unknown ledger account key "${key}"`, 'LEDGER_UNKNOWN_ACCOUNT');
    }

    const normalized = normalizeCurrency(currency);

    const account = await trx.ledgerAccount.upsert({
      where: { organizationId_key_currency: { organizationId, key, currency: normalized } },
      create: { organizationId, key, type, currency: normalized },
      update: {},
    });

    if (account.organizationId !== organizationId || account.currency !== normalized || account.type !== type) {
      throw new LedgerError('Ledger account identity is inconsistent', 'LEDGER_ACCOUNT_IDENTITY_MISMATCH');
    }

    return { id: account.id, type };
  }

  /** Idempotently resolve an account for (org, key, currency). */
  async getOrCreateAccount(
    organizationId: string,
    key: string,
    currency: string,
  ): Promise<{ id: string; type: LedgerAccountType }> {
    return this._db.$transaction((trx) => this._getOrCreateAccountInTrx(trx, organizationId, key, currency));
  }

  private async _postEntriesInTrx(
    trx: Prisma.TransactionClient,
    input: PostTransactionInput,
  ): Promise<{ id: string; entryIds: string[] }> {
    validateBalanced(input.entries);

    const accountIds = [...new Set(input.entries.map((entry) => entry.accountId))];

    const accounts = await trx.ledgerAccount.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, organizationId: true, currency: true },
    });

    const byId = new Map(accounts.map((account) => [account.id, account]));

    for (const entry of input.entries) {
      const account = byId.get(entry.accountId);

      if (!account) {
        throw new LedgerError(`Ledger account ${entry.accountId} does not exist`, 'LEDGER_ACCOUNT_NOT_FOUND');
      }

      if (account.organizationId !== input.organizationId) {
        throw new LedgerError('Cross-organization ledger posting refused', 'LEDGER_ACCOUNT_ORG_MISMATCH');
      }

      if (account.currency !== normalizeCurrency(entry.currency)) {
        throw new LedgerError('Ledger account currency mismatch refused', 'LEDGER_ACCOUNT_CURRENCY_MISMATCH');
      }
    }

    const requestHash = transactionRequestHash(input);

    const created = await trx.ledgerTransaction.create({
      data: {
        organizationId: input.organizationId,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey ?? null,
        reversalOfId: input.reversalOfId ?? null,
        rateCardVersion: input.rateCardVersion ?? null,
        metadata: {
          ...(input.metadata ?? {}),
          requestHash,
        } as Prisma.InputJsonValue,
      },
    });

    await trx.ledgerEntry.createMany({
      data: input.entries.map((entry) => ({
        transactionId: created.id,
        accountId: entry.accountId,
        direction: entry.direction,
        amountMinor: entry.amountMinor,
        currency: normalizeCurrency(entry.currency),
      })),
    });

    const entries = await trx.ledgerEntry.findMany({
      where: { transactionId: created.id },
      select: { id: true },
    });

    return { id: created.id, entryIds: entries.map((entry) => entry.id) };
  }

  private _assertTransactionReplayMatches(
    existing: {
      reason: string;
      reversalOfId: string | null;
      rateCardVersion: number | null;
      metadata: unknown;
      entries: Array<{ accountId: string; direction: string; amountMinor: bigint; currency: string }>;
    },
    input: PostTransactionInput,
  ): void {
    const metadata =
      typeof existing.metadata === 'object' && existing.metadata !== null && !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : undefined;

    const persistedHash = typeof metadata?.requestHash === 'string' ? metadata.requestHash : undefined;

    if (persistedHash) {
      if (persistedHash !== transactionRequestHash(input)) {
        throw conflict(
          'Ledger transaction idempotency key was reused for another request',
          'LEDGER_IDEMPOTENCY_CONFLICT',
        );
      }

      return;
    }

    const expected = input.entries
      .map((entry) => `${entry.accountId}:${entry.direction}:${entry.amountMinor}:${normalizeCurrency(entry.currency)}`)
      .sort();
    const actual = existing.entries
      .map((entry) => `${entry.accountId}:${entry.direction}:${entry.amountMinor}:${normalizeCurrency(entry.currency)}`)
      .sort();

    if (
      existing.reason !== input.reason ||
      existing.reversalOfId !== (input.reversalOfId ?? null) ||
      existing.rateCardVersion !== (input.rateCardVersion ?? null) ||
      expected.length !== actual.length ||
      expected.some((value, index) => value !== actual[index])
    ) {
      throw conflict(
        'Ledger transaction idempotency key was reused for another request',
        'LEDGER_IDEMPOTENCY_CONFLICT',
      );
    }
  }

  /**
   * Post a balanced transaction ATOMICALLY. Validates debit==credit per currency
   * BEFORE any write (I-LED-1) — an unbalanced set never touches the DB. Idempotent
   * on (organizationId, idempotencyKey): a replay returns the existing transaction.
   */
  async postTransaction(input: PostTransactionInput): Promise<{ id: string; entryIds: string[]; replayed: boolean }> {
    validateBalanced(input.entries);

    if (input.idempotencyKey) {
      const existing = await this._db.ledgerTransaction.findUnique({
        where: {
          organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey },
        },
        include: {
          entries: { select: { id: true, accountId: true, direction: true, amountMinor: true, currency: true } },
        },
      });

      if (existing) {
        this._assertTransactionReplayMatches(existing, input);
        return { id: existing.id, entryIds: existing.entries.map((e) => e.id), replayed: true };
      }
    }

    try {
      const tx = await this._db.$transaction((trx) => this._postEntriesInTrx(trx, input));

      return { ...tx, replayed: false };
    } catch (error) {
      if (isUniqueViolation(error) && input.idempotencyKey) {
        const row = await this._db.ledgerTransaction.findUniqueOrThrow({
          where: {
            organizationId_idempotencyKey: {
              organizationId: input.organizationId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          include: {
            entries: { select: { id: true, accountId: true, direction: true, amountMinor: true, currency: true } },
          },
        });
        this._assertTransactionReplayMatches(row, input);

        return { id: row.id, entryIds: row.entries.map((e) => e.id), replayed: true };
      }

      throw error;
    }
  }

  /** Signed net balance (Σ DEBIT − Σ CREDIT) in minor units for an account. */
  async accountBalanceMinor(accountId: string, currency: string): Promise<bigint> {
    const cur = normalizeCurrency(currency);

    const rows = await this._db.ledgerEntry.findMany({
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
  private async _reservationAccountsInTrx(
    trx: Prisma.TransactionClient,
    organizationId: string,
    currency: string,
  ): Promise<ReservationAccounts> {
    const normalizedCurrency = normalizeCurrency(currency);

    /*
     * Serialize first-use account creation across replicas. Prisma's emulated
     * upsert can otherwise surface P2002 when two different reservation keys
     * initialize the same tenant/currency concurrently; retrying by reservation
     * key cannot recover because neither reservation necessarily exists yet.
     */
    await trx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ledger-accounts:${organizationId}:${normalizedCurrency}`}))`;

    const userCredits = await this._getOrCreateAccountInTrx(trx, organizationId, 'user_credits', normalizedCurrency);
    const reserved = await this._getOrCreateAccountInTrx(trx, organizationId, 'reserved', normalizedCurrency);
    const revenue = await this._getOrCreateAccountInTrx(trx, organizationId, 'revenue', normalizedCurrency);
    const taxPayable = await this._getOrCreateAccountInTrx(trx, organizationId, 'tax_payable', normalizedCurrency);

    return {
      userCreditsAccountId: userCredits.id,
      reservedAccountId: reserved.id,
      revenueAccountId: revenue.id,
      taxPayableAccountId: taxPayable.id,
    };
  }

  private async _lockReservationBalance(trx: Prisma.TransactionClient, accountId: string): Promise<void> {
    await trx.$queryRaw`SELECT "id" FROM "LedgerAccount" WHERE "id" = ${accountId} FOR UPDATE`;
  }

  private _assertReservationReplayMatches(
    existing: {
      organizationId: string;
      idempotencyKey: string;
      operation: string;
      maxAmountMinor: bigint;
      currency: string;
      userId: string | null;
      importJobId: string | null;
      rateCardVersion: number | null;
      requestHash: string | null;
    },
    input: ReservationRequest,
    expectedHash: string,
  ): void {
    const matchesLegacyShape =
      existing.organizationId === input.organizationId &&
      existing.idempotencyKey === input.idempotencyKey &&
      existing.operation === input.operation &&
      existing.maxAmountMinor === input.maxAmountMinor &&
      existing.currency === normalizeCurrency(input.currency) &&
      existing.userId === (input.userId ?? null) &&
      existing.importJobId === (input.importJobId ?? null) &&
      existing.rateCardVersion === (input.rateCardVersion ?? null);

    if (
      (existing.requestHash && existing.requestHash !== expectedHash) ||
      (!existing.requestHash && !matchesLegacyShape)
    ) {
      throw conflict(
        'Ledger reservation idempotency key was reused for another request',
        'LEDGER_IDEMPOTENCY_CONFLICT',
      );
    }
  }

  /**
   * RESERVE — idempotent by (org, idempotencyKey). Optionally enforces a hard
   * limit on the org's total reserved balance BEFORE posting (I-LED-4): a reserve
   * that would breach it is refused whole, nothing posted.
   */
  async reserveUsageInTransaction(
    trx: Prisma.TransactionClient,
    input: ReserveUsageInput,
  ): Promise<{ id: string; status: string; created: boolean }> {
    const currency = normalizeCurrency(input.currency ?? 'usd');
    const request: ReservationRequest = { ...input, currency };
    const requestHash = reservationRequestHash(request);
    const accounts = await this._reservationAccountsInTrx(trx, input.organizationId, currency);
    await this._lockReservationBalance(trx, accounts.reservedAccountId);

    let existing = await trx.ledgerReservation.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: input.organizationId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });

    if (existing) {
      await trx.$queryRaw`SELECT "id" FROM "LedgerReservation" WHERE "id" = ${existing.id} FOR UPDATE`;
      existing = await trx.ledgerReservation.findUniqueOrThrow({ where: { id: existing.id } });
      this._assertReservationReplayMatches(existing, request, requestHash);

      if (!existing.requestHash) {
        await trx.ledgerReservation.update({ where: { id: existing.id }, data: { requestHash } });
      }

      if (
        input.reviveReleasedReplay &&
        existing.operation === 'ai.chat' &&
        canonicalAiReservationCanRevive(existing.metadata)
      ) {
        const now = await databaseNow(trx);
        const expiresAt =
          input.expiresInMs !== undefined
            ? boundedDeadline(now, input.expiresInMs)
            : input.expiresAt
              ? new Date(input.expiresAt)
              : undefined;
        if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
          throw new LedgerError('Reservation expiry is required', 'LEDGER_BAD_EXPIRY');
        }

        if (existing.status === 'ACTIVE' && existing.expiresAt <= now) {
          const renewed = await trx.ledgerReservation.updateMany({
            where: {
              id: existing.id,
              status: 'ACTIVE',
              version: existing.version,
              expiresAt: { lte: now },
            },
            data: { expiresAt, version: { increment: 1 } },
          });
          if (renewed.count === 1) {
            return { id: existing.id, status: 'ACTIVE', created: false };
          }
          throw conflict('Reservation replay lost its expiry fence', 'LEDGER_RESERVATION_FENCE_LOST');
        }

        // Only the DB-clock timeout state is replayable. An explicit RELEASED
        // state may represent cancellation, offboarding, or purge and must stay
        // terminal even if no provider was reached.
        if (existing.status === 'EXPIRED') {
          if (input.enforceUserSpendLimit) {
            if (!input.userId || !input.userSpendPeriodStart) {
              throw new LedgerError(
                'User spend enforcement needs an actor and period',
                'LEDGER_USER_SPEND_SCOPE_REQUIRED',
              );
            }
            const periodStart = new Date(input.userSpendPeriodStart);
            if (Number.isNaN(periodStart.getTime()) || periodStart > now) {
              throw new LedgerError('User spend period is invalid', 'LEDGER_USER_SPEND_PERIOD_INVALID');
            }
            await trx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ledger-user-spend:${input.organizationId}:${input.userId}`}))`;
            const limit = await trx.userSpendLimit.findUnique({
              where: {
                organizationId_userId: {
                  organizationId: input.organizationId,
                  userId: input.userId,
                },
              },
              select: { limitCents: true },
            });
            if (limit) {
              const periodReservations = await trx.ledgerReservation.findMany({
                where: {
                  organizationId: input.organizationId,
                  userId: input.userId,
                  currency,
                  OR: [
                    { status: 'ACTIVE', createdAt: { gte: periodStart } },
                    { status: 'COMMITTED', committedAt: { gte: periodStart } },
                  ],
                },
                select: { status: true, maxAmountMinor: true, committedMinor: true },
              });
              const claimed = periodReservations.reduce(
                (sum, reservation) =>
                  sum +
                  (reservation.status === 'COMMITTED'
                    ? (reservation.committedMinor ?? 0n)
                    : reservation.maxAmountMinor),
                0n,
              );
              if (claimed + existing.maxAmountMinor > BigInt(limit.limitCents)) {
                throw Object.assign(
                  new LedgerError('User spend limit would be exceeded', 'USER_SPEND_LIMIT_REACHED'),
                  { statusCode: 429 },
                );
              }
            }
          }

          const revived = await trx.ledgerReservation.updateMany({
            where: { id: existing.id, status: existing.status, version: existing.version, importJobId: null },
            data: {
              status: 'ACTIVE',
              expiresAt,
              releasedAt: null,
              releaseReason: null,
              version: { increment: 1 },
            },
          });
          if (revived.count === 1) {
            const posted = await this._postEntriesInTrx(trx, {
              organizationId: existing.organizationId,
              reason: RESERVATION_REVIVE_REASON,
              idempotencyKey: `reserve:${existing.id}:v${existing.version + 1}`,
              rateCardVersion: existing.rateCardVersion ?? undefined,
              entries: reserveEntries(accounts, existing.maxAmountMinor, currency),
              metadata: { reservationId: existing.id, revived: true, version: existing.version + 1 },
            });
            await trx.ledgerReservation.update({
              where: { id: existing.id },
              data: { reserveTxId: posted.id },
            });
            return { id: existing.id, status: 'ACTIVE', created: false };
          }
        }
      }

      return { id: existing.id, status: existing.status, created: false };
    }

    const now = await databaseNow(trx);

    if (input.enforceUserSpendLimit) {
      if (!input.userId || !input.userSpendPeriodStart) {
        throw new LedgerError('User spend enforcement needs an actor and period', 'LEDGER_USER_SPEND_SCOPE_REQUIRED');
      }

      const periodStart = new Date(input.userSpendPeriodStart);
      if (Number.isNaN(periodStart.getTime()) || periodStart > now) {
        throw new LedgerError('User spend period is invalid', 'LEDGER_USER_SPEND_PERIOD_INVALID');
      }

      /*
       * User-limit mutations take the same advisory lock. The org reservation
       * balance lock above serializes reservations, while this lock also fences
       * an administrator lowering/clearing the cap concurrently.
       */
      await trx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ledger-user-spend:${input.organizationId}:${input.userId}`}))`;

      const limit = await trx.userSpendLimit.findUnique({
        where: {
          organizationId_userId: {
            organizationId: input.organizationId,
            userId: input.userId,
          },
        },
        select: { limitCents: true },
      });

      if (limit) {
        const periodReservations = await trx.ledgerReservation.findMany({
          where: {
            organizationId: input.organizationId,
            userId: input.userId,
            currency,
            OR: [
              { status: 'ACTIVE', createdAt: { gte: periodStart } },
              { status: 'COMMITTED', committedAt: { gte: periodStart } },
            ],
          },
          select: { status: true, maxAmountMinor: true, committedMinor: true },
        });
        const claimed = periodReservations.reduce(
          (sum, reservation) =>
            sum +
            (reservation.status === 'COMMITTED'
              ? (reservation.committedMinor ?? 0n)
              : reservation.maxAmountMinor),
          0n,
        );

        if (claimed + input.maxAmountMinor > BigInt(limit.limitCents)) {
          throw Object.assign(
            new LedgerError('User spend limit would be exceeded', 'USER_SPEND_LIMIT_REACHED'),
            { statusCode: 429 },
          );
        }
      }
    }

    const expiresAt =
      input.expiresInMs !== undefined
        ? boundedDeadline(now, input.expiresInMs)
        : input.expiresAt
          ? new Date(input.expiresAt)
          : undefined;

    if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
      throw new LedgerError('Reservation expiry is required', 'LEDGER_BAD_EXPIRY');
    }

    if (input.hardLimitMinor !== undefined) {
      const rows = await trx.ledgerEntry.findMany({
        where: { accountId: accounts.reservedAccountId, currency },
        select: { direction: true, amountMinor: true },
      });
      const net = rows.reduce(
        (total, row) => total + (row.direction === 'DEBIT' ? row.amountMinor : -row.amountMinor),
        0n,
      );
      assertWithinHardLimit(-net + input.maxAmountMinor, input.hardLimitMinor, 'reservation budget');
    }

    const reservation = await trx.ledgerReservation.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId ?? null,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        operation: input.operation,
        currency,
        maxAmountMinor: input.maxAmountMinor,
        rateCardVersion: input.rateCardVersion ?? null,
        importJobId: input.importJobId ?? null,
        expiresAt,
      },
    });

    const posted = await this._postEntriesInTrx(trx, {
      organizationId: input.organizationId,
      reason: 'reservation.reserve',
      idempotencyKey: `reserve:${reservation.id}:v0`,
      rateCardVersion: input.rateCardVersion,
      entries: reserveEntries(accounts, input.maxAmountMinor, currency),
      metadata: { reservationId: reservation.id, operation: input.operation, requestHash },
    });
    await trx.ledgerReservation.update({ where: { id: reservation.id }, data: { reserveTxId: posted.id } });

    return { id: reservation.id, status: reservation.status, created: true };
  }

  async reserveUsage(input: ReserveUsageInput): Promise<{ id: string; status: string; created: boolean }> {
    const currency = normalizeCurrency(input.currency ?? 'usd');
    const request: ReservationRequest = { ...input, currency };
    const requestHash = reservationRequestHash(request);

    try {
      return await this._db.$transaction((trx) => this.reserveUsageInTransaction(trx, input));
    } catch (error) {
      if (isUniqueViolation(error)) {
        const row = await this._db.ledgerReservation.findUniqueOrThrow({
          where: {
            organizationId_idempotencyKey: {
              organizationId: input.organizationId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        this._assertReservationReplayMatches(row, request, requestHash);

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
  async commitReservationInTransaction(
    trx: Prisma.TransactionClient,
    input: CommitReservationInput,
  ): Promise<{ committedMinor: bigint; replayed: boolean }> {
    const preflight = await trx.ledgerReservation.findUniqueOrThrow({
      where: { id: input.reservationId },
      select: { organizationId: true, currency: true },
    });
    const accounts = await this._reservationAccountsInTrx(trx, preflight.organizationId, preflight.currency);
    await this._lockReservationBalance(trx, accounts.reservedAccountId);
    await trx.$queryRaw`SELECT "id" FROM "LedgerReservation" WHERE "id" = ${input.reservationId} FOR UPDATE`;

    const reservation = await trx.ledgerReservation.findUniqueOrThrow({ where: { id: input.reservationId } });

    if (reservation.organizationId !== preflight.organizationId || reservation.currency !== preflight.currency) {
      throw new LedgerError('Reservation identity changed while acquiring its lock', 'LEDGER_RESERVATION_SCOPE_MISMATCH');
    }

    if (input.refuseOverage && input.actualAmountMinor > reservation.maxAmountMinor) {
      throw conflict('Reservation charge exceeds its authorized ceiling', 'LEDGER_RESERVATION_OVERAGE');
    }

    const committed =
      input.actualAmountMinor > reservation.maxAmountMinor ? reservation.maxAmountMinor : input.actualAmountMinor;

    const taxMinor = input.taxMinor ?? 0n;

    if (reservation.status === 'COMMITTED') {
      const settle = reservation.settleTxId
        ? await trx.ledgerTransaction.findUnique({
            where: { id: reservation.settleTxId },
            select: { metadata: true },
          })
        : null;
      const metadata =
        typeof settle?.metadata === 'object' && settle.metadata !== null && !Array.isArray(settle.metadata)
          ? (settle.metadata as Record<string, unknown>)
          : undefined;

      if (reservation.committedMinor !== committed || metadata?.tax !== taxMinor.toString()) {
        throw conflict('Reservation commit replay differs from the settled request', 'LEDGER_COMMIT_CONFLICT');
      }

      return { committedMinor: reservation.committedMinor ?? 0n, replayed: true };
    }

    if (reservation.status !== 'ACTIVE') {
      throw new LedgerError('Reservation is not active and cannot be committed', 'LEDGER_RESERVATION_NOT_ACTIVE');
    }

    const now = await databaseNow(trx);

    if (reservation.expiresAt <= now) {
      throw conflict('Expired reservation cannot be committed', 'LEDGER_RESERVATION_EXPIRED');
    }

    const entries = settleEntries(accounts, reservation.maxAmountMinor, committed, reservation.currency, taxMinor);

    const cas = await trx.ledgerReservation.updateMany({
      where: { id: reservation.id, status: 'ACTIVE', version: reservation.version, expiresAt: { gt: now } },
      data: {
        status: 'COMMITTED',
        committedMinor: committed,
        committedAt: now,
        version: { increment: 1 },
      },
    });

    if (cas.count !== 1) {
      throw conflict('Reservation commit ownership was lost', 'LEDGER_RESERVATION_FENCE_LOST');
    }

    const posted = await this._postEntriesInTrx(trx, {
      organizationId: reservation.organizationId,
      reason: 'reservation.settle',
      idempotencyKey: `settle:${reservation.id}:v${reservation.version}`,
      rateCardVersion: reservation.rateCardVersion ?? undefined,
      entries,
      metadata: { reservationId: reservation.id, committed: committed.toString(), tax: taxMinor.toString() },
    });
    await trx.ledgerReservation.update({ where: { id: reservation.id }, data: { settleTxId: posted.id } });

    return { committedMinor: committed, replayed: false };
  }

  async commitReservation(input: CommitReservationInput): Promise<{ committedMinor: bigint; replayed: boolean }> {
    return this._db.$transaction((trx) => this.commitReservationInTransaction(trx, input));
  }

  /**
   * COMPENSATE — COMMITTED → COMPENSATED. Unwinds a committed reservation with a
   * REVERSE entry (refund to available credits), never mutating the settle. The
   * compensation transaction is linked to the settle via reversalOfId.
   */
  async compensateReservation(reservationId: string): Promise<{ compensated: boolean }> {
    return this._db.$transaction(async (trx) => {
      const preflight = await trx.ledgerReservation.findUniqueOrThrow({
        where: { id: reservationId },
        select: { organizationId: true, currency: true },
      });
      const accounts = await this._reservationAccountsInTrx(trx, preflight.organizationId, preflight.currency);
      await this._lockReservationBalance(trx, accounts.reservedAccountId);
      await trx.$queryRaw`SELECT "id" FROM "LedgerReservation" WHERE "id" = ${reservationId} FOR UPDATE`;

      const reservation = await trx.ledgerReservation.findUniqueOrThrow({ where: { id: reservationId } });

      if (reservation.organizationId !== preflight.organizationId || reservation.currency !== preflight.currency) {
        throw new LedgerError(
          'Reservation identity changed while acquiring its lock',
          'LEDGER_RESERVATION_SCOPE_MISMATCH',
        );
      }

      if (reservation.status === 'COMPENSATED') {
        return { compensated: false };
      }

      if (reservation.status !== 'COMMITTED') {
        throw new LedgerError('Only a committed reservation can be compensated', 'LEDGER_RESERVATION_NOT_COMMITTED');
      }

      const settlement = reservation.settleTxId
        ? await trx.ledgerTransaction.findUnique({
            where: { id: reservation.settleTxId },
            include: {
              entries: { select: { accountId: true, direction: true, amountMinor: true, currency: true } },
            },
          })
        : null;
      const settlementMetadata =
        typeof settlement?.metadata === 'object' && settlement.metadata !== null && !Array.isArray(settlement.metadata)
          ? (settlement.metadata as Record<string, unknown>)
          : undefined;

      if (
        !settlement ||
        settlement.organizationId !== reservation.organizationId ||
        settlement.reason !== 'reservation.settle' ||
        settlementMetadata?.reservationId !== reservation.id
      ) {
        throw new LedgerError('Committed reservation has no valid settlement transaction', 'LEDGER_SETTLEMENT_CORRUPT');
      }

      const persistedSettle = settlement.entries;

      const entries = deriveCompensationEntries(persistedSettle, accounts);

      const derivedRefund = entries
        .filter((entry) => entry.accountId === accounts.userCreditsAccountId && entry.direction === 'CREDIT')
        .reduce((sum, entry) => sum + entry.amountMinor, 0n);

      if (derivedRefund !== (reservation.committedMinor ?? 0n)) {
        throw new LedgerError('Committed reservation has no valid settlement entries', 'LEDGER_SETTLEMENT_CORRUPT');
      }

      const now = await databaseNow(trx);

      const cas = await trx.ledgerReservation.updateMany({
        where: { id: reservation.id, status: 'COMMITTED', version: reservation.version },
        data: {
          status: 'COMPENSATED',
          releasedAt: now,
          releaseReason: 'compensation',
          version: { increment: 1 },
        },
      });

      if (cas.count !== 1) {
        return { compensated: false };
      }

      if (entries.length > 0) {
        const posted = await this._postEntriesInTrx(trx, {
          organizationId: reservation.organizationId,
          reason: 'reservation.compensate',
          idempotencyKey: `compensate:${reservation.id}:v${reservation.version}`,
          reversalOfId: reservation.settleTxId ?? undefined,
          entries,
          metadata: {
            reservationId: reservation.id,
            refunded: (reservation.committedMinor ?? 0n).toString(),
            derivedFromSettle: true,
          },
        });
        await trx.ledgerReservation.update({ where: { id: reservation.id }, data: { compensateTxId: posted.id } });
      }

      return { compensated: true };
    });
  }

  /**
   * RELEASE — ACTIVE → RELEASED (cancel/failure) or EXPIRED (timeout). Returns the
   * whole hold to available credits. No commit ⇒ no revenue was ever recognised.
   */
  async releaseReservation(
    reservationId: string,
    reason: 'cancel' | 'failure' | 'timeout',
    opts: { expectedVersion?: number } = {},
  ): Promise<{ released: boolean }> {
    return this._db.$transaction((trx) => this.releaseReservationInTransaction(trx, reservationId, reason, opts));
  }

  async releaseReservationInTransaction(
    trx: Prisma.TransactionClient,
    reservationId: string,
    reason: 'cancel' | 'failure' | 'timeout',
    opts: { expectedVersion?: number } = {},
  ): Promise<{ released: boolean }> {
    // All reserve/revive/release paths take the tenant balance lock before the
    // reservation row lock. The pre-read is identity-only; the row is re-read
    // authoritatively after both locks. This prevents the reaper from deadlocking
    // with an exact retry that is reacquiring an expired hold.
    const preflight = await trx.ledgerReservation.findUniqueOrThrow({
      where: { id: reservationId },
      select: { organizationId: true, currency: true },
    });
    const accounts = await this._reservationAccountsInTrx(trx, preflight.organizationId, preflight.currency);
    await this._lockReservationBalance(trx, accounts.reservedAccountId);
    await trx.$queryRaw`SELECT "id" FROM "LedgerReservation" WHERE "id" = ${reservationId} FOR UPDATE`;

    const reservation = await trx.ledgerReservation.findUniqueOrThrow({ where: { id: reservationId } });

    if (reservation.organizationId !== preflight.organizationId || reservation.currency !== preflight.currency) {
      throw new LedgerError('Reservation identity changed while acquiring its lock', 'LEDGER_RESERVATION_SCOPE_MISMATCH');
    }

    if (reservation.status !== 'ACTIVE') {
      return { released: false };
    }

    /*
     * Once STARTED is durable, releasing the hold can lose real provider spend.
     * This check happens after the row lock, so a reaper that selected the row
     * just before STARTED was written still observes the latch and backs off.
     */
    if (canonicalAiProviderMayHaveStarted(reservation.metadata)) {
      return { released: false };
    }

    if (opts.expectedVersion !== undefined && reservation.version !== opts.expectedVersion) {
      return { released: false };
    }

    const now = await databaseNow(trx);

    if (reason === 'timeout' && reservation.expiresAt > now) {
      return { released: false };
    }

    const cas = await trx.ledgerReservation.updateMany({
      where: {
        id: reservation.id,
        status: 'ACTIVE',
        version: reservation.version,
        ...(reason === 'timeout' ? { expiresAt: { lte: now } } : {}),
      },
      data: {
        status: reason === 'timeout' ? 'EXPIRED' : 'RELEASED',
        releasedAt: now,
        releaseReason: reason,
        version: { increment: 1 },
      },
    });

    if (cas.count !== 1) {
      return { released: false };
    }

    await this._postEntriesInTrx(trx, {
      organizationId: reservation.organizationId,
      reason: `reservation.release.${reason}`,
      idempotencyKey: `release:${reservation.id}:v${reservation.version}`,
      entries: releaseEntries(accounts, reservation.maxAmountMinor, reservation.currency),
      metadata: { reservationId: reservation.id, reason, version: reservation.version },
    });

    return { released: true };
  }

  /** Recover an unattached orphan without trusting an API process clock. */
  async reviveReservation(input: {
    reservationId: string;
    expiresInMs?: number;

    /** Legacy absolute deadline. Prefer expiresInMs. */
    expiresAt?: string;

    /** Retained for source compatibility; PostgreSQL remains authoritative. */
    nowIso?: string;
  }): Promise<boolean> {
    return this._db.$transaction(async (trx) => {
      const preflight = await trx.ledgerReservation.findUnique({
        where: { id: input.reservationId },
        select: { organizationId: true, currency: true },
      });

      if (!preflight) {
        return false;
      }

      const accounts = await this._reservationAccountsInTrx(trx, preflight.organizationId, preflight.currency);
      await this._lockReservationBalance(trx, accounts.reservedAccountId);
      await trx.$queryRaw`SELECT "id" FROM "LedgerReservation" WHERE "id" = ${input.reservationId} FOR UPDATE`;

      const reservation = await trx.ledgerReservation.findUnique({ where: { id: input.reservationId } });

      if (!reservation || reservation.importJobId !== null) {
        return false;
      }
      if (reservation.organizationId !== preflight.organizationId || reservation.currency !== preflight.currency) {
        throw new LedgerError(
          'Reservation identity changed while acquiring its lock',
          'LEDGER_RESERVATION_SCOPE_MISMATCH',
        );
      }

      const now = await databaseNow(trx);

      const expiresAt =
        input.expiresInMs !== undefined
          ? boundedDeadline(now, input.expiresInMs)
          : input.expiresAt
            ? new Date(input.expiresAt)
            : boundedDeadline(now, 60 * 60_000);

      if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
        throw new LedgerError('Revived reservation needs a future deadline', 'LEDGER_BAD_EXPIRY');
      }

      if (reservation.status === 'ACTIVE') {
        if (reservation.expiresAt > now) {
          return false;
        }

        const extended = await trx.ledgerReservation.updateMany({
          where: {
            id: reservation.id,
            status: 'ACTIVE',
            version: reservation.version,
            importJobId: null,
            expiresAt: { lte: now },
          },
          data: { expiresAt, version: { increment: 1 } },
        });

        return extended.count === 1;
      }

      if (reservation.status !== 'EXPIRED' && reservation.status !== 'RELEASED') {
        return false;
      }

      const cas = await trx.ledgerReservation.updateMany({
        where: {
          id: reservation.id,
          status: reservation.status,
          version: reservation.version,
          importJobId: null,
        },
        data: {
          status: 'ACTIVE',
          expiresAt,
          releasedAt: null,
          releaseReason: null,
          version: { increment: 1 },
        },
      });

      if (cas.count !== 1) {
        return false;
      }

      const posted = await this._postEntriesInTrx(trx, {
        organizationId: reservation.organizationId,
        reason: RESERVATION_REVIVE_REASON,
        idempotencyKey: `reserve:${reservation.id}:v${reservation.version + 1}`,
        entries: reserveEntries(accounts, reservation.maxAmountMinor, reservation.currency),
        metadata: { reservationId: reservation.id, revived: true, version: reservation.version + 1 },
      });
      await trx.ledgerReservation.update({ where: { id: reservation.id }, data: { reserveTxId: posted.id } });

      return true;
    });
  }

  /** Sweep using only PostgreSQL time; an API clock cannot expire a live hold. */
  async reapExpiredReservations(_nowIso?: string): Promise<string[]> {
    const due = await this._db.$queryRaw<Array<{ id: string; version: number }>>(Prisma.sql`
      SELECT "id", "version"
      FROM "LedgerReservation"
      WHERE "status" = 'ACTIVE'
        AND "expiresAt" <= clock_timestamp()
        AND NOT (
          "operation" = 'ai.chat'
          AND (
            COALESCE("metadata"->'canonicalAiExecution'->>'state' IN ('started', 'received'), false)
            OR COALESCE(jsonb_typeof("metadata"->'canonicalAiUsageBatch') = 'object', false)
            OR (
              COALESCE(jsonb_typeof("metadata"->'canonicalAiPlatformIntent') = 'object', false)
              AND NOT COALESCE(jsonb_typeof("metadata"->'canonicalAiPlatformUsage') = 'object', false)
            )
          )
        )
      ORDER BY "expiresAt" ASC
      LIMIT 100
    `);

    const reaped: string[] = [];

    for (const { id, version } of due) {
      const { released } = await this.releaseReservation(id, 'timeout', { expectedVersion: version });

      if (released) {
        reaped.push(id);
      }
    }

    return reaped;
  }

  async getReservation(id: string) {
    return this._db.ledgerReservation.findUnique({ where: { id } });
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
    const run = await this._db.ledgerReconciliationRun.create({
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
