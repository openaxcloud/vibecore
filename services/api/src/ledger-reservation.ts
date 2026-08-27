/**
 * Durable reservation lifecycle expressed as DOUBLE-ENTRY ledger transactions
 * (pure). Where the in-process reservation of PR #27 held a number in a Map, this
 * maps every lifecycle step to a BALANCED set of ledger entries that the durable
 * store posts. The reservation ROW is a small state machine
 * (ACTIVE→COMMITTED→COMPENSATED / RELEASED / EXPIRED); the MONEY lives entirely in
 * immutable ledger transactions.
 *
 * Accounts used (per org, per currency):
 *  - user_credits (LIABILITY): the user's available prepaid credits.
 *  - reserved     (LIABILITY): the portion currently held by a reservation.
 *  - revenue      (REVENUE):   recognised when a hold is consumed at settle.
 *  - tax_payable  (LIABILITY): tax withheld at settle (optional).
 *
 * Money conservation (proved by tests): over reserve → settle → compensate every
 * account nets to ZERO — the user is made whole and revenue is unwound, all via
 * reverse ENTRIES, never a mutation of a posted transaction.
 */

import type { LedgerEntryInput } from './ledger-core.js';
import { normalizeCurrency, reverseEntries } from './ledger-core.js';

export interface ReservationAccounts {
  userCreditsAccountId: string;
  reservedAccountId: string;
  revenueAccountId: string;
  taxPayableAccountId?: string;
}

function entry(
  accountId: string,
  direction: 'DEBIT' | 'CREDIT',
  amountMinor: bigint,
  currency: string,
): LedgerEntryInput {
  return { accountId, direction, amountMinor, currency: normalizeCurrency(currency) };
}

/**
 * RESERVE — move the authorized ceiling from available credits into the reserved
 * hold. Debits nothing real yet: it is a transfer between two liability buckets.
 *   DEBIT user_credits max ; CREDIT reserved max
 */
export function reserveEntries(accounts: ReservationAccounts, maxMinor: bigint, currency: string): LedgerEntryInput[] {
  return [
    entry(accounts.userCreditsAccountId, 'DEBIT', maxMinor, currency),
    entry(accounts.reservedAccountId, 'CREDIT', maxMinor, currency),
  ];
}

/**
 * SETTLE — consume the hold: recognise `committed` as revenue (minus optional
 * tax), and return the unused `max − committed` to the user's available credits.
 *   DEBIT reserved max
 *   CREDIT revenue (committed − tax)
 *   CREDIT tax_payable tax            (only if tax > 0)
 *   CREDIT user_credits (max − committed)
 * committed must be ≤ max; tax must be ≤ committed.
 */
export function settleEntries(
  accounts: ReservationAccounts,
  maxMinor: bigint,
  committedMinor: bigint,
  currency: string,
  taxMinor = 0n,
): LedgerEntryInput[] {
  if (committedMinor < 0n || committedMinor > maxMinor) {
    throw new Error(`committed ${committedMinor} must be within [0, max ${maxMinor}]`);
  }

  if (taxMinor < 0n || taxMinor > committedMinor) {
    throw new Error(`tax ${taxMinor} must be within [0, committed ${committedMinor}]`);
  }

  const entries: LedgerEntryInput[] = [entry(accounts.reservedAccountId, 'DEBIT', maxMinor, currency)];

  const revenueMinor = committedMinor - taxMinor;

  if (revenueMinor > 0n) {
    entries.push(entry(accounts.revenueAccountId, 'CREDIT', revenueMinor, currency));
  }

  if (taxMinor > 0n) {
    if (!accounts.taxPayableAccountId) {
      throw new Error('taxPayableAccountId is required when taxMinor > 0');
    }

    entries.push(entry(accounts.taxPayableAccountId, 'CREDIT', taxMinor, currency));
  }

  const refundMinor = maxMinor - committedMinor;

  if (refundMinor > 0n) {
    entries.push(entry(accounts.userCreditsAccountId, 'CREDIT', refundMinor, currency));
  }

  return entries;
}

