import { describe, expect, it } from 'vitest';
import {
  applyPlanGrant,
  availableCreditsCents,
  gateCheckpoint,
  openCheckpoint,
  settleCheckpoint,
} from '../credits-service.js';
import { TestApiStore } from './test-api-store.js';

const NOW = 2_000_000_000_000;
const future = () => new Date(NOW + 90 * 24 * 3600 * 1000);

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
