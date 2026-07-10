import { describe, expect, it, vi, beforeEach } from 'vitest';

/*
 * Sever the provider <-> manager import cycle (same pattern as openai.spec.ts).
 */
vi.mock('../manager', () => ({ LLMManager: { getInstance: () => ({ env: {} }) } }));

/*
 * Capture how each provider configures the underlying @ai-sdk/openai client so we
 * can assert the A7 cache-affinity plumbing (OpenAI `user` field / xAI header)
 * WITHOUT making a network call. The mocked `openai(model, settings)` records its
 * args and `createOpenAI(config)` records the transport config (baseURL/headers).
 */
const createOpenAICalls: Array<Record<string, any>> = [];
const modelCalls: Array<{ model: string; settings: unknown }> = [];

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: (config: Record<string, any>) => {
    createOpenAICalls.push(config);

    const factory = (model: string, settings?: unknown) => {
      modelCalls.push({ model, settings });
      return { model, settings } as any;
    };

    return factory;
  },
}));

// eslint-disable-next-line @typescript-eslint/naming-convention -- dynamic-import of a provider class binding
const { default: OpenAIProvider } = await import('./openai');
// eslint-disable-next-line @typescript-eslint/naming-convention -- dynamic-import of a provider class binding
const { default: XAIProvider } = await import('./xai');

const serverEnv = { OPENAI_API_KEY: 'sk-openai', XAI_API_KEY: 'xai-key' } as any;

beforeEach(() => {
  createOpenAICalls.length = 0;
  modelCalls.length = 0;
});

describe('A7 OpenAI cache-affinity (user field)', () => {
  it('passes the cacheAffinityKey as the OpenAI `user` model setting (with the pinned gpt-4o snapshot)', () => {
    new OpenAIProvider().getModelInstance({ model: 'gpt-4o', serverEnv, cacheAffinityKey: 'conv-123' });
    expect(modelCalls).toHaveLength(1);
    expect(modelCalls[0].model).toBe('gpt-4o-2024-08-06');
    expect(modelCalls[0].settings).toEqual({ user: 'conv-123' });
  });

  it('omits the `user` setting entirely when no key (byte-identical to today)', () => {
    new OpenAIProvider().getModelInstance({ model: 'gpt-4o', serverEnv });
    expect(modelCalls[0].settings).toBeUndefined();
  });
});

describe('OpenAI cache-v2 wire config (compatibility + snapshot pin)', () => {
  it("instantiates the real OpenAI client with compatibility: 'strict' so streaming usage (cached tokens) is reported", () => {
    new OpenAIProvider().getModelInstance({ model: 'gpt-4o', serverEnv });
    expect(createOpenAICalls).toHaveLength(1);
    expect(createOpenAICalls[0].compatibility).toBe('strict');
  });

  it('pins the floating gpt-4o alias to a dated snapshot and passes other ids through untouched', () => {
    new OpenAIProvider().getModelInstance({ model: 'gpt-4o', serverEnv });
    new OpenAIProvider().getModelInstance({ model: 'gpt-4o-mini', serverEnv });
    new OpenAIProvider().getModelInstance({ model: 'gpt-4.1', serverEnv });
    new OpenAIProvider().getModelInstance({ model: 'o3-mini', serverEnv });
    expect(modelCalls.map((c) => c.model)).toEqual(['gpt-4o-2024-08-06', 'gpt-4o-mini', 'gpt-4.1', 'o3-mini']);
  });
});

describe('NON-REGRESSION: strict/pin stay on the real OpenAI provider only', () => {
  it('xAI createOpenAI config carries NO compatibility flag (would break the non-OpenAI baseURL)', () => {
    new XAIProvider().getModelInstance({ model: 'grok-4', serverEnv });
    expect(createOpenAICalls).toHaveLength(1);
    expect(createOpenAICalls[0].baseURL).toBe('https://api.x.ai/v1');
    expect('compatibility' in createOpenAICalls[0]).toBe(false);
  });

  it('xAI never pins the model id', () => {
    new XAIProvider().getModelInstance({ model: 'grok-4', serverEnv });
    expect(modelCalls[0].model).toBe('grok-4');
  });
});

describe('A7 xAI cache-affinity (x-grok-conv-id header)', () => {
  it('passes the cacheAffinityKey as the x-grok-conv-id header, preserving baseURL', () => {
    new XAIProvider().getModelInstance({ model: 'grok-4', serverEnv, cacheAffinityKey: 'conv-abc' });
    expect(createOpenAICalls).toHaveLength(1);
    expect(createOpenAICalls[0].baseURL).toBe('https://api.x.ai/v1');
    expect(createOpenAICalls[0].headers).toEqual({ 'x-grok-conv-id': 'conv-abc' });
  });

  it('omits the header when no key (undefined headers -> byte-identical)', () => {
    new XAIProvider().getModelInstance({ model: 'grok-4', serverEnv });
    expect(createOpenAICalls[0].headers).toBeUndefined();
  });
});
