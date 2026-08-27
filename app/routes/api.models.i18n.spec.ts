import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loader, toPublicModelSummaries } from './api.models';
import {
  getModelApiCopy,
  localizeModelInfo,
  localizeModelLabel,
  localizeProviderInfo,
  modelApiEn,
  modelApiFr,
} from '~/lib/i18n/catalogs/model-api';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';

const mocks = vi.hoisted(() => ({
  getInstance: vi.fn(),
  fetchAdminEnabledProviders: vi.fn(),
}));

vi.mock('~/lib/modules/llm/manager', () => ({
  LLMManager: { getInstance: mocks.getInstance },
}));

vi.mock('~/lib/modules/llm/provider-visibility.server', () => ({
  fetchAdminEnabledProviders: mocks.fetchAdminEnabledProviders,
}));

const dynamicModels: ModelInfo[] = [
  {
    name: 'vendor/orion',
    label: 'Orion - in:$1.20 out:$3.45 - context 128k',
    provider: 'OpenRouter',
    maxTokenAllowed: 128_000,
  },
  {
    name: 'vendor/beta',
    label: 'beta - context N/A [ by org-name]',
    provider: 'Groq',
    maxTokenAllowed: 8_192,
  },
  {
    name: 'vendor/gamma',
    label: 'gamma (Dynamic)',
    provider: 'Cerebras',
    maxTokenAllowed: 32_000,
  },
  {
    name: 'gemini-test',
    label: 'Gemini Test (1M context)',
    provider: 'Google',
    maxTokenAllowed: 1_048_576,
  },
  {
    name: 'qwen-coder',
    label: 'Qwen3-Coder (Best for Coding)',
    provider: 'Fireworks',
    maxTokenAllowed: 128_000,
  },
  {
    name: 'glm-benchmark',
    label: 'ZAI GLM (Coding: 73.8% SWE-bench)',
    provider: 'Cerebras',
    maxTokenAllowed: 128_000,
  },
];

const providers: ProviderInfo[] = [
  {
    name: 'OpenRouter',
    staticModels: [dynamicModels[0]],
  },
  {
    name: 'Ollama',
    staticModels: [dynamicModels[2]],
    labelForGetApiKey: 'Download Ollama',
  },
  {
    name: 'LMStudio',
    staticModels: [dynamicModels[3]],
    labelForGetApiKey: 'Get LMStudio',
  },
];

const manager = {
  getAllProviders: vi.fn(() => providers),
  getDefaultProvider: vi.fn(() => providers[0]),
  getProvider: vi.fn((name: string) => providers.find((provider) => provider.name === name)),
  getModelListFromProvider: vi.fn(async (provider: ProviderInfo) => provider.staticModels),
  updateModelList: vi.fn(async () => dynamicModels),
};

interface ModelsPayload {
  modelList: ModelInfo[];
  models: Array<{ id: string; name: string; provider: string; description: string }>;
  providers: ProviderInfo[];
  defaultProvider: ProviderInfo;
}

function loaderArgs(url: string, headers?: HeadersInit, provider?: string) {
  return {
    context: { cloudflare: { env: {} } },
    params: provider ? { provider } : {},
    request: new Request(url, { headers }),
  };
}

async function load(url: string, headers?: HeadersInit, provider?: string) {
  const response = await loader(loaderArgs(url, headers, provider));
  return { response, payload: (await response.json()) as ModelsPayload };
}

