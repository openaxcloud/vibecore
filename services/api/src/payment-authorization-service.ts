/**
 * Payment authorizations — the MONEY side of D4 phase 1.
 *
 * Reserving credits (UsageReservation) and authorizing a payment are two
 * different operations; conflating them is an accounting fault. This module is
 * the payment side, for purchases (domains, ...):
 *
 * - the amount lives at the PSP (Stripe PaymentIntent), never in the credit
 *   wallet — NOTHING in this file touches `recordCreditEntry`/`debitCredits`;
 * - same idempotency discipline as reservations: one (org, key) → one
 *   authorization, replays return the existing row;
 * - same guarded state machine: PENDING → AUTHORIZED → CAPTURED, with VOIDED /
 *   EXPIRED as terminal outcomes, compare-and-set transitions.
 *
 * Phase 1 ships the object + invariants (the domain-purchase flow that will
 * consume it does not exist yet); the Stripe PaymentIntent wiring lands with
 * that flow.
 */
import type { ApiStore, PaymentAuthorizationRecord } from './store.js';

export class PaymentAuthorizationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'PaymentAuthorizationError';
  }
}

export interface OpenPaymentAuthorizationInput {
  organizationId: string;
  userId?: string;
  idempotencyKey: string;

  /** What is being bought ('domain' | ...). */
  purpose: string;

  /** Integer cents, strictly positive — a free purchase needs no authorization. */
  amountCents: number;
  currency?: string;
  ttlMs: number;
  metadata?: unknown;
  nowMs: number;
}

/** Open (idempotently) a PENDING authorization for a purchase. */
export async function openPaymentAuthorization(
  store: ApiStore,
  input: OpenPaymentAuthorizationInput,
): Promise<{ authorization: PaymentAuthorizationRecord; replayed: boolean }> {
  if (!input.purpose || PURCHASELESS_OPERATIONS.has(input.purpose)) {
    throw new PaymentAuthorizationError(
      `'${input.purpose}' is credit usage, not a purchase: open a UsageReservation instead of a payment authorization.`,
      400,
      'USAGE_REQUIRES_RESERVATION',
    );
  }

  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new PaymentAuthorizationError(
      'amountCents must be a positive integer amount of cents.',
      400,
      'PAYMENT_AUTHORIZATION_INVALID_AMOUNT',
    );
  }

  if (!Number.isFinite(input.ttlMs) || input.ttlMs <= 0) {
    throw new PaymentAuthorizationError('ttlMs must be a positive duration.', 400, 'PAYMENT_AUTHORIZATION_INVALID_TTL');
  }

  const { authorization, created } = await store.createPaymentAuthorization({
    organizationId: input.organizationId,
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    purpose: input.purpose,
    amountCents: input.amountCents,
    currency: input.currency,
    expiresAt: new Date(input.nowMs + input.ttlMs),
    metadata: input.metadata,
  });

  return { authorization, replayed: !created };
}

/** Usage families that must NEVER be paid for as purchases (mirror guard). */
const PURCHASELESS_OPERATIONS = new Set(['import', 'agent', 'compute', 'storage']);

/** PSP confirmed the hold: PENDING → AUTHORIZED (stores the PaymentIntent id). */
export async function markPaymentAuthorized(
  store: ApiStore,
  input: { authorizationId: string; stripePaymentIntentId: string; nowMs: number },
): Promise<PaymentAuthorizationRecord> {
  const authorization = await requireLive(store, input.authorizationId, input.nowMs);

  const updated = await store.transitionPaymentAuthorization({
    id: authorization.id,
    from: ['PENDING'],
    to: 'AUTHORIZED',
    stripePaymentIntentId: input.stripePaymentIntentId,
    nowIso: new Date(input.nowMs).toISOString(),
  });

  if (!updated) {
    throw conflict(authorization);
  }

  return updated;
}

/** The purchase went through: AUTHORIZED → CAPTURED. */
export async function capturePaymentAuthorization(
  store: ApiStore,
  input: { authorizationId: string; nowMs: number },
): Promise<PaymentAuthorizationRecord> {
  const authorization = await requireLive(store, input.authorizationId, input.nowMs);

  const updated = await store.transitionPaymentAuthorization({
    id: authorization.id,
    from: ['AUTHORIZED'],
    to: 'CAPTURED',
    nowIso: new Date(input.nowMs).toISOString(),
  });

  if (!updated) {
    throw conflict(authorization);
  }

  return updated;
}

/** Abandon/decline: PENDING or AUTHORIZED → VOIDED. Idempotent on terminal rows. */
export async function voidPaymentAuthorization(
  store: ApiStore,
  input: { authorizationId: string; nowMs: number },
): Promise<{ voided: boolean; authorization?: PaymentAuthorizationRecord }> {
  const updated = await store.transitionPaymentAuthorization({
    id: input.authorizationId,
    from: ['PENDING', 'AUTHORIZED'],
    to: 'VOIDED',
    nowIso: new Date(input.nowMs).toISOString(),
  });

  if (!updated) {
    return { voided: false, authorization: await store.getPaymentAuthorization(input.authorizationId) };
  }

  return { voided: true, authorization: updated };
}

/** Load + expire-on-read: a stale row flips to EXPIRED and is refused. */
async function requireLive(
  store: ApiStore,
  authorizationId: string,
  nowMs: number,
): Promise<PaymentAuthorizationRecord> {
  const authorization = await store.getPaymentAuthorization(authorizationId);

  if (!authorization) {
    throw new PaymentAuthorizationError(
      `Payment authorization ${authorizationId} not found.`,
      404,
      'PAYMENT_AUTHORIZATION_NOT_FOUND',
    );
  }

  if (
    new Date(authorization.expiresAt).getTime() <= nowMs &&
    (authorization.status === 'PENDING' || authorization.status === 'AUTHORIZED')
  ) {
    await store.transitionPaymentAuthorization({
      id: authorization.id,
      from: ['PENDING', 'AUTHORIZED'],
      to: 'EXPIRED',
      nowIso: new Date(nowMs).toISOString(),
    });
    throw new PaymentAuthorizationError(
      `Payment authorization ${authorization.id} expired.`,
      409,
      'PAYMENT_AUTHORIZATION_EXPIRED',
    );
  }

  return authorization;
}

function conflict(authorization: PaymentAuthorizationRecord): PaymentAuthorizationError {
  return new PaymentAuthorizationError(
    `Payment authorization ${authorization.id} is ${authorization.status}.`,
    409,
    'PAYMENT_AUTHORIZATION_CONFLICT',
  );
}
