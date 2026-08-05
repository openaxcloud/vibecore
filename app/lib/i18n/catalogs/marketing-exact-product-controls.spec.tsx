import { readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import {
  formatExactBuildDuration,
  formatExactControlCount,
  formatExactRequestFailure,
  getMarketingExactProductControlsCopy,
  marketingExactProductControlsEn,
  marketingExactProductControlsFr,
} from './marketing-exact-product-controls';

import {
  ecodeProductMarketingPages,
  getEcodeExactProductMarketingPages,
  makeEcodeCampaignMeta,
  makeEcodeProductMeta,
} from '~/components/marketing/EcodeExactProductMarketingPages';
import {
  AIModelSelector,
  apiRequest,
  BuildModeSelector,
} from '~/components/marketing/ecode-exact/EcodeExactLandingControls';
import { createI18nInstance } from '~/lib/i18n/runtime';
import { loader as rootLoader } from '~/root';
import { meta as aiAgentMeta } from '~/routes/ai-agent';
import { meta as bountiesMeta } from '~/routes/bounties';

function leafPaths(value: unknown, path: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leafPaths(item, [...path, String(index)]));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => leafPaths(item, [...path, key]));
  }

  return [path.join('.')];
}

function stringPairs(
  english: unknown,
  french: unknown,
  path: string[] = [],
): { path: string; english: string; french: string }[] {
  if (Array.isArray(english) && Array.isArray(french)) {
    return english.flatMap((item, index) => stringPairs(item, french[index], [...path, String(index)]));
  }

  if (english && french && typeof english === 'object' && typeof french === 'object') {
    return Object.entries(english).flatMap(([key, item]) =>
      stringPairs(item, (french as Record<string, unknown>)[key], [...path, key]),
    );
  }

  return typeof english === 'string' && typeof french === 'string' ? [{ path: path.join('.'), english, french }] : [];
}

function renderWithLanguage(node: ReactNode, language: 'en' | 'fr') {
  return renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(language)}>{node}</I18nextProvider>);
}

function dataOf<T>(result: unknown): T {
  return result && typeof result === 'object' && 'data' in result ? (result as { data: T }).data : (result as T);
}

