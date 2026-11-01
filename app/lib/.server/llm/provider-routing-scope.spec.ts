import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => {
  const instance = vi.fn(() => ({ fixture: true }));

  const providers = ['Anthropic', 'OpenAI', 'Google'].map((name) => ({
    name,
    config: { apiTokenKey: `FIXTURE_${name}` },
    getModelInstance: instance,
    getProviderBaseUrlAndKey: ({ apiKeys, serverEnv, providerSettings }: any) => ({
      apiKey: apiKeys?.[name] || serverEnv?.[`FIXTURE_${name}`],
      baseUrl: providerSettings?.baseUrl || 'https://fixture.invalid',
    }),
  }));

  return { providers, instance, generate: vi.fn() };
});
vi.mock('ai', () => ({ generateText: fixture.generate }));
vi.mock('~/utils/constants', () => ({
  DEFAULT_PROVIDER: fixture.providers[0],
  DEFAULT_MODEL: 'fixture-model',
  PROVIDER_LIST: fixture.providers,
}));
vi.mock('~/lib/modules/llm/runtime-env', () => ({ readRuntimeEnv: () => undefined }));
vi.mock('~/lib/modules/llm/manager', () => ({
  LLMManager: {
    getInstance: () => ({
      env: {},
      getStaticModelListFromProvider: (provider: any) => [{ name: `fixture-${provider.name}` }],
    }),
  },
}));
vi.mock('~/utils/logger', () => ({ createScopedLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
import { resolveUsableProvider } from './provider-credentials';
import {
  ensureProviderProbed,
  resolveRuntimeProvider,
  resetProviderHealth,
  resetProviderProbeCache,
} from './provider-fallback';
beforeEach(() => {
  resetProviderHealth();
  resetProviderProbeCache();
  fixture.generate.mockReset();
  fixture.instance.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw Error('Network forbidden in fixture');
    }),
  );
});
it('preserves the requested provider when the card forbids fallback', () => {
  const keys = { OpenAI: 'fixture-only-not-a-credential' };

  const resolved = resolveUsableProvider({
    requestedProvider: 'Anthropic',
    requestedModel: 'requested-model',
    apiKeys: keys,
    serverEnv: {},
    chaine: [],
  });

  const choice = resolveRuntimeProvider({ ...resolved, apiKeys: keys, serverEnv: {}, chaine: [] });
  expect(choice.provider.name).toBe('Anthropic');
  expect(choice.model).toBe('requested-model');
  expect(choice.switchedFrom).toBeUndefined();
  expect(fixture.generate).not.toHaveBeenCalled();
});
it('selects only the card fallback and returns its provenance', () => {
  const keys = { OpenAI: 'fixture-A', Google: 'fixture-B' };

  const resolved = resolveUsableProvider({
    requestedProvider: 'Anthropic',
    requestedModel: 'requested-model',
    apiKeys: keys,
    serverEnv: {},
    chaine: [{ provider: 'Google', model: 'fixture-Google' }],
  });
  const choice = resolveRuntimeProvider({
    ...resolved,
    apiKeys: keys,
    serverEnv: {},
    chaine: [{ provider: 'Google', model: 'fixture-Google' }],
  });
  expect(choice.provider.name).toBe('Google');
  expect(resolved.switchedFrom?.provider).toBe('Anthropic');
});
it('does not let a failed BYOK A probe suppress or redirect BYOK B', async () => {
  fixture.generate.mockRejectedValueOnce(Object.assign(new Error('synthetic unauthorized'), { statusCode: 401 }));

  const provider = fixture.providers[0] as any;
  await ensureProviderProbed({
    provider,
    model: 'fixture-Anthropic',
    apiKeys: { Anthropic: 'fixture-A' },
    serverEnv: {},
  });
  fixture.generate.mockResolvedValueOnce({ text: 'fixture ok' });
  await ensureProviderProbed({
    provider,
    model: 'fixture-Anthropic',
    apiKeys: { Anthropic: 'fixture-B' },
    serverEnv: {},
  });
  expect(fixture.generate).toHaveBeenCalledTimes(2);

  const choice = resolveRuntimeProvider({
    provider,
    model: 'fixture-Anthropic',
    apiKeys: { Anthropic: 'fixture-B', OpenAI: 'fixture-C' },
    serverEnv: {},
  });
  expect(choice.provider.name).toBe('Anthropic');
  expect(choice.switchedFrom).toBeUndefined();
});
it('probes different credentials and models independently within TTL', async () => {
  fixture.generate.mockResolvedValue({ text: 'fixture ok' });

  const provider = fixture.providers[0] as any;
  await ensureProviderProbed({
    provider,
    model: 'fixture-model-A',
    apiKeys: { Anthropic: 'fixture-A' },
    serverEnv: {},
  });
  await ensureProviderProbed({
    provider,
    model: 'fixture-model-B',
    apiKeys: { Anthropic: 'fixture-B' },
    serverEnv: {},
  });
  expect(fixture.generate).toHaveBeenCalledTimes(2);
  expect(fixture.instance).toHaveBeenCalledTimes(2);
});

afterEach(() => vi.unstubAllGlobals());

it('shares a concurrent probe only within the same opaque scope and model', async () => {
  let release!: (value: { text: string }) => void;
  fixture.generate.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );

  const options = { provider: fixture.providers[0] as any, model: 'fixture', apiKeys: { Anthropic: 'fixture-A' } };
  const first = ensureProviderProbed(options);
  const second = ensureProviderProbed(options);
  expect(fixture.generate).toHaveBeenCalledTimes(1);
  release({ text: 'ok' });
  await Promise.all([first, second]);
  await ensureProviderProbed(options);
  expect(fixture.generate).toHaveBeenCalledTimes(1);
});

it('a reset during a pending probe does not repopulate health or probe caches', async () => {
  let reject!: (error: Error) => void;
  fixture.generate.mockImplementationOnce(
    () =>
      new Promise((_resolve, rejectPromise) => {
        reject = rejectPromise;
      }),
  );

  const options = { provider: fixture.providers[0] as any, model: 'fixture', apiKeys: { Anthropic: 'fixture-A' } };
  const pending = ensureProviderProbed(options);
  resetProviderHealth();
  resetProviderProbeCache();
  reject(Object.assign(new Error('synthetic unauthorized'), { statusCode: 401 }));
  await pending;
  fixture.generate.mockResolvedValueOnce({ text: 'ok' });
  await ensureProviderProbed(options);
  expect(fixture.generate).toHaveBeenCalledTimes(2);
  expect(resolveRuntimeProvider(options).switchedFrom).toBeUndefined();
});

it('does not cache an aborted probe as a successful five-minute verdict', async () => {
  fixture.generate
    .mockRejectedValueOnce(Object.assign(new Error('cancelled'), { name: 'AbortError' }))
    .mockResolvedValueOnce({ text: 'ok' });

  const options = { provider: fixture.providers[0] as any, model: 'fixture', apiKeys: { Anthropic: 'fixture-A' } };
  await ensureProviderProbed(options);
  await ensureProviderProbed(options);
  expect(fixture.generate).toHaveBeenCalledTimes(2);
});
