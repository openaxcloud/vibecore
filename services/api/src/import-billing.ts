/**
 * Import SAFETY billing — minimal, idempotent credit reservation around the
 * import pipeline (Avi spec, DEC-IMPORT-CREDIT-RESERVE).
 *
 * The three safety rules this module enforces:
 *   1. RESERVE idempotently BEFORE any paid work (before staging/scan/commit).
 *      A retried import with the same idempotency key never double-reserves.
 *   2. At the end, SETTLE (adjust to the real amount) OR COMPENSATE (release).
 *   3. NO final debit if the commit did not happen — `settle` is only legal when
 *      the import actually COMMITTED; every non-committed exit COMPENSATES to 0.
 *
 * This is a PURE reducer (`reserveReservation` / `settleReservation` /
 * `compensateReservation`) plus a small in-memory ledger (`ImportCreditLedger`)
 * kept for reducer-level tests. Production import jobs persist reservations and
 * settle/compensate them atomically through the store implementation.
 */

export type ReservationState = 'RESERVED' | 'SETTLED' | 'COMPENSATED';

export interface ImportReservation {
  /** Mandatory idempotency key (client-supplied). Uniquely identifies the reservation. */
  key: string;
  organizationId: string;
  importJobId: string;
  /** Credits held up-front (estimate). */
  reservedCredits: number;
  /** Credits actually charged. > 0 ONLY once SETTLED (i.e. the import committed). */
  debitedCredits: number;
  state: ReservationState;
}

export class ImportBillingError extends Error {
  readonly statusCode = 409;

  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ImportBillingError';
  }
}

/** Non-negative integer credit amount, or throw. */
function assertCredits(amount: number, label: string): void {
  if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(amount)) {
    throw new ImportBillingError(`${label} must be a non-negative integer (was ${amount})`, 'BILLING_BAD_AMOUNT');
  }
}

/**
 * RESERVE before any paid work. Idempotent by key: reserving again with the SAME
 * key returns the EXISTING reservation unchanged — never a second charge. A
 * different key for the same job is a programming error (one reservation per job).
 */
export function reserveReservation(
  existing: ImportReservation | undefined,
  input: { key: string; organizationId: string; importJobId: string; reservedCredits: number },
): ImportReservation {
  if (!input.key || input.key.trim().length === 0) {
    throw new ImportBillingError('An idempotency key is mandatory to reserve import credits', 'BILLING_KEY_REQUIRED');
  }

  assertCredits(input.reservedCredits, 'reservedCredits');

  if (existing) {
    // Idempotent replay: same key → same reservation, no double reserve.
    if (existing.key === input.key) {
      return existing;
    }

    throw new ImportBillingError(
      `Reservation for import ${input.importJobId} already exists under a different key`,
      'BILLING_KEY_CONFLICT',
    );
  }

  return {
    key: input.key,
    organizationId: input.organizationId,
    importJobId: input.importJobId,
    reservedCredits: input.reservedCredits,
    debitedCredits: 0,
    state: 'RESERVED',
  };
}

/**
 * SETTLE — the ONLY place a debit is recorded. Legal ONLY when the import
 * committed (`committed === true`); calling it otherwise is the rule-3 violation
 * and throws. Idempotent: settling an already-SETTLED reservation with the same
 * amount is a no-op. Cannot settle a COMPENSATED (released) reservation.
 */
export function settleReservation(
  reservation: ImportReservation,
  committed: boolean,
  actualCredits: number,
): ImportReservation {
  assertCredits(actualCredits, 'actualCredits');

  if (!committed) {
    throw new ImportBillingError(
      'Refusing to settle/debit an import that did not COMMIT — no commit, no debit.',
      'BILLING_SETTLE_WITHOUT_COMMIT',
    );
  }

  if (reservation.state === 'COMPENSATED') {
    throw new ImportBillingError(
      'Cannot settle a compensated (released) reservation',
      'BILLING_SETTLE_AFTER_COMPENSATE',
    );
  }

  if (reservation.state === 'SETTLED') {
    if (reservation.debitedCredits !== actualCredits) {
      throw new ImportBillingError(
        `Reservation already settled at ${reservation.debitedCredits}, cannot re-settle at ${actualCredits}`,
        'BILLING_RESETTLE_MISMATCH',
      );
    }

    return reservation; // idempotent
  }

  return { ...reservation, state: 'SETTLED', debitedCredits: actualCredits };
}

/**
 * COMPENSATE — release the reservation with ZERO debit. Used on every
 * non-committed exit (cancel / timeout / rollback / failure). Idempotent. A
 * reservation that already SETTLED (the import committed) is NOT compensated —
 * that would be reversing a legitimate charge; the caller must never do it, so
 * this throws to surface the bug.
 */