describe('exact product registry and landing control catalogs', () => {
  it('keeps complete EN/FR structural parity', () => {
    expect(leafPaths(marketingExactProductControlsFr)).toEqual(leafPaths(marketingExactProductControlsEn));
  });

  it('provides French for every substantive platform string while preserving accepted technical terms', () => {
    const stablePaths = new Set([
      'exactProductRegistry.pages.ide.label',
      'exactLandingControls.modelSelector.automatic',
      'exactLandingControls.modelSelector.streaming',
      ...stringPairs(marketingExactProductControlsEn, marketingExactProductControlsFr)
        .filter((pair) => pair.path.endsWith('.id'))
        .map((pair) => pair.path),
    ]);

    for (const pair of stringPairs(marketingExactProductControlsEn, marketingExactProductControlsFr)) {
      if (!stablePaths.has(pair.path)) {
        expect(pair.french, pair.path).not.toBe(pair.english);
      }
    }

    const french = JSON.stringify(marketingExactProductControlsFr);

    for (const term of ['E-Code', 'IDE', 'Git', 'MVP', 'prompt']) {
      expect(french).toContain(term);
    }

    expect(french).toContain('Développement d’applications complètes');
    expect(french).toContain('Diffusion en continu');
    expect(french).toContain('Service applicatif et interface utilisateur');
    expect(french).not.toMatch(/\b(?:full-stack|backend|frontend)\b/iu);
  });

  it('falls back to English for unsupported locales', () => {
    const fallback = getMarketingExactProductControlsCopy('de-DE');

    expect(fallback.exactProductRegistry.pages.bounties.title).toBe('Bounties');
    expect(fallback.exactLandingControls.buildMode.title).toBe('How would you like to continue?');
  });

  it('localizes the complete product registry without translating stable routes', () => {
    const french = getEcodeExactProductMarketingPages('fr');

    expect(french['ai-agent'].title).toBe('Agent IA v2');
    expect(french.multiplayer.label).toBe('Collaboration en temps réel');
    expect(french.deployments.label).toBe('Déploiements');
    expect(french.pricing.label).toBe('Tarifs');
    expect(french.bounties.label).toBe('Primes');
    expect(french['ai-agent'].route).toBe('/ai-agent');
    expect(french.multiplayer.route).toBe('/features#multiplayer');
    expect(french.bounties.route).toBe('/marketing/bounties');
    expect(ecodeProductMarketingPages['ai-agent'].title).toBe('AI Agent v2');
  });

  it('uses Intl for localized plurals, duration units and HTTP status values', () => {
    const english = marketingExactProductControlsEn.exactLandingControls;
    const french = marketingExactProductControlsFr.exactLandingControls;

    expect(formatExactControlCount(1, french.modelSelector.availableDescription, 'fr')).toContain('1 disponible');
    expect(formatExactControlCount(2, french.buildMode.featureCount, 'fr')).toBe('2 fonctionnalités');
    expect(formatExactControlCount(1_200, english.buildMode.featureCount, 'en')).toBe('1,200 features');
    expect(formatExactBuildDuration(3, french.buildMode.duration, 'fr')).toBe('Environ 3 minutes');
    expect(formatExactBuildDuration(1, english.buildMode.duration, 'en')).toBe('About 1 minute');
    expect(formatExactRequestFailure(french.errors.requestFailed, 503, 'fr')).toBe('La requête a échoué (HTTP 503).');
  });

  it('renders every initial model selector state in French', () => {
    const compact = renderWithLanguage(<AIModelSelector variant="compactLine" />, 'fr');
    const card = renderWithLanguage(<AIModelSelector variant="card" />, 'fr');

    expect(compact).toContain('Modèle :');
    expect(compact).toContain('Modèle d’IA');
    expect(compact).toContain('Auto');
    expect(card).toContain('Choix du modèle d’IA');
    expect(card).toContain('Chargement des modèles d’IA disponibles');
    expect(card).toContain('Chargement des modèles d’IA…');
    expect(card).not.toContain('AI model selection');
    expect(card).not.toContain('Loading available AI models');
  });

  it('renders all build modes, durations and dynamic counts in French without translating user content', () => {
    const markup = renderWithLanguage(
      <BuildModeSelector
        open
        onOpenChange={() => undefined}
        onSelectMode={() => undefined}
        featureList={['auth']}
        projectName="Atlas API"
      />,
      'fr',
    );

    expect(markup).toContain('Atlas API');
    expect(markup).toContain('Comment souhaitez-vous continuer ?');
    expect(markup).toContain('1 fonctionnalité');
    expect(markup).toContain('Visuel en premier');
    expect(markup).toContain('Recommandé');
    expect(markup).toContain('Environ 3 minutes');
    expect(markup).toContain('Environ 10 minutes');
    expect(markup).toContain('Développement d’applications complètes');
    expect(markup).not.toContain('Start with a design');
    expect(markup).not.toContain('Continue refining the prompt');
  });

  it('returns a localized safe API error instead of exposing an English server error in French', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'English server detail' }), {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    try {
      await expect(apiRequest('POST', '/api/example', { enabled: true }, 'fr')).rejects.toThrow(
        'La requête a échoué (HTTP 503).',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    [
      makeEcodeProductMeta('ai-agent'),
      aiAgentMeta,
      marketingExactProductControlsFr.exactProductRegistry.pages['ai-agent'],
    ],
    [
      makeEcodeCampaignMeta('bounties'),
      bountiesMeta,
      marketingExactProductControlsFr.exactProductRegistry.pages.bounties,
    ],
  ])('serves localized SEO metadata through the helper and direct route', (helperMeta, routeMeta, page) => {
    const args = { matches: [{ id: 'root', data: { language: 'fr' } }] } as never;

    for (const meta of [helperMeta, routeMeta]) {
      const tags = meta(args);
      const title = `${page.title} - E-Code`;

      expect(tags).toEqual(expect.arrayContaining([{ title }]));
      expect(tags).toEqual(expect.arrayContaining([{ name: 'description', content: page.description }]));
      expect(tags).toEqual(expect.arrayContaining([{ property: 'og:title', content: title }]));
      expect(tags).toEqual(expect.arrayContaining([{ property: 'og:image:alt', content: page.imageAlt }]));
      expect(tags).toEqual(expect.arrayContaining([{ name: 'twitter:title', content: title }]));
      expect(tags).toEqual(expect.arrayContaining([{ name: 'twitter:description', content: page.description }]));
      expect(tags).toEqual(expect.arrayContaining([{ name: 'twitter:image:alt', content: page.imageAlt }]));
    }
  });

  it.each(['/ai-agent', '/bounties'])('inherits canonical and en/fr alternates for %s', (path) => {
    const result = rootLoader({
      request: new Request(`https://e-code.ai${path}?lang=fr`),
      params: {},
      context: {},
    });

    const data = dataOf<{ seo: { canonical: string; english: string; french: string } }>(result);

    expect(data.seo).toEqual({
      canonical: `https://e-code.ai${path}`,
      english: `https://e-code.ai${path}`,
      french: `https://e-code.ai${path}?lang=fr`,
    });
  });

  it('keeps long French controls responsive, accessible and theme-safe', () => {
    const source = readFileSync(
      new URL('../../../components/marketing/ecode-exact/EcodeExactLandingControls.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('max-h-[calc(100dvh-2rem)]');
    expect(source).toContain('overflow-y-auto');
    expect(source).toContain('break-words');
    expect(source).toContain('min-w-0');
    expect(source).toContain('whitespace-normal');
    expect(source).toContain('w-full');
    expect(source).toContain('sm:w-auto');
    expect(source).toContain('bg-background');
    expect(source).toContain('text-muted-foreground');
    expect(source).toContain('focus-visible:ring-2');
    expect(source).toContain('aria-labelledby="build-mode-selector-title"');
    expect(source).toContain('disabled:cursor-wait');
  });

  it('leaves no hard-coded visible copy in the components or their direct routes', async () => {
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');

    const files = [
      '../../../components/marketing/EcodeExactProductMarketingPages.tsx',
      '../../../components/marketing/ecode-exact/EcodeExactLandingControls.tsx',
      '../../../routes/ai-agent.tsx',
      '../../../routes/bounties.tsx',
    ];

    for (const relativePath of files) {
      const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      const result = scanSource(source, relativePath);

      expect(result.parseErrors, relativePath).toEqual([]);
      expect(result.findings, relativePath).toEqual([]);
    }
  });
});
