import { describe, expect, it } from 'vitest';
import { TestApiStore } from './test-api-store.js';

describe('credit wallet store', () => {
  it('creates a wallet lazily and grants then debits atomically', async () => {
    const store = new TestApiStore();
    const org = 'org_1';

    const wallet = await store.ensureCreditWallet(org);
    expect(wallet.balanceCents).toBe(0);

    const grant = await store.recordCreditEntry({
      organizationId: org,
      deltaCents: 2500,
      kind: 'GRANT',
      reason: 'monthly grant',
    });
    expect(grant.balanceCents).toBe(2500);

    const debit = await store.recordCreditEntry({
      organizationId: org,
      deltaCents: -130,
      kind: 'CONSUMPTION',
      reason: 'checkpoint',
      checkpointId: 'cp_1',
    });
    expect(debit.balanceCents).toBe(2370);

    const refreshed = await store.getCreditWallet(org);
    expect(refreshed?.balanceCents).toBe(2370);

    const ledger = await store.listCreditLedger(org);
    expect(ledger).toHaveLength(2);
    expect(ledger.map((e) => e.kind)).toContain('CONSUMPTION');
  });

  it('records and updates budget cap settings', async () => {
    const store = new TestApiStore();
    const updated = await store.updateCreditWalletSettings({ organizationId: 'org_2', budgetCapCents: 5000 });
    expect(updated.budgetCapCents).toBe(5000);
    const cleared = await store.updateCreditWalletSettings({ organizationId: 'org_2', budgetCapCents: null });
    expect(cleared.budgetCapCents).toBeUndefined();
  });
});

describe('credit pack store', () => {
  it('creates a pack, lists active-only, and decrements remaining', async () => {
    const store = new TestApiStore();
    const future = new Date(Date.now() + 90 * 24 * 3600 * 1000);
    const past = new Date(Date.now() - 1000);

    const pack = await store.createCreditPack({ organizationId: 'org_1', purchasedCents: 1000, expiresAt: future });
    expect(pack.remainingCents).toBe(1000);

    await store.createCreditPack({ organizationId: 'org_1', purchasedCents: 500, expiresAt: past });

    const active = await store.listCreditPacks('org_1', { activeOnly: true });
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(pack.id);

    const all = await store.listCreditPacks('org_1');
    expect(all).toHaveLength(2);

    const decremented = await store.decrementCreditPack({ id: pack.id, cents: 300 });
    expect(decremented.remainingCents).toBe(700);
  });
});

describe('agent checkpoint store', () => {
  it('opens a PENDING checkpoint and settles it', async () => {
    const store = new TestApiStore();
    const cp = await store.createAgentCheckpoint({
      organizationId: 'org_1',
      projectId: 'proj_1',
      highPowerModel: true,
    });
    expect(cp.status).toBe('PENDING');
    expect(cp.highPowerModel).toBe(true);

    const settled = await store.completeAgentCheckpoint({
      id: cp.id,
      status: 'COMPLETED',
      inputTokens: 1000,
      outputTokens: 500,
      rawProviderCents: 100,
      creditCents: 130,
    });
    expect(settled.status).toBe('COMPLETED');
    expect(settled.creditCents).toBe(130);
    expect(settled.completedAt).toBeDefined();

    const list = await store.listAgentCheckpoints('org_1');
    expect(list).toHaveLength(1);
  });
});

describe('admin supervision listings', () => {
  it('lists wallets and checkpoints across orgs', async () => {
    const store = new TestApiStore();
    await store.recordCreditEntry({ organizationId: 'org_a', deltaCents: 100, kind: 'GRANT', reason: 'g' });
    await store.recordCreditEntry({ organizationId: 'org_b', deltaCents: 200, kind: 'GRANT', reason: 'g' });
    await store.createAgentCheckpoint({ organizationId: 'org_a' });

    const wallets = await store.listAdminCreditWallets();
    expect(wallets.map((w) => w.organizationId).sort()).toEqual(['org_a', 'org_b']);

    const checkpoints = await store.listAdminAgentCheckpoints();
    expect(checkpoints).toHaveLength(1);
  });
});

describe('provider/model registry store', () => {
  it('upserts a model, auto-creating its provider shell', async () => {
    const store = new TestApiStore();
    const model = await store.upsertModelConfig({
      provider: 'anthropic',
      modelId: 'claude-opus-4-8',
      displayName: 'Claude Opus 4.8',
      enabledPlans: ['pro', 'enterprise'],
      isHighPower: true,
      inputCentsPerM: 500,
      outputCentsPerM: 2500,
      contextWindow: 1_000_000,
    });
    expect(model.provider).toBe('anthropic');
    expect(model.enabled).toBe(false);

    const providers = await store.listProviderConfigs();
    expect(providers.map((p) => p.provider)).toContain('anthropic');
  });

  it('enabledOnly filters out disabled models and disabled providers', async () => {
    const store = new TestApiStore();
    await store.upsertProviderConfig({ provider: 'anthropic', displayName: 'Anthropic', enabled: true });
    await store.upsertModelConfig({
      provider: 'anthropic',
      modelId: 'm-on',
      displayName: 'On',
      enabled: true,
      enabledPlans: ['core'],
      inputCentsPerM: 1,
      outputCentsPerM: 1,
      contextWindow: 1000,
    });
    await store.upsertModelConfig({
      provider: 'anthropic',
      modelId: 'm-off',
      displayName: 'Off',
      enabled: false,
      enabledPlans: ['core'],
      inputCentsPerM: 1,
      outputCentsPerM: 1,
      contextWindow: 1000,
    });
    // Provider disabled → its enabled model is still hidden.
    await store.upsertProviderConfig({ provider: 'mistral', displayName: 'Mistral', enabled: false });
    await store.upsertModelConfig({
      provider: 'mistral',
      modelId: 'm-prov-off',
      displayName: 'ProvOff',
      enabled: true,
      enabledPlans: ['core'],
      inputCentsPerM: 1,
      outputCentsPerM: 1,
      contextWindow: 1000,
    });

    const enabled = await store.listModelConfigs({ enabledOnly: true });
    expect(enabled.map((m) => m.modelId)).toEqual(['m-on']);

    const all = await store.listModelConfigs();
    expect(all).toHaveLength(3);
  });
});
