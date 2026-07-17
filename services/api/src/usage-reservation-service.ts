/**
 * Usage reservations — D4 phase 1, billing minimal de sûreté.
 *
 * Rule (Avi, 2026-07-17): an operation that consumes credits must NOT start
 * without an idempotent reservation, and must be compensated on failure. This
 * module is that rule, executable:
 *
 * - `reserveUsage`     opens an idempotent HOLD (ceiling `maxAmountCents`,
 *                      expiry). Replaying the same idempotency key returns the
 *                      SAME reservation — never a second hold.
 * - `requireActiveReservation`  the structural gate: the billable step refuses
 *                      to start without an ACTIVE, unexpired reservation. This
 *                      is enforced regardless of BILLING_CREDITS_ENABLED — it
 *                      is a correctness invariant, not a pricing decision.
 * - `evaluateBoundary` the HARD-LIMIT check, callable ONLY at safe boundaries
 *                      (before a migration / an Agent step) — NEVER in the
 *                      middle of an atomic commit. The caller decides WHERE the
 *                      boundaries are; this function only decides WHETHER to
 *                      continue past one.
 * - `commitReservation` the one place credits are actually debited — AFTER the
 *                      billable step succeeded — through the shared
 *                      `debitCredits` accounting path, with every ledger entry
 *                      stamped `reservationId`. The debit can never exceed the
 *                      authorized ceiling.
 * - `releaseReservation` cancel/failure before commit: the hold vanishes,
 *                      nothing was debited, nothing to compensate.
 * - `expireUsageReservations` the timeout sweep for abandoned holds.
 * - `compensateReservation` post-commit rollback: an OPPOSITE `REFUND` ledger
 *                      entry — the UsageEvent history is never mutated.
 *
 * SHADOW-safe like the rest of the credit system: financial refusals and real
 * debits activate only when `BILLING_CREDITS_ENABLED === 'true'`; structural
 * invariants (reservation required, idempotency, state machine) always hold.
 *
 * Kept as standalone functions over `ApiStore` (same shape as
 * credits-service.ts) so they're unit-testable against the in-memory store and
 * reusable by the import routes today and the connector jobs next.
 */
import type { CreditGateDecision } from '@vibecore/billing';
import { debitCredits, gateCheckpoint } from './credits-service.js';
import type { ApiStore, UsageReservationRecord } from './store.js';

export class UsageReservationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'UsageReservationError';
  }
}

/** Real refusals/debits only when credits billing is live (SHADOW otherwise). */
export function billingEnforced(): boolean {
  return process.env.BILLING_CREDITS_ENABLED === 'true';
}

/**
 * Operations that BUY something (money leaves via the PSP) must go through
 * PaymentAuthorization — reserving credits for them is an accounting fault.
 */
const PURCHASE_OPERATIONS = new Set(['purchase', 'domain', 'domain-purchase']);

export interface ReserveUsageInput {
  organizationId: string;
  userId?: string;

  /** Replay-safe key (e.g. `import:<importJobId>`), unique per org. */
  idempotencyKey: string;

  /** Operation family: 'import' today, connector/agent kinds next. */
  operation: string;

  /** The ceiling the user authorizes. Integer cents, >= 0. */
  maxAmountCents: number;

  /** How long the hold lives before the timeout sweep releases it. */
  ttlMs: number;
  importJobId?: string;
  rateCardVersion?: number;
  metadata?: unknown;
  nowMs: number;
}

export interface ReserveUsageResult {
  reservation: UsageReservationRecord;

  /** True when the idempotency key had already opened this hold. */
  replayed: boolean;

  /** The credit-gate decision (advisory in SHADOW, enforced when live). */
  gate: CreditGateDecision;
}

/**
 * Open an idempotent credit hold. Refuses purchases (wrong object), invalid
 * amounts, and — when billing is live — holds the org cannot cover.
 */
