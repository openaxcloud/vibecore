import type { Location, MetaDescriptor, UIMatch } from 'react-router';
import { describe, expect, it } from 'vitest';

import { resolveLeafDocumentSeoLinkKeys, resolveLeafDocumentSeoOwnership, type RouteMetaModule } from './document-seo';

const location: Location = {
  pathname: '/pricing',
  search: '?lang=fr',
  hash: '',
  state: null,
  key: 'seo-test',
};

function match(id: string, pathname: string, data: unknown): UIMatch {
  return {
    id,
    pathname,
    params: {},
    data,
    loaderData: data,
    handle: undefined,
  };
}

function resolveKeys(routeModules: Readonly<Record<string, RouteMetaModule>>) {
  return resolveLeafDocumentSeoLinkKeys({
    matches: [match('root', '/', { language: 'fr' }), match('routes/pricing', '/pricing', { language: 'fr' })],
    routeModules,
    location,
  });
}

function resolveOwnership(routeModules: Readonly<Record<string, RouteMetaModule>>) {
  return resolveLeafDocumentSeoOwnership({
    matches: [match('root', '/', { language: 'fr' }), match('routes/pricing', '/pricing', { language: 'fr' })],
    routeModules,
    location,
  });
}

describe('document SEO link ownership', () => {
  it('detects canonical and every supported hreflang link emitted by the leaf route', () => {
    const descriptors: MetaDescriptor[] = [
      { title: 'Tarifs — E-Code' },
      { tagName: 'link', rel: 'canonical', href: 'https://e-code.ai/pricing' },
      { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: 'https://e-code.ai/pricing?lang=en' },
      { tagName: 'link', rel: 'alternate', hrefLang: 'fr', href: 'https://e-code.ai/pricing?lang=fr' },
      { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: 'https://e-code.ai/pricing' },
    ];

    const keys = resolveKeys({
      root: { meta: () => [{ title: 'E-Code' }] },
      'routes/pricing': {
        meta: ({ matches }) => {
          expect(matches[0]?.data).toEqual({ language: 'fr' });
          return descriptors;
        },
      },
    });

    expect([...keys].sort()).toEqual(['alternate:en', 'alternate:fr', 'alternate:x-default', 'canonical']);
  });

  it('reports only links owned by the leaf so the root can fill missing alternates', () => {
    const keys = resolveKeys({
      root: { meta: () => [{ title: 'E-Code' }] },
      'routes/pricing': {
        meta: () => [
          { tagName: 'link', rel: 'canonical', href: 'https://e-code.ai/pricing' },
          { tagName: 'link', rel: 'alternate', hrefLang: 'FR', href: 'https://e-code.ai/pricing?lang=fr' },
          { tagName: 'link', rel: 'alternate', hrefLang: 'de', href: 'https://e-code.ai/pricing?lang=de' },
        ],
      },
    });

    expect([...keys].sort()).toEqual(['alternate:fr', 'canonical']);
  });

  it('detects canonical and hreflang links exported by route link descriptors', () => {
    const keys = resolveKeys({
      root: { meta: () => [{ title: 'E-Code' }] },
      'routes/pricing': {
        meta: () => [{ title: 'Tarifs — E-Code' }],
        links: () => [
          { rel: 'canonical' },
          { rel: 'alternate', hrefLang: 'en' },
          { rel: 'alternate', hrefLang: 'fr' },
          { rel: 'alternate', hrefLang: 'x-default' },
        ],
      },
    });

    expect([...keys].sort()).toEqual(['alternate:en', 'alternate:fr', 'alternate:x-default', 'canonical']);
  });

  it('reports leaf social fields and their localized values for document fallbacks', () => {
    const ownership = resolveOwnership({
      root: { meta: () => [{ title: 'E-Code' }] },
      'routes/pricing': {
        meta: () => [
          { title: 'Tarifs — E-Code' },
          { name: 'description', content: 'Comparez les offres E-Code.' },
          { property: 'og:title', content: 'Tarifs — E-Code' },
          { property: 'og:locale:alternate', content: 'en_US' },
          { name: 'twitter:card', content: 'summary_large_image' },
        ],
      },
    });

    expect(ownership.title).toBe('Tarifs — E-Code');
    expect(ownership.description).toBe('Comparez les offres E-Code.');
    expect(ownership.metaKeys).toEqual(
      new Set([
        'title',
        'name:description',
        'property:og:title',
        'property:og:locale:alternate',
        'property:og:locale:alternate:en_us',
        'name:twitter:card',
      ]),
    );
  });

  it('preserves React Router metadata inheritance when a child has no meta export', () => {
    const keys = resolveKeys({
      root: {
        meta: [
          { tagName: 'link', rel: 'canonical', href: 'https://e-code.ai/pricing' },
          { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: 'https://e-code.ai/pricing' },
        ],
      },
      'routes/pricing': {},
    });

    expect([...keys].sort()).toEqual(['alternate:en', 'canonical']);
  });

  it('fails open to root SEO links if route metadata evaluation throws', () => {
    const keys = resolveKeys({
      root: { meta: () => [{ title: 'E-Code' }] },
      'routes/pricing': {
        meta: () => {
          throw new Error('metadata failure');
        },
      },
    });

    expect([...keys]).toEqual([]);
  });

  it('mirrors error-boundary truncation and forwards the route error to root metadata', () => {
    const routeError = {
      status: 404,
      statusText: 'Not Found',
      data: null,
      internal: false,
    };
    const ownership = resolveLeafDocumentSeoOwnership({
      matches: [match('root', '/', { language: 'fr' }), match('routes/pricing', '/pricing', undefined)],
      routeModules: {
        root: {
          meta: ({ error, matches }) => {
            expect(error).toBe(routeError);
            expect(matches.map((candidate) => candidate.id)).toEqual(['root']);

            return [
              { title: 'Cette page est introuvable · E-Code' },
              { name: 'description', content: 'La page recherchée est introuvable.' },
              { name: 'robots', content: 'noindex,follow' },
            ];
          },
        },
        'routes/pricing': {
          meta: () => {
            throw new Error('metadata beyond the active error boundary must not run');
          },
        },
      },
      location,
      errors: { root: routeError },
    });

    expect(ownership.title).toBe('Cette page est introuvable · E-Code');
    expect(ownership.description).toBe('La page recherchée est introuvable.');
    expect(ownership.metaKeys).toEqual(new Set(['title', 'name:description', 'name:robots']));
  });
});
