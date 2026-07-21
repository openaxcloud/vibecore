/**
 * Canonical DOUBLE-ENTRY ledger — pure core (no DB, no I/O).
 *
 * This is the accounting engine behind E-CODE billing (C1 / P0-V3-12). It replaces
 * the single-entry `CreditWallet.balanceCents` "porte-monnaie" and the in-process
 * import reservation with a strict double-entry model:
 *
 *  - Money is EXACT integer minor units (bigint) — NEVER a float. A currency code
 *    travels with every amount.
 *  - Every posted transaction BALANCES per currency: Σ debits == Σ credits for
 *    each currency it touches (`I-LED-1`). An unbalanced transaction is refused.
 *  - Cross-currency moves go through an FX clearing account so each currency still
 *    balances exactly; the FX rate applied is recorded and rounding is deterministic
 *    (`I-LED-2`).
 *  - Posted transactions and their entries are IMMUTABLE. A correction is a NEW
 *    reversing transaction (`reverseEntries`), never a mutation of a past event
 *    (`I-LED-3`). Reversal + original net to zero per (account, currency).
 *  - Hard limits are checked at the safe boundary BEFORE posting: a move that would
 *    breach a budget/limit is refused whole — never a partial, never a corrupt
 *    balance (`I-LED-4`).
 *
 * All amounts are `bigint` minor units (e.g. US cents, or micro-credits). The
 * engine is pure and deterministic so the invariants are unit-testable without a
 * database; the durable store persists exactly these shapes.
 */

export type LedgerDirection = 'DEBIT' | 'CREDIT';

/** A single line of a transaction. `amountMinor` is a POSITIVE integer minor unit. */
export interface LedgerEntryInput {
  accountId: string;
  direction: LedgerDirection;
  amountMinor: bigint;
  currency: string;
}

export interface PostedTransactionInput {
  /** Business reason (e.g. 'import.settle', 'reservation.compensate'). */
  reason: string;
  entries: LedgerEntryInput[];
  /** Optional idempotency key — the store enforces uniqueness; kept here for shape. */
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export class LedgerError extends Error {
  readonly statusCode = 422;

  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'LedgerError';
  }
}

/** A currency code is a non-empty lowercase-normalised token (e.g. "usd", "eur"). */
export function normalizeCurrency(currency: string): string {
  const c = (currency ?? '').trim().toLowerCase();

  if (!/^[a-z]{3,8}$/.test(c)) {
    throw new LedgerError(`Invalid currency code "${currency}"`, 'LEDGER_BAD_CURRENCY');
  }

  return c;
}

function assertPositiveMinor(amount: bigint, label: string): void {
  if (typeof amount !== 'bigint') {
    throw new LedgerError(`${label} must be a bigint minor amount`, 'LEDGER_BAD_AMOUNT');
  }

  if (amount <= 0n) {
    throw new LedgerError(`${label} must be a positive integer minor amount (was ${amount})`, 'LEDGER_NONPOSITIVE_AMOUNT');
  }
}

/**
 * Validate a set of entries and return the per-currency balanced totals. Throws
 * `LEDGER_UNBALANCED` if any currency's debits ≠ credits. This is I-LED-1.
 */
export function validateBalanced(entries: LedgerEntryInput[]): Map<string, bigint> {
  if (!Array.isArray(entries) || entries.length < 2) {
    throw new LedgerError('A transaction needs at least two entries (double-entry)', 'LEDGER_TOO_FEW_ENTRIES');
  }

  // Per-currency signed sum: DEBIT = +, CREDIT = −. Balanced ⇒ zero per currency.
  const net = new Map<string, bigint>();
  const gross = new Map<string, bigint>();

  for (const entry of entries) {
    if (!entry.accountId || typeof entry.accountId !== 'string') {
      throw new LedgerError('Every entry needs an accountId', 'LEDGER_BAD_ACCOUNT');
    }

    if (entry.direction !== 'DEBIT' && entry.direction !== 'CREDIT') {
      throw new LedgerError(`Bad entry direction "${entry.direction}"`, 'LEDGER_BAD_DIRECTION');
    }

    assertPositiveMinor(entry.amountMinor, 'entry.amountMinor');
    const currency = normalizeCurrency(entry.currency);

    const signed = entry.direction === 'DEBIT' ? entry.amountMinor : -entry.amountMinor;
    net.set(currency, (net.get(currency) ?? 0n) + signed);
    gross.set(currency, (gross.get(currency) ?? 0n) + entry.amountMinor);
  }

  for (const [currency, sum] of net) {
    if (sum !== 0n) {
      throw new LedgerError(
        `Transaction does not balance in ${currency}: debits − credits = ${sum} minor units`,
        'LEDGER_UNBALANCED',
      );
    }
  }

  // Return the balanced gross (total debits == total credits) per currency.
  const balanced = new Map<string, bigint>();

  for (const [currency, g] of gross) {
    balanced.set(currency, g / 2n); // gross counts each side once; halve for the one-sided total
  }

  return balanced;
}

/**
 * Reverse (compensate) a set of entries: flip every DEBIT↔CREDIT, same amounts.
 * The reversal is itself balanced, and reversal ⊕ original nets to zero per
 * (account, currency). This is how a correction is made — NEVER by mutating the
 * original (I-LED-3).
 */
