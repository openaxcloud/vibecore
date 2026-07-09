import { encryptJson } from '@vibecore/security';
import { afterEach, describe, expect, it } from 'vitest';

import {
  __setProviderKeyLoaderForTest,
  bearer,
  configured,
  hydrateProviderKeyOverrides,
  providerConfigs,
  withProviderKeyOverride,
  type ProviderKeyRow,
} from './gateway.js';

function openaiConfig() {
  const config = providerConfigs().find((c) => c.id === 'openai');

  if (!config) {
    throw new Error('openai config missing');
  }

  return config;
}

async function hydrateWith(rows: ProviderKeyRow[]) {
  __setProviderKeyLoaderForTest(async () => rows);
  await hydrateProviderKeyOverrides(true);
}

describe('gateway DB-first provider key resolution', () => {
  const prevKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    __setProviderKeyLoaderForTest(undefined);

    if (prevKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = prevKey;
    }
  });

  it('resolves the DB key over the env key', async () => {
    process.env.OPENAI_API_KEY = 'sk-env-key';
    await hydrateWith([{ provider: 'OpenAI', apiKeyEnc: encryptJson({ value: 'sk-db-key' }) }]);

    const config = withProviderKeyOverride(openaiConfig());
    expect(bearer(config)).toBe('sk-db-key');
    expect(configured(config)).toBe(true);
  });

  it('falls back to the env key when no DB row exists (zero regression)', async () => {
    process.env.OPENAI_API_KEY = 'sk-env-key';
    await hydrateWith([]);

    const config = withProviderKeyOverride(openaiConfig());
    expect(bearer(config)).toBe('sk-env-key');
    expect(configured(config)).toBe(true);
  });

  it('a DB key makes a provider configured even with no env key', async () => {
    delete process.env.OPENAI_API_KEY;
    await hydrateWith([{ provider: 'OpenAI', apiKeyEnc: encryptJson({ value: 'sk-db-only' }) }]);

    const config = withProviderKeyOverride(openaiConfig());
    expect(configured(config)).toBe(true);
    expect(bearer(config)).toBe('sk-db-only');
  });

  it('honors a DB baseUrl override', async () => {
    await hydrateWith([
      { provider: 'OpenAI', apiKeyEnc: encryptJson({ value: 'sk-db' }), baseUrl: 'https://proxy.example.com/v1' },
    ]);

    const config = withProviderKeyOverride(openaiConfig());
    expect(config.baseUrl).toBe('https://proxy.example.com/v1');
  });

  it('an undecryptable stored key leaves the env fallback in place', async () => {
    process.env.OPENAI_API_KEY = 'sk-env-key';
    await hydrateWith([{ provider: 'OpenAI', apiKeyEnc: 'not-a-valid-ciphertext' }]);

    const config = withProviderKeyOverride(openaiConfig());
    expect(bearer(config)).toBe('sk-env-key');
  });
});