describe('model API i18n', () => {
  beforeEach(() => {
    mocks.getInstance.mockReturnValue(manager);
    mocks.fetchAdminEnabledProviders.mockResolvedValue(null);
    manager.getProvider.mockImplementation((name: string) => providers.find((provider) => provider.name === name));
    manager.getModelListFromProvider.mockImplementation(async (provider: ProviderInfo) => provider.staticModels);
    manager.updateModelList.mockResolvedValue(dynamicModels);
  });

  it('keeps complete EN/FR catalog parity and falls back to English', () => {
    expect(Object.keys(modelApiFr).sort()).toEqual(Object.keys(modelApiEn).sort());

    for (const key of Object.keys(modelApiEn) as Array<keyof typeof modelApiEn>) {
      expect(modelApiEn[key].trim().length, key).toBeGreaterThan(0);
      expect(modelApiFr[key].trim().length, key).toBeGreaterThan(0);
    }

    expect(getModelApiCopy('fr-CA')['modelApi.unknownProvider']).toBe('Fournisseur inconnu');
    expect(getModelApiCopy('es-ES')['modelApi.unknownProvider']).toBe('Unknown provider');
  });

  it('localizes E-Code-owned label framing without changing model ids, names, brands or owners', () => {
    expect(localizeModelLabel(dynamicModels[0].label, dynamicModels[0].maxTokenAllowed, 'fr')).toBe(
      'Orion — entrée : 1,20\u00A0$ · sortie : 3,45\u00A0$ — contexte : 128\u00A0k',
    );
    expect(localizeModelLabel(dynamicModels[1].label, dynamicModels[1].maxTokenAllowed, 'fr')).toBe(
      'beta — contexte : N/D [par org-name]',
    );
    expect(localizeModelLabel(dynamicModels[2].label, dynamicModels[2].maxTokenAllowed, 'fr')).toBe(
      'gamma (Dynamique)',
    );
    expect(localizeModelLabel(dynamicModels[3].label, dynamicModels[3].maxTokenAllowed, 'fr')).toBe(
      'Gemini Test (contexte : 1\u00A0M)',
    );
    expect(localizeModelLabel(dynamicModels[4].label, dynamicModels[4].maxTokenAllowed, 'fr')).toBe(
      'Qwen3-Coder (Idéal pour le code)',
    );
    expect(localizeModelLabel(dynamicModels[5].label, dynamicModels[5].maxTokenAllowed, 'fr')).toBe(
      'ZAI GLM (Code : 73,8 % SWE-bench)',
    );
    expect(localizeModelInfo(dynamicModels[0], 'en')).toEqual(dynamicModels[0]);
    expect(localizeModelInfo(dynamicModels[0], 'fr').name).toBe(dynamicModels[0].name);
    expect(localizeModelInfo(dynamicModels[0], 'fr').provider).toBe(dynamicModels[0].provider);
  });

  it('localizes provider actions and nested static models without mutating the shared registry', () => {
    const ollama = localizeProviderInfo(providers[1], 'fr');
    const lmStudio = localizeProviderInfo(providers[2], 'fr');

    expect(ollama.labelForGetApiKey).toBe('Télécharger Ollama');
    expect(ollama.staticModels[0].label).toBe('gamma (Dynamique)');
    expect(lmStudio.labelForGetApiKey).toBe('Obtenir LM Studio');
    expect(providers[1].labelForGetApiKey).toBe('Download Ollama');
    expect(providers[1].staticModels[0].label).toBe('gamma (Dynamic)');
  });

  it('serves a fully localized French payload with locale and private-cache headers', async () => {
    const { response, payload } = await load('https://app.e-code.ai/api/models', {
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Language')).toBe('fr');
    expect(response.headers.get('Vary')).toContain('Cookie');
    expect(response.headers.get('Vary')).toContain('Accept-Language');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Set-Cookie')).toContain('vibecore-auto-lang=fr');
    expect(payload.modelList[0]).toMatchObject({
      name: dynamicModels[0].name,
      provider: dynamicModels[0].provider,
      label: 'Orion — entrée : 1,20\u00A0$ · sortie : 3,45\u00A0$ — contexte : 128\u00A0k',
    });
    expect(payload.models[0]).toMatchObject({
      id: dynamicModels[0].name,
      provider: dynamicModels[0].provider,
      description: 'Orion — entrée : 1,20\u00A0$ · sortie : 3,45\u00A0$ — contexte : 128\u00A0k',
    });
    expect(payload.providers[1].labelForGetApiKey).toBe('Télécharger Ollama');
    expect(payload.providers[1].staticModels[0].label).toBe('gamma (Dynamique)');
    expect(payload.defaultProvider.staticModels[0].label).toContain('entrée');
  });

  it('keeps a manual English choice authoritative and preserves the original English labels', async () => {
    const { response, payload } = await load('https://app.e-code.ai/api/models', {
      Cookie: 'vibecore-lang=en; vibecore-auto-lang=fr',
      'Accept-Language': 'fr-FR',
    });

    expect(response.headers.get('Content-Language')).toBe('en');
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(payload.modelList).toEqual(dynamicModels);
    expect(payload.providers[1].labelForGetApiKey).toBe('Download Ollama');
  });

  it('localizes the provider-specific endpoint used when an API key changes', async () => {
    const { response, payload } = await load(
      'https://app.e-code.ai/api/models/OpenRouter',
      { Cookie: 'vibecore-lang=fr' },
      'OpenRouter',
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Language')).toBe('fr');
    expect(payload.modelList).toHaveLength(1);
    expect(payload.modelList[0]).toMatchObject({
      name: dynamicModels[0].name,
      provider: 'OpenRouter',
      label: 'Orion — entrée : 1,20\u00A0$ · sortie : 3,45\u00A0$ — contexte : 128\u00A0k',
    });
  });

  it('falls back to English for unsupported locales and persists the normalized query choice', async () => {
    const { response, payload } = await load('https://app.e-code.ai/api/models?lang=es');

    expect(response.headers.get('Content-Language')).toBe('en');
    expect(response.headers.get('Set-Cookie')).toContain('vibecore-lang=en');
    expect(payload.modelList[0].label).toBe(dynamicModels[0].label);
  });

  it('returns localized coded errors and never serializes provider diagnostics', async () => {
    const missing = await load(
      'https://app.e-code.ai/api/models/DoesNotExist',
      { Cookie: 'vibecore-lang=fr' },
      'DoesNotExist',
    );

    expect(missing.response.status).toBe(404);
    expect(missing.response.headers.get('Content-Language')).toBe('fr');
    expect(missing.payload).toEqual({
      code: 'MODEL_PROVIDER_NOT_FOUND',
      error: modelApiFr['modelApi.providerNotFound'],
    });

    manager.updateModelList.mockRejectedValueOnce(new Error('secret=provider-key ECONNRESET'));

    const failed = await load('https://app.e-code.ai/api/models', { Cookie: 'vibecore-lang=fr' });
    const serialized = JSON.stringify(failed.payload);

    expect(failed.response.status).toBe(503);
    expect(failed.response.headers.get('Content-Language')).toBe('fr');
    expect(failed.payload).toEqual({
      code: 'MODEL_CATALOG_UNAVAILABLE',
      error: modelApiFr['modelApi.catalogUnavailable'],
    });
    expect(serialized).not.toContain('provider-key');
    expect(serialized).not.toContain('ECONNRESET');
  });

  it('localizes the otherwise-unreachable public provider fallback', () => {
    const malformed = { ...dynamicModels[0], provider: '' };

    expect(toPublicModelSummaries([malformed], 'fr')[0].provider).toBe('Fournisseur inconnu');
    expect(toPublicModelSummaries([malformed], 'en')[0].provider).toBe('Unknown provider');
  });

  it('has zero direct hardcoded-copy findings in the route and agent-mode boundary', async () => {
    const { scanSource } = await import('../../scripts/i18n/source-scanner.mjs');

    const files = [
      ['app/routes/api.models.ts', new URL('./api.models.ts', import.meta.url)],
      ['app/lib/.server/llm/agent-mode.ts', new URL('../lib/.server/llm/agent-mode.ts', import.meta.url)],
    ] as const;

    for (const [file, url] of files) {
      const result = scanSource(readFileSync(url, 'utf8'), file);
      expect(result.parseErrors, file).toEqual([]);
      expect(result.findings, file).toEqual([]);
    }
  });
});