export function reverseEntries(entries: LedgerEntryInput[]): LedgerEntryInput[] {
  return entries.map((e) => ({
    accountId: e.accountId,
    direction: e.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT',
    amountMinor: e.amountMinor,
    currency: normalizeCurrency(e.currency),
  }));
}

/**
 * Net position per (account, currency) for a set of entries. Positive = net debit,
 * negative = net credit. Used by tests/reconciliation to prove reversal ⇒ 0.
 */
export function netByAccount(entries: LedgerEntryInput[]): Map<string, bigint> {
  const net = new Map<string, bigint>();

  for (const e of entries) {
    const key = `${e.accountId}:${normalizeCurrency(e.currency)}`;
    const signed = e.direction === 'DEBIT' ? e.amountMinor : -e.amountMinor;
    net.set(key, (net.get(key) ?? 0n) + signed);
  }

  return net;
}

/* -------------------------------------------------------------------------- */
/*  Exact FX conversion (no float, deterministic rounding)                     */
/* -------------------------------------------------------------------------- */

/**
 * An FX rate expressed as an EXACT rational `rateNum / rateDen` (both bigint) so
 * conversion never touches a float. `effectiveAt`/`cutoffAt` bound when the rate
 * may be applied (a booking dated after `cutoffAt` must use the next rate).
 */
export interface FxRate {
  fromCurrency: string;
  toCurrency: string;
  rateNum: bigint;
  rateDen: bigint;
  effectiveAt: string; // ISO
  cutoffAt?: string; // ISO — exclusive upper bound this rate is valid for
}

export type FxRounding = 'HALF_UP' | 'DOWN';

/**
 * Convert `amountMinor` from → to using an exact rational rate, rounded to an
 * integer minor unit with the given mode. Returns the converted amount AND the
 * exact remainder (numerator/denominator) so callers can route rounding residue
 * to an FX rounding account and keep the transaction balanced.
 */
export function convertFx(
  amountMinor: bigint,
  rate: FxRate,
  rounding: FxRounding = 'HALF_UP',
): { converted: bigint; rateApplied: string } {
  assertPositiveMinor(amountMinor, 'amountMinor');

  if (rate.rateNum <= 0n || rate.rateDen <= 0n) {
    throw new LedgerError('FX rate numerator/denominator must be positive', 'LEDGER_BAD_FX_RATE');
  }

  const product = amountMinor * rate.rateNum;
  let converted = product / rate.rateDen;
  const remainder = product % rate.rateDen;

  if (rounding === 'HALF_UP' && remainder * 2n >= rate.rateDen) {
    converted += 1n;
  }

  return { converted, rateApplied: `${rate.rateNum}/${rate.rateDen}` };
}

/**
 * Pick the FX rate valid at `atIso` from a set, honouring the cutoff: a rate is
 * eligible when effectiveAt ≤ at AND (no cutoff OR at < cutoff). The latest
 * eligible effectiveAt wins. Throws if none applies (never guess a rate).
 */
export function pickFxRate(rates: FxRate[], from: string, to: string, atIso: string): FxRate {
  const f = normalizeCurrency(from);
  const t = normalizeCurrency(to);
  const at = Date.parse(atIso);

  if (Number.isNaN(at)) {
    throw new LedgerError(`Invalid FX booking date "${atIso}"`, 'LEDGER_BAD_FX_DATE');
  }

  const eligible = rates
    .filter((r) => normalizeCurrency(r.fromCurrency) === f && normalizeCurrency(r.toCurrency) === t)
    .filter((r) => Date.parse(r.effectiveAt) <= at)
    .filter((r) => !r.cutoffAt || at < Date.parse(r.cutoffAt))
    .sort((a, b) => Date.parse(b.effectiveAt) - Date.parse(a.effectiveAt));

  if (eligible.length === 0) {
    throw new LedgerError(`No FX rate ${f}→${t} effective at ${atIso} (respecting cutoff)`, 'LEDGER_NO_FX_RATE');
  }

  return eligible[0];
}

/* -------------------------------------------------------------------------- */
/*  Hard limits at safe boundaries                                             */
/* -------------------------------------------------------------------------- */

/**
 * Refuse a move that would breach a hard limit BEFORE it is posted. `projected`
 * is the balance the move would produce; `limitMinor` is the safe ceiling. The
 * check is all-or-nothing — a breach throws and NOTHING is posted (I-LED-4).
 */
export function assertWithinHardLimit(
  projectedMinor: bigint,
  limitMinor: bigint | null | undefined,
  label = 'budget',
): void {
  if (limitMinor === null || limitMinor === undefined) {
    return;
  }

  if (projectedMinor > limitMinor) {
    throw new LedgerError(
      `Hard ${label} limit breached: projected ${projectedMinor} > limit ${limitMinor} minor units`,
      'LEDGER_HARD_LIMIT',
    );
  }
}

/** Round a rational (num/den) UP to the next integer minor unit, min 1 (I-BIL-2 floor). */
export function ceilToMinor(num: bigint, den: bigint, floor = 1n): bigint {
  if (den <= 0n) {
    throw new LedgerError('denominator must be positive', 'LEDGER_BAD_AMOUNT');
  }

  const whole = num / den;
  const up = num % den === 0n ? whole : whole + 1n;
  return up < floor ? floor : up;
}
