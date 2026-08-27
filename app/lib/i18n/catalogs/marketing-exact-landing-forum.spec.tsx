import { readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  formatForumCount,
  formatForumStat,
  formatLandingDemoLabel,
  getMarketingExactLandingForumCopy,
  marketingExactLandingForumEn,
  marketingExactLandingForumFr,
} from './marketing-exact-landing-forum';

import Forum from '~/components/marketing/ecode-exact/pages/Forum';
import LandingOptimized from '~/components/marketing/ecode-exact/pages/LandingOptimized';
import { createI18nInstance } from '~/lib/i18n/runtime';
import { loader as rootLoader } from '~/root';
import { loader as landingLoader, meta as landingMeta } from '~/routes/_index';
import { loader as forumLoader, meta as forumMeta } from '~/routes/forum';

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

function dataOf<T>(result: unknown): T {
  return result && typeof result === 'object' && 'data' in result ? (result as { data: T }).data : (result as T);
}

function renderInFrench(node: ReactNode, path = '/') {
  const router = createMemoryRouter([{ path: '*', element: node }], { initialEntries: [path] });
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  try {
    return renderToStaticMarkup(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <RouterProvider router={router} />
      </I18nextProvider>,
    );
  } finally {
    consoleError.mockRestore();
  }
}

describe('exact landing and forum marketing catalogs', () => {
  it('keeps complete EN/FR structural parity', () => {
    expect(leafPaths(marketingExactLandingForumFr)).toEqual(leafPaths(marketingExactLandingForumEn));
  });

  it('provides professional French for every platform-owned substantive string', () => {
    const intentionallyStable = new Set([
      'exactForum.stats.items.2.label',
      ...stringPairs(marketingExactLandingForumEn, marketingExactLandingForumFr)
        .filter((pair) => pair.path.endsWith('.id'))
        .map((pair) => pair.path),
    ]);

    for (const pair of stringPairs(marketingExactLandingForumEn, marketingExactLandingForumFr)) {
      if (!intentionallyStable.has(pair.path)) {
        expect(pair.french, pair.path).not.toBe(pair.english);
      }
    }
  });

  it('falls back to English for unsupported locales', () => {
    const fallback = getMarketingExactLandingForumCopy('de-DE');

    expect(fallback.exactLanding.hero.buildNow).toBe('Build now');
    expect(fallback.exactForum.hero.title).toBe('Join the E-Code community');
  });

  it('formats duration, plurals and metrics with locale-aware Intl rules', () => {
    const english = marketingExactLandingForumEn;
    const french = marketingExactLandingForumFr;

    expect(formatLandingDemoLabel(english.exactLanding.hero.watchDemo, 2, 'en')).toBe('Watch demo (2 min)');
    expect(formatLandingDemoLabel(french.exactLanding.hero.watchDemo, 2, 'fr')).toBe('Voir la démo (2 min)');
    expect(formatForumCount(1, french.exactForum.categories.topics, 'fr')).toBe('1 sujet');
    expect(formatForumCount(3_400, french.exactForum.categories.topics, 'fr')).toMatch(/^3,4\s?k sujets$/u);
    expect(formatForumCount(1_200, english.exactForum.categories.posts, 'en')).toBe('1.2K posts');
    expect(formatForumStat(48_200, 'fr', 'standard')).toMatch(/^48[\s\u202f]200\+$/u);
    expect(formatForumStat(210_000, 'en')).toBe('210K+');
  });

  it('renders the direct landing hero in French without replaced English copy', () => {
    const markup = renderInFrench(<LandingOptimized />);

    expect(markup).toContain('Créez et déployez');
    expect(markup).toContain('des applications de production');
    expect(markup).toContain('Créer maintenant');
    expect(markup).toContain('Voir la démo (2 min)');
    expect(markup).toContain('Tableau de bord analytique');
    expect(markup).toContain('Aucune carte bancaire requise');
    expect(markup).not.toContain('Build and deploy');
    expect(markup).not.toContain('Watch demo');
    expect(markup).not.toContain('No credit card required');
  });

  it('renders the complete forum in French without replaced English copy', () => {
    const markup = renderInFrench(<Forum />, '/forum');

    expect(markup).toContain('Rejoignez la communauté E-Code');
    expect(markup).toContain('48 200 membres et une communauté qui grandit');
    expect(markup).toContain('Parcourir les catégories');
    expect(markup).toContain('Aide et assistance');
    expect(markup).toContain('Règles de la communauté');
    expect(markup).toContain('Rejoindre le forum');
    expect(markup).toContain('href="/signup"');
    expect(markup).not.toContain('Join the E-Code community');
    expect(markup).not.toContain('Browse categories');
    expect(markup).not.toContain('Community guidelines');
  });

  it('preserves brands, technical terms and stable routes', () => {
    const frenchCatalog = JSON.stringify(marketingExactLandingForumFr);

    const landingSource = readFileSync(
      new URL('../../../components/marketing/ecode-exact/pages/LandingOptimized.tsx', import.meta.url),
      'utf8',
    );

    for (const term of [
      'E-Code',
      'Stripe',
      'Slack',
      'WebSocket',
      'OpenAI GPT-5',
      'RAG',
      'Fortune 500',
      'KPI',
      'SaaS',
      'Jira',
      'Kanban',
    ]) {
      expect(frenchCatalog).toContain(term);
    }

    expect(landingSource).toContain("navigate('/projects/new')");
    expect(landingSource).toContain("navigate('/pricing')");
    expect(landingSource).toContain("sessionStorage.setItem('pendingAppDescription', prompt)");
  });

  it('keeps long French copy responsive, accessible and theme-safe', () => {
    const componentSources = [
      '../../../components/marketing/ecode-exact/pages/LandingOptimized.tsx',
      '../../../components/marketing/ecode-exact/pages/Forum.tsx',
    ].map((relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8'));

    const source = componentSources.join('\n');

    expect(source).toContain('break-words');
    expect(source).toContain('min-w-0');
    expect(source).toContain('whitespace-normal');
    expect(source).toContain('w-full');
    expect(source).toContain('sm:w-auto');
    expect(source).toContain('bg-background');
    expect(source).toContain('text-muted-foreground');
    expect(source).toContain('focus-visible:ring-2');
    expect(source).toContain('aria-busy={isBuilding}');
    expect(source).not.toContain('window.location.href');
    expect(source).not.toContain("backgroundColor: 'var(--ecode-accent)'");
  });

  it.each([
    [landingLoader, landingMeta, 'https://e-code.ai/', marketingExactLandingForumFr.exactLanding.seo],
    [forumLoader, forumMeta, 'https://e-code.ai/forum', marketingExactLandingForumFr.exactForum.seo],
  ])('serves localized route metadata', (loader, meta, url, seo) => {
    const data = loader({ request: new Request(`${url}?lang=fr`) } as never);
    const tags = meta({ data } as never);

    expect(data.language).toBe('fr');
    expect(tags).toEqual(expect.arrayContaining([{ title: seo.title }]));
    expect(tags).toEqual(expect.arrayContaining([{ name: 'description', content: seo.description }]));
    expect(tags).toEqual(expect.arrayContaining([{ property: 'og:title', content: seo.title }]));
    expect(tags).toEqual(expect.arrayContaining([{ property: 'og:image:alt', content: seo.imageAlt }]));
    expect(tags).toEqual(expect.arrayContaining([{ name: 'twitter:title', content: seo.title }]));
    expect(tags).toEqual(expect.arrayContaining([{ name: 'twitter:description', content: seo.description }]));
    expect(tags).toEqual(expect.arrayContaining([{ name: 'twitter:image:alt', content: seo.imageAlt }]));
  });

  it.each(['/', '/forum'])('inherits canonical and en/fr alternates for %s', (path) => {
    const result = rootLoader({
      request: new Request(`https://e-code.ai${path}?lang=fr`),
      params: {},
      context: {},
    });

    const data = dataOf<{ seo: { canonical: string; english: string; french: string } }>(result);
    const canonical = `https://e-code.ai${path}`;

    expect(data.seo).toEqual({
      canonical,
      english: canonical,
      french: `${canonical}?lang=fr`,
    });
  });

  it('leaves no hard-coded visible source copy in the direct pages or routes', async () => {
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');

    const files = [
      '../../../components/marketing/ecode-exact/pages/LandingOptimized.tsx',
      '../../../components/marketing/ecode-exact/pages/Forum.tsx',
      '../../../routes/_index.tsx',
      '../../../routes/forum.tsx',
    ];

    for (const relativePath of files) {
      const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      const result = scanSource(source, relativePath);

      expect(result.parseErrors, relativePath).toEqual([]);
      expect(result.findings, relativePath).toEqual([]);
    }
  });
});