export async function reserveUsage(store: ApiStore, input: ReserveUsageInput): Promise<ReserveUsageResult> {
  if (PURCHASE_OPERATIONS.has(input.operation)) {
    throw new UsageReservationError(
      `Operation '${input.operation}' buys something: it needs a PaymentAuthorization, not a credit reservation. Reserving credits and authorizing a payment are different operations.`,
      400,
      'PURCHASE_REQUIRES_PAYMENT_AUTHORIZATION',
    );
  }

  if (!Number.isInteger(input.maxAmountCents) || input.maxAmountCents < 0) {
    throw new UsageReservationError(
      'maxAmountCents must be a non-negative integer amount of credit cents.',
      400,
      'RESERVATION_INVALID_AMOUNT',
    );
  }

  if (!Number.isFinite(input.ttlMs) || input.ttlMs <= 0) {
    throw new UsageReservationError('ttlMs must be a positive duration.', 400, 'RESERVATION_INVALID_TTL');
  }

  /*
   * Gate BEFORE creating the hold. `gateCheckpoint` is the existing pure
   * decision (wallet + packs + per-user Enterprise caps); the reservation is
   * what makes it stick for a long-running operation.
   */
  const gate = await gateCheckpoint(store, {
    organizationId: input.organizationId,
    estimatedCents: input.maxAmountCents,
    nowMs: input.nowMs,
    userId: input.userId,
  });

  if (!gate.ok && billingEnforced()) {
    throw new UsageReservationError(
      `Insufficient credits to reserve ${input.maxAmountCents} cents (${gate.reason}).`,
      402,
      'RESERVATION_INSUFFICIENT_CREDITS',
    );
  }

  const { reservation, created } = await store.createUsageReservation({
    organizationId: input.organizationId,
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    operation: input.operation,
    maxAmountCents: input.maxAmountCents,
    expiresAt: new Date(input.nowMs + input.ttlMs),
    rateCardVersion: input.rateCardVersion,
    importJobId: input.importJobId,
    metadata: input.metadata,
  });

  return { reservation, replayed: !created, gate };
}

/**
 * The structural gate in front of every billable step: no ACTIVE, unexpired
 * reservation → the operation must not start. Always enforced (SHADOW too) —
 * this is the invariant, not the price.
 */
export async function requireActiveReservation(
  store: ApiStore,
  input: { organizationId: string; importJobId?: string; idempotencyKey?: string; nowMs: number },
): Promise<UsageReservationRecord> {
  const reservation = input.importJobId
    ? await store.findUsageReservationByImportJob(input.importJobId)
    : input.idempotencyKey
      ? await store.findUsageReservationByKey(input.organizationId, input.idempotencyKey)
      : undefined;

  if (!reservation || reservation.organizationId !== input.organizationId) {
    throw new UsageReservationError(
      'This operation consumes credits and must not start without a reservation.',
      402,
      'RESERVATION_REQUIRED',
    );
  }

  if (reservation.status !== 'ACTIVE') {
    throw new UsageReservationError(
      `Reservation ${reservation.id} is ${reservation.status}, not ACTIVE.`,
      409,
      'RESERVATION_NOT_ACTIVE',
    );
  }

  if (new Date(reservation.expiresAt).getTime() <= input.nowMs) {
    // Expired hold: stamp it (best-effort — the sweep would do the same).
    await store.transitionUsageReservation({
      id: reservation.id,
      from: ['ACTIVE'],
      to: 'EXPIRED',
      releaseReason: 'timeout',
      nowIso: new Date(input.nowMs).toISOString(),
    });
    throw new UsageReservationError(`Reservation ${reservation.id} expired.`, 409, 'RESERVATION_EXPIRED');
  }

  return reservation;
}

export interface BoundaryDecision {
  /** May the operation continue past this boundary? */
  proceed: boolean;

  /** True when the ceiling is exceeded (advisory when billing is SHADOW). */
  wouldBlock: boolean;
  remainingCents: number;
}

/**
 * HARD-LIMIT check at a SAFE BOUNDARY — before a migration, before an Agent
 * step. NEVER call this in the middle of an atomic commit: once a commit
 * started, it finishes; the limit cuts at the NEXT boundary. (That placement
 * rule is the caller's contract — this function is deliberately pure so it
 * cannot interrupt anything by itself.)
 */
export function evaluateBoundary(input: {
  reservation: Pick<UsageReservationRecord, 'maxAmountCents'>;
  spentSoFarCents: number;
  nextStepMaxCents: number;
}): BoundaryDecision {
  const spent = Number.isFinite(input.spentSoFarCents) ? Math.max(0, input.spentSoFarCents) : 0;
  const next = Number.isFinite(input.nextStepMaxCents) ? Math.max(0, input.nextStepMaxCents) : 0;
  const remainingCents = Math.max(0, input.reservation.maxAmountCents - spent);
  const wouldBlock = next > remainingCents;

  return { proceed: !(wouldBlock && billingEnforced()), wouldBlock, remainingCents };
}

export interface CommitReservationResult {
  reservation: UsageReservationRecord;

  /** What was actually debited — never above the authorized ceiling. */
  committedCents: number;

