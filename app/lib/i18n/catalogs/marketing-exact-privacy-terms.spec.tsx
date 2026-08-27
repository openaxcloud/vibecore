import { readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  getMarketingExactPrivacyTermsCopy,
  marketingExactPrivacyTermsEn,
  marketingExactPrivacyTermsFr,
} from './marketing-exact-privacy-terms';

import Legal from '~/components/marketing/ecode-exact/pages/Legal';
import Privacy from '~/components/marketing/ecode-exact/pages/Privacy';
import Terms from '~/components/marketing/ecode-exact/pages/Terms';
import { formatLegalMonthYear } from '~/lib/i18n/legal-date';
import { createI18nInstance } from '~/lib/i18n/runtime';
import { LEGAL_DATES } from '~/lib/legal-dates';
import { loader as rootLoader } from '~/root';
import { loader as legalLoader, meta as legalMeta } from '~/routes/legal';
import { loader as privacyLoader, meta as privacyMeta } from '~/routes/privacy';
import { loader as termsLoader, meta as termsMeta } from '~/routes/terms';

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

function visibleTextPattern(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u');
}

function dataOf<T>(result: unknown): T {
  return result && typeof result === 'object' && 'data' in result ? (result as { data: T }).data : (result as T);
}

function renderInFrench(node: ReactNode) {
  const router = createMemoryRouter([{ path: '*', element: node }], { initialEntries: ['/'] });
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  try {
    return renderToStaticMarkup(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <RouterProvider router={router} />
      </I18nextProvider>,
    );
  } finally {
    consoleError.mockRestore();
  }
}

