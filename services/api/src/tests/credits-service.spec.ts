import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyPlanGrant,
  availableCreditsCents,
  checkServiceShutdown,
  debitCredits,
  gateCheckpoint,
  openCheckpoint,
  reportCheckpointPaygUsage,
  settleCheckpoint,
} from '../credits-service.js';
import type { ApiStore } from '../store.js';
import { TestApiStore } from './test-api-store.js';

const NOW = 2_000_000_000_000;
const future = () => new Date(NOW + 90 * 24 * 3600 * 1000);

describe('checkServiceShutdown (Replit-parity service-shutdown limit)', () => {
  const originalFlag = process.env.BILLING_CREDITS_ENABLED;

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.BILLING_CREDITS_ENABLED;
    } else {
      process.env.BILLING_CREDITS_ENABLED = originalFlag;
    }
  });

  it('is inert in SHADOW (flag off): never shuts down even with zero credits + cap set', async () => {
    delete process.env.BILLING_CREDITS_ENABLED;

    const store = new TestApiStore();
    await store.updateCreditWalletSettings({ organizationId: 'org_1', serviceShutdownCents: 1000 });
    expect((await checkServiceShutdown(store, { organizationId: 'org_1', nowMs: NOW })).shutdown).toBe(false);
  });

  it('shuts down when flag on + cap set + credits exhausted', async () => {
    process.env.BILLING_CREDITS_ENABLED = 'true';

    const store = new TestApiStore();
    await store.updateCreditWalletSettings({ organizationId: 'org_1', serviceShutdownCents: 1000 });

    // no grants → available = 0
    expect((await checkServiceShutdown(store, { organizationId: 'org_1', nowMs: NOW })).shutdown).toBe(true);
  });

  it('does not shut down when credits remain', async () => {
    process.env.BILLING_CREDITS_ENABLED = 'true';

    const store = new TestApiStore();
    await store.updateCreditWalletSettings({ organizationId: 'org_1', serviceShutdownCents: 1000 });
    await store.recordCreditEntry({ organizationId: 'org_1', deltaCents: 500, kind: 'GRANT', reason: 'grant' });
    expect((await checkServiceShutdown(store, { organizationId: 'org_1', nowMs: NOW })).shutdown).toBe(false);
  });

  it('does not shut down when no cap is configured', async () => {
    process.env.BILLING_CREDITS_ENABLED = 'true';

    const store = new TestApiStore();
    expect((await checkServiceShutdown(store, { organizationId: 'org_1', nowMs: NOW })).shutdown).toBe(false);
  });
});

