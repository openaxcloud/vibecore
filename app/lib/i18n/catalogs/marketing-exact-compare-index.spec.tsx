/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getMarketingExactCompareIndexCopy,
  interpolateMarketingExactCompareIndexCopy,
  marketingExactCompareIndexEn,
  marketingExactCompareIndexFr,
} from './marketing-exact-compare-index';
import CompareIndex from '~/components/marketing/ecode-exact/pages/CompareIndex';
import { loader as compareIndexLoader, meta as compareIndexMeta } from '~/routes/compare._index';

let language = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

vi.mock('~/components/marketing/EcodeMarketingPages', () => ({
  comparePages: {
    'github-codespaces': { slug: 'github-codespaces' },
    glitch: { slug: 'glitch' },
    heroku: { slug: 'heroku' },
    codesandbox: { slug: 'codesandbox' },
    'aws-cloud9': { slug: 'aws-cloud9' },
  },
}));

vi.mock('~/components/marketing/ecode-exact/EcodeExactShell', () => ({
  EcodeExactPublicNavbar: () => <nav data-testid="public-navbar" />,
  EcodeExactPublicFooter: () => <footer data-testid="public-footer" />,
}));

vi.mock('~/components/marketing/ecode-exact/EcodeExactUi', () => ({
  Badge: ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  Card: ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  CardContent: ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  CardHeader: ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  CardTitle: ({ children, ...props }: HTMLAttributes<HTMLHeadingElement> & { children?: ReactNode }) => (
    <h3 {...props}>{children}</h3>
  ),
  CardDescription: ({ children, ...props }: HTMLAttributes<HTMLParagraphElement> & { children?: ReactNode }) => (
    <p {...props}>{children}</p>
  ),
}));

function leafPaths(value: unknown, path: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leafPaths(item, [...path, String(index)]));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => leafPaths(item, [...path, key]));
  }

  return [path.join('.')];
}

function loaderArgs(url: string, headers?: HeadersInit) {
  return {
    request: new Request(url, { headers }),
    params: {},
    context: {},
  } as Parameters<typeof compareIndexLoader>[0];
}