describe('exact privacy, terms and legal marketing catalogs', () => {
  it('keeps complete EN/FR structural parity', () => {
    expect(leafPaths(marketingExactPrivacyTermsFr)).toEqual(leafPaths(marketingExactPrivacyTermsEn));
  });

  it('falls back to English for unsupported locales', () => {
    const fallback = getMarketingExactPrivacyTermsCopy('de-DE');

    expect(fallback.exactPrivacy.title).toBe('Privacy Policy');
    expect(fallback.exactTerms.title).toBe('Terms of Service');
    expect(fallback.exactLegal.hero.title).toBe('Legal resources');
  });

  it('formats canonical legal dates for the active locale', () => {
    expect(formatLegalMonthYear(LEGAL_DATES.privacy, 'en')).toBe('September 2025');
    expect(formatLegalMonthYear(LEGAL_DATES.privacy, 'fr')).toBe('septembre 2025');
    expect(formatLegalMonthYear(LEGAL_DATES.terms, 'fr-FR')).toBe('septembre 2025');
  });

  it('renders the complete Privacy Policy in French', () => {
    const markup = renderInFrench(<Privacy />);

    expect(markup).toContain('Politique de confidentialité');
    expect(markup).toContain('septembre 2025');
    expect(markup).toContain('Informations que nous collectons');
    expect(markup).toContain('Partage des informations');
    expect(markup).toContain('Obtenir la portabilité de vos données');
    expect(markup).not.toContain('Privacy Policy');
    expect(markup).not.toContain('Information We Collect');
    expect(markup).not.toContain('September 2025');
  });

  it('renders the complete Terms of Service in French', () => {
    const markup = renderInFrench(<Terms />);

    expect(markup).toContain('Conditions d’utilisation');
    expect(markup).toContain('septembre 2025');
    expect(markup).toContain('1. Acceptation des conditions');
    expect(markup).toContain('4. Utilisations interdites');
    expect(markup).toContain('8. Exclusion de garanties');
    expect(markup).not.toContain('Terms of Service');
    expect(markup).not.toContain('Acceptance of Terms');
    expect(markup).not.toContain('September 2025');
  });

  it('renders the complete Legal Center in French', () => {
    const markup = renderInFrench(<Legal />);

    expect(markup).toContain('Ressources juridiques');
    expect(markup).toContain('Sous-traitants ultérieurs');
    expect(markup).toContain('Accord de traitement des données des élèves');
    expect(markup).toContain('Politique d’application des règles');
    expect(markup).toContain('Consulter le document');
    expect(markup).not.toContain('Legal resources');
    expect(markup).not.toContain('View document');
    expect(markup).not.toContain('Need legal help?');
  });

  it('renders every localized page leaf and no replaced English leaf', () => {
    const pages = [
      [
        marketingExactPrivacyTermsEn.exactPrivacy,
        marketingExactPrivacyTermsFr.exactPrivacy,
        renderInFrench(<Privacy />),
      ],
      [marketingExactPrivacyTermsEn.exactTerms, marketingExactPrivacyTermsFr.exactTerms, renderInFrench(<Terms />)],
      [marketingExactPrivacyTermsEn.exactLegal, marketingExactPrivacyTermsFr.exactLegal, renderInFrench(<Legal />)],
    ] as const;

    for (const [english, french, markup] of pages) {
      const visiblePairs = stringPairs(english, french).filter(
        (pair) => !pair.path.startsWith('seo.') && !pair.path.endsWith('.id'),
      );

      for (const pair of visiblePairs) {
        expect(markup, `missing French catalog leaf at ${pair.path}`).toContain(
          renderToStaticMarkup(<>{pair.french}</>),
        );

        if (pair.english !== pair.french) {
          expect(markup, `residual English catalog leaf at ${pair.path}`).not.toMatch(
            visibleTextPattern(renderToStaticMarkup(<>{pair.english}</>)),
          );
        }
      }
    }
  });

  it('preserves legal entity data, email addresses, brands and stable document links', () => {
    const privacy = renderInFrench(<Privacy />);
    const terms = renderInFrench(<Terms />);
    const legal = renderInFrench(<Legal />);

    expect(privacy).toContain('E-Code.AI (Snatch Group Limited)');
    expect(privacy).toContain('privacy@e-code.ai');
    expect(privacy).toContain('Abba Eban 8 Blvd, 46120 Herzliya Pituach, Israel');
    expect(terms).toContain('mailto:privacy@e-code.ai');
    expect(legal).toContain('mailto:legal@e-code.ai');
    expect(legal).toContain('DPA');

    for (const href of [
      '/terms',
      '/privacy',
      '/subprocessors',
      '/dpa',
      '/student-dpa',
      '/security',
      '/acceptable-use',
      '/enforcement',
      '/licensing',
      '/account-inactivity',
      '/data-deletion',
      '/report-abuse',
    ]) {
      expect(legal).toContain(`href="${href}"`);
    }
  });

  it('keeps long legal copy responsive and uses semantic light/dark theme tokens', () => {
    const componentSources = [
      '../../../components/marketing/ecode-exact/pages/Privacy.tsx',
      '../../../components/marketing/ecode-exact/pages/Terms.tsx',
      '../../../components/marketing/ecode-exact/pages/Legal.tsx',
    ].map((relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8'));

    const source = componentSources.join('\n');

    expect(source).toContain('text-responsive-2xl');
    expect(source).toContain('break-words');
    expect(source).toContain('min-w-0');
    expect(source).toContain('sm:pl-6');
    expect(source).toContain('w-full');
    expect(source).toContain('sm:w-auto');
    expect(source).toContain('border-border');
    expect(source).toContain('bg-muted');
    expect(source).toContain('bg-surface-solid');
    expect(source).toContain('dark:prose-invert');
    expect(source).not.toContain('border-white/');
    expect(source).not.toContain('bg-black');
  });

  it.each([
    [privacyLoader, privacyMeta, 'https://e-code.ai/privacy', marketingExactPrivacyTermsFr.exactPrivacy.seo],
    [termsLoader, termsMeta, 'https://e-code.ai/terms', marketingExactPrivacyTermsFr.exactTerms.seo],
    [legalLoader, legalMeta, 'https://e-code.ai/legal', marketingExactPrivacyTermsFr.exactLegal.seo],
  ])('serves localized route metadata', (loader, meta, url, seo) => {
    const data = loader({ request: new Request(`${url}?lang=fr`) } as never);
    const tags = meta({ data } as never);

    expect(data.language).toBe('fr');
    expect(tags).toEqual(expect.arrayContaining([{ title: seo.title }]));
    expect(tags).toEqual(expect.arrayContaining([{ name: 'description', content: seo.description }]));
    expect(tags).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'og:title', content: seo.title })]),
    );
    expect(tags).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'og:description', content: seo.description })]),
    );
    expect(tags).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'twitter:description', content: seo.description })]),
    );
    expect(tags).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'twitter:image:alt', content: seo.imageAlt })]),
    );
  });

  it.each(['/privacy', '/terms', '/legal'])('inherits canonical and en/fr alternates for %s', (path) => {
    const result = rootLoader({
      request: new Request(`https://e-code.ai${path}?lang=fr`),
      params: {},
      context: {},
    });

    const data = dataOf<{ seo: { canonical: string; english: string; french: string } }>(result);

    expect(data.seo).toEqual({
      canonical: `https://e-code.ai${path}`,
      english: `https://e-code.ai${path}`,
      french: `https://e-code.ai${path}?lang=fr`,
    });
  });

  it('leaves no hard-coded visible source copy in the three pages or routes', async () => {
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');

    const files = [
      '../../../components/marketing/ecode-exact/pages/Privacy.tsx',
      '../../../components/marketing/ecode-exact/pages/Terms.tsx',
      '../../../components/marketing/ecode-exact/pages/Legal.tsx',
      '../../../routes/privacy.tsx',
      '../../../routes/terms.tsx',
      '../../../routes/legal.tsx',
    ];

    for (const relativePath of files) {
      const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      const result = scanSource(source, relativePath);

      expect(result.parseErrors, relativePath).toEqual([]);
      expect(result.findings, relativePath).toEqual([]);
    }
  });
});