describe('reportCheckpointPaygUsage (Replit-parity PAYG draw-down, SHADOW-safe)', () => {
  const originalFlag = process.env.BILLING_CREDITS_ENABLED;
  const originalPrice = process.env.STRIPE_PAYG_AI_PRICE_ID;

  afterEach(() => {
    process.env.BILLING_CREDITS_ENABLED = originalFlag ?? '';

    if (originalFlag === undefined) {
      delete process.env.BILLING_CREDITS_ENABLED;
    }

    process.env.STRIPE_PAYG_AI_PRICE_ID = originalPrice ?? '';

    if (originalPrice === undefined) {
      delete process.env.STRIPE_PAYG_AI_PRICE_ID;
    }
  });

  const storeWithSub = (externalId?: string) =>
    ({ getSubscription: async () => (externalId ? { externalId } : undefined) }) as unknown as ApiStore;

  const stripe = (priceId: string) => ({
    getSubscription: vi.fn(async () => ({ items: { data: [{ id: 'si_1', price: { id: priceId } }] } })),
    reportUsage: vi.fn(async () => ({})),
  });

  it('is a no-op in SHADOW (flag off)', async () => {
    delete process.env.BILLING_CREDITS_ENABLED;
    process.env.STRIPE_PAYG_AI_PRICE_ID = 'price_payg';

    const s = stripe('price_payg');

    const out = await reportCheckpointPaygUsage(storeWithSub('sub_1'), s, {
      organizationId: 'org_1',
      checkpointId: 'cp_1',
      paygChargeCents: 500,
    });
    expect(out.reported).toBe(false);
    expect(out.reason).toBe('shadow');
    expect(s.reportUsage).not.toHaveBeenCalled();
  });

  it('reports the overage with a checkpoint-id idempotency key when fully configured', async () => {
    process.env.BILLING_CREDITS_ENABLED = 'true';
    process.env.STRIPE_PAYG_AI_PRICE_ID = 'price_payg';

    const s = stripe('price_payg');

    const out = await reportCheckpointPaygUsage(storeWithSub('sub_1'), s, {
      organizationId: 'org_1',
      checkpointId: 'cp_42',
      paygChargeCents: 350,
    });
    expect(out.reported).toBe(true);
    expect(s.reportUsage).toHaveBeenCalledWith({
      subscriptionItemId: 'si_1',
      quantity: 350,
      idempotencyKey: 'checkpoint:cp_42',
    });
  });

  it('no-ops when there is no overage', async () => {
    process.env.BILLING_CREDITS_ENABLED = 'true';
    process.env.STRIPE_PAYG_AI_PRICE_ID = 'price_payg';

    const out = await reportCheckpointPaygUsage(storeWithSub('sub_1'), stripe('price_payg'), {
      organizationId: 'org_1',
      checkpointId: 'cp_1',
      paygChargeCents: 0,
    });
    expect(out.reported).toBe(false);
    expect(out.reason).toBe('no_overage');
  });

  it('no-ops when the subscription has no matching metered item', async () => {
    process.env.BILLING_CREDITS_ENABLED = 'true';
    process.env.STRIPE_PAYG_AI_PRICE_ID = 'price_payg';

    const out = await reportCheckpointPaygUsage(storeWithSub('sub_1'), stripe('price_OTHER'), {
      organizationId: 'org_1',
      checkpointId: 'cp_1',
      paygChargeCents: 500,
    });
    expect(out.reported).toBe(false);
    expect(out.reason).toBe('no_metered_item');
  });
});