export function compensateReservation(reservation: ImportReservation): ImportReservation {
  if (reservation.state === 'SETTLED') {
    throw new ImportBillingError(
      'Cannot compensate a settled reservation (the import committed and was debited)',
      'BILLING_COMPENSATE_AFTER_SETTLE',
    );
  }

  if (reservation.state === 'COMPENSATED') {
    return reservation; // idempotent
  }

  return { ...reservation, state: 'COMPENSATED', debitedCredits: 0 };
}

/**
 * Core SAFETY invariant: a debit is recorded ONLY when the reservation settled
 * (i.e. the import committed). Any positive debit outside SETTLED is a bug.
 */
export function assertNoDebitWithoutCommit(reservation: ImportReservation): void {
  if (reservation.debitedCredits > 0 && reservation.state !== 'SETTLED') {
    throw new ImportBillingError(
      `Debit ${reservation.debitedCredits} recorded while reservation is ${reservation.state} (no commit) — invariant breach`,
      'BILLING_DEBIT_WITHOUT_COMMIT',
    );
  }
}

/**
 * In-memory idempotent ledger kept as a reducer/test helper. Production request
 * correctness never relies on this process-local class; its ledger is durable in
 * PostgreSQL through ApiStore.
 */
export class ImportCreditLedger {
  private readonly byKey = new Map<string, ImportReservation>();
  /** Secondary index so the endpoint can settle/compensate with only the jobId. */
  private readonly keyByJob = new Map<string, string>();

  /** Idempotent reserve. Returns the reservation (existing one on key replay). */
  reserve(input: {
    key: string;
    organizationId: string;
    importJobId: string;
    reservedCredits: number;
  }): ImportReservation {
    const existing = this.byKey.get(input.key);
    const next = reserveReservation(existing, input);
    this.byKey.set(next.key, next);
    this.keyByJob.set(input.importJobId, next.key);
    return next;
  }

  get(key: string): ImportReservation | undefined {
    return this.byKey.get(key);
  }

  getByJob(importJobId: string): ImportReservation | undefined {
    const key = this.keyByJob.get(importJobId);
    return key ? this.byKey.get(key) : undefined;
  }

  /** Settle a reservation by key (records the debit). Throws if it did not commit. */
  settle(key: string, committed: boolean, actualCredits: number): ImportReservation {
    const reservation = this.require(key);
    const next = settleReservation(reservation, committed, actualCredits);
    assertNoDebitWithoutCommit(next);
    this.byKey.set(key, next);
    return next;
  }

  /** Settle by jobId. Throws if no reservation exists for the job. */
  settleByJob(importJobId: string, committed: boolean, actualCredits: number): ImportReservation {
    const key = this.keyByJob.get(importJobId);

    if (!key) {
      throw new ImportBillingError(`No reservation found for import ${importJobId}`, 'BILLING_RESERVATION_MISSING');
    }

    return this.settle(key, committed, actualCredits);
  }

  /** Compensate by key (release, zero debit). Idempotent; safe on any cleanup. */
  compensate(key: string): ImportReservation {
    const reservation = this.byKey.get(key);

    if (!reservation) {
      // Nothing reserved (e.g. failure before reserve) — compensation is a no-op.
      return {
        key,
        organizationId: '',
        importJobId: '',
        reservedCredits: 0,
        debitedCredits: 0,
        state: 'COMPENSATED',
      };
    }

    const next = compensateReservation(reservation);
    assertNoDebitWithoutCommit(next);
    this.byKey.set(key, next);
    return next;
  }

  /**
   * Compensate by jobId. A no-op (returns undefined) when nothing was reserved —
   * so cleanup on a job that failed BEFORE reserving is always safe to call.
   */
  compensateByJob(importJobId: string): ImportReservation | undefined {
    const key = this.keyByJob.get(importJobId);

    if (!key) {
      return undefined;
    }

    return this.compensate(key);
  }

  private require(key: string): ImportReservation {
    const reservation = this.byKey.get(key);

    if (!reservation) {
      throw new ImportBillingError(`No reservation found for key ${key}`, 'BILLING_RESERVATION_MISSING');
    }

    return reservation;
  }
}

/**
 * Estimate the credits to reserve up-front for an import. Kept trivial and
 * deterministic (1 credit per staged file, min 1) — the point of this module is
 * the reservation LIFECYCLE safety, not a pricing model. Pricing is versioned by
 * RATE_CARD; durable holds and settlement live in the canonical LedgerReservation
 * double-entry ledger. Settle adjusts the hold to the measured amount.
 */
export function estimateImportReservation(stagedFileCount: number): number {
  if (!Number.isFinite(stagedFileCount) || stagedFileCount <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(stagedFileCount));
}