describe('exact Compare index marketing catalog and surface', () => {
  beforeEach(() => {
    language = 'en';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps complete EN/FR parity, stable IDs, interpolation and English fallback', () => {
    expect(leafPaths(marketingExactCompareIndexFr)).toEqual(leafPaths(marketingExactCompareIndexEn));
    expect(marketingExactCompareIndexFr.exactCompareIndex.comparisons.items.map(({ id }) => id)).toEqual([
      'github-codespaces',
      'glitch',
      'heroku',
      'codesandbox',
      'aws-cloud9',
    ]);
    expect(marketingExactCompareIndexFr.exactCompareIndex.reasons.items.map(({ id }) => id)).toEqual([
      'production',
      'ai',
      'collaboration',
      'enterprise',
    ]);
    expect(getMarketingExactCompareIndexCopy('fr-CA').exactCompareIndex.hero.title).toBe(
      'Comparez E-Code aux autres plateformes',
    );
    expect(getMarketingExactCompareIndexCopy('de-DE').exactCompareIndex.hero.title).toBe('How E-Code compares');
    expect(
      interpolateMarketingExactCompareIndexCopy(marketingExactCompareIndexFr.exactCompareIndex.comparisons.actionAria, {
        comparison: 'E-Code face à Heroku',
      }),
    ).toBe('Consulter le comparatif E-Code face à Heroku');
    expect(interpolateMarketingExactCompareIndexCopy('{known} {missing}', { known: 'value' })).toBe('value {missing}');
  });

  it('renders every comparison and reason in French with unchanged destinations', () => {
    language = 'fr';

    render(<CompareIndex />);

    expect(screen.getByRole('heading', { level: 1, name: 'Comparez E-Code aux autres plateformes' })).toBeTruthy();
    expect(screen.getByText('Comparatifs')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Comparatifs par plateforme' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Pourquoi les équipes choisissent E-Code' })).toBeTruthy();
    expect(screen.getAllByTestId(/^card-compare-(?!reason)/u)).toHaveLength(5);
    expect(screen.getAllByTestId(/^card-compare-reason-/u)).toHaveLength(4);

    const expectedLinks = [
      ['E-Code face à GitHub Codespaces', '/compare/github-codespaces'],
      ['E-Code face à Glitch', '/compare/glitch'],
      ['E-Code face à Heroku', '/compare/heroku'],
      ['E-Code face à CodeSandbox', '/compare/codesandbox'],
      ['E-Code face à AWS Cloud9', '/compare/aws-cloud9'],
    ] as const;

    for (const [comparison, href] of expectedLinks) {
      expect(screen.getByRole('heading', { level: 3, name: comparison })).toBeTruthy();
      expect(screen.getByRole('link', { name: `Consulter le comparatif ${comparison}` }).getAttribute('href')).toBe(
        href,
      );
    }

    expect(screen.getByRole('heading', { level: 3, name: 'Du prompt à la production' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'IA administrée' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Collaboration en temps réel' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Prêt pour l’entreprise' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Commencer gratuitement' }).getAttribute('href')).toBe('/');
  });

  it('preserves brands and technical terms while removing the original English interface in French', () => {
    language = 'fr';

    render(<CompareIndex />);

    expect(document.body.textContent).toContain('E-Code');
    expect(document.body.textContent).toContain('GitHub Codespaces');
    expect(document.body.textContent).toContain('Glitch');
    expect(document.body.textContent).toContain('Heroku');
    expect(document.body.textContent).toContain('CodeSandbox');
    expect(document.body.textContent).toContain('AWS Cloud9');
    expect(document.body.textContent).toContain('SSO/SAML');
    expect(document.body.textContent).toContain('VPC');
    expect(document.body.textContent).toContain('application complète');
    expect(document.body.textContent).not.toContain('full-stack');
    expect(document.body.textContent).not.toContain('How E-Code compares');
    expect(document.body.textContent).not.toContain('See comparison');
    expect(document.body.textContent).not.toContain('Why teams choose E-Code');
    expect(document.body.textContent).not.toContain('Start building free');
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getAllByTestId(/^icon-compare-/u).every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(
      true,
    );
  });

  it('renders the complete English fallback for unsupported locales', () => {
    language = 'es-MX';

    render(<CompareIndex />);

    expect(screen.getByRole('heading', { level: 1, name: 'How E-Code compares' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'E-Code vs GitHub Codespaces' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Why teams choose E-Code' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Start building free' })).toBeTruthy();
  });

  it('emits localized French SEO, social image alt, canonical and hreflang metadata', () => {
    const data = compareIndexLoader(
      loaderArgs('https://e-code.ai/compare', {
        'Accept-Language': 'fr-FR, en;q=0.8',
      }),
    );

    const descriptors = compareIndexMeta({ data } as Parameters<typeof compareIndexMeta>[0]);

    expect(data.language).toBe('fr');
    expect(descriptors).toContainEqual({ title: 'Comparer les plateformes de développement assisté par IA — E-Code' });
    expect(descriptors).toContainEqual({
      name: 'description',
      content:
        'Comparez E-Code à GitHub Codespaces, Glitch, Heroku, CodeSandbox et AWS Cloud9 pour le développement assisté par IA, la collaboration et le déploiement.',
    });
    expect(descriptors).toContainEqual({
      property: 'og:image:alt',
      content: 'Comparaison d’E-Code avec les principales plateformes de développement assisté par IA',
    });
    expect(descriptors).toContainEqual({
      name: 'twitter:image:alt',
      content: 'Comparaison d’E-Code avec les principales plateformes de développement assisté par IA',
    });
    expect(descriptors).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
    expect(descriptors).toContainEqual({ property: 'og:locale:alternate', content: 'en_US' });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://e-code.ai/compare',
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'en',
      href: 'https://e-code.ai/compare?lang=en',
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: 'https://e-code.ai/compare?lang=fr',
    });
  });

  it('lets an explicit English query override French browser detection for SEO', () => {
    const data = compareIndexLoader(
      loaderArgs('https://e-code.ai/compare?lang=en', {
        'Accept-Language': 'fr-FR',
      }),
    );

    const descriptors = compareIndexMeta({ data } as Parameters<typeof compareIndexMeta>[0]);

    expect(data.language).toBe('en');
    expect(descriptors).toContainEqual({ title: 'Compare AI Development Platforms — E-Code' });
    expect(descriptors).toContainEqual({ property: 'og:locale', content: 'en_US' });
  });

  it('has zero scanner findings and explicit responsive, theme and accessibility safeguards', async () => {
    const sourcePaths = [
      'app/components/marketing/ecode-exact/pages/CompareIndex.tsx',
      'app/routes/compare._index.tsx',
    ];

    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');

    for (const sourcePath of sourcePaths) {
      const source = readFileSync(sourcePath, 'utf8');
      const result = scanSource(source, sourcePath);

      expect(result.parseErrors, sourcePath).toEqual([]);
      expect(result.findings, sourcePath).toEqual([]);
    }

    const source = readFileSync(sourcePaths[0], 'utf8');

    expect(source).toContain('grid-cols-1');
    expect(source).toContain('sm:grid-cols-2');
    expect(source).toContain('lg:grid-cols-4');
    expect(source).toContain('min-w-0');
    expect(source).toContain('break-words');
    expect(source).toContain('[overflow-wrap:anywhere]');
    expect(source).toContain('w-full');
    expect(source).toContain('sm:w-auto');
    expect(source).toContain('whitespace-normal');
    expect(source).toContain('bg-[var(--ecode-background)]');
    expect(source).toContain('bg-[var(--ecode-surface)]');
    expect(source).toContain('text-[var(--ecode-text)]');
    expect(source).toContain('border-[var(--ecode-border)]');
    expect(source).toContain('text-[var(--ecode-accent-contrast)]');
    expect(source).toContain('min-h-11');
    expect(source).toContain('focus-visible:ring-2');
    expect(source).toContain('motion-reduce:transition-none');
    expect(source).toContain('motion-reduce:transform-none');
    expect(source).toContain('aria-labelledby');
    expect(source).toContain('aria-hidden');
    expect(source).not.toContain('truncate');
    expect(source).not.toContain('line-clamp');
    expect(source).not.toMatch(/#[0-9a-f]{3,8}/iu);
    expect(source).not.toMatch(/rgba?\(/iu);
    expect(source).not.toContain('style={{');
  });
});