describe('settleCheckpoint', () => {
  it('debits the wallet balance when there are no packs', async () => {
    const store = new TestApiStore();
    await store.recordCreditEntry({ organizationId: 'org_1', deltaCents: 2500, kind: 'GRANT', reason: 'grant' });

    const cp = await openCheckpoint(store, { organizationId: 'org_1' });

    const result = await settleCheckpoint(store, {
      checkpointId: cp.id,
      organizationId: 'org_1',
      rawProviderCents: 100, // ×1.3 margin = 130
      nowMs: NOW,
    });

    expect(result.creditCents).toBe(130);
    expect(result.fromBalance).toBe(130);
    expect(result.fromPacks).toBe(0);
    expect((await store.getCreditWallet('org_1'))?.balanceCents).toBe(2500 - 130);

    const settled = await store.getAgentCheckpoint(cp.id);
    expect(settled?.status).toBe('COMPLETED');
    expect(settled?.creditCents).toBe(130);
  });

  it('caps the wallet draw at the real balance and overflows the rest to PAYG', async () => {
    const store = new TestApiStore();

    // Balance is only 50¢ but the checkpoint costs 130¢ and there are no packs.
    await store.recordCreditEntry({ organizationId: 'org_1', deltaCents: 50, kind: 'GRANT', reason: 'grant' });

    const cp = await openCheckpoint(store, { organizationId: 'org_1' });

    const result = await settleCheckpoint(store, {
      checkpointId: cp.id,
      organizationId: 'org_1',
      rawProviderCents: 100, // ×1.3 = 130
      nowMs: NOW,
    });

    expect(result.creditCents).toBe(130);
    expect(result.fromPacks).toBe(0);

    // Draw is clamped to the 50¢ balance, not the full 130¢…
    expect(result.fromBalance).toBe(50);

    // …so the wallet lands at exactly 0 instead of going negative…
    expect((await store.getCreditWallet('org_1'))?.balanceCents).toBe(0);

    // …and the uncovered 80¢ becomes the PAYG overage (creditCents - fromPacks - fromBalance).
    expect(result.creditCents - result.fromPacks - result.fromBalance).toBe(80);
  });

  it('consumes packs earliest-first before touching the balance', async () => {
    const store = new TestApiStore();
    await store.recordCreditEntry({ organizationId: 'org_1', deltaCents: 1000, kind: 'GRANT', reason: 'grant' });

    const earlyPack = await store.createCreditPack({
      organizationId: 'org_1',
      purchasedCents: 80,
      expiresAt: new Date(NOW + 10 * 24 * 3600 * 1000),
    });
    await store.createCreditPack({
      organizationId: 'org_1',
      purchasedCents: 1000,
      expiresAt: new Date(NOW + 100 * 24 * 3600 * 1000),
    });

    const cp = await openCheckpoint(store, { organizationId: 'org_1' });

    const result = await settleCheckpoint(store, {
      checkpointId: cp.id,
      organizationId: 'org_1',
      rawProviderCents: 100, // 130 total
      nowMs: NOW,
    });

    expect(result.creditCents).toBe(130);
    expect(result.fromPacks).toBe(130); // 80 from early + 50 from late
    expect(result.fromBalance).toBe(0);
    expect((await store.getCreditWallet('org_1'))?.balanceCents).toBe(1000); // untouched
    expect((await store.listCreditPacks('org_1')).find((p) => p.id === earlyPack.id)?.remainingCents).toBe(0);
  });

  it('shadow mode records cost but debits nothing', async () => {
    const store = new TestApiStore();
    await store.recordCreditEntry({ organizationId: 'org_1', deltaCents: 500, kind: 'GRANT', reason: 'grant' });

    const cp = await openCheckpoint(store, { organizationId: 'org_1' });

    const result = await settleCheckpoint(store, {
      checkpointId: cp.id,
      organizationId: 'org_1',
      rawProviderCents: 100,
      shadow: true,
      nowMs: NOW,
    });

    expect(result.shadow).toBe(true);
    expect(result.fromBalance).toBe(0);
    expect((await store.getCreditWallet('org_1'))?.balanceCents).toBe(500); // untouched
    expect((await store.getAgentCheckpoint(cp.id))?.creditCents).toBe(130); // still recorded
  });
});

describe('applyPlanGrant', () => {
  it('grants Core monthly ($25) and expires prior unused balance (no rollover)', async () => {
    const store = new TestApiStore();
    await store.recordCreditEntry({ organizationId: 'org_1', deltaCents: 700, kind: 'GRANT', reason: 'old' });

    const result = await applyPlanGrant(store, { organizationId: 'org_1', planKey: 'core', nowMs: NOW });
    expect(result.period).toBe('monthly');
    expect(result.granted).toBe(2500);
    expect(result.expired).toBe(700);
    expect((await store.getCreditWallet('org_1'))?.balanceCents).toBe(2500);
  });

  it('grants Pro monthly ($100) and rolls over one period (caps balance)', async () => {
    const store = new TestApiStore();

    // 12000 balance, Pro grant 10000, rollover cap = 1×10000 → expire 2000, then +10000.
    await store.recordCreditEntry({ organizationId: 'org_1', deltaCents: 12_000, kind: 'GRANT', reason: 'old' });

    const result = await applyPlanGrant(store, { organizationId: 'org_1', planKey: 'pro', nowMs: NOW });
    expect(result.granted).toBe(10_000);
    expect(result.expired).toBe(2000);
    expect((await store.getCreditWallet('org_1'))?.balanceCents).toBe(10_000 + 10_000);
  });

  it('grants Starter daily credits', async () => {
    const store = new TestApiStore();
    const result = await applyPlanGrant(store, { organizationId: 'org_1', planKey: 'starter', nowMs: NOW });
    expect(result.period).toBe('daily');
    expect(result.granted).toBe(25);
    expect((await store.getCreditWallet('org_1'))?.balanceCents).toBe(25);
  });
});

