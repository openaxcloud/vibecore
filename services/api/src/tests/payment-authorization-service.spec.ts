/**
 * PaymentAuthorization — the MONEY side of D4 phase 1. The load-bearing proof:
 * a payment authorization NEVER touches the credit wallet or ledger, in any
 * state transition — reserving credits and authorizing a payment are two
 * different operations.
 */
import { describe, expect, it } from 'vitest';
import {
  capturePaymentAuthorization,
  markPaymentAuthorized,
  openPaymentAuthorization,
  voidPaymentAuthorization,
} from '../payment-authorization-service.js';
import { TestApiStore } from './test-api-store.js';

const NOW = 2_000_000_000_000;
const HOUR = 60 * 60 * 1000;
const ORG = 'org_pay';

function baseAuthorization(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    idempotencyKey: 'domain:example.com',
    purpose: 'domain',
    amountCents: 1_200,
    ttlMs: HOUR,
    nowMs: NOW,
    ...overrides,
  };
}

describe('payment authorizations never touch credits', () => {
  it('full PENDING→AUTHORIZED→CAPTURED flow leaves wallet and ledger at zero', async () => {
    const store = new TestApiStore();
    await store.recordCreditEntry({ organizationId: ORG, deltaCents: 1_000, kind: 'GRANT', reason: 'grant' });

    const { authorization } = await openPaymentAuthorization(store, baseAuthorization());
    await markPaymentAuthorized(store, {
      authorizationId: authorization.id,
      stripePaymentIntentId: 'pi_1',
      nowMs: NOW,
    });

    const captured = await capturePaymentAuthorization(store, { authorizationId: authorization.id, nowMs: NOW });

    expect(captured.status).toBe('CAPTURED');
    expect(captured.stripePaymentIntentId).toBe('pi_1');

    // The accounting fault line: money moved at the PSP, credits did not move.
    expect((await store.ensureCreditWallet(ORG)).balanceCents).toBe(1_000);
    expect(await store.listCreditLedger(ORG)).toHaveLength(1); // the grant only
  });

  it('is idempotent per (org, key): a replay returns the SAME authorization', async () => {
    const store = new TestApiStore();

    const first = await openPaymentAuthorization(store, baseAuthorization());
    const replay = await openPaymentAuthorization(store, baseAuthorization({ amountCents: 99_999 }));

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.authorization.id).toBe(first.authorization.id);
    expect(replay.authorization.amountCents).toBe(1_200); // a replay cannot reprice
    expect(await store.listPaymentAuthorizations(ORG)).toHaveLength(1);
  });

  it('refuses usage families — credit consumption goes through UsageReservation', async () => {
    const store = new TestApiStore();

    await expect(openPaymentAuthorization(store, baseAuthorization({ purpose: 'import' }))).rejects.toMatchObject({
      code: 'USAGE_REQUIRES_RESERVATION',
      statusCode: 400,
    });
  });

  it('refuses non-positive or fractional amounts', async () => {
    const store = new TestApiStore();

    await expect(openPaymentAuthorization(store, baseAuthorization({ amountCents: 0 }))).rejects.toMatchObject({
      code: 'PAYMENT_AUTHORIZATION_INVALID_AMOUNT',
    });
    await expect(openPaymentAuthorization(store, baseAuthorization({ amountCents: 10.5 }))).rejects.toMatchObject({
      code: 'PAYMENT_AUTHORIZATION_INVALID_AMOUNT',
    });
  });

  it('guards the state machine: capture without authorization is refused', async () => {
    const store = new TestApiStore();
    const { authorization } = await openPaymentAuthorization(store, baseAuthorization());

    await expect(
      capturePaymentAuthorization(store, { authorizationId: authorization.id, nowMs: NOW }),
    ).rejects.toMatchObject({ code: 'PAYMENT_AUTHORIZATION_CONFLICT', statusCode: 409 });
  });

  it('expires on read: a stale authorization flips to EXPIRED and is refused', async () => {
    const store = new TestApiStore();
    const { authorization } = await openPaymentAuthorization(store, baseAuthorization());

    await expect(
      markPaymentAuthorized(store, {
        authorizationId: authorization.id,
        stripePaymentIntentId: 'pi_late',
        nowMs: NOW + 2 * HOUR,
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_AUTHORIZATION_EXPIRED', statusCode: 409 });

    expect((await store.getPaymentAuthorization(authorization.id))?.status).toBe('EXPIRED');
  });

  it('void is idempotent and terminal', async () => {
    const store = new TestApiStore();
    const { authorization } = await openPaymentAuthorization(store, baseAuthorization());

    const voided = await voidPaymentAuthorization(store, { authorizationId: authorization.id, nowMs: NOW });
    expect(voided.voided).toBe(true);

    const again = await voidPaymentAuthorization(store, { authorizationId: authorization.id, nowMs: NOW });
    expect(again.voided).toBe(false);
    expect(again.authorization?.status).toBe('VOIDED');
  });
});
