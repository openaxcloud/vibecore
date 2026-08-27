/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getMarketingExactSupportPolicyCopy,
  marketingExactSupportPolicyEn,
  marketingExactSupportPolicyFr,
} from './marketing-exact-support-policy';
import SupportPolicyPage, { loader as supportPolicyLoader, meta as supportPolicyMeta } from '~/routes/support-policy';

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
  } as Parameters<typeof supportPolicyLoader>[0];
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SupportPolicyPage />
    </MemoryRouter>,
  );
}

describe('exact support-policy marketing catalog and route', () => {
  beforeEach(() => {
    language = 'en';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps complete EN/FR parity, stable identifiers and English fallback', () => {
    expect(leafPaths(marketingExactSupportPolicyFr)).toEqual(leafPaths(marketingExactSupportPolicyEn));
    expect(marketingExactSupportPolicyFr.exactSupportPolicy.highlights.items.map(({ id }) => id)).toEqual([
      'tickets',
      'resources',
      'priority',
      'security',
    ]);
    expect(marketingExactSupportPolicyFr.exactSupportPolicy.policy.sections.map(({ id }) => id)).toEqual([
      'channels',
      'coverage',
      'targets',
      'security',
    ]);
    expect(getMarketingExactSupportPolicyCopy('fr-CA').exactSupportPolicy.hero.title).toBe('Politique d’assistance');
    expect(getMarketingExactSupportPolicyCopy('de-DE').exactSupportPolicy.hero.title).toBe('Support Policy');
  });

  it('renders every support-policy section in professional French', () => {
    language = 'fr';

    renderPage();

    expect(screen.getByText('Assistance')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Politique d’assistance' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'L’assistance en un coup d’œil' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Fonctionnement de l’assistance E-Code' })).toBeTruthy();
    expect(screen.getAllByTestId(/^highlight-support-policy-/u)).toHaveLength(4);
    expect(screen.getAllByTestId(/^article-support-policy-/u)).toHaveLength(4);
    expect(screen.getByRole('heading', { level: 3, name: 'Comment obtenir de l’aide' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Périmètre de l’assistance' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Objectifs de réponse par offre' })).toBeTruthy();
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'Traitement prioritaire des signalements de sécurité et d’abus',
      }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Obtenez l’assistance adaptée' })).toBeTruthy();
    expect(screen.getByText(/réponse aux tickets sous quelques jours ouvrés/u)).toBeTruthy();
  });

  it('preserves destinations, brand, plan names and technical terms', () => {
    language = 'fr';

    renderPage();

    const primaryLinks = screen.getAllByRole('link', { name: 'Contacter l’assistance' });
    const secondaryLinks = screen.getAllByRole('link', { name: 'Consulter la documentation' });

    expect(primaryLinks).toHaveLength(2);
    expect(primaryLinks.every((link) => link.getAttribute('href') === '/support')).toBe(true);
    expect(secondaryLinks).toHaveLength(2);
    expect(secondaryLinks.every((link) => link.getAttribute('href') === '/docs')).toBe(true);
    expect(document.body.textContent).toContain('E-Code');
    expect(document.body.textContent).toContain('Starter');
    expect(document.body.textContent).toContain('Core / Pro');
    expect(document.body.textContent).toContain('Enterprise');
    expect(document.body.textContent).toContain('SLA');
    expect(document.body.textContent).toContain('IDE');
    expect(document.body.textContent).not.toContain('How to get help');
    expect(document.body.textContent).not.toContain('What support covers');
    expect(document.body.textContent).not.toContain('Response targets by plan');
    expect(document.body.textContent).not.toContain('Contact support');
    expect(document.body.textContent).not.toContain('Browse documentation');
    expect(document.querySelector('img')).toBeNull();
    expect([...document.querySelectorAll('svg')].every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(
      true,
    );
  });

  it('renders the complete English fallback for unsupported locales', () => {
    language = 'es-MX';

    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Support Policy' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'How to get help' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Response targets by plan' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Contact support' })[0]?.getAttribute('href')).toBe('/support');
  });

  it('emits localized French SEO, image alt, canonical and hreflang metadata', () => {
    const data = supportPolicyLoader(
      loaderArgs('https://e-code.ai/support-policy', {
        'Accept-Language': 'fr-FR, en;q=0.8',
      }),
    );

    const descriptors = supportPolicyMeta({ data } as Parameters<typeof supportPolicyMeta>[0]);

    expect(data.language).toBe('fr');
    expect(descriptors).toContainEqual({ title: 'Politique d’assistance — E-Code' });
    expect(descriptors).toContainEqual({
      name: 'description',
      content:
        'Découvrez le fonctionnement de l’assistance E-Code, les canaux à utiliser, son périmètre et les objectifs de réponse associés à chaque offre.',
    });
    expect(descriptors).toContainEqual({
      property: 'og:image:alt',
      content: 'Canaux, périmètre et objectifs de réponse de l’assistance E-Code',
    });
    expect(descriptors).toContainEqual({
      name: 'twitter:image:alt',
      content: 'Canaux, périmètre et objectifs de réponse de l’assistance E-Code',
    });
    expect(descriptors).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
    expect(descriptors).toContainEqual({ property: 'og:locale:alternate', content: 'en_US' });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://e-code.ai/support-policy',
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'en',
      href: 'https://e-code.ai/support-policy?lang=en',
    });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: 'https://e-code.ai/support-policy?lang=fr',
    });
  });

  it('lets an explicit English query override French browser detection for SEO', () => {
    const data = supportPolicyLoader(
      loaderArgs('https://e-code.ai/support-policy?lang=en', {
        'Accept-Language': 'fr-FR',
      }),
    );

    const descriptors = supportPolicyMeta({ data } as Parameters<typeof supportPolicyMeta>[0]);

    expect(data.language).toBe('en');
    expect(descriptors).toContainEqual({ title: 'Support Policy — E-Code' });
    expect(descriptors).toContainEqual({ property: 'og:locale', content: 'en_US' });
  });

  it('has zero scanner findings and explicit responsive, theme and accessibility safeguards', async () => {
    const sourcePath = 'app/routes/support-policy.tsx';
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
