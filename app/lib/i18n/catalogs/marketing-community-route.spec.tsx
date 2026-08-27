import { readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  COMMUNITY_ROUTE_TAG_IDS,
  getMarketingCommunityRouteCopy,
  marketingCommunityRouteEn,
  marketingCommunityRouteFr,
} from './marketing-community-route';
import { CommunityMarketingPage } from '~/components/marketing/EcodePublicResourcePages';
import { USER_LANGUAGE_COOKIE } from '~/lib/i18n/language';
import { createI18nInstance } from '~/lib/i18n/runtime';
import { toResponse } from '~/lib/test/rr7-data';
import { loader as rootLoader } from '~/root';
import { buildCommunityRouteData, loader as communityLoader, meta as communityMeta } from '~/routes/community';

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

function loaderArgs(url: string, headers?: HeadersInit): Parameters<typeof communityLoader>[0] {
  return {
    context: {},
    params: {},
    request: new Request(url, { headers }),
  };
}

function renderInFrench(node: ReactNode) {
  const router = createMemoryRouter([{ path: '*', element: node }], { initialEntries: ['/community'] });
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

describe('community marketing route i18n', () => {
  it('keeps complete EN/FR structural parity', () => {
    expect(leafPaths(marketingCommunityRouteFr)).toEqual(leafPaths(marketingCommunityRouteEn));
  });

  it('provides professional French for every platform-owned substantive string', () => {
    const intentionallyStable = new Set([
      'communityRoute.contributorBadges.0.badge',
      ...stringPairs(marketingCommunityRouteEn, marketingCommunityRouteFr)
        .filter((pair) => pair.path.endsWith('.id'))
        .map((pair) => pair.path),
    ]);

    for (const pair of stringPairs(marketingCommunityRouteEn, marketingCommunityRouteFr)) {
      if (intentionallyStable.has(pair.path)) {
        expect(pair.french, pair.path).toBe(pair.english);
      } else {
        expect(pair.french, pair.path).not.toBe(pair.english);
      }
    }
  });

  it('falls back to English without exposing raw catalog keys', () => {
    const fallback = getMarketingCommunityRouteCopy('de-DE').communityRoute;

    expect(fallback.seo.title).toBe('Community — E-Code');
    expect(fallback.posts[0].title).toBe('How are teams routing agent memory safely in production?');
    expect(JSON.stringify(fallback)).not.toContain('communityRoute.');
  });

  it('localizes editorial copy and tag labels while preserving machine identifiers and stable technical fields', () => {
    const english = buildCommunityRouteData('en');
    const french = buildCommunityRouteData('fr');

    expect(french.posts[0]).toMatchObject({
      id: english.posts[0].id,
      authorName: 'Maya Chen',
      authorHandle: 'maya-ops',
      tags: ['ai-agent', 'memory', 'security', 'audit'],
      tagLabels: ['Agent IA', 'Mémoire', 'Sécurité', 'Audit'],
      title: 'Comment les équipes acheminent-elles la mémoire des agents en toute sécurité en production ?',
      categoryName: 'Aide',
    });
    expect(french.posts[0].summary).not.toBe(english.posts[0].summary);
    expect(french.posts[0].content).not.toBe(english.posts[0].content);
    expect(french.posts.map((post) => post.id)).toEqual(english.posts.map((post) => post.id));
    expect(french.posts.map((post) => post.authorName)).toEqual(english.posts.map((post) => post.authorName));
    expect(french.posts.map((post) => post.authorHandle)).toEqual(english.posts.map((post) => post.authorHandle));
    expect(french.posts.map((post) => post.tags)).toEqual(english.posts.map((post) => post.tags));
    expect(english.posts.every((post) => post.tagLabels === undefined)).toBe(true);
    expect([...new Set(french.posts.flatMap((post) => post.tags))].sort()).toEqual([...COMMUNITY_ROUTE_TAG_IDS].sort());
    expect(french.posts.flatMap((post) => post.tagLabels ?? [])).toEqual([
      'Agent IA',
      'Mémoire',
      'Sécurité',
      'Audit',
      'Mobile',
      'Assurance qualité',
      'Aperçu',
      'Adaptatif',
      'Déploiements',
      'Retour arrière',
      'Cloud Run',
      'Helm',
      'Modèles',
      'TypeScript',
      'API',
      'Qualité',
      'Équipes',
      'RBAC',
      'Collaboration',
      'Transmission',
      'Journée de démonstration',
      'Applications IA',
      'Tableaux de bord',
      'Mobile',
    ]);
    expect(french.challenges.map((challenge) => challenge.difficulty)).toEqual(
      english.challenges.map((challenge) => challenge.difficulty),
    );
    expect(french.events.map((event) => event.date)).toEqual(english.events.map((event) => event.date));
    expect(french.events.every((event) => /^2026-\d{2}-\d{2}T/.test(event.date))).toBe(true);
    expect(french.categories).toEqual([
      { id: 'all', name: 'Tout', postCount: 6 },
      { id: 'showcase', name: 'Vitrines', postCount: 2 },
      { id: 'help', name: 'Aide', postCount: 1 },
      { id: 'tutorials', name: 'Tutoriels', postCount: 1 },
      { id: 'discussion', name: 'Discussions', postCount: 2 },
    ]);
  });

  it('uses the request locale, persists first detection and gives the manual cookie priority', async () => {
    const detectedResponse = toResponse(
      await communityLoader(loaderArgs('https://e-code.ai/community', { 'Accept-Language': 'fr-FR,fr;q=0.9' })),
    );

    const detectedPayload = (await detectedResponse.json()) as ReturnType<typeof buildCommunityRouteData>;

    expect(detectedPayload.language).toBe('fr');
    expect(detectedPayload.posts[0].title).toContain('Comment les équipes');
    expect(detectedResponse.headers.get('content-language')).toBe('fr');
    expect(detectedResponse.headers.get('set-cookie')).toContain('vibecore-auto-lang=fr');
    expect(detectedResponse.headers.get('vary')).toContain('Accept-Language');

    const manualResponse = toResponse(
      await communityLoader(
        loaderArgs('https://e-code.ai/community', {
          'Accept-Language': 'fr-FR,fr;q=0.9',
          Cookie: `${USER_LANGUAGE_COOKIE}=en; vibecore-auto-lang=fr`,
        }),
      ),
    );

    const manualPayload = (await manualResponse.json()) as ReturnType<typeof buildCommunityRouteData>;

    expect(manualPayload.language).toBe('en');
    expect(manualPayload.posts[0].title).toBe('How are teams routing agent memory safely in production?');
    expect(manualResponse.headers.get('set-cookie')).toBeNull();
  });

  it('serves localized SEO and social metadata from route-loader data', () => {
    const routeResult = communityLoader(loaderArgs('https://e-code.ai/community?lang=fr'));
    const data = dataOf<ReturnType<typeof buildCommunityRouteData>>(routeResult);
    const seo = marketingCommunityRouteFr.communityRoute.seo;
    const tags = communityMeta({ data } as never);

    expect(data.language).toBe('fr');
    expect(tags).toEqual(expect.arrayContaining([{ title: seo.title }]));
    expect(tags).toEqual(expect.arrayContaining([{ name: 'description', content: seo.description }]));
    expect(tags).toEqual(expect.arrayContaining([{ property: 'og:title', content: seo.title }]));
    expect(tags).toEqual(expect.arrayContaining([{ property: 'og:image:alt', content: seo.imageAlt }]));
    expect(tags).toEqual(expect.arrayContaining([{ name: 'twitter:title', content: seo.title }]));
    expect(tags).toEqual(expect.arrayContaining([{ name: 'twitter:description', content: seo.description }]));
    expect(tags).toEqual(expect.arrayContaining([{ name: 'twitter:image:alt', content: seo.imageAlt }]));
  });

  it('inherits the canonical English URL and EN/FR hreflang alternates from root', () => {
    const result = rootLoader({
      request: new Request('https://e-code.ai/community?lang=fr'),
      params: {},
      context: {},
    });

    const data = dataOf<{ language: string; seo: { canonical: string; english: string; french: string } }>(result);

    expect(data.language).toBe('fr');
    expect(data.seo).toEqual({
      canonical: 'https://e-code.ai/community',
      english: 'https://e-code.ai/community',
      french: 'https://e-code.ai/community?lang=fr',
    });
  });

  it('renders French platform copy and tag labels while retaining community identities', () => {
    const data = buildCommunityRouteData('fr');

    const markup = renderInFrench(
      <CommunityMarketingPage
        posts={data.posts}
        categories={data.categories}
        challenges={data.challenges}
        contributors={data.contributors}
        events={data.events}
      />,
    );

    expect(markup).toContain('Échangez avec des personnes qui publient de vrais projets E-Code');
    expect(markup).toContain('Comment les équipes acheminent-elles la mémoire des agents');
    expect(markup).toContain('Guide de déploiement sécurisé');
    expect(markup).toContain('Table ronde sur les systèmes d’agents');
    expect(markup).toContain('27 juin 2026');
    expect(markup).toContain('Maya Chen');
    expect(markup).toContain('@maya-ops');
    expect(markup).toContain('Agent IA');
    expect(markup).toContain('Aperçu');
    expect(markup).toContain('Déploiements');
    expect(markup).toContain('Retour arrière');
    expect(markup).toContain('Modèles');
    expect(markup).toContain('Équipes');
    expect(markup).toContain('Tableaux de bord');
    expect(markup).toContain('placeholder="Rechercher une discussion, une étiquette ou un profil…"');
    expect(markup).toContain('Intermédiaire');
    expect(markup).toContain('Facile');
    expect(markup).toContain('Difficile');
    expect(markup).toContain('Mentor');
    expect(markup).toContain('Livraison');
    expect(markup).toContain('Créateur');
    expect(markup).not.toMatch(/>(?:preview|deployments|templates|teams|dashboards|rollback)</u);
    expect(markup).not.toContain('How are teams routing agent memory safely in production?');
    expect(markup).not.toContain('Secure deployment runbook');
    expect(markup).not.toContain('Agent systems roundtable');
    expect(markup).not.toContain('Active challenges');
    expect(markup).not.toContain('Top contributors');
  });

  it('keeps the shared community surface safe for long French copy, responsive breakpoints and both themes', () => {
    const source = readFileSync(
      new URL('../../../components/marketing/EcodePublicResourcePages.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('container-responsive');
    expect(source).toContain('min-w-0 flex-1');
    expect(source).toContain('overflow-x-auto');
    expect(source).toContain('flex-wrap');
    expect(source).toContain('sm:flex-row');
    expect(source).toContain('md:grid-cols-2');
    expect(source).toContain('xl:grid-cols-[minmax(0,1fr)_22rem]');
    expect(source).toContain('bg-[var(--ecode-background)]');
    expect(source).toContain('text-[var(--ecode-text)]');
    expect(source).toContain('focus:border-[var(--ecode-accent)]');
    expect(source).not.toContain('error.message');
  });

  it('leaves zero hard-coded visible source findings in the route', async () => {
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');
    const relativePath = '../../../routes/community.tsx';
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    const result = scanSource(source, relativePath);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
  });
});
