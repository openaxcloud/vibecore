/**
 * G24: /search is a real loader-backed search page over the app's honest
 * corpora (page index, Help Center topics/articles, template catalog). These
 * tests pin the loader contract: empty query → empty groups, matches grouped
 * by source, and results capped per source.
 */
import { describe, expect, it, vi } from 'vitest';
import { APP_PAGE_INDEX, loader } from './search';

/*
 * The route module pulls in the public shell for its component; stub it so the
 * loader can be imported under the default node environment (vi.mock is
 * hoisted above the route import).
 */
vi.mock('~/components/dashboard/SaaSLayout', () => ({
  PublicShell: ({ children }: { children: unknown }) => children,
}));

function loaderArgs(url: string): Parameters<typeof loader>[0] {
  return {
    context: {},
    params: {},
    request: new Request(url),
  };
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

  it('caps every source group at its per-source maximum', () => {
    // 'a' matches broadly across all corpora, exercising the caps.
    const result = loader(loaderArgs('http://test/search?q=a'));

    expect(result.pages.length).toBeLessThanOrEqual(8);
    expect(result.helpTopics.length).toBeLessThanOrEqual(8);
    expect(result.helpArticles.length).toBeLessThanOrEqual(8);
    expect(result.templates.length).toBeLessThanOrEqual(8);
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
