/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatMarketingExactChangelogDate,
  getMarketingExactChangelogCopy,
  marketingExactChangelogEn,
  marketingExactChangelogFr,
} from './marketing-exact-changelog';
import ChangelogPage from '~/components/marketing/ecode-exact/pages/Changelog';
import { changelogReleases } from '~/lib/marketing/changelog-releases';
import { loader as changelogLoader, meta as changelogMeta } from '~/routes/changelog';
import { loader as changelogFeedLoader } from '~/routes/changelog[.]xml';

let language = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

vi.mock('~/components/marketing/ecode-exact/EcodeExactShell', () => ({
  EcodeExactPublicNavbar: () => <nav data-testid="public-navbar" />,
  EcodeExactPublicFooter: () => <footer data-testid="public-footer" />,
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
  } as Parameters<typeof changelogLoader>[0];
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ChangelogPage />
    </MemoryRouter>,
  );
}

describe('exact Changelog marketing catalog and routes', () => {
  beforeEach(() => {
    language = 'en';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps complete EN/FR parity, release metadata coverage, and English fallback', () => {
    expect(leafPaths(marketingExactChangelogFr)).toEqual(leafPaths(marketingExactChangelogEn));
    expect(Object.keys(marketingExactChangelogFr.exactChangelog.releases)).toEqual(
      changelogReleases.map(({ id }) => id),
    );
    expect(getMarketingExactChangelogCopy('fr-CA').exactChangelog.hero.title).toBe('Journal des modifications');
    expect(getMarketingExactChangelogCopy('de-DE').exactChangelog.hero.title).toBe('Changelog');
  });

  it('formats valid dates for each locale and never exposes an invalid value', () => {
    expect(formatMarketingExactChangelogDate('2026-06-16', 'en-US')).toBe('June 16, 2026');
    expect(formatMarketingExactChangelogDate('2026-06-16', 'fr-FR')).toBe('16 juin 2026');
    expect(formatMarketingExactChangelogDate('not-a-date', 'fr-FR')).toBe('Date indisponible');
    expect(formatMarketingExactChangelogDate('not-a-date', 'de-DE')).toBe('Date unavailable');
  });

  it('renders every release and all user-facing content in French', () => {
    language = 'fr';

    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Journal des modifications' })).toBeTruthy();
    expect(screen.getByText('Mis à jour en continu')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Versions d’E-Code' })).toBeTruthy();
    expect(screen.getAllByTestId(/^changelog-release-/u)).toHaveLength(6);
    expect(screen.getAllByText('Nouveau')).toHaveLength(3);
    expect(screen.getAllByText('Amélioré')).toHaveLength(2);
    expect(screen.getByText('Corrigé')).toBeTruthy();
    expect(screen.getByText('16 juin 2026')).toBeTruthy();
    expect(screen.getByText('26 mai 2026')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Mode de consensus multi-agents' })).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Déploiements plus rapides et plus intelligents' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Crédits à l’usage et portail de facturation' })).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Stabilité de l’espace de travail et de l’aperçu' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Collaboration en temps réel' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Génération de code par IA plus intelligente' })).toBeTruthy();
    expect(screen.getAllByText('Modifications apportées dans cette version', { exact: true })).toHaveLength(6);
    expect(screen.getByRole('heading', { level: 2, name: 'Créez avec la dernière version d’E-Code' })).toBeTruthy();
  });

  it('preserves technical identifiers, routes, image source, and justified technical terms', () => {
    language = 'fr';

    renderPage();

    for (const release of changelogReleases) {
      const item = screen.getByTestId(`changelog-release-${release.id}`);

      expect(item.id).toBe(release.version);
      expect(item.textContent).toContain(release.version);
      expect(item.querySelector('time')?.getAttribute('datetime')).toBe(release.publishedAt);
    }

    expect(screen.getByRole('link', { name: 'Commencer gratuitement' }).getAttribute('href')).toBe('/signup');
    expect(screen.getByRole('link', { name: 'Ouvrir le tableau de bord' }).getAttribute('href')).toBe('/dashboard');
    expect(screen.getByRole('img').getAttribute('src')).toBe('/ecode-static/assets/product/ide.png');
    expect(document.body.textContent).toContain('E-Code');
    expect(document.body.textContent).toContain('IDE');
    expect(document.body.textContent).toContain('terminal');
    expect(document.body.textContent).toContain('compilations');
    expect(document.body.textContent).toContain('applications complètes');
    expect(document.body.textContent).not.toMatch(/\b(?:builds|full-stack)\b/iu);
    expect(document.body.textContent).toContain('shells');
    expect(document.body.textContent).toContain('diffs');
    expect(document.body.textContent).not.toContain('Every feature, improvement, and fix');
    expect(document.body.textContent).not.toContain('Updated continuously');
    expect(document.body.textContent).not.toContain('What changed in this release');
    expect(document.body.textContent).not.toContain('Get started free');
    expect(document.body.textContent).not.toContain('Open dashboard');
    expect([...document.querySelectorAll('svg')].every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(
      true,
    );
  });

  it('updates rendered copy and date formatting when the active language changes', () => {
    const view = renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Changelog' })).toBeTruthy();
    expect(screen.getByText('June 16, 2026')).toBeTruthy();

    language = 'fr';
    view.rerender(
      <MemoryRouter>
        <ChangelogPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Journal des modifications' })).toBeTruthy();
    expect(screen.getByText('16 juin 2026')).toBeTruthy();
    expect(screen.queryByText('June 16, 2026')).toBeNull();
  });

  it('emits localized French SEO, social image alt, canonical, and hreflang metadata', () => {
    const data = changelogLoader(
      loaderArgs('https://e-code.ai/changelog', {
        'Accept-Language': 'fr-FR, en;q=0.8',
      }),
    );

    const descriptors = changelogMeta({ data } as Parameters<typeof changelogMeta>[0]);

    expect(data.language).toBe('fr');
    expect(descriptors).toContainEqual({ title: 'Journal des modifications — E-Code' });
    expect(descriptors).toContainEqual({
      name: 'description',
      content: 'Découvrez les dernières fonctionnalités, améliorations et corrections livrées dans E-Code.',
    });
    expect(descriptors).toContainEqual({
      property: 'og:image:alt',
      content: 'Les dernières fonctionnalités, améliorations et corrections d’E-Code',
    });
    expect(descriptors).toContainEqual({
      name: 'twitter:image:alt',
      content: 'Les dernières fonctionnalités, améliorations et corrections d’E-Code',
    });
    expect(descriptors).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
    expect(descriptors).toContainEqual({ property: 'og:locale:alternate', content: 'en_US' });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://e-code.ai/changelog',
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'en',
      href: 'https://e-code.ai/changelog?lang=en',
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: 'https://e-code.ai/changelog?lang=fr',
    });
  });

  it('lets an explicit English query override French browser detection for SEO', () => {
    const data = changelogLoader(
      loaderArgs('https://e-code.ai/changelog?lang=en', {
        'Accept-Language': 'fr-FR',
      }),
    );

    const descriptors = changelogMeta({ data } as Parameters<typeof changelogMeta>[0]);

    expect(data.language).toBe('en');
    expect(descriptors).toContainEqual({ title: 'Changelog — E-Code' });
    expect(descriptors).toContainEqual({ property: 'og:locale', content: 'en_US' });
  });

  it('localizes the RSS feed while preserving versions, canonical anchors, and RFC dates', async () => {
    const response = await changelogFeedLoader(
      loaderArgs('https://e-code.ai/changelog.xml?lang=fr', {
        'Accept-Language': 'en-US',
      }),
    );

    const xml = await response.text();

    expect(response.headers.get('content-type')).toBe('application/rss+xml; charset=utf-8');
    expect(xml).toContain('<language>fr</language>');
    expect(xml).toContain('<title>Journal des modifications E-Code</title>');
    expect(xml).toContain('Mode de consensus multi-agents');
    expect(xml).toContain('<category>Nouveau</category>');
    expect(xml).toContain('<pubDate>Tue, 16 Jun 2026 00:00:00 GMT</pubDate>');
    expect(xml).toContain('https://e-code.ai/changelog#v3.8.0');
    expect(xml).not.toContain('Multi-agent consensus mode');
  });

  it('has zero scanner findings and explicit responsive, theme, and accessibility safeguards', async () => {
    const sourcePaths = [
      'app/components/marketing/ecode-exact/pages/Changelog.tsx',
      'app/lib/marketing/changelog-releases.ts',
      'app/routes/changelog.tsx',
      'app/routes/changelog[.]xml.tsx',
    ];

    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');

    for (const sourcePath of sourcePaths) {
      const source = readFileSync(sourcePath, 'utf8');
      const result = scanSource(source, sourcePath);

      expect(result.parseErrors).toEqual([]);
      expect(result.findings).toEqual([]);
    }

    const source = readFileSync(sourcePaths[0], 'utf8');

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
    expect(source).not.toContain('fetch(');
  });
});
