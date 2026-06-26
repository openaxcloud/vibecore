import { describe, expect, it } from 'vitest';
import { TestApiStore } from './test-api-store.js';

/*
 * Admin DB-backed Stripe config store contract (backs GET/POST /admin/stripe-config).
 * Secrets are stored encrypted + write-only (only hasX flags surface); a blank
 * field on save is preserved (undefined) and null clears it. Per-plan price IDs
 * (not secrets) live on the Plan row and update independently.
 */
describe('stripe config admin (store)', () => {
  it('is empty before any admin write (env-fallback path)', async () => {
    const store = new TestApiStore();
    expect(await store.getStripeConfig()).toBeNull();
  });

  it('stores encrypted secrets and reports hasX flags', async () => {
    const store = new TestApiStore();
    const result = await store.upsertStripeConfig({
      secretKeyEnc: 'enc:sk_live_123',
      webhookSecretEnc: 'enc:whsec_123',
    });

    expect(result).toEqual({ hasSecretKey: true, hasWebhookSecret: true });

    const stored = await store.getStripeConfig();
    expect(stored?.secretKeyEnc).toBe('enc:sk_live_123');
    expect(stored?.webhookSecretEnc).toBe('enc:whsec_123');
  });

  it('preserves an unset field (undefined keeps, null clears)', async () => {
    const store = new TestApiStore();
    await store.upsertStripeConfig({ secretKeyEnc: 'enc:sk', webhookSecretEnc: 'enc:wh' });

    // Save only the webhook secret — the key must survive (saving one secret
    // must not wipe the other).
    const afterWebhookOnly = await store.upsertStripeConfig({ webhookSecretEnc: 'enc:wh2' });
    expect(afterWebhookOnly.hasSecretKey).toBe(true);
    expect((await store.getStripeConfig())?.secretKeyEnc).toBe('enc:sk');
    expect((await store.getStripeConfig())?.webhookSecretEnc).toBe('enc:wh2');

    // Explicit null clears the key.
    const cleared = await store.upsertStripeConfig({ secretKeyEnc: null });
    expect(cleared.hasSecretKey).toBe(false);
    expect((await store.getStripeConfig())?.secretKeyEnc).toBeNull();
  });

  it('sets per-plan price IDs on the Plan row, leaving other fields untouched', async () => {
    const store = new TestApiStore();
    await store.upsertBillingPlan({ key: 'pro', name: 'Pro', monthlyCents: 2000, limits: {} });

    await store.setPlanStripePrices({
      key: 'pro',
      stripePriceMonthlyId: 'price_monthly',
      stripePriceAnnualId: 'price_annual',
    });

    const plan = await store.getBillingPlan('pro');
    expect(plan?.stripePriceMonthlyId).toBe('price_monthly');
    expect(plan?.stripePriceAnnualId).toBe('price_annual');
    expect(plan?.monthlyCents).toBe(2000);

    // Empty/null clears a single field without touching the others.
    await store.setPlanStripePrices({ key: 'pro', stripePriceAnnualId: null });
    const updated = await store.getBillingPlan('pro');
    expect(updated?.stripePriceAnnualId).toBeUndefined();
    expect(updated?.stripePriceMonthlyId).toBe('price_monthly');
  });
});
