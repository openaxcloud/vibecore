import { describe, expect, it, vi } from 'vitest';

/*
 * `xai.ts` -> `base-provider.ts` -> `manager.ts` -> `registry.ts` -> every
 * provider -> `base-provider.ts` is a circular import. Stubbing the manager
 * severs the cycle so the real provider class loads cleanly in isolation
 * (same approach as openai.spec.ts).
 */
vi.mock('../manager', () => ({ LLMManager: class {} }));

// eslint-disable-next-line @typescript-eslint/naming-convention -- dynamic-import of a provider class binding
const { default: XAIProvider } = await import('./xai');

/*
 * Mirrors PROVIDER_COMPLETION_LIMITS['xAI'] in app/utils/constants.ts. If any
 * xAI model omits maxCompletionTokens, getCompletionTokenLimit() silently falls
 * back to this floor and truncates large multi-file generations mid-file.
 */
const XAI_PROVIDER_COMPLETION_FLOOR = 8192;

describe('XAIProvider static models', () => {
  const provider = new XAIProvider();

  it('declares an explicit maxCompletionTokens for every static model (bug 1)', () => {
    for (const model of provider.staticModels) {
      expect(model.maxCompletionTokens, `${model.name} should set maxCompletionTokens`).toBeTypeOf('number');
      expect(model.maxCompletionTokens!).toBeGreaterThan(0);
    }
  });

  it('sets a completion budget above the 8192 provider floor so Grok output is not truncated (bug 1)', () => {
    for (const model of provider.staticModels) {
      expect(
        model.maxCompletionTokens!,
        `${model.name} must exceed the ${XAI_PROVIDER_COMPLETION_FLOOR} fallback floor`,
      ).toBeGreaterThan(XAI_PROVIDER_COMPLETION_FLOOR);
    }
  });

  it('keeps the completion budget within the context window for every model', () => {
    for (const model of provider.staticModels) {
      expect(model.maxCompletionTokens!).toBeLessThanOrEqual(model.maxTokenAllowed);
    }
  });

  it('gives the Grok-4 family the widest completion budget', () => {
    const grok4 = provider.staticModels.find((m) => m.name === 'grok-4');
    const grok4Dated = provider.staticModels.find((m) => m.name === 'grok-4-07-09');
    expect(grok4?.maxCompletionTokens).toBe(32768);
    expect(grok4Dated?.maxCompletionTokens).toBe(32768);
  });
});
