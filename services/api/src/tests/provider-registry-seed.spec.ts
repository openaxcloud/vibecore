import { describe, expect, it } from 'vitest';
import { aiModelCatalog } from '@vibecore/billing';
import { seedProviderRegistry } from '../app.js';
import { TestApiStore } from './test-api-store.js';

describe('seedProviderRegistry', () => {
  it('seeds every catalog model and its provider', async () => {
    const store = new TestApiStore();
    await seedProviderRegistry(store);

    const models = await store.listModelConfigs();
    expect(models).toHaveLength(aiModelCatalog.length);

    const providers = await store.listProviderConfigs();
    const expectedProviders = new Set(aiModelCatalog.map((m) => m.provider));
    expect(new Set(providers.map((p) => p.provider))).toEqual(expectedProviders);
  });

  it('maps ai-plan keys to credit-plan keys (free→starter, pro→core, business→pro)', async () => {
    const store = new TestApiStore();
    await seedProviderRegistry(store);
    const models = await store.listModelConfigs();

    // GPT-4.1 Mini is offered on the free tier in the catalog → must include starter.
    const mini = models.find((m) => m.modelId === 'gpt-4.1-mini');
    expect(mini?.enabledPlans).toContain('starter');
    expect(mini?.enabledPlans).not.toContain('free');
  });

  it('is idempotent and does not clobber an admin edit', async () => {
    const store = new TestApiStore();
    await seedProviderRegistry(store);

    // Admin disables a model after the first seed.
    const first = (await store.listModelConfigs())[0];
    await store.upsertModelConfig({
      provider: first.provider!,
      modelId: first.modelId,
      displayName: first.displayName,
      enabled: false,
      enabledPlans: first.enabledPlans,
      inputCentsPerM: first.inputCentsPerM,
      outputCentsPerM: first.outputCentsPerM,
      contextWindow: first.contextWindow,
    });

    // Re-seed (next boot).
    await seedProviderRegistry(store);

    const after = (await store.listModelConfigs()).find((m) => m.modelId === first.modelId);
    expect(after?.enabled).toBe(false); // admin's disable survived
    // No duplicate rows were created.
    expect(await store.listModelConfigs()).toHaveLength(aiModelCatalog.length);
  });
});
