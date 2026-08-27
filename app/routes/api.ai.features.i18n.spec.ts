import { readFileSync } from 'node:fs';

import type { LoaderFunctionArgs } from 'react-router';
import { describe, expect, it } from 'vitest';

import { loader } from './api.ai.features';
import { apiAiFeaturesEn, apiAiFeaturesFr, getApiAiFeaturesCopy } from '~/lib/i18n/catalogs/api-ai-features';
import { toResponse } from '~/lib/test/rr7-data';

interface AiFeaturesPayload {
  features: Record<string, { title: string; description: string; icon: string; details: string[] }>;
  useCases: Array<{ title: string; description: string; icon: string; example: string }>;
  aiTools: Array<{ name: string; description: string; icon: string }>;
  providers: Array<{ name: string; models: string[]; available: boolean }>;
}

function loaderArgs(url: string, headers?: HeadersInit): LoaderFunctionArgs {
  return {
    context: {},
    params: {},
    request: new Request(url, { headers }),
  };
}

async function load(url: string, headers?: HeadersInit): Promise<{ response: Response; payload: AiFeaturesPayload }> {
  const response = toResponse(await loader(loaderArgs(url, headers))) as Response;
  const payload = (await response.json()) as AiFeaturesPayload;

  return { response, payload };
}

function prose(payload: AiFeaturesPayload): string[] {
  return [
    ...Object.values(payload.features).flatMap((feature) => [feature.title, feature.description, ...feature.details]),
    ...payload.useCases.flatMap((useCase) => [useCase.title, useCase.description, useCase.example]),
    ...payload.aiTools.flatMap((tool) => [tool.name, tool.description]),
  ];
}

describe('api.ai.features i18n', () => {
  it('keeps strict catalog parity and falls back to English', () => {
    expect(Object.keys(apiAiFeaturesFr).sort()).toEqual(Object.keys(apiAiFeaturesEn).sort());

    for (const key of Object.keys(apiAiFeaturesEn) as Array<keyof typeof apiAiFeaturesEn>) {
      expect(apiAiFeaturesEn[key].trim().length, key).toBeGreaterThan(0);
      expect(apiAiFeaturesFr[key].trim().length, key).toBeGreaterThan(0);
    }

    expect(getApiAiFeaturesCopy('fr-CA')['apiAiFeatures.features.autonomous.title']).toBe('Agent autonome');
    expect(getApiAiFeaturesCopy('es-ES')['apiAiFeatures.features.autonomous.title']).toBe('Autonomous Agent');
  });

  it('localizes every prose field in French while preserving technical provider data', async () => {
    const french = await load('https://app.e-code.ai/api/ai/features', {
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
    });
    const english = await load('https://app.e-code.ai/api/ai/features', {
      Cookie: 'vibecore-lang=en',
      'Accept-Language': 'fr-FR',
    });

    const frenchProse = prose(french.payload);
    const englishProse = prose(english.payload);

    expect(frenchProse).toHaveLength(48);
    expect(englishProse).toHaveLength(frenchProse.length);

    for (const [index, value] of frenchProse.entries()) {
      expect(value, `prose field ${index}`).not.toBe(englishProse[index]);
    }

    expect(french.payload.features.autonomous.title).toBe('Agent autonome');
    expect(french.payload.features.multilingual.details).toContain(
      'Coloration syntaxique et IntelliSense en temps réel',
    );
    expect(french.payload.useCases[1]?.example).toContain('authentification JWT');
    expect(french.payload.aiTools[5]?.name).toBe('Points de contrôle et retour arrière');
    expect(french.payload.providers).toEqual(english.payload.providers);
    expect(french.response.headers.get('Content-Language')).toBe('fr');
    expect(french.response.headers.get('Cache-Control')).toBe('no-store');
    expect(french.response.headers.get('Vary')).toContain('Accept-Language');
    expect(french.response.headers.get('Set-Cookie')).toContain('vibecore-auto-lang=fr');
  });

  it('keeps manual English authoritative and serves English for unsupported locales', async () => {
    const manualEnglish = await load('https://app.e-code.ai/api/ai/features', {
      Cookie: 'vibecore-lang=en; vibecore-auto-lang=fr',
      'Accept-Language': 'fr-FR',
    });

    const unsupported = await load('https://app.e-code.ai/api/ai/features?lang=es');

    expect(manualEnglish.payload.features.autonomous.title).toBe('Autonomous Agent');
    expect(manualEnglish.response.headers.get('Content-Language')).toBe('en');
    expect(unsupported.payload.features.autonomous.title).toBe('Autonomous Agent');
    expect(unsupported.response.headers.get('Content-Language')).toBe('en');
    expect(unsupported.response.headers.get('Set-Cookie')).toContain('vibecore-lang=en');
  });

  it('has zero hardcoded-copy scanner findings', async () => {
    const file = 'app/routes/api.ai.features.ts';
    const source = readFileSync(new URL('./api.ai.features.ts', import.meta.url), 'utf8');
    const { scanSource } = await import('../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, file);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
  });
});
