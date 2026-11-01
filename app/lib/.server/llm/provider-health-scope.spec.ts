import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isProviderUsable } from './provider-credentials';
import { getProviderHealth, markProviderUnhealthy, resetProviderHealth } from './provider-fallback';
import { createProviderHealthScope } from './provider-health-scope';
import { LLMManager } from '~/lib/modules/llm/manager';
import { PROVIDER_LIST } from '~/utils/constants';

const environment = vi.hoisted(() => ({ values: {} as Record<string, string> }));
vi.mock('~/lib/modules/llm/runtime-env', () => ({ readRuntimeEnv: (key: string) => environment.values[key] }));

const provider = PROVIDER_LIST.find((p) => p.name === 'OpenAI')!;
beforeEach(() => {
  environment.values = {};
  resetProviderHealth();
  vi.spyOn(LLMManager, 'getInstance').mockReturnValue({ env: { OPENAI_API_KEY: 'fixture-manager' } } as never);
});
afterEach(() => vi.restoreAllMocks());

it('uses real resolver precedence, normalized credentials and opaque identifiers', () => {
  const scope = createProviderHealthScope({
    provider,
    apiKeys: { OpenAI: ' fixture - byok ' },
    serverEnv: { OPENAI_API_KEY: 'fixture-server' },
  });
  expect(scope).toEqual(createProviderHealthScope({ provider, apiKeys: { OpenAI: 'fixture-byok' } }));
  expect(scope.id).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(scope)).not.toContain('fixture');

  const managed = createProviderHealthScope({ provider, serverEnv: { OPENAI_API_KEY: 'fixture-server' } });
  expect(scope.id).not.toBe(managed.id);
  environment.values.OPENAI_API_KEY = 'fixture-runtime';
  expect(createProviderHealthScope({ provider, serverEnv: { OPENAI_API_KEY: 'fixture-server' } })).toEqual(managed);
  expect(createProviderHealthScope({ provider }).id).not.toBe(managed.id);
});

it('honors the real custom-base-URL managed-key guard and separates endpoint scopes', () => {
  const settings = { OpenAI: { baseUrl: 'https://user-fixture.invalid/v1' } } as any;
  expect(isProviderUsable(provider, {}, { OPENAI_API_KEY: 'fixture-managed' }, settings)).toBe(false);

  const unavailable = createProviderHealthScope({
    provider,
    serverEnv: { OPENAI_API_KEY: 'fixture-A' },
    providerSettings: settings,
  });
  expect(unavailable).toEqual(
    createProviderHealthScope({ provider, serverEnv: { OPENAI_API_KEY: 'fixture-B' }, providerSettings: settings }),
  );

  const byok = createProviderHealthScope({ provider, apiKeys: { OpenAI: 'fixture-user' }, providerSettings: settings });
  expect(byok.id).not.toBe(createProviderHealthScope({ provider, apiKeys: { OpenAI: 'fixture-user' } }).id);
});

it('retains only a bounded scope verdict and never an error body containing a fixture credential', () => {
  const first = createProviderHealthScope({ provider, apiKeys: { OpenAI: 'fixture-0' } });
  markProviderUnhealthy(first, 'auth', 'private-body fixture-0');
  expect(getProviderHealth(first)?.detail).toBe('auth');

  for (let i = 1; i <= 512; i++) {
    markProviderUnhealthy(
      createProviderHealthScope({ provider, apiKeys: { OpenAI: `fixture-${i}` } }),
      'auth',
      'private-body',
    );
  }
  expect(getProviderHealth(first)).toBeUndefined();
  expect(getProviderHealth(createProviderHealthScope({ provider, apiKeys: { OpenAI: 'fixture-512' } }))?.kind).toBe(
    'auth',
  );
});
