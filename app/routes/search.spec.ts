/**
 * G24: /search is a real loader-backed search page over the app's honest
 * corpora (page index, Help Center topics/articles, template catalog). These
 * tests pin the loader contract: empty query → empty groups, matches grouped
 * by source, and results capped per source.
 */
import { describe, expect, it, vi } from 'vitest';
import { APP_PAGE_INDEX, loader, meta } from './search';

/*
 * The route module pulls in the public shell for its component; stub it so the
 * loader can be imported under the default node environment (vi.mock is
 * hoisted above the route import).
 */
vi.mock('~/components/dashboard/SaaSLayout', () => ({
  PublicShell: ({ children }: { children: unknown }) => children,
}));

function loaderArgs(url: string, headers?: HeadersInit): Parameters<typeof loader>[0] {
  return {
    context: {},
    params: {},
    request: new Request(url, { headers }),
  } as Parameters<typeof loader>[0];
}

describe('search loader', () => {
  it('returns empty groups for an empty or whitespace-only query', () => {
    for (const url of ['http://test/search', 'http://test/search?q=%20%20']) {
      const result = loader(loaderArgs(url));

      expect(result.query).toBe('');
      expect(result.pages).toEqual([]);
      expect(result.helpTopics).toEqual([]);
      expect(result.helpArticles).toEqual([]);
      expect(result.templates).toEqual([]);
    }
  });

  it('normalizes the query and finds app pages and help topics', () => {
    const result = loader(loaderArgs('http://test/search?q=%20Billing%20'));

    expect(result.query).toBe('billing');
    expect(result.pages.map((page) => page.path)).toContain('/billing');
    expect(result.helpTopics.map((topic) => topic.title)).toContain('Billing');
  });

  it('finds templates in the real catalog with a category name attached', () => {
    const result = loader(loaderArgs('http://test/search?q=react'));

    expect(result.templates.length).toBeGreaterThan(0);

    for (const template of result.templates) {
      expect(template.slug).toBeTruthy();
      expect(template.name).toBeTruthy();
      expect(template.categoryName).toBeTruthy();
    }
  });

  it('finds help articles by their text', () => {
    const result = loader(loaderArgs('http://test/search?q=custom+domain'));

    expect(result.helpArticles).toContain('Adding a custom domain to a deployment');
  });

  it('detects French and returns localized page, help and article results', () => {
    const billing = loader(
      loaderArgs('http://test/search?q=facturation', {
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      }),
    );
    const article = loader(
      loaderArgs('http://test/search?q=domaine+personnalise', {
        'Accept-Language': 'fr-FR',
      }),
    );

    expect(billing.language).toBe('fr');
    expect(billing.pages).toContainEqual(expect.objectContaining({ path: '/billing', title: 'Facturation' }));
    expect(billing.helpTopics.map((topic) => topic.title)).toContain('Facturation');
    expect(article.helpArticles).toContain('Ajouter un domaine personnalisé à un déploiement');
  });

  it('uses the exact Help Center catalog as its localized help corpus', () => {
    const topic = loader(
      loaderArgs('http://test/search?q=premiers', {
        'Accept-Language': 'fr-FR',
      }),
    );
    const article = loader(
      loaderArgs('http://test/search?q=prompt', {
        'Accept-Language': 'fr-FR',
      }),
    );

    expect(topic.helpTopics).toContainEqual(expect.objectContaining({ id: 'gettingStarted', title: 'Premiers pas' }));
    expect(article.helpArticles).toContain('Comment créer un projet à partir d’un prompt ?');
  });

  it('matches English aliases in French mode but only renders localized copy', () => {
    const result = loader(
      loaderArgs('http://test/search?q=billing', {
        'Accept-Language': 'fr',
      }),
    );

    expect(result.pages).toContainEqual(expect.objectContaining({ path: '/billing', title: 'Facturation' }));
    expect(result.pages.map((page) => page.title)).not.toContain('Billing');
    expect(result.helpTopics.map((topic) => topic.title)).not.toContain('Billing');
  });

  it('searches localized templates and keeps stable technical slugs', () => {
    const result = loader(
      loaderArgs('http://test/search?q=tableau', {
        'Accept-Language': 'fr',
      }),
    );

    expect(result.templates).toContainEqual(
      expect.objectContaining({
        slug: 'next-dashboard',
        name: 'Tableau de bord Next',
        lookupName: 'Next dashboard',
      }),
    );
  });

  it('localizes legacy starter-template descriptions instead of leaking English', () => {
    const result = loader(
      loaderArgs('http://test/search?q=astro', {
        'Accept-Language': 'fr',
      }),
    );

    expect(result.templates).toContainEqual(
      expect.objectContaining({
        slug: 'basic-astro',
        name: 'Base Astro',
        description: 'Modèle Astro léger pour créer des sites statiques rapides.',
      }),
    );
    expect(result.templates.map((template) => template.description).join(' ')).not.toContain('starter template');
  });

  it('caps every source group at its per-source maximum', () => {
    // 'a' matches broadly across all corpora, exercising the caps.
    const result = loader(loaderArgs('http://test/search?q=a'));

    expect(result.pages.length).toBeLessThanOrEqual(8);
    expect(result.helpTopics.length).toBeLessThanOrEqual(8);
    expect(result.helpArticles.length).toBeLessThanOrEqual(8);
    expect(result.templates.length).toBeLessThanOrEqual(8);
  });

  it('emits localized French SEO and stable hreflang descriptors', () => {
    const data = loader(
      loaderArgs('http://test/search', {
        'Accept-Language': 'fr',
      }),
    );

    const descriptors = meta({ data } as Parameters<typeof meta>[0]);

    expect(descriptors).toContainEqual({ title: 'Rechercher sur E-Code' });
    expect(descriptors).toContainEqual(
      expect.objectContaining({ property: 'og:image:alt', content: expect.stringContaining('Recherche E-Code') }),
    );
    expect(descriptors).toContainEqual(expect.objectContaining({ tagName: 'link', rel: 'alternate', hrefLang: 'fr' }));
  });
});

describe('APP_PAGE_INDEX', () => {
  it('lists unique, absolute, user-facing paths with searchable copy', () => {
    const paths = APP_PAGE_INDEX.map((page) => page.path);

    expect(new Set(paths).size).toBe(paths.length);

    for (const page of APP_PAGE_INDEX) {
      expect(page.path.startsWith('/')).toBe(true);
      expect(page.title.trim()).not.toBe('');
      expect(page.description.trim()).not.toBe('');
    }
  });
});
