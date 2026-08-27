/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getMarketingExactTrustSafetyCopy,
  marketingExactTrustSafetyEn,
  marketingExactTrustSafetyFr,
} from './marketing-exact-trust-and-safety';
import TrustAndSafetyPage, { loader as trustSafetyLoader, meta as trustSafetyMeta } from '~/routes/trust-and-safety';

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
  } as Parameters<typeof trustSafetyLoader>[0];
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TrustAndSafetyPage />
    </MemoryRouter>,
  );
}

describe('exact Trust and Safety marketing catalog and route', () => {
  beforeEach(() => {
    language = 'en';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps complete EN/FR parity, stable identifiers and English fallback', () => {
    expect(leafPaths(marketingExactTrustSafetyFr)).toEqual(leafPaths(marketingExactTrustSafetyEn));
    expect(marketingExactTrustSafetyFr.exactTrustSafety.highlights.items.map(({ id }) => id)).toEqual([
      'rules',
      'review',
      'children',
      'reporting',
    ]);
    expect(marketingExactTrustSafetyFr.exactTrustSafety.policy.sections.map(({ id }) => id)).toEqual([
      'prohibited',
      'children',
      'enforcement',
      'reporting',
      'appeals',
    ]);
    expect(getMarketingExactTrustSafetyCopy('fr-CA').exactTrustSafety.hero.title).toBe('Confiance et sécurité');
    expect(getMarketingExactTrustSafetyCopy('de-DE').exactTrustSafety.hero.title).toBe('Trust & Safety');
  });

  it('renders every policy section and safety commitment in French', () => {
    language = 'fr';

    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Confiance et sécurité' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Nos engagements fondamentaux en matière de sécurité' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Politique de confiance et de sécurité' })).toBeTruthy();
    expect(screen.getAllByTestId(/^highlight-trust-safety-/u)).toHaveLength(4);
    expect(screen.getAllByTestId(/^article-trust-safety-/u)).toHaveLength(5);
    expect(screen.getByText('Règles claires')).toBeTruthy();
    expect(screen.getByText('Détection automatisée et revue humaine')).toBeTruthy();
    expect(screen.getByText('Protection des mineurs', { selector: 'span' })).toBeTruthy();
    expect(screen.getByText('Signalement accessible à tous')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Contenus et comportements interdits' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Protection des mineurs' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Détection et application des règles' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Comment effectuer un signalement' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Recours' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Aidez-nous à protéger E-Code' })).toBeTruthy();
  });

  it('preserves action URLs, brands, technical terms and the appeals address', () => {
    language = 'fr';

    renderPage();

    const primaryLinks = screen.getAllByRole('link', { name: 'Signaler un problème' });

    const secondaryLinks = screen.getAllByRole('link', {
      name: 'Lire la politique d’utilisation acceptable',
    });

    expect(primaryLinks).toHaveLength(2);
    expect(primaryLinks.every((link) => link.getAttribute('href') === '/report-abuse')).toBe(true);
    expect(secondaryLinks).toHaveLength(2);
    expect(secondaryLinks.every((link) => link.getAttribute('href') === '/acceptable-use')).toBe(true);
    expect(document.body.textContent).toContain('E-Code');
    expect(document.body.textContent).toContain('CSAM');
    expect(document.body.textContent).toContain('NCMEC');
    expect(document.body.textContent).toContain('reverse shells');
    expect(document.body.textContent).toContain('appeals@e-code.ai');
    expect(document.body.textContent).not.toContain('Prohibited content and conduct');
    expect(document.body.textContent).not.toContain('How we detect and enforce');
    expect(document.body.textContent).not.toContain('Report a problem');
    expect(document.body.textContent).not.toContain('Read acceptable use');
    expect(document.querySelector('img')).toBeNull();
    expect([...document.querySelectorAll('svg')].every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(
      true,
    );
  });

  it('renders the complete English fallback for unsupported locales', () => {
    language = 'es-MX';

    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Trust & Safety' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Prohibited content and conduct' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'How we detect and enforce' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Report a problem' })[0]?.getAttribute('href')).toBe('/report-abuse');
  });

  it('emits localized French SEO, image alt, canonical and hreflang metadata', () => {
    const data = trustSafetyLoader(
      loaderArgs('https://e-code.ai/trust-and-safety', {
        'Accept-Language': 'fr-FR, en;q=0.8',
      }),
    );

    const descriptors = trustSafetyMeta({ data } as Parameters<typeof trustSafetyMeta>[0]);

    expect(data.language).toBe('fr');
    expect(descriptors).toContainEqual({ title: 'Confiance et sécurité — E-Code' });
    expect(descriptors).toContainEqual({
      name: 'description',
      content:
        'Consultez les contenus et comportements interdits sur E-Code, les méthodes de détection et d’application des règles, la protection des mineurs et les moyens de signalement.',
    });
    expect(descriptors).toContainEqual({
      property: 'og:image:alt',
      content: 'Règles de confiance et sécurité, mesures appliquées et signalements sur E-Code',
    });
    expect(descriptors).toContainEqual({
      name: 'twitter:image:alt',
      content: 'Règles de confiance et sécurité, mesures appliquées et signalements sur E-Code',
    });
    expect(descriptors).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
    expect(descriptors).toContainEqual({ property: 'og:locale:alternate', content: 'en_US' });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://e-code.ai/trust-and-safety',
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'en',
      href: 'https://e-code.ai/trust-and-safety?lang=en',
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: 'https://e-code.ai/trust-and-safety?lang=fr',
    });
  });

  it('lets an explicit English query override French browser detection for SEO', () => {
    const data = trustSafetyLoader(
      loaderArgs('https://e-code.ai/trust-and-safety?lang=en', {
        'Accept-Language': 'fr-FR',
      }),
    );

    const descriptors = trustSafetyMeta({ data } as Parameters<typeof trustSafetyMeta>[0]);

    expect(data.language).toBe('en');
    expect(descriptors).toContainEqual({ title: 'Trust & Safety — E-Code' });
    expect(descriptors).toContainEqual({ property: 'og:locale', content: 'en_US' });
  });

  it('has zero scanner findings and explicit responsive, theme and accessibility safeguards', async () => {
    const sourcePath = 'app/routes/trust-and-safety.tsx';
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
