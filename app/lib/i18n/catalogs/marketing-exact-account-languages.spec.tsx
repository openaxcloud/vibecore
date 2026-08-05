import { readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  formatMarketingExactAccountLanguagesInteger,
  getMarketingExactAccountLanguagesCopy,
  interpolateMarketingExactAccountLanguagesCopy,
  marketingExactAccountLanguagesEn,
  marketingExactAccountLanguagesFr,
} from './marketing-exact-account-languages';
import AccountInactivity from '~/components/marketing/ecode-exact/pages/AccountInactivity';
import Languages from '~/components/marketing/ecode-exact/pages/Languages';
import { createI18nInstance } from '~/lib/i18n/runtime';

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

function renderInFrench(node: ReactNode): string {
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

describe('exact account inactivity and languages marketing catalogs', () => {
  it('keeps complete EN/FR structural parity and English fallback', () => {
    expect(leafPaths(marketingExactAccountLanguagesFr)).toEqual(leafPaths(marketingExactAccountLanguagesEn));

    const fallback = getMarketingExactAccountLanguagesCopy('de-DE');

    expect(fallback.exactAccountInactivity.title).toBe('Account Inactivity Policy');
    expect(fallback.exactLanguages.hero.title).toBe('Build in any language');
    expect(getMarketingExactAccountLanguagesCopy('fr-FR').exactLanguages.hero.title).toBe(
      'Créez dans le langage de votre choix',
    );
  });

  it('formats locale-aware counts and preserves interpolation values', () => {
    expect(formatMarketingExactAccountLanguagesInteger(12_345, 'fr')).toMatch(/^12[\s\u202f]345$/u);
    expect(
      interpolateMarketingExactAccountLanguagesCopy(
        marketingExactAccountLanguagesFr.exactLanguages.languages.actionAria,
        { language: 'TypeScript' },
      ),
    ).toBe('Commencer à créer avec TypeScript');
    expect(
      interpolateMarketingExactAccountLanguagesCopy(marketingExactAccountLanguagesFr.exactLanguages.hero.badge, {
        count: '12',
      }),
    ).toBe('Plus de 12 langages, zéro configuration');
  });

  it('renders the complete account inactivity policy in French with its canonical contact and date', () => {
    const markup = renderInFrench(<AccountInactivity />);

    expect(markup).toContain('Politique d’inactivité du compte');
    expect(markup).toContain('Dernière mise à jour :');
    expect(markup).toContain('septembre 2025');
    expect(markup).toContain('1. Période d’inactivité');
    expect(markup).toContain('<strong>gratuit</strong>');
    expect(markup).toContain('<strong>un (1) an</strong>');
    expect(markup).toContain('4. Préavis et conservation de votre compte');
    expect(markup).toContain('href="mailto:support@e-code.ai"');
    expect(markup).not.toContain('Account Inactivity Policy');
    expect(markup).not.toContain('Last updated:');
    expect(markup).not.toContain('September 2025');
    expect(markup).not.toContain('Notice and keeping your account');
  });

  it('renders the complete languages page in French with contextual accessible actions', () => {
    const markup = renderInFrench(<Languages />);

    expect(markup).toContain('Créez dans le langage de votre choix');
    expect(markup).toContain('Plus de 12 langages, zéro configuration');
    expect(markup).toContain('Langages pris en charge');
    expect(markup).toContain('Données, IA et services applicatifs avec installation instantanée des paquets.');
    expect(markup).toContain('Frameworks et environnements d’exécution');
    expect(markup).toContain('Un espace de travail, toutes vos technologies');
    expect(markup).toContain('Choisissez un langage et commencez à créer');
    expect(markup).toContain('aria-label="Commencer à créer avec Python"');
    expect(markup).toContain('aria-label="Commencer à créer avec C++"');
    expect(markup).not.toContain('Build in any language');
    expect(markup).not.toContain('Supported languages');
    expect(markup).not.toContain('One workspace, every stack');
    expect(markup).not.toContain('Pick a language and start building');
  });

  it('renders every localized visible leaf and no replaced English leaf', () => {
    const pages = [
      [
        marketingExactAccountLanguagesEn.exactAccountInactivity,
        marketingExactAccountLanguagesFr.exactAccountInactivity,
        renderInFrench(<AccountInactivity />),
      ],
      [
        marketingExactAccountLanguagesEn.exactLanguages,
        marketingExactAccountLanguagesFr.exactLanguages,
        renderInFrench(<Languages />),
      ],
    ] as const;

    for (const [english, french, markup] of pages) {
      const visiblePairs = stringPairs(english, french).filter(
        (pair) =>
          !pair.path.startsWith('seo.') &&
          !pair.path.endsWith('.id') &&
          !pair.path.endsWith('.kind') &&
          !pair.path.endsWith('.name') &&
          !pair.path.endsWith('.address') &&
          pair.path !== 'hero.badge' &&
          pair.path !== 'languages.actionAria',
      );

      for (const pair of visiblePairs) {
        expect(markup, `missing French catalog leaf at ${pair.path}`).toContain(
          renderToStaticMarkup(<>{pair.french}</>),
        );

        if (pair.english !== pair.french && pair.english.trim().length >= 4) {
          expect(markup, `residual English catalog leaf at ${pair.path}`).not.toContain(
            renderToStaticMarkup(<>{pair.english}</>),
          );
        }
      }
    }
  });

  it('preserves programming identifiers, framework names, brands and email addresses', () => {
    const english = marketingExactAccountLanguagesEn;
    const french = marketingExactAccountLanguagesFr;

    expect(french.exactLanguages.languages.items.map(({ id, name }) => ({ id, name }))).toEqual(
      english.exactLanguages.languages.items.map(({ id, name }) => ({ id, name })),
    );
    expect(french.exactLanguages.frameworks.items.map(({ id, name }) => ({ id, name }))).toEqual(
      english.exactLanguages.frameworks.items.map(({ id, name }) => ({ id, name })),
    );

    const accountMarkup = renderInFrench(<AccountInactivity />);
    const languagesMarkup = renderInFrench(<Languages />);

    expect(accountMarkup).toContain('support@e-code.ai');
    expect(languagesMarkup).toContain('E-Code');
    expect(languagesMarkup).toContain('TypeScript');
    expect(languagesMarkup).toContain('C++');
    expect(languagesMarkup).toContain('.NET');
  });

  it('provides localized SEO copy for both route surfaces', () => {
    expect(marketingExactAccountLanguagesFr.exactAccountInactivity.seo).toEqual({
      title: 'Politique d’inactivité du compte — E-Code',
      description:
        'Découvrez dans quels cas un compte E-Code gratuit inactif peut être supprimé et comment maintenir votre compte actif.',
      imageAlt: 'Politique E-Code relative à l’inactivité des comptes et au préavis de suppression',
    });
    expect(marketingExactAccountLanguagesFr.exactLanguages.seo.title).toBe('Langages — E-Code');
    expect(marketingExactAccountLanguagesFr.exactLanguages.seo.description).toContain(
      'principaux langages de programmation',
    );
  });

  it('has zero scanner findings and explicit responsive, theme and accessibility safeguards', async () => {
    const sourcePaths = [
      'app/components/marketing/ecode-exact/pages/AccountInactivity.tsx',
      'app/components/marketing/ecode-exact/pages/Languages.tsx',
    ];

    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');

    for (const sourcePath of sourcePaths) {
      const source = readFileSync(sourcePath, 'utf8');
      const result = scanSource(source, sourcePath);

      expect(result.parseErrors, sourcePath).toEqual([]);
      expect(result.findings, sourcePath).toEqual([]);
    }

    const accountSource = readFileSync(sourcePaths[0], 'utf8');
    const languagesSource = readFileSync(sourcePaths[1], 'utf8');
    const source = `${accountSource}\n${languagesSource}`;

    expect(source).toContain('text-responsive-2xl');
    expect(source).toContain('break-words');
    expect(source).toContain('[overflow-wrap:anywhere]');
    expect(source).toContain('min-w-0');
    expect(source).toContain('grid-cols-1');
    expect(source).toContain('sm:grid-cols-2');
    expect(source).toContain('w-full');
    expect(source).toContain('sm:w-auto');
    expect(source).toContain('min-h-11');
    expect(source).toContain('dark:prose-invert');
    expect(source).toContain('bg-primary');
    expect(source).toContain('text-primary-foreground');
    expect(source).toContain('focus-visible:ring-2');
    expect(source).toContain('aria-hidden');
    expect(source).not.toMatch(/#[0-9a-f]{3,8}/iu);
  });
});
