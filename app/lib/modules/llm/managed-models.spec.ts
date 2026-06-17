import { describe, expect, it } from 'vitest';

import { getPlatformKeyedProviderNames, isManagedModelsMode, trimToUsableProviders } from './managed-models';
import type { ModelInfo } from './types';
import type { ProviderInfo } from '~/types/model';

const provider = (name: string): ProviderInfo => ({ name, staticModels: [] }) as unknown as ProviderInfo;

const model = (name: string, providerName: string): ModelInfo =>
  ({ name, label: name, provider: providerName, maxTokenAllowed: 8000 }) as unknown as ModelInfo;

describe('isManagedModelsMode', () => {
  it('is on only when the runtime flag is exactly "true"', () => {
    expect(isManagedModelsMode({ VITE_BYOK_DISABLED: 'true' })).toBe(true);
    expect(isManagedModelsMode({ VITE_BYOK_DISABLED: 'false' })).toBe(false);
    expect(isManagedModelsMode({ VITE_BYOK_DISABLED: '1' })).toBe(false);
    expect(isManagedModelsMode({})).toBe(false);
  });
});

describe('getPlatformKeyedProviderNames', () => {
  const allProviders = [
    { name: 'Anthropic', config: { apiTokenKey: 'ANTHROPIC_API_KEY' } },
    { name: 'OpenAI', config: { apiTokenKey: 'OPENAI_API_KEY' } },
    { name: 'Groq', config: { apiTokenKey: 'GROQ_API_KEY' } },
    { name: 'Ollama', config: {} }, // local provider, no platform token
  ];

  it('keeps only providers whose platform key is present and non-empty', () => {
    const usable = getPlatformKeyedProviderNames(allProviders, {
      ANTHROPIC_API_KEY: 'sk-ant',
      OPENAI_API_KEY: 'sk-oai',
      GROQ_API_KEY: '   ', // whitespace-only → treated as unset
    });

    expect(usable.has('Anthropic')).toBe(true);
    expect(usable.has('OpenAI')).toBe(true);
    expect(usable.has('Groq')).toBe(false);
    expect(usable.has('Ollama')).toBe(false);
  });

  it('excludes everything when no platform keys are set', () => {
    /*
     * Explicit empty values (not omitted) so the per-key readRuntimeEnv fallback
     * — which is correct in prod where serverEnv is the pod env — doesn't read
     * the host shell's real provider keys during the test.
     */
    const noKeys = { ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GROQ_API_KEY: '' };
    expect(getPlatformKeyedProviderNames(allProviders, noKeys).size).toBe(0);
  });
});

describe('trimToUsableProviders', () => {
  const providers = [provider('Anthropic'), provider('OpenAI'), provider('Groq'), provider('Mistral')];

  const modelList = [
    model('claude-opus-4-8', 'Anthropic'),
    model('gpt-5.4', 'OpenAI'),
    model('llama-3', 'Groq'),
    model('mistral-large', 'Mistral'),
  ];

  it('drops providers and models that lack a platform key', () => {
    const usableProviderNames = new Set(['Anthropic', 'OpenAI']);

    const out = trimToUsableProviders({
      modelList,
      providers,
      defaultProvider: provider('Anthropic'),
      usableProviderNames,
    });

    expect(out.providers.map((p) => p.name)).toEqual(['Anthropic', 'OpenAI']);
    expect(out.modelList.map((m) => m.provider)).toEqual(['Anthropic', 'OpenAI']);
  });

  it('repoints the default provider when the legacy default is not usable', () => {
    const out = trimToUsableProviders({
      modelList,
      providers,
      defaultProvider: provider('Groq'), // not in the usable set
      usableProviderNames: new Set(['Anthropic', 'OpenAI']),
    });

    expect(out.defaultProvider.name).toBe('Anthropic');
  });

  it('keeps the default provider when it is still usable', () => {
    const out = trimToUsableProviders({
      modelList,
      providers,
      defaultProvider: provider('OpenAI'),
      usableProviderNames: new Set(['Anthropic', 'OpenAI']),
    });

    expect(out.defaultProvider.name).toBe('OpenAI');
  });

  it('falls back to the full list when nothing is usable (never strand the selector)', () => {
    const out = trimToUsableProviders({
      modelList,
      providers,
      defaultProvider: provider('Anthropic'),
      usableProviderNames: new Set<string>(),
    });

    expect(out.providers).toHaveLength(4);
    expect(out.modelList).toHaveLength(4);
  });
});