describe('gateCheckpoint', () => {
  it('allows when credits (balance + packs) cover the estimate', async () => {
    const store = new TestApiStore();
    await store.recordCreditEntry({ organizationId: 'org_1', deltaCents: 100, kind: 'GRANT', reason: 'grant' });
    await store.createCreditPack({ organizationId: 'org_1', purchasedCents: 200, expiresAt: future() });

    expect(await availableCreditsCents(store, 'org_1', NOW)).toBe(300);

    const decision = await gateCheckpoint(store, { organizationId: 'org_1', estimatedCents: 250, nowMs: NOW });
    expect(decision).toEqual({ ok: true, mode: 'credits' });
  });

  it('blocks when short and PAYG disabled', async () => {
    const store = new TestApiStore();
    await store.recordCreditEntry({ organizationId: 'org_1', deltaCents: 50, kind: 'GRANT', reason: 'grant' });

    const decision = await gateCheckpoint(store, { organizationId: 'org_1', estimatedCents: 250, nowMs: NOW });
    expect(decision).toEqual({ ok: false, mode: 'blocked', reason: 'insufficient_credits' });
  });

  it('allows PAYG overage under the Usage Limit', async () => {
    const store = new TestApiStore();
    await store.updateCreditWalletSettings({ organizationId: 'org_1', budgetCapCents: 5000 });

    const decision = await gateCheckpoint(store, {
      organizationId: 'org_1',
      estimatedCents: 250,
      paygSpentCents: 100,
      nowMs: NOW,
    });
    expect(decision).toEqual({ ok: true, mode: 'payg' });
  });
});

describe('debitCredits (concurrent wallet-balance over-spend guard)', () => {
  it('never settles the wallet negative when the balance read is stale (race)', async () => {
    const store = new TestApiStore();

    // Real balance is 100; both racing settles see this same snapshot.
    await store.recordCreditEntry({ organizationId: 'org_1', deltaCents: 100, kind: 'GRANT', reason: 'grant' });

    /*
     * Simulate the race: the stale read still reports 100 even after a sibling
     * settlement has already drained the wallet to 0.
     */
    const real = store.getCreditWallet.bind(store);
    vi.spyOn(store, 'getCreditWallet').mockImplementation(async (orgId: string) => {
      const wallet = await real(orgId);

      return wallet ? { ...wallet, balanceCents: 100 } : wallet;
    });

    // First debit drains the wallet to 0 (covered).
    const first = await debitCredits(store, {
      organizationId: 'org_1',
      amountCents: 100,
      reason: 'agent checkpoint',
      nowMs: NOW,
    });
    expect(first.fromBalance).toBe(100);

    // Second concurrent debit reads the SAME stale balance=100 and would over-draw.
    const second = await debitCredits(store, {
      organizationId: 'org_1',
      amountCents: 100,
      reason: 'agent checkpoint',
      nowMs: NOW,
    });

    const wallet = await real('org_1');

    // Clamp-to-0 invariant: the wallet is never driven negative.
    expect(wallet?.balanceCents).toBe(0);

    // The uncovered remainder is excluded from fromBalance so it overflows to PAYG.
    expect(second.fromBalance).toBe(0);
  });

  it('draws the real balance and reports no over-draw on the happy path', async () => {
    const store = new TestApiStore();
    await store.recordCreditEntry({ organizationId: 'org_1', deltaCents: 500, kind: 'GRANT', reason: 'grant' });

    const result = await debitCredits(store, {
      organizationId: 'org_1',
      amountCents: 200,
      reason: 'agent checkpoint',
      nowMs: NOW,
    });

    expect(result.fromBalance).toBe(200);

    const wallet = await store.getCreditWallet('org_1');
    expect(wallet?.balanceCents).toBe(300);
  });
});