  /** The part of `actualCents` above the ceiling: logged, never charged. */
  overflowCents: number;
  fromPacks: number;
  fromBalance: number;
  ledgerEntryIds: string[];
  usageEventId?: string;
  shadow: boolean;

  /** True when this commit had already happened (idempotent replay). */
  replayed: boolean;
}

/**
 * Debit the REAL cost, exactly once, AFTER the billable step succeeded. The
 * ACTIVE→COMMITTED compare-and-set is the double-commit lock; the debit runs
 * through the shared `debitCredits` path with `reservationId` stamped on the
 * ledger; the immutable UsageEvent records the invoice line
 * (importJobId ↔ reservationId ↔ ledgerEntryIds).
 */
export async function commitReservation(
  store: ApiStore,
  input: { reservationId: string; actualCents: number; reason: string; nowMs: number },
): Promise<CommitReservationResult> {
  const existing = await store.getUsageReservation(input.reservationId);

  if (!existing) {
    throw new UsageReservationError(`Reservation ${input.reservationId} not found.`, 404, 'RESERVATION_NOT_FOUND');
  }

  if (!Number.isInteger(input.actualCents) || input.actualCents < 0) {
    throw new UsageReservationError(
      'actualCents must be a non-negative integer amount of credit cents.',
      400,
      'RESERVATION_INVALID_AMOUNT',
    );
  }

  const replay = async (reservation: UsageReservationRecord): Promise<CommitReservationResult> => {
    const entries = await store.listCreditLedgerByReservation(reservation.id);

    return {
      reservation,
      committedCents: reservation.committedCents ?? 0,
      overflowCents: 0,
      fromPacks: 0,
      fromBalance: 0,
      ledgerEntryIds: entries.map((entry) => entry.id),
      shadow: !billingEnforced(),
      replayed: true,
    };
  };

  if (existing.status === 'COMMITTED') {
    return replay(existing);
  }

  if (existing.status !== 'ACTIVE') {
    throw new UsageReservationError(
      `Reservation ${existing.id} is ${existing.status}: nothing to commit.`,
      409,
      'RESERVATION_NOT_ACTIVE',
    );
  }

  /*
   * The ceiling is what the user authorized: the debit is clamped to it, the
   * overage is recorded (platform loss, visible in the usage event) — a
   * reservation that could charge beyond its own maximum would be no ceiling
   * at all. Operations are expected to stop at a safe boundary before
   * incurring more than the hold (evaluateBoundary); the clamp is the last
   * line of defence, not the mechanism.
   */
  const committedCents = Math.min(input.actualCents, existing.maxAmountCents);
  const overflowCents = Math.max(0, input.actualCents - committedCents);

  const committed = await store.transitionUsageReservation({
    id: existing.id,
    from: ['ACTIVE'],
    to: 'COMMITTED',
    committedCents,
    nowIso: new Date(input.nowMs).toISOString(),
  });

  if (!committed) {
    // Lost the compare-and-set: someone else committed or released first.
    const current = await store.getUsageReservation(existing.id);

    if (current?.status === 'COMMITTED') {
      return replay(current);
    }

    throw new UsageReservationError(
      `Reservation ${existing.id} was ${current?.status ?? 'removed'} concurrently.`,
      409,
      'RESERVATION_NOT_ACTIVE',
    );
  }

  const shadow = !billingEnforced();

  let fromPacks = 0;
  let fromBalance = 0;

  if (!shadow && committedCents > 0) {
    const result = await debitCredits(store, {
      organizationId: existing.organizationId,
      amountCents: committedCents,
      reason: input.reason,
      reservationId: existing.id,
      nowMs: input.nowMs,
    });

    fromPacks = result.fromPacks;
    fromBalance = result.fromBalance;
  }

  const ledgerEntryIds = (await store.listCreditLedgerByReservation(existing.id)).map((entry) => entry.id);

  /*
   * The immutable usage record — the invoice line the UI shows. Corrections
   * (compensateReservation) APPEND opposite ledger entries; this event is
   * never edited (DB trigger `usage_event_immutable` refuses mutation).
   */
  const usageEvent = await store.recordUsageEvent({
    organizationId: existing.organizationId,
    userId: existing.userId,
    type: `${existing.operation}.credits`,
    quantity: committedCents,
    metadata: {
      reservationId: existing.id,
      importJobId: existing.importJobId,
      maxAmountCents: existing.maxAmountCents,
      actualCents: input.actualCents,
      committedCents,
      overflowCents,
      fromPacks,
      fromBalance,
      ledgerEntryIds,
      shadow,
    },
  });

  return {
    reservation: committed,
    committedCents,
    overflowCents,
    fromPacks,
    fromBalance,
    ledgerEntryIds,
    usageEventId: usageEvent.id,
    shadow,
    replayed: false,
  };
}

