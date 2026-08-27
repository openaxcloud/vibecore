import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  getMarketingSurfacePageCopy,
  marketingSurfacePageEnglish as marketingSurfacePageEn,
  marketingSurfacePageFrench as marketingSurfacePageFr,
} from './marketing-surface-pages';

import { EcodeSurfacePage, ecodeSurfacePages } from '~/components/marketing/EcodeSurfacePages';
import { createI18nInstance } from '~/lib/i18n/runtime';

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

describe('static marketing surface page catalog', () => {
  it('keeps all 62 English and French page records in exact structural parity', () => {
    expect(Object.keys(marketingSurfacePageEn)).toHaveLength(62);
    expect(Object.keys(marketingSurfacePageFr).sort()).toEqual(Object.keys(marketingSurfacePageEn).sort());

    for (const slug of Object.keys(marketingSurfacePageEn) as Array<keyof typeof marketingSurfacePageEn>) {
      const english = marketingSurfacePageEn[slug];
      const french = marketingSurfacePageFr[slug];

      expect(french.highlights, slug).toHaveLength(english.highlights.length);
      expect(Object.hasOwn(french, 'secondaryActionLabel'), slug).toBe(Object.hasOwn(english, 'secondaryActionLabel'));
    }
  });

  it('resolves French, English fallback and unknown static slugs safely', () => {
    expect(getMarketingSurfacePageCopy('fr-CA', 'new')?.title).toBe('Nouveau projet E-Code');
    expect(getMarketingSurfacePageCopy('de', 'new')?.title).toBe('New E-Code Project');
    expect(getMarketingSurfacePageCopy('fr', 'route-inconnue')).toBeUndefined();
  });

  it('contains no accidentally unchanged English copy outside approved technical or brand terms', () => {
    const approvedInvariants = new Set([
      'Assistant',
      'Badges',
      'Console',
      'Cycles',
      'E-Code',
      'Extensions',
      'Feature flags',
      'Migrations',
      'Notifications',
      'OAuth',
      'Powerups',
      'SAML/OIDC',
      'SCIM',
      'SalesforcePro CRM',
      'Secrets',
      'Shell',
      'SolarTech AI Chat',
      'SolarTech CRM',
      'SolarTech Fortune 500 Store',
    ]);

    for (const slug of Object.keys(marketingSurfacePageEn) as Array<keyof typeof marketingSurfacePageEn>) {
      const english = marketingSurfacePageEn[slug];
      const french = marketingSurfacePageFr[slug];
      const englishValues = [english.title, english.description, ...english.highlights];
      const frenchValues = [french.title, french.description, ...french.highlights];

      englishValues.forEach((value, index) => {
        if (value === frenchValues[index]) {
          expect(approvedInvariants, `${slug}: ${value}`).toContain(value);
        }
      });
    }
  });

  it('renders localized page content across builder, runtime, security, data and AI categories', () => {
    const cases = [
      {
        page: ecodeSurfacePages.new,
        french: 'Cahier des charges en langage naturel',
        english: 'Natural-language brief',
      },
      {
        page: ecodeSurfacePages['runtime-diagnostics'],
        french: 'Récupération après erreur',
        english: 'Error recovery',
      },
      {
        page: ecodeSurfacePages['security-scanner'],
        french: 'Analyseur de sécurité',
        english: 'Security Scanner',
      },
      {
        page: ecodeSurfacePages.database,
        french: 'Conception du schéma',
        english: 'Schema design',
      },
      {
        page: ecodeSurfacePages['agent-activity'],
        french: 'Synthèses des patchs',
        english: 'Patch summaries',
      },
    ];

    for (const { page, french, english } of cases) {
      const html = renderInFrench(<EcodeSurfacePage page={page} />);

      expect(html).toContain(french);
      expect(html).not.toContain(english);
    }
  });

  it('localizes the custom plans secondary action without changing its route', () => {
    const html = renderInFrench(<EcodeSurfacePage page={ecodeSurfacePages.plans} />);

    expect(html).toContain('Voir les tarifs');
    expect(html).not.toContain('View pricing');
    expect(ecodeSurfacePages.plans.secondaryAction[1]).toBe('/pricing');
    expect(ecodeSurfacePages.plans.slug).toBe('plans');
  });
});
