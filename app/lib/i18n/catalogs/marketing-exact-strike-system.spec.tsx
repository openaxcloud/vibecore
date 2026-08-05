/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatMarketingExactStrikeSystemInteger,
  getMarketingExactStrikeSystemCopy,
  interpolateMarketingExactStrikeSystemCopy,
  marketingExactStrikeSystemEn,
  marketingExactStrikeSystemFr,
} from './marketing-exact-strike-system';
import StrikeSystemPage, { loader as strikeSystemLoader, meta as strikeSystemMeta } from '~/routes/strike-system';

let language = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  PublicShell: ({ children }: { children: ReactNode }) => <div data-testid="public-shell">{children}</div>,
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
  } as Parameters<typeof strikeSystemLoader>[0];
}

function renderPage() {
  return render(
    <MemoryRouter>
      <StrikeSystemPage />
    </MemoryRouter>,
  );
}

describe('exact strike-system marketing catalog and route', () => {
  beforeEach(() => {
    language = 'en';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps complete EN/FR parity, stable identifiers, interpolation and English fallback', () => {
    expect(leafPaths(marketingExactStrikeSystemFr)).toEqual(leafPaths(marketingExactStrikeSystemEn));
    expect(marketingExactStrikeSystemFr.exactStrikeSystem.highlights.items.map(({ id }) => id)).toEqual([
      'warning',
      'escalation',
      'expiry',
      'appeals',
    ]);
    expect(marketingExactStrikeSystemFr.exactStrikeSystem.policy.sections.map(({ id }) => id)).toEqual([
      'escalation',
      'expiry',
      'triggers',
      'appeals',
    ]);
    expect(getMarketingExactStrikeSystemCopy('fr-CA').exactStrikeSystem.hero.title).toBe('Système d’avertissements');
    expect(getMarketingExactStrikeSystemCopy('de-DE').exactStrikeSystem.hero.title).toBe('Strike System');
    expect(formatMarketingExactStrikeSystemInteger(12_345, 'fr-FR')).toBe('12 345');
    expect(formatMarketingExactStrikeSystemInteger(12_345, 'en-US')).toBe('12,345');
    expect(interpolateMarketingExactStrikeSystemCopy('{count} jours', { count: 180 })).toBe('180 jours');
    expect(interpolateMarketingExactStrikeSystemCopy('{known} {missing}', { known: 'value' })).toBe('value {missing}');
  });

  it('renders every policy section in French with the implemented thresholds and expiry', () => {
    language = 'fr';

    renderPage();

    expect(screen.getByText('Centre juridique')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Système d’avertissements' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Garanties du système d’avertissements' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Fonctionnement du système d’avertissements' })).toBeTruthy();
    expect(screen.getAllByTestId(/^highlight-strike-system-/u)).toHaveLength(4);
    expect(screen.getAllByTestId(/^article-strike-system-/u)).toHaveLength(4);
    expect(screen.getByRole('heading', { level: 3, name: 'Progression des mesures disciplinaires' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Expiration des avertissements' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Motifs d’un avertissement' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Comment exercer un recours' })).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Comprenez les règles et poursuivez vos créations' }),
    ).toBeTruthy();
    expect(screen.getByText(/^1 avertissement disciplinaire/u)).toBeTruthy();
    expect(screen.getByText(/^3 avertissements disciplinaires/u)).toBeTruthy();
    expect(screen.getByText(/^4 avertissements disciplinaires/u)).toBeTruthy();
    expect(screen.getAllByText(/180 jours/u).length).toBeGreaterThanOrEqual(3);
  });

  it('preserves destinations, brand, email address and technical terms', () => {
    language = 'fr';

    renderPage();

    const primaryLinks = screen.getAllByRole('link', { name: 'Signaler un abus' });
    const secondaryLinks = screen.getAllByRole('link', { name: 'Lire la politique d’utilisation acceptable' });

    expect(primaryLinks).toHaveLength(2);
    expect(primaryLinks.every((link) => link.getAttribute('href') === '/report-abuse')).toBe(true);
    expect(secondaryLinks).toHaveLength(2);
    expect(secondaryLinks.every((link) => link.getAttribute('href') === '/acceptable-use')).toBe(true);
    expect(document.body.textContent).toContain('E-Code');
    expect(document.body.textContent).toContain('appeals@e-code.ai');
    expect(document.body.textContent).toContain('IDE');
    expect(document.body.textContent).toContain('reverse shells');
    expect(document.body.textContent).not.toContain('How strikes escalate');
    expect(document.body.textContent).not.toContain('What triggers a strike');
    expect(document.body.textContent).not.toContain('How to appeal');
    expect(document.body.textContent).not.toContain('Report abuse');
    expect(document.body.textContent).not.toContain('Read acceptable use');
    expect(document.querySelector('img')).toBeNull();
    expect([...document.querySelectorAll('svg')].every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(
      true,
    );
  });

  it('renders the complete English fallback for unsupported locales', () => {
    language = 'es-MX';

    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Strike System' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'How strikes escalate' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Strikes expire' })).toBeTruthy();
    expect(screen.getByText(/^180-day expiry for each strike/u)).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Report abuse' })[0]?.getAttribute('href')).toBe('/report-abuse');
  });

  it('emits localized French SEO, image alt, canonical and hreflang metadata', () => {
    const data = strikeSystemLoader(
      loaderArgs('https://e-code.ai/strike-system', {
        'Accept-Language': 'fr-FR, en;q=0.8',
      }),
    );

    const descriptors = strikeSystemMeta({ data } as Parameters<typeof strikeSystemMeta>[0]);

    expect(data.language).toBe('fr');
    expect(descriptors).toContainEqual({ title: 'Système d’avertissements — E-Code' });
    expect(descriptors).toContainEqual({
      name: 'description',
      content:
        'Découvrez comment les avertissements disciplinaires E-Code progressent de la notification à la suspension, expirent après 180 jours et peuvent être contestés.',
    });
    expect(descriptors).toContainEqual({
      property: 'og:image:alt',
      content: 'Progression, expiration et procédure de recours des avertissements disciplinaires E-Code',
    });
    expect(descriptors).toContainEqual({
      name: 'twitter:image:alt',
      content: 'Progression, expiration et procédure de recours des avertissements disciplinaires E-Code',
    });
    expect(descriptors).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
    expect(descriptors).toContainEqual({ property: 'og:locale:alternate', content: 'en_US' });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://e-code.ai/strike-system',
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'en',
      href: 'https://e-code.ai/strike-system?lang=en',
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: 'https://e-code.ai/strike-system?lang=fr',
    });
  });

  it('lets an explicit English query override French browser detection for SEO', () => {
    const data = strikeSystemLoader(
      loaderArgs('https://e-code.ai/strike-system?lang=en', {
        'Accept-Language': 'fr-FR',
      }),
    );

    const descriptors = strikeSystemMeta({ data } as Parameters<typeof strikeSystemMeta>[0]);

    expect(data.language).toBe('en');
    expect(descriptors).toContainEqual({ title: 'Strike System — E-Code' });
    expect(descriptors).toContainEqual({ property: 'og:locale', content: 'en_US' });
  });

  it('has zero scanner findings and explicit responsive, theme and accessibility safeguards', async () => {
    const sourcePath = 'app/routes/strike-system.tsx';
    const source = readFileSync(sourcePath, 'utf8');
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, sourcePath);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('grid-cols-1');
    expect(source).toContain('sm:grid-cols-2');
    expect(source).toContain('lg:grid-cols-4');
    expect(source).toContain('lg:grid-cols-2');
    expect(source).toContain('min-w-0');
    expect(source).toContain('break-words');
    expect(source).toContain('[overflow-wrap:anywhere]');
    expect(source).toContain('w-full');
    expect(source).toContain('sm:w-auto');
    expect(source).toContain('whitespace-normal');
    expect(source).toContain('bg-[var(--ecode-background)]');
    expect(source).toContain('bg-[var(--ecode-surface)]');
    expect(source).toContain('text-[var(--ecode-text)]');
    expect(source).toContain('text-[var(--ecode-text-secondary)]');
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
    expect(source).not.toContain('useState');
  });
});