/**
 * Cancel / pre-commit failure: drop the hold. Nothing was debited while the
 * reservation was ACTIVE, so there is nothing to compensate — that is the
 * point of debiting only after the billable step. Idempotent: an already
 * terminal reservation is a no-op.
 */
export async function releaseReservation(
  store: ApiStore,
  input: { reservationId: string; reason: 'cancel' | 'failure' | 'timeout'; nowMs: number },
): Promise<{ released: boolean; reservation?: UsageReservationRecord }> {
  const updated = await store.transitionUsageReservation({
    id: input.reservationId,
    from: ['ACTIVE'],
    to: input.reason === 'timeout' ? 'EXPIRED' : 'RELEASED',
    releaseReason: input.reason,
    nowIso: new Date(input.nowMs).toISOString(),
  });

  if (!updated) {
    return { released: false, reservation: await store.getUsageReservation(input.reservationId) };
  }

  return { released: true, reservation: updated };
}

/**
 * POST-COMMIT rollback (the operation was billed, then had to be undone): an
 * opposite REFUND ledger entry stamped with the same `reservationId` restores
 * the balance. History is corrected by APPENDING — the original debit and the
 * original UsageEvent stay exactly as written.
 */
export async function compensateReservation(
  store: ApiStore,
  input: { reservationId: string; reason: string; nowMs: number },
): Promise<{ compensated: boolean; refundedCents: number; ledgerEntryId?: string }> {
  const existing = await store.getUsageReservation(input.reservationId);

  if (!existing) {
    throw new UsageReservationError(`Reservation ${input.reservationId} not found.`, 404, 'RESERVATION_NOT_FOUND');
  }

  if (existing.status === 'COMPENSATED') {
    return { compensated: false, refundedCents: 0 };
  }

  if (existing.status !== 'COMMITTED') {
    throw new UsageReservationError(
      `Reservation ${existing.id} is ${existing.status}: only a COMMITTED reservation can be compensated (release ACTIVE holds instead).`,
      409,
      'RESERVATION_NOT_COMMITTED',
    );
  }

  const updated = await store.transitionUsageReservation({
    id: existing.id,
    from: ['COMMITTED'],
    to: 'COMPENSATED',
    releaseReason: input.reason,
    nowIso: new Date(input.nowMs).toISOString(),
  });

  if (!updated) {
    // Concurrent compensation won; this call has nothing left to refund.
    return { compensated: false, refundedCents: 0 };
  }

  const refundedCents = existing.committedCents ?? 0;

  let ledgerEntryId: string | undefined;

  if (refundedCents > 0 && billingEnforced()) {
    /*
     * Refund to the wallet balance even when the debit partly came from
     * expiring packs — simplest sound accounting (never re-inflates an expired
     * pack), and the asymmetry is visible in the correlated ledger entries.
     */
    const { entry } = await store.recordCreditEntry({
      organizationId: existing.organizationId,
      deltaCents: refundedCents,
      kind: 'REFUND',
      reason: input.reason,
      reservationId: existing.id,
    });

    ledgerEntryId = entry.id;
  }

  return { compensated: true, refundedCents, ledgerEntryId };
}

/**
 * Timeout sweep for abandoned holds (companion of the import reaper): every
 * ACTIVE reservation past `expiresAt` becomes EXPIRED (reason 'timeout').
 * Expired holds carried no debit, so expiry needs no ledger compensation.
 */
export async function expireUsageReservations(store: ApiStore, nowMs: number): Promise<UsageReservationRecord[]> {
  return store.reapExpiredUsageReservations(new Date(nowMs).toISOString());
}

/**
 * UsageEvent rows are IMMUTABLE — the database refuses UPDATE/DELETE (trigger
 * `usage_event_immutable`, migration 0076) and the store interface exposes no
 * mutation. This function is the executable statement of that policy: any
 * "fix the usage event" request is refused and redirected to compensation.
 */
export function refuseUsageEventMutation(): never {
  throw new UsageReservationError(
    'UsageEvent is append-only: corrections go through a compensating ledger entry (compensateReservation), never through mutation.',
    409,
    'USAGE_EVENT_IMMUTABLE',
  );
}
