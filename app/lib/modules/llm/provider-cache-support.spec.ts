import { describe, expect, it } from 'vitest';

import { PROVIDER_CACHE_SUPPORT, providerCacheSupport } from './provider-cache-support';

// Our catalog (app/lib/modules/llm/providers/* + KNOWN_LLM_PROVIDERS in services/api).
const CATALOG = [
  'OpenAI',
  'Anthropic',
  'xAI',
  'OpenRouter',
  'Google',
  'Deepseek',
  'Github',
  'AmazonBedrock',
  'Cerebras',
  'Cohere',
  'Fireworks',
  'Groq',
  'HuggingFace',
  'Hyperbolic',
  'LMStudio',
  'Mistral',
  'Moonshot',
  'Ollama',
  'OpenAILike',
  'Perplexity',
  'Together',
  'Z.ai',
];

describe('PROVIDER_CACHE_SUPPORT registry', () => {
  it('has an entry for EVERY provider in the catalog (nothing silently missing)', () => {
    for (const provider of CATALOG) {
      expect(PROVIDER_CACHE_SUPPORT[provider], `missing cache-support entry for ${provider}`).toBeDefined();
      expect(PROVIDER_CACHE_SUPPORT[provider].provider).toBe(provider);
    }
  });

  it('drives OpenAI / Anthropic / xAI natively (impl-explicit)', () => {
    expect(PROVIDER_CACHE_SUPPORT.OpenAI.mechanism).toBe('impl-explicit');
    expect(PROVIDER_CACHE_SUPPORT.Anthropic.mechanism).toBe('impl-explicit');
    expect(PROVIDER_CACHE_SUPPORT.xAI.mechanism).toBe('impl-explicit');
  });

  it('treats Gemini / DeepSeek / OpenRouter as provider-auto', () => {
    expect(PROVIDER_CACHE_SUPPORT.Google.mechanism).toBe('provider-auto');
    expect(PROVIDER_CACHE_SUPPORT.Deepseek.mechanism).toBe('provider-auto');
    expect(PROVIDER_CACHE_SUPPORT.OpenRouter.mechanism).toBe('provider-auto');
  });

  it('encodes per-model minimums (Anthropic Haiku 2048 vs Sonnet 1024; Gemini Pro 4096 vs Flash 2048)', () => {
    const anthropic = PROVIDER_CACHE_SUPPORT.Anthropic;
    expect(anthropic.minCacheTokens('claude-haiku-4-5-20251001')).toBe(2048);
    expect(anthropic.minCacheTokens('claude-sonnet-4-5-20250929')).toBe(1024);

    const google = PROVIDER_CACHE_SUPPORT.Google;
    expect(google.minCacheTokens('gemini-2.5-pro')).toBe(4096);
    expect(google.minCacheTokens('gemini-2.5-flash')).toBe(2048);
  });

  it('marks no-contract providers SUPPORT-ONLY with no threshold', () => {
    for (const p of ['Mistral', 'Cohere', 'Perplexity', 'Cerebras', 'Fireworks', 'Moonshot', 'Z.ai']) {
      expect(PROVIDER_CACHE_SUPPORT[p].mechanism).toBe('support-only');
      expect(PROVIDER_CACHE_SUPPORT[p].minCacheTokens(undefined)).toBeNull();
    }
  });

  it('maps a telemetry field for OpenAI-compatible providers that can return cached_tokens', () => {
    for (const p of ['Groq', 'Together', 'OpenAILike']) {
      expect(PROVIDER_CACHE_SUPPORT[p].telemetryField).toBe('cached_tokens');
    }
  });

  it('falls back to support-only for an unknown provider', () => {
    expect(providerCacheSupport('SomethingNew').mechanism).toBe('support-only');
    expect(providerCacheSupport(undefined).mechanism).toBe('support-only');
  });
});
