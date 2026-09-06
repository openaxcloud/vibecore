/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  formatExactBlogDate,
  getMarketingExactLegalBlogCopy,
  marketingExactLegalBlogEn,
  marketingExactLegalBlogFr,
} from './marketing-exact-legal-blog';

import Blog from '~/components/marketing/ecode-exact/pages/Blog';
import { createI18nInstance } from '~/lib/i18n/runtime';
import { loader as rootLoader } from '~/root';

afterEach(cleanup);

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

function frenchTree(node: ReactNode) {
  const router = createMemoryRouter([{ path: '*', element: node }], { initialEntries: ['/blog'] });

  return (
    <I18nextProvider i18n={createI18nInstance('fr')}>
      <RouterProvider router={router} />
    </I18nextProvider>
  );
}

function renderInFrench(node: ReactNode): string {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  try {
    return renderToStaticMarkup(frenchTree(node));
  } finally {
    consoleError.mockRestore();
  }
}

function dataOf<T>(result: unknown): T {
  return result && typeof result === 'object' && 'data' in result ? (result as { data: T }).data : (result as T);
}

describe('exact legal registry and blog catalogs', () => {
  it('keeps complete EN/FR structural parity', () => {
    expect(leafPaths(marketingExactLegalBlogFr)).toEqual(leafPaths(marketingExactLegalBlogEn));
  });

  it('translates every substantive string while preserving stable identifiers and accepted technical terms', () => {
    const stablePaths = new Set([
      'exactLegalRegistry.pages.dpa.label',
      'exactBlog.seo.title',
      'exactBlog.categories.5.label',
      'exactBlog.articles.posts.3.category',
      ...stringPairs(marketingExactLegalBlogEn, marketingExactLegalBlogFr)
        .filter((pair) => pair.path.endsWith('.id'))
        .map((pair) => pair.path),
    ]);

    for (const pair of stringPairs(marketingExactLegalBlogEn, marketingExactLegalBlogFr)) {
      if (!stablePaths.has(pair.path)) {
        expect(pair.french, pair.path).not.toBe(pair.english);
      }
    }

    const french = JSON.stringify(marketingExactLegalBlogFr);

    const visibleFrench = stringPairs(marketingExactLegalBlogEn, marketingExactLegalBlogFr)
      .filter((pair) => !stablePaths.has(pair.path))
      .map((pair) => pair.french)
      .join('\n');

    for (const term of ['E-Code', 'DPA', 'IDE', 'Agent IA', 'URL', 'YAML', 'SSE']) {
      expect(french).toContain(term);
    }

    expect(french).toContain('application complète');
    expect(visibleFrench).not.toMatch(/\b(?:backpressure|full-stack|streaming|workflow)\b/iu);
  });

  it('falls back to English for unsupported locales', () => {
    const fallback = getMarketingExactLegalBlogCopy('de-DE');

    expect(fallback.exactLegalRegistry.pages.privacy.title).toBe('Privacy Policy');
    expect(fallback.exactBlog.hero.title).toBe('The E-Code blog');
  });

  it('formats publication dates with the active locale and a stable UTC day', () => {
    expect(formatExactBlogDate('2026-06-16', 'en')).toBe('June 16, 2026');
    expect(formatExactBlogDate('2026-06-16', 'fr')).toBe('16 juin 2026');
  });

  it('renders the complete blog in French without former English copy', () => {
    const markup = renderInFrench(<Blog />);

    expect(markup).toContain('Le blog E-Code');
    expect(markup).toContain('Nous construisons au grand jour');
    expect(markup).toContain('Tous les articles');
    expect(markup).toContain('À la une');
    expect(markup).toContain('16 juin 2026');
    expect(markup).toContain('Derniers articles');
    expect(markup).toContain('Comment des sous-agents parallèles');
    expect(markup).toContain('Passez de la lecture à la création');
    expect(markup).toContain('Commencer gratuitement');
    expect(markup).toContain('href="/blog"');
    expect(markup).toContain('/ecode-static/assets/product/ide.png');
    expect(markup).not.toContain('The E-Code blog');
    expect(markup).not.toContain('Latest posts');
    expect(markup).not.toContain('Read more');
    expect(markup).not.toContain('Stop reading, start building');
  });

  it('filters localized cards through stable category identifiers', () => {
    render(frenchTree(<Blog />));

    fireEvent.click(screen.getByTestId('filter-pricing'));

    expect(
      screen.getByText('Tarification fondée sur l’effort : payez pour les résultats, pas pour des sièges inactifs'),
    ).toBeTruthy();
    expect(
      screen.queryByText('Comment des sous-agents parallèles parviennent à un consensus sur votre code'),
    ).toBeNull();
    expect(screen.getByTestId('filter-pricing').getAttribute('aria-pressed')).toBe('true');
  });

  it('inherits canonical and en/fr alternates from the root route', () => {
    const result = rootLoader({
      request: new Request('https://e-code.ai/blog?lang=fr'),
      params: {},
      context: {},
    });

    const data = dataOf<{ seo: { canonical: string; english: string; french: string } }>(result);

    expect(data.seo).toEqual({
      canonical: 'https://e-code.ai/blog',
      english: 'https://e-code.ai/blog',
      french: 'https://e-code.ai/blog?lang=fr',
    });
  });

  it('keeps long French copy responsive, accessible and theme-safe', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/components/marketing/ecode-exact/pages/Blog.tsx'), 'utf8');

    expect(source).toContain('break-words');
    expect(source).toContain('min-w-0');
    expect(source).toContain('whitespace-normal');
    expect(source).toContain('overflow-x-auto');
    expect(source).toContain('h-full');
    expect(source).toContain('w-full');
    expect(source).toContain('sm:w-auto');
    expect(source).toContain('bg-background');
    expect(source).toContain('text-muted-foreground');
    expect(source).toContain('focus-visible:ring-2');
    expect(source).toContain('aria-pressed={isActive}');
    expect(source).not.toContain('error.message');
    expect(source).not.toContain('window.location');
  });

  it('leaves no hard-coded visible copy in the two components or the authorized Blog route', async () => {
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');

    const files = ['app/components/marketing/ecode-exact/pages/Blog.tsx', 'app/routes/blog.tsx'];

    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      const result = scanSource(source, file);

      expect(result.parseErrors, file).toEqual([]);
      expect(result.findings, file).toEqual([]);
    }
  });
});
