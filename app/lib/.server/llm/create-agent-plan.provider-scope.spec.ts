import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAgentPlan } from './create-agent-plan';
import { getProviderHealth, resetProviderHealth } from './provider-fallback';
import { createProviderHealthScope } from './provider-health-scope';
import { LLMManager } from '~/lib/modules/llm/manager';
import { PROVIDER_LIST } from '~/utils/constants';

const boundary = vi.hoisted(() => ({ generate: vi.fn(), dynamic: vi.fn(), fetch: vi.fn() }));
vi.mock('ai', async (original) => ({ ...(await original<object>()), generateText: boundary.generate }));
vi.mock('~/lib/modules/llm/runtime-env', () => ({ readRuntimeEnv: () => undefined }));

const provider = PROVIDER_LIST.find((p) => p.name === 'Anthropic')!;
const model = provider.staticModels[0].name;
const keys = { Anthropic: 'fixture-planner-A' };

const messages = [
  { role: 'user' as const, content: `[Model: ${model}]\n\n[Provider: Anthropic]\n\nBuild the isolated fixture.` },
];
beforeEach(() => {
  resetProviderHealth();
  vi.clearAllMocks();
  boundary.dynamic.mockResolvedValue([]);
  vi.spyOn(LLMManager, 'getInstance').mockReturnValue({
    env: {},
    getStaticModelListFromProvider: (p: (typeof PROVIDER_LIST)[number]) => p.staticModels,
    getModelListFromProvider: boundary.dynamic,
  } as never);
  vi.spyOn(provider, 'getModelInstance').mockReturnValue({ provider: 'Anthropic', modelId: model } as never);
  boundary.fetch.mockImplementation(() => {
    throw new Error('External network forbidden');
  });
  vi.stubGlobal('fetch', boundary.fetch);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('attributes a planner authentication failure only to the exact SDK credential/endpoint scope', async () => {
  boundary.generate.mockRejectedValueOnce(Object.assign(new Error('private fixture body'), { statusCode: 401 }));

  const providerSettings = { Anthropic: { baseUrl: 'https://planner-fixture.invalid' } } as any;
  await expect(createAgentPlan({ messages, apiKeys: keys, providerSettings })).resolves.toBeUndefined();

  const scope = createProviderHealthScope({ provider, apiKeys: keys, providerSettings });
  expect(getProviderHealth(scope)?.kind).toBe('auth');
  expect(getProviderHealth(scope)?.detail).toBe('auth');
  expect(
    getProviderHealth(
      createProviderHealthScope({ provider, apiKeys: { Anthropic: 'fixture-planner-B' }, providerSettings }),
    ),
  ).toBeUndefined();
  expect(
    getProviderHealth(createProviderHealthScope({ provider, serverEnv: { ANTHROPIC_API_KEY: 'fixture-managed' } })),
  ).toBeUndefined();
  expect(provider.getModelInstance).toHaveBeenCalledWith(expect.objectContaining({ apiKeys: keys, providerSettings }));
  expect(boundary.fetch).not.toHaveBeenCalled();
});

it('does not turn a transient planner request failure into a credential-health verdict', async () => {
  boundary.generate.mockRejectedValueOnce(Object.assign(new Error('synthetic server failure'), { statusCode: 503 }));
  await createAgentPlan({ messages, apiKeys: keys });
  expect(getProviderHealth(createProviderHealthScope({ provider, apiKeys: keys }))).toBeUndefined();
});

it('does not attribute auxiliary model-discovery authentication errors to a model never invoked', async () => {
  boundary.dynamic.mockRejectedValueOnce(Object.assign(new Error('synthetic discovery refusal'), { statusCode: 401 }));
  await createAgentPlan({
    messages: [{ role: 'user', content: '[Model: unknown-fixture-model]\n\n[Provider: Anthropic]\n\nBuild fixture.' }],
    apiKeys: keys,
  });
  expect(boundary.generate).not.toHaveBeenCalled();
  expect(provider.getModelInstance).not.toHaveBeenCalled();
  expect(getProviderHealth(createProviderHealthScope({ provider, apiKeys: keys }))).toBeUndefined();
});
