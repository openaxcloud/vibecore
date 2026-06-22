import { afterEach, describe, expect, it } from 'vitest';
import { headers, type ProviderConfig } from './gateway.js';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  Object.assign(process.env, ORIGINAL_ENV);
});

function config(overrides: Partial<ProviderConfig> & Pick<ProviderConfig, 'id' | 'kind'>): ProviderConfig {
  return {
    baseUrl: 'https://example.test',
    defaultModel: 'model',
    ...overrides,
  };
}

describe('headers()', () => {
  it('sets a Bearer Authorization header for openai-compatible providers', () => {
    process.env.OPENAI_API_KEY = 'openai-secret';

    const result = headers(config({ id: 'openai', kind: 'openai-compatible', apiKeyEnv: 'OPENAI_API_KEY' }));

    expect(result.authorization).toBe('Bearer openai-secret');
    expect(result['x-api-key']).toBeUndefined();
  });

  it('does NOT leak the Gemini key into an Authorization header (key travels in the query string)', () => {
    process.env.GOOGLE_GEMINI_API_KEY = 'gemini-secret';

    const result = headers(config({ id: 'google-gemini', kind: 'gemini', apiKeyEnv: 'GOOGLE_GEMINI_API_KEY' }));

    // The Gemini path authenticates via ?key=<API_KEY>; no second header should carry the key.
    expect(result.authorization).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('gemini-secret');
  });

  it('uses x-api-key (not Authorization) for anthropic', () => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-secret';

    const result = headers(config({ id: 'anthropic', kind: 'anthropic', apiKeyEnv: 'ANTHROPIC_API_KEY' }));

    expect(result.authorization).toBeUndefined();
    expect(result['x-api-key']).toBe('anthropic-secret');
    expect(result['anthropic-version']).toBe('2023-06-01');
  });

  it('omits the Authorization header for ollama when no key is configured', () => {
    const result = headers(config({ id: 'ollama', kind: 'ollama' }));

    expect(result.authorization).toBeUndefined();
    expect(result['x-api-key']).toBeUndefined();
    expect(result['content-type']).toBe('application/json');
  });
});
