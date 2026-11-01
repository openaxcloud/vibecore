import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { decideTaskHardness } from './agent-mode';
import { createAgentPlan } from './create-agent-plan';
import { createSummary } from './create-summary';
import {
  getProviderHealth,
  markProviderUnhealthy,
  resetProviderHealth,
  resetProviderProbeCache,
} from './provider-fallback';
import { createProviderHealthScope, type ProviderHealthScope } from './provider-health-scope';
import { selectContext } from './select-context';
import { streamText } from './stream-text';
import { LLMManager } from '~/lib/modules/llm/manager';
import { PROVIDER_LIST } from '~/utils/constants';

const boundary = vi.hoisted(() => ({ probe: vi.fn(), stream: vi.fn(), fetch: vi.fn() }));
vi.mock('ai', async (original) => ({
  ...(await original<object>()),
  generateText: boundary.probe,
  streamText: boundary.stream,
}));
vi.mock('./managed-provider-keys', () => ({ applyManagedProviderKeys: async (env: unknown) => env }));
vi.mock('~/lib/modules/llm/runtime-env', () => ({ readRuntimeEnv: () => undefined, readRuntimeEnvBag: () => ({}) }));

const provider = (name: string) => PROVIDER_LIST.find((p) => p.name === name)!;
const model = (name: string) => provider(name).staticModels[0].name;
const keys = { OpenAI: 'fixture-openai', Google: 'fixture-google' };

