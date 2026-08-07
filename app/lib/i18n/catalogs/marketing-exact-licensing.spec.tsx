/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getMarketingExactLicensingCopy,
  marketingExactLicensingEn,
  marketingExactLicensingFr,
} from './marketing-exact-licensing';
import LicensingRoute, { loader as licensingLoader, meta as licensingMeta } from '~/routes/licensing';

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
  } as Parameters<typeof licensingLoader>[0];
}

describe('exact licensing marketing catalog and route', () => {
  beforeEach(() => {
    language = 'en';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps complete EN/FR parity, stable identifiers and English fallback', () => {
    expect(leafPaths(marketingExactLicensingFr)).toEqual(leafPaths(marketingExactLicensingEn));
    expect(marketingExactLicensingFr.exactLicensing.sections.map(({ id }) => id)).toEqual([
      'platform',
      'ownership',
      'dependencies',
      'trademarks',
    ]);
    expect(getMarketingExactLicensingCopy('fr-CA').exactLicensing.hero.title).toBe('Licences');
    expect(getMarketingExactLicensingCopy('de-DE').exactLicensing.hero.title).toBe('Licensing');
  });

  it('renders every licensing section and microcopy in French', () => {
    language = 'fr';

    render(<LicensingRoute />);

    expect(screen.getByText('Centre juridique')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Licences' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Conditions de licence' })).toBeTruthy();
    expect(screen.getAllByTestId(/^article-licensing-/u)).toHaveLength(4);
    expect(screen.getByRole('heading', { level: 3, name: 'Licence de la plateforme (MIT)' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Vos applications vous appartiennent' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Dépendances tierces' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Marques' })).toBeTruthy();
    expect(screen.getByText('Vérifiez les licences de vos dépendances avant toute publication')).toBeTruthy();
    expect(screen.getByText('Conservez les mentions d’attribution lorsqu’une licence l’exige')).toBeTruthy();
  });

  it('preserves brands and technical license identifiers without residual English interface copy', () => {
    language = 'fr';

    render(<LicensingRoute />);

    expect(document.body.textContent).toContain('E-Code');
    expect(document.body.textContent).toContain('VibeCore');
    expect(document.body.textContent).toContain('MIT');
    expect(document.body.textContent).toContain('LICENSE');
    expect(document.body.textContent).toContain('bolt.diy');
    expect(document.body.textContent).toContain('Apache-2.0');
    expect(document.body.textContent).toContain('BSD');
    expect(document.body.textContent).not.toContain('Platform license');
    expect(document.body.textContent).not.toContain('Your apps belong to you');
    expect(document.body.textContent).not.toContain('Third-party dependencies');
    expect(document.body.textContent).not.toContain('Trademarks');
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('button, a, input, select, textarea')).toBeNull();
  });

  it('renders the complete English fallback for unsupported locales', () => {
    language = 'es-MX';

    render(<LicensingRoute />);

    expect(screen.getByRole('heading', { level: 1, name: 'Licensing' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Platform license (MIT)' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Third-party dependencies' })).toBeTruthy();
    expect(screen.getByText('Review your dependency licenses before publishing')).toBeTruthy();
  });

  it('emits localized French SEO, image alt, canonical and hreflang metadata', () => {
    const data = licensingLoader(
      loaderArgs('https://e-code.ai/licensing', {
        'Accept-Language': 'fr-FR, en;q=0.8',
      }),
    );

    const descriptors = licensingMeta({ data } as Parameters<typeof licensingMeta>[0]);

    expect(data.language).toBe('fr');
    expect(descriptors).toContainEqual({ title: 'Licences — E-Code' });
    expect(descriptors).toContainEqual({
      name: 'description',
      content:
        'Découvrez comment la plateforme E-Code est distribuée sous licence MIT et quelles obligations de licence concernent les applications que vous créez.',
    });
    expect(descriptors).toContainEqual({
      property: 'og:image:alt',
      content: 'Informations sur les licences de la plateforme E-Code et des applications créées',
    });
    expect(descriptors).toContainEqual({
      name: 'twitter:image:alt',
      content: 'Informations sur les licences de la plateforme E-Code et des applications créées',
    });
    expect(descriptors).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
    expect(descriptors).toContainEqual({ property: 'og:locale:alternate', content: 'en_US' });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://e-code.ai/licensing',
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'en',
      href: 'https://e-code.ai/licensing?lang=en',
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: 'https://e-code.ai/licensing?lang=fr',
    });
  });

  it('lets an explicit English query override French browser detection for SEO', () => {
    const data = licensingLoader(
      loaderArgs('https://e-code.ai/licensing?lang=en', {
        'Accept-Language': 'fr-FR',
      }),
    );

    const descriptors = licensingMeta({ data } as Parameters<typeof licensingMeta>[0]);

    expect(data.language).toBe('en');
    expect(descriptors).toContainEqual({ title: 'Licensing — E-Code' });
    expect(descriptors).toContainEqual({ property: 'og:locale', content: 'en_US' });
  });

  it('has zero scanner findings and explicit responsive, theme and accessibility safeguards', async () => {
    const sourcePath = 'app/routes/licensing.tsx';
    const source = readFileSync(sourcePath, 'utf8');
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, sourcePath);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('container-responsive');
    expect(source).toContain('grid-cols-1');
    expect(source).toContain('lg:grid-cols-2');
    expect(source).toContain('sm:p-7');
    expect(source).toContain('min-w-0');
    expect(source).toContain('break-words');
    expect(source).toContain('[overflow-wrap:anywhere]');
    expect(source).toContain('bg-[var(--ecode-background)]');
    expect(source).toContain('bg-[var(--ecode-surface)]');
    expect(source).toContain('text-[var(--ecode-text)]');
    expect(source).toContain('text-[var(--ecode-text-secondary)]');
    expect(source).toContain('border-[var(--ecode-border)]');
    expect(source).toContain('aria-labelledby');
    expect(source).not.toContain('truncate');
    expect(source).not.toContain('line-clamp');
    expect(source).not.toContain('overflow-hidden');
    expect(source).not.toMatch(/#[0-9a-f]{3,8}/iu);
    expect(source).not.toMatch(/rgba?\(/iu);
    expect(source).not.toContain('style={{');
    expect(source).not.toContain('fetch(');
    expect(source).not.toContain('useState');
  });
});
