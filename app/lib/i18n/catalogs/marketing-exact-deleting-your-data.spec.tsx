/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatMarketingExactDeletingYourDataInteger,
  getMarketingExactDeletingYourDataCopy,
  interpolateMarketingExactDeletingYourDataCopy,
  marketingExactDeletingYourDataEn,
  marketingExactDeletingYourDataFr,
} from './marketing-exact-deleting-your-data';
import DeletingYourDataPage, {
  loader as deletingDataLoader,
  meta as deletingDataMeta,
} from '~/routes/deleting-your-data';

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
  } as Parameters<typeof deletingDataLoader>[0];
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DeletingYourDataPage />
    </MemoryRouter>,
  );
}

describe('exact deleting-your-data marketing catalog and route', () => {
  beforeEach(() => {
    language = 'en';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps complete EN/FR parity, stable identifiers, interpolation and English fallback', () => {
    expect(leafPaths(marketingExactDeletingYourDataFr)).toEqual(leafPaths(marketingExactDeletingYourDataEn));
    expect(marketingExactDeletingYourDataFr.exactDeletingYourData.highlights.items.map(({ id }) => id)).toEqual([
      'selfService',
      'grace',
      'export',
      'permanent',
    ]);
    expect(marketingExactDeletingYourDataFr.exactDeletingYourData.guide.sections.map(({ id }) => id)).toEqual([
      'export',
      'request',
      'grace',
      'retention',
    ]);
    expect(getMarketingExactDeletingYourDataCopy('fr-CA').exactDeletingYourData.hero.title).toBe(
      'Suppression de vos données',
    );
    expect(getMarketingExactDeletingYourDataCopy('de-DE').exactDeletingYourData.hero.title).toBe('Deleting Your Data');
    expect(formatMarketingExactDeletingYourDataInteger(12_345, 'fr-FR')).toBe('12 345');
    expect(formatMarketingExactDeletingYourDataInteger(12_345, 'en-US')).toBe('12,345');
    expect(interpolateMarketingExactDeletingYourDataCopy('{count} jours', { count: '14' })).toBe('14 jours');
    expect(interpolateMarketingExactDeletingYourDataCopy('{known} {missing}', { known: 'value' })).toBe(
      'value {missing}',
    );
  });

  it('renders every export and deletion section in French with the formatted grace period', () => {
    language = 'fr';

    renderPage();

    expect(screen.getByText('Centre juridique')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Suppression de vos données' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Garanties de maîtrise de vos données' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Guide d’export et de suppression' })).toBeTruthy();
    expect(screen.getAllByTestId(/^highlight-deleting-data-/u)).toHaveLength(4);
    expect(screen.getAllByTestId(/^article-deleting-data-/u)).toHaveLength(4);
    expect(screen.getAllByText('Délai de grâce de 14 jours')).toHaveLength(2);
    expect(screen.getByRole('heading', { level: 3, name: 'Exporter vos données' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Supprimer vous-même votre compte' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Délai de grâce de 14 jours' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Données supprimées et données conservées' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Gardez la maîtrise de vos données' })).toBeTruthy();
    expect(screen.getByText('14 jours pour revenir sur votre décision')).toBeTruthy();
  });

  it('preserves destinations, brand and security-sensitive exclusions', () => {
    language = 'fr';

    renderPage();

    const primaryLinks = screen.getAllByRole('link', { name: 'Gérer vos données' });

    const secondaryLinks = screen.getAllByRole('link', { name: 'Lire la Politique de confidentialité' });

    expect(primaryLinks).toHaveLength(2);
    expect(primaryLinks.every((link) => link.getAttribute('href') === '/account-settings/data')).toBe(true);
    expect(secondaryLinks).toHaveLength(2);
    expect(secondaryLinks.every((link) => link.getAttribute('href') === '/privacy')).toBe(true);
    expect(document.body.textContent).toContain('E-Code');
    expect(document.body.textContent).toContain('Les secrets et les jetons d’accès ne sont jamais inclus');
    expect(document.body.textContent).not.toContain('Export your data');
    expect(document.body.textContent).not.toContain('Delete your account yourself');
    expect(document.body.textContent).not.toContain('Manage your data');
    expect(document.body.textContent).not.toContain('Read the Privacy Policy');
    expect(document.querySelector('img')).toBeNull();
    expect([...document.querySelectorAll('svg')].every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(
      true,
    );
  });

  it('renders the complete English fallback for unsupported locales', () => {
    language = 'es-MX';

    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Deleting Your Data' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Export your data' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: '14-day grace period' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Manage your data' })[0]?.getAttribute('href')).toBe(
      '/account-settings/data',
    );
  });

  it('emits localized French SEO, image alt, canonical and hreflang metadata', () => {
    const data = deletingDataLoader(
      loaderArgs('https://e-code.ai/deleting-your-data', {
        'Accept-Language': 'fr-FR, en;q=0.8',
      }),
    );

    const descriptors = deletingDataMeta({ data } as Parameters<typeof deletingDataMeta>[0]);

    expect(data.language).toBe('fr');
    expect(descriptors).toContainEqual({ title: 'Suppression de vos données — E-Code' });
    expect(descriptors).toContainEqual({
      name: 'description',
      content:
        'Découvrez comment exporter ou supprimer vous-même vos données E-Code, comment fonctionne le délai de grâce de 14 jours et quelles données sont supprimées ou conservées.',
    });
    expect(descriptors).toContainEqual({
      property: 'og:image:alt',
      content: 'Guide E-Code sur l’export de données et la suppression du compte en libre-service',
    });
    expect(descriptors).toContainEqual({
      name: 'twitter:image:alt',
      content: 'Guide E-Code sur l’export de données et la suppression du compte en libre-service',
    });
    expect(descriptors).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
    expect(descriptors).toContainEqual({ property: 'og:locale:alternate', content: 'en_US' });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://e-code.ai/deleting-your-data',
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'en',
      href: 'https://e-code.ai/deleting-your-data?lang=en',
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: 'https://e-code.ai/deleting-your-data?lang=fr',
    });
  });

  it('lets an explicit English query override French browser detection for SEO', () => {
    const data = deletingDataLoader(
      loaderArgs('https://e-code.ai/deleting-your-data?lang=en', {
        'Accept-Language': 'fr-FR',
      }),
    );

    const descriptors = deletingDataMeta({ data } as Parameters<typeof deletingDataMeta>[0]);

    expect(data.language).toBe('en');
    expect(descriptors).toContainEqual({ title: 'Deleting Your Data — E-Code' });
    expect(descriptors).toContainEqual({ property: 'og:locale', content: 'en_US' });
  });

  it('has zero scanner findings and explicit responsive, theme and accessibility safeguards', async () => {
    const sourcePath = 'app/routes/deleting-your-data.tsx';
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
