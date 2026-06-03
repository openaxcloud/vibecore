import { describe, expect, it } from 'vitest';
import { isProviderUsable, pickFallbackProvider, resolveUsableProvider } from './provider-credentials';
import { DEFAULT_PROVIDER, PROVIDER_LIST } from '~/utils/constants';

const providerByName = (name: string) => {
  const provider = PROVIDER_LIST.find((p) => p.name === name);

  if (!provider) {
    throw new Error(`Provider ${name} not registered in this build`);
  }

  return provider;
};

describe('isProviderUsable', () => {
  it('treats a user-supplied API key as usable for any provider', () => {
    const bedrock = providerByName('AmazonBedrock');
    expect(isProviderUsable(bedrock, { AmazonBedrock: '{"region":"us-east-1"}' }, {})).toBe(true);
  });

  it('treats a provider as usable when its apiToken env var is present', () => {
    const anthropic = providerByName('Anthropic');
    expect(isProviderUsable(anthropic, {}, { ANTHROPIC_API_KEY: 'sk-ant-test-key' })).toBe(true);
  });

  it('treats a key-only provider as unusable when no credential is resolvable', () => {
    const bedrock = providerByName('AmazonBedrock');

    // AmazonBedrock requires AWS_BEDROCK_CONFIG and has no built-in base URL.
    expect(isProviderUsable(bedrock, {}, {})).toBe(false);
  });

  it('treats a key-less provider (Ollama) as usable only when a base URL is configured', () => {
    const ollama = providerByName('Ollama');

    // Ollama needs no API key, but does need a base URL to talk to.
    expect(isProviderUsable(ollama, {}, {})).toBe(false);
    expect(isProviderUsable(ollama, {}, { OLLAMA_API_BASE_URL: 'http://localhost:11434' })).toBe(true);
  });
});

describe('pickFallbackProvider', () => {
  it('prefers the default provider when it is credentialed', () => {
    const fallback = pickFallbackProvider({}, { ANTHROPIC_API_KEY: 'sk-ant-test-key' });
    expect(fallback?.name).toBe(DEFAULT_PROVIDER.name);
  });

  it('returns a usable provider when a user supplies a key for one', () => {
    const fallback = pickFallbackProvider({ OpenAI: 'sk-openai-test-key' }, {});
    expect(fallback).toBeDefined();
    expect(isProviderUsable(fallback!, { OpenAI: 'sk-openai-test-key' }, {})).toBe(true);
  });
});

describe('resolveUsableProvider', () => {
  it('keeps the requested provider/model when it is credentialed', () => {
    const result = resolveUsableProvider({
      requestedProvider: 'Anthropic',
      requestedModel: 'claude-sonnet-4-5-20250929',
      apiKeys: {},
      serverEnv: { ANTHROPIC_API_KEY: 'sk-ant-test-key' },
    });

    expect(result.provider.name).toBe('Anthropic');
    expect(result.model).toBe('claude-sonnet-4-5-20250929');
  });

  it('falls back to a credentialed provider and a valid model when the requested provider is unusable', () => {
    const result = resolveUsableProvider({
      requestedProvider: 'AmazonBedrock',
      requestedModel: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      apiKeys: {},
      serverEnv: { ANTHROPIC_API_KEY: 'sk-ant-test-key' },
    });

    // No AWS creds -> must not stay on AmazonBedrock.
    expect(result.provider.name).not.toBe('AmazonBedrock');
    expect(result.provider.name).toBe(DEFAULT_PROVIDER.name);

    // The returned model must be one the fallback provider actually serves.
    const fallbackModels = result.provider.staticModels.map((m) => m.name);
    expect(fallbackModels).toContain(result.model);
  });
});
