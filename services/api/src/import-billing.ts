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
 * `compensateReservation`) plus a small in-process ledger (`ImportCreditLedger`)
 * that mirrors the existing in-process `importStaging` map. Durable persistence
 * (surviving a process restart) is the separate UsageReservation follow-up; the
 * SAFETY invariants here hold regardless of backend and are what the endpoint
 * relies on so a failed/cancelled/timed-out import can never leave a debit.
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
 * The async surface both reservation backends expose — the DURABLE Postgres
 * one (`DurableImportCreditLedger`, production) and this file's in-memory one
 * (tests without a database). `reserve` is the atomic idempotency point:
 * exactly ONE concurrent caller per (organizationId, key) sees
 * `created: true`, and only that winner may create the import job.
 */
export interface ImportBillingLedger {
  reserve(input: {
    organizationId: string;
    key: string;
    reservedCredits: number;
  }): Promise<{ reservation: ImportReservation; created: boolean }>;
  attachJob(organizationId: string, key: string, importJobId: string): Promise<'attached' | 'conflict'>;
  findByKey(organizationId: string, key: string): Promise<ImportReservation | undefined>;
  settleByJob(
    organizationId: string,
    importJobId: string,
    committed: boolean,
    actualCredits: number,
  ): Promise<ImportReservation>;
  compensateByJob(
    importJobId: string,
    reason: 'cancel' | 'failure' | 'timeout',
  ): Promise<ImportReservation | undefined>;
  getByJob(organizationId: string, importJobId: string): Promise<ImportReservation | undefined>;
  reapExpired(nowIso: string): Promise<string[]>;
}

/**
 * In-process reservation ledger for DB-less tests (production uses the durable
 * `DurableImportCreditLedger` over Postgres — see the app wiring). Fix-forward
 * of the expert's #27 refusal even here:
 *  - keys are NAMESPACED BY ORGANIZATION (`org \x00 key` composite) — two orgs
 *    using the same key never share a reservation;
 *  - `reserve` is a single synchronous check-and-insert on the JS event loop —
 *    of two concurrent requests exactly one observes `created: true`;
 *  - by-job operations verify OWNERSHIP against the calling organization.
 */
export class ImportCreditLedger implements ImportBillingLedger {
  private readonly byOrgKey = new Map<string, ImportReservation>();

  /** Secondary index so the endpoint can settle/compensate with only the jobId. */
  private readonly byJob = new Map<string, string>();

  private static composite(organizationId: string, key: string): string {
    return `${organizationId}\u0000${key}`;
  }

  async reserve(input: { organizationId: string; key: string; reservedCredits: number }) {
    const composite = ImportCreditLedger.composite(input.organizationId, input.key);
    const existing = this.byOrgKey.get(composite);

    /*
     * ORPHAN RECOVERY parity with the durable backend (expert #39-1): a dead
     * hold (released) that never got a job may be re-armed by a retry of the
     * same key — the retry proceeds as creator instead of spinning forever.
     */
    if (existing && existing.state === 'COMPENSATED' && !existing.importJobId) {
      const revived = reserveReservation(undefined, {
        key: input.key,
        organizationId: input.organizationId,
        importJobId: '',
        reservedCredits: input.reservedCredits,
      });
      this.byOrgKey.set(composite, revived);

      return { reservation: revived, created: true };
    }

    if (existing) {
      return { reservation: existing, created: false };
    }

    const next = reserveReservation(undefined, {
      key: input.key,
      organizationId: input.organizationId,
      importJobId: '',
      reservedCredits: input.reservedCredits,
    });
    this.byOrgKey.set(composite, next);

    return { reservation: next, created: true };
  }

  async attachJob(organizationId: string, key: string, importJobId: string): Promise<'attached' | 'conflict'> {
    const composite = ImportCreditLedger.composite(organizationId, key);
    const reservation = this.byOrgKey.get(composite);

    if (!reservation) {
      throw new ImportBillingError(`No reservation found for key ${key}`, 'BILLING_RESERVATION_MISSING');
    }

    if (reservation.importJobId && reservation.importJobId !== importJobId) {
      return 'conflict';
    }

    this.byOrgKey.set(composite, { ...reservation, importJobId });
    this.byJob.set(importJobId, composite);

    return 'attached';
  }

  async findByKey(organizationId: string, key: string): Promise<ImportReservation | undefined> {
    return this.byOrgKey.get(ImportCreditLedger.composite(organizationId, key));
  }

  async settleByJob(
    organizationId: string,
    importJobId: string,
    committed: boolean,
    actualCredits: number,
  ): Promise<ImportReservation> {
    const reservation = this.requireByJob(importJobId);

    // OWNERSHIP (expert #27-4): another org's reservation is untouchable.
    if (reservation.organizationId !== organizationId) {
      throw new ImportBillingError(
        `Reservation for import ${importJobId} belongs to another organization`,
        'BILLING_RESERVATION_FOREIGN',
      );
    }

    const next = settleReservation(reservation, committed, actualCredits);
    assertNoDebitWithoutCommit(next);
    this.byOrgKey.set(ImportCreditLedger.composite(next.organizationId, next.key), next);

    return next;
  }

  async compensateByJob(
    importJobId: string,
    _reason: 'cancel' | 'failure' | 'timeout',
  ): Promise<ImportReservation | undefined> {
    const composite = this.byJob.get(importJobId);

    if (!composite) {
      return undefined; // failure before reserve — nothing to release
    }

    const reservation = this.byOrgKey.get(composite);

    if (!reservation) {
      return undefined;
    }

    const next = compensateReservation(reservation);
    assertNoDebitWithoutCommit(next);
    this.byOrgKey.set(composite, next);

    return next;
  }

  async getByJob(organizationId: string, importJobId: string): Promise<ImportReservation | undefined> {
    const composite = this.byJob.get(importJobId);
    const reservation = composite ? this.byOrgKey.get(composite) : undefined;

    if (!reservation || reservation.organizationId !== organizationId) {
      return undefined;
    }

    return reservation;
  }

  async reapExpired(_nowIso: string): Promise<string[]> {
    return []; // in-memory backend has no TTL — the durable one does
  }

  private requireByJob(importJobId: string): ImportReservation {
    const composite = this.byJob.get(importJobId);
    const reservation = composite ? this.byOrgKey.get(composite) : undefined;

    if (!reservation) {
      throw new ImportBillingError(`No reservation found for import ${importJobId}`, 'BILLING_RESERVATION_MISSING');
    }

    return reservation;
  }
}

/**
 * Estimate the credits to reserve up-front for an import. Kept trivial and
 * deterministic (1 credit per staged file, min 1) — the point of this module is
 * the reservation LIFECYCLE safety, not a pricing model (real pricing lives in
 * RATE_CARD / the UsageReservation follow-up). Settle adjusts to the real amount.
 */
export function estimateImportReservation(stagedFileCount: number): number {
  if (!Number.isFinite(stagedFileCount) || stagedFileCount <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(stagedFileCount));
}