/**
 * RELEASE — the hold was never consumed (cancel / timeout / pre-commit failure):
 * return the whole ceiling to available credits.
 *   DEBIT reserved max ; CREDIT user_credits max
 */
export function releaseEntries(accounts: ReservationAccounts, maxMinor: bigint, currency: string): LedgerEntryInput[] {
  return [
    entry(accounts.reservedAccountId, 'DEBIT', maxMinor, currency),
    entry(accounts.userCreditsAccountId, 'CREDIT', maxMinor, currency),
  ];
}

/**
 * COMPENSATE — a committed reservation must be unwound (post-commit failure /
 * refund). This is a REVERSE ENTRY of the revenue recognition: undo the revenue
 * and refund the committed amount to the user's available credits. The original
 * settle transaction is left byte-for-byte intact.
 *   DEBIT revenue (committed − tax)
 *   DEBIT tax_payable tax            (only if tax > 0)
 *   CREDIT user_credits committed
 */
export function compensateEntries(
  accounts: ReservationAccounts,
  committedMinor: bigint,
  currency: string,
  taxMinor = 0n,
): LedgerEntryInput[] {
  if (committedMinor <= 0n) {
    throw new Error('compensation requires a positive committed amount');
  }

  if (taxMinor < 0n || taxMinor > committedMinor) {
    throw new Error(`tax ${taxMinor} must be within [0, committed ${committedMinor}]`);
  }

  // Reverse of the revenue-recognition leg of settle.
  const revenueMinor = committedMinor - taxMinor;
  const entries: LedgerEntryInput[] = [];

  if (revenueMinor > 0n) {
    entries.push(entry(accounts.revenueAccountId, 'DEBIT', revenueMinor, currency));
  }

  if (taxMinor > 0n) {
    if (!accounts.taxPayableAccountId) {
      throw new Error('taxPayableAccountId is required when taxMinor > 0');
    }

    entries.push(entry(accounts.taxPayableAccountId, 'DEBIT', taxMinor, currency));
  }

  entries.push(entry(accounts.userCreditsAccountId, 'CREDIT', committedMinor, currency));

  return entries;
}

/**
 * Generic compensation for ANY transaction (chargeback, manual reversal): flip
 * every entry's direction. The store links the reversal to the original via
 * `reversalOfId`; the original is never mutated. This is `reverseEntries`
 * re-exported at the reservation layer so call sites read intent.
 */
export const reverseTransactionEntries = reverseEntries;

/**
 * Build a compensation exclusively from the settlement that was actually
 * posted. The unused-credit refund in the settlement remains untouched; only
 * the persisted revenue/tax legs are reversed and returned to the user.
 */
export function deriveCompensationEntries(
  persistedSettleEntries: Array<{
    accountId: string;
    direction: 'DEBIT' | 'CREDIT';
    amountMinor: bigint;
    currency: string;
  }>,
  accounts: ReservationAccounts,
): LedgerEntryInput[] {
  const entries: LedgerEntryInput[] = [];

  let refundMinor = 0n;
  let currency: string | undefined;

  for (const persisted of persistedSettleEntries) {
    const revenue = persisted.accountId === accounts.revenueAccountId && persisted.direction === 'CREDIT';

    const tax =
      accounts.taxPayableAccountId !== undefined &&
      persisted.accountId === accounts.taxPayableAccountId &&
      persisted.direction === 'CREDIT';

    if (!revenue && !tax) {
      continue;
    }

    entries.push(entry(persisted.accountId, 'DEBIT', persisted.amountMinor, persisted.currency));
    refundMinor += persisted.amountMinor;
    currency = persisted.currency;
  }

  if (refundMinor > 0n && currency) {
    entries.push(entry(accounts.userCreditsAccountId, 'CREDIT', refundMinor, currency));
  }

  return entries;
}
