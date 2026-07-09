import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetManagedProviderKeysCacheForTest, applyManagedProviderKeys } from './managed-provider-keys';
import OpenAIProvider from '~/lib/modules/llm/providers/openai';
import { PROVIDER_LIST } from '~/utils/constants';

const providerEnvKeys = Array.from(
  new Set(
    PROVIDER_LIST.flatMap((provider) => [provider.config.apiTokenKey, provider.config.baseUrlKey]).filter(
      (key): key is string => Boolean(key),
    ),
  ),
);

function mockCredentialsResponse(providers: Array<{ provider: string; apiKey: string; baseUrl?: string | null }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ providers }), { status: 200 })),
  );
}

beforeEach(() => {
  __resetManagedProviderKeysCacheForTest();

  for (const key of providerEnvKeys) {
    vi.stubEnv(key, '');
  }

  // The helper only calls the API when an internal secret is present.
  vi.stubEnv('INTERNAL_API_SHARED_SECRET', 'test-internal-secret');
  vi.stubEnv('SAAS_API_URL', 'http://api.test');
});

afterEach(() => {
  __resetManagedProviderKeysCacheForTest();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('applyManagedProviderKeys overlay', () => {
  it('returns serverEnv unchanged when no internal secret is configured (env fallback)', async () => {
    vi.stubEnv('INTERNAL_API_SHARED_SECRET', '');
    vi.stubEnv('WORKSPACE_MANAGER_SHARED_SECRET', '');

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const base = { OPENAI_API_KEY: 'sk-env' };
    const result = await applyManagedProviderKeys(base);

    expect(result).toEqual(base);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('overlays a DB key onto the provider apiTokenKey', async () => {
    mockCredentialsResponse([{ provider: 'OpenAI', apiKey: 'sk-db', baseUrl: null }]);

    const result = await applyManagedProviderKeys({ OPENAI_API_KEY: 'sk-env' });

    expect(result?.OPENAI_API_KEY).toBe('sk-db');
  });

  it('overlays a DB baseUrl onto the provider baseUrlKey when present', async () => {
    mockCredentialsResponse([{ provider: 'OpenAILike', apiKey: 'sk-db', baseUrl: 'https://proxy.test/v1' }]);

    const result = await applyManagedProviderKeys({});

    expect(result?.OPENAI_LIKE_API_KEY).toBe('sk-db');
    expect(result?.OPENAI_LIKE_API_BASE_URL).toBe('https://proxy.test/v1');
  });
});

/*
 * Precedence the overlay is meant to produce end-to-end, verified through the
 * real resolver base-provider.getProviderBaseUrlAndKey: a user BYOK cookie wins
 * over the DB-injected serverEnv key, which in turn wins over the env value.
 */
describe('managed key precedence (cookie > DB > env) via base-provider', () => {
  it('a user BYOK cookie wins over the DB-injected serverEnv key', async () => {
    mockCredentialsResponse([{ provider: 'OpenAI', apiKey: 'sk-db', baseUrl: null }]);

    const serverEnv = (await applyManagedProviderKeys({ OPENAI_API_KEY: 'sk-env' })) as Record<string, string>;

    const provider = new OpenAIProvider();

    const { apiKey } = provider.getProviderBaseUrlAndKey({
      apiKeys: { OpenAI: 'sk-cookie' },
      serverEnv,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'OPENAI_API_KEY',
    });

    expect(apiKey).toBe('sk-cookie');
  });

  it('the DB-injected key wins over the env value when there is no cookie', async () => {
    mockCredentialsResponse([{ provider: 'OpenAI', apiKey: 'sk-db', baseUrl: null }]);

    const serverEnv = (await applyManagedProviderKeys({ OPENAI_API_KEY: 'sk-env' })) as Record<string, string>;

    const provider = new OpenAIProvider();

    const { apiKey } = provider.getProviderBaseUrlAndKey({
      serverEnv,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'OPENAI_API_KEY',
    });

    expect(apiKey).toBe('sk-db');
  });

  it('falls back to the env value when no DB key exists', async () => {
    mockCredentialsResponse([]);

    const serverEnv = (await applyManagedProviderKeys({ OPENAI_API_KEY: 'sk-env' })) as Record<string, string>;

    const provider = new OpenAIProvider();

    const { apiKey } = provider.getProviderBaseUrlAndKey({
      serverEnv,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'OPENAI_API_KEY',
    });

    expect(apiKey).toBe('sk-env');
  });
});