beforeEach(() => {
  resetProviderHealth();
  resetProviderProbeCache();
  vi.clearAllMocks();
  vi.spyOn(LLMManager, 'getInstance').mockReturnValue({
    env: {},
    getStaticModelListFromProvider: (p: (typeof PROVIDER_LIST)[number]) => p.staticModels,
    getModelListFromProvider: async () => [],
  } as never);

  for (const p of PROVIDER_LIST) {
    vi.spyOn(p, 'getModelInstance').mockImplementation(({ model }) => ({ provider: p.name, modelId: model }) as never);
  }
  boundary.probe.mockResolvedValue({ text: 'fixture ping' });
  boundary.stream.mockResolvedValue({ fixture: true });
  boundary.fetch.mockImplementation(() => {
    throw new Error('External network forbidden');
  });
  vi.stubGlobal('fetch', boundary.fetch);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const invoke = (options: Partial<Parameters<typeof streamText>[0]> = {}) =>
  streamText({
    messages: [{ role: 'user', content: 'Explain the isolated fixture.' }],
    chatMode: 'discuss',
    forcedRoute: { provider: 'Anthropic', model: model('Anthropic') },
    apiKeys: keys,
    ...options,
  });

it('rejects a missing primary under a no-fallback card without probing or selecting another provider', async () => {
  const announce = vi.fn();
  const scope = vi.fn();
  await expect(
    invoke({ repliDeCarte: null, onBasculeFournisseur: announce, onProviderHealthScope: scope }),
  ).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  expect(boundary.probe).not.toHaveBeenCalled();
  expect(boundary.stream).not.toHaveBeenCalled();
  expect(announce).not.toHaveBeenCalled();
  expect(scope.mock.calls).toEqual([[undefined]]);
});

it('honors the declared fallback and announces the actual selected destination exactly once', async () => {
  const announce = vi.fn();
  const scope = vi.fn();
  await invoke({
    repliDeCarte: { provider: 'Google', model: model('Google') },
    onBasculeFournisseur: announce,
    onProviderHealthScope: scope,
  });
  expect(announce).toHaveBeenCalledExactlyOnceWith({
    depuis: { provider: 'Anthropic', model: model('Anthropic') },
    vers: { provider: 'Google', model: model('Google') },
    motif: 'missing-credentials',
  });
  expect(boundary.stream.mock.calls[0][0].model).toMatchObject({ provider: 'Google' });
  expect(scope.mock.calls).toEqual([
    [undefined],
    [createProviderHealthScope({ provider: provider('Google'), apiKeys: keys })],
  ]);
  expect(boundary.fetch).not.toHaveBeenCalled();
});

it('composes credential and runtime fallback into one announcement of the final destination', async () => {
  markProviderUnhealthy(createProviderHealthScope({ provider: provider('OpenAI'), apiKeys: keys }), 'auth', 'fixture');

  const announce = vi.fn();
  await invoke({ onBasculeFournisseur: announce });
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce.mock.calls[0][0]).toMatchObject({ depuis: { provider: 'Anthropic' }, vers: { provider: 'Google' } });
  expect(boundary.stream.mock.calls[0][0].model).toMatchObject({ provider: 'Google' });
});

it('hands the caller the effective BYOK scope and clears it before a later rejected invocation', async () => {
  let captured: ProviderHealthScope | undefined;

  const onProviderHealthScope = (scope: ProviderHealthScope | undefined) => {
    captured = scope;
  };
  await invoke({ apiKeys: { Anthropic: 'fixture-user-A' }, repliDeCarte: null, onProviderHealthScope });
  expect(captured).toEqual(
    createProviderHealthScope({ provider: provider('Anthropic'), apiKeys: { Anthropic: 'fixture-user-A' } }),
  );
  markProviderUnhealthy(captured!, 'auth', 'synthetic private body');
  expect(
    getProviderHealth(
      createProviderHealthScope({ provider: provider('Anthropic'), apiKeys: { Anthropic: 'fixture-user-B' } }),
    ),
  ).toBeUndefined();
  await expect(invoke({ apiKeys: {}, repliDeCarte: null, onProviderHealthScope })).rejects.toMatchObject({
    code: 'AUTH_FAILED',
  });
  expect(captured).toBeUndefined();
});

it.each([null, { provider: 'Google', model: 'gemini-2.5-pro' }])(
  'rejects an unknown primary provider under an explicit card before any probe or stream',
  async (repliDeCarte) => {
    const announce = vi.fn();
    await expect(
      invoke({
        forcedRoute: { provider: 'Unknown-fixture-provider', model: 'unknown-model' },
        apiKeys: { Anthropic: 'fixture-default', ...keys },
        repliDeCarte,
        onBasculeFournisseur: announce,
      }),
    ).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND', isRetryable: false });
    expect(boundary.probe).not.toHaveBeenCalled();
    expect(boundary.stream).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  },
);

const auxiliaryRouting = () => ({ primary: { provider: 'Anthropic', model: model('Anthropic') }, fallback: null });

const auxiliaryMessages = () => [
  {
    role: 'user' as const,
    content: `[Model: ${model('OpenAI')}]\n\n[Provider: OpenAI]\n\nBuild a complete isolated application.`,
  },
];

it('does not substitute credentials for card-governed summary, context, planner or classifier calls', async () => {
  const common = { routing: auxiliaryRouting(), messages: auxiliaryMessages(), apiKeys: keys };
  await expect(createSummary(common)).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  await expect(selectContext({ ...common, files: {}, summary: '' })).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  await expect(createAgentPlan(common)).resolves.toBeUndefined();

  const hardness = await decideTaskHardness({
    task: {
      chatMode: 'build',
      lastUserMessage: 'Build an entire full-stack app from scratch',
      contextFileCount: 0,
      planFirst: true,
    },
    lastUserMessage: 'Build an entire full-stack app from scratch',
    classifier: { provider: 'Anthropic', model: model('Anthropic') },
    apiKeys: keys,
  });
  expect(hardness.decidedBy).toBe('heuristic');
  expect(hardness.classifierUsage).toBeUndefined();
  expect(boundary.probe).not.toHaveBeenCalled();
  expect(boundary.stream).not.toHaveBeenCalled();
  expect(boundary.fetch).not.toHaveBeenCalled();
});

it('still invokes the permitted primary for healthy auxiliary work and preserves legacy callers without a card', async () => {
  const common = {
    routing: auxiliaryRouting(),
    messages: auxiliaryMessages(),
    apiKeys: { ...keys, Anthropic: 'fixture-primary' },
  };
  boundary.probe.mockResolvedValue({
    text: '{"tasks":[{"title":"Fixture task","role":"frontend"}]}',
    usage: { promptTokens: 1, completionTokens: 1 },
  });
  await expect(createAgentPlan(common)).resolves.toMatchObject({ roleIds: ['frontend'] });
  await createSummary(common);
  await selectContext({
    ...common,
    files: { '/home/project/src/App.tsx': { type: 'file', content: 'export const fixture = true;', isBinary: false } },
    summary: '',
  });
  await decideTaskHardness({
    task: {
      chatMode: 'build',
      lastUserMessage: 'Build an entire full-stack app from scratch',
      contextFileCount: 0,
      planFirst: true,
    },
    lastUserMessage: 'Build an entire full-stack app from scratch',
    classifier: { provider: 'Anthropic', model: model('Anthropic') },
    apiKeys: common.apiKeys,
  });
  expect(boundary.probe).toHaveBeenCalledTimes(4);

  for (const [input] of boundary.probe.mock.calls) {
    expect(input.model.provider).toBe('Anthropic');
  }
  boundary.probe.mockClear();
  await createSummary({ messages: auxiliaryMessages(), apiKeys: keys });
  expect(boundary.probe).toHaveBeenCalledTimes(1);
  expect(boundary.probe.mock.calls[0][0].model.provider).toBe('OpenAI');
  expect(boundary.fetch).not.toHaveBeenCalled();
});
