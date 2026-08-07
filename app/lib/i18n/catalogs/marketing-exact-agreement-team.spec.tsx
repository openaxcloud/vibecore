import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  getMarketingExactAgreementTeamCopy,
  marketingExactAgreementTeamEn,
  marketingExactAgreementTeamFr,
} from './marketing-exact-agreement-team';

import CommercialAgreement from '~/components/marketing/ecode-exact/pages/CommercialAgreement';
import PublicTeamPage from '~/components/marketing/ecode-exact/pages/PublicTeamPage';
import { createI18nInstance } from '~/lib/i18n/runtime';
import { loader as rootLoader } from '~/root';
import { loader as commercialAgreementLoader, meta as commercialAgreementMeta } from '~/routes/commercial-agreement';
import { loader as teamLoader, meta as teamMeta } from '~/routes/marketing.teams';

function leafPaths(value: unknown, path: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leafPaths(item, [...path, String(index)]));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => leafPaths(item, [...path, key]));
  }

  return [path.join('.')];
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

describe('exact commercial agreement and team catalogs', () => {
  it('keeps complete EN/FR structural parity', () => {
    expect(leafPaths(marketingExactAgreementTeamFr)).toEqual(leafPaths(marketingExactAgreementTeamEn));
  });

  it('falls back to English for unsupported locales', () => {
    const fallback = getMarketingExactAgreementTeamCopy('de');

    expect(fallback.exactCommercialAgreement.title).toBe('Commercial Agreement');
    expect(fallback.exactTeam.hero.title).toBe('Build Together, Ship Faster');
  });

  it('renders the complete Commercial Agreement in French with a localized legal date', () => {
    const markup = renderInFrench(<CommercialAgreement />);

    expect(markup).toContain('Accord commercial');
    expect(markup).toContain('1. Champ d’application');
    expect(markup).toContain('10. Contact');
    expect(markup).toContain('septembre 2025');
    expect(markup).toContain('Snatch Group Limited');
    expect(markup).not.toContain('Commercial Agreement');
    expect(markup).not.toContain('September 2025');
  });

  it('renders the complete team page in French without its English headline', () => {
    const markup = renderInFrench(<PublicTeamPage />);

    expect(markup).toContain('Créez ensemble, livrez plus vite');
    expect(markup).toContain('Tout ce dont votre équipe a besoin');
    expect(markup).toContain('Établissements d’enseignement');
    expect(markup).toContain('Prêts à transformer le travail de votre équipe ?');
    expect(markup).not.toContain('Build Together, Ship Faster');
  });

  it('preserves brands, technical terms, URLs and names', () => {
    const agreement = renderInFrench(<CommercialAgreement />);
    const team = renderInFrench(<PublicTeamPage />);

    expect(agreement).toContain('legal@e-code.ai');
    expect(team).toContain('Git');
    expect(team).toContain('SSO');
    expect(team).toContain('Sarah Chen');
    expect(team).toContain('Tech University');
  });

  it.each([
    [
      commercialAgreementLoader,
      commercialAgreementMeta,
      'https://e-code.ai/commercial-agreement',
      'Accord commercial — E-Code',
    ],
    [teamLoader, teamMeta, 'https://e-code.ai/marketing/teams', 'Équipes — E-Code'],
  ])('serves localized route metadata', (loader, meta, url, title) => {
    const data = loader({ request: new Request(`${url}?lang=fr`) } as never);
    const tags = meta({ data } as never);

    expect(data.language).toBe('fr');
    expect(tags).toEqual(expect.arrayContaining([{ title }]));
    expect(tags).toEqual(expect.arrayContaining([expect.objectContaining({ property: 'og:title', content: title })]));
    expect(tags).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'twitter:description' })]));
    expect(tags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'twitter:image:alt', content: expect.stringContaining('créez') }),
      ]),
    );
  });

  it.each(['/commercial-agreement', '/marketing/teams'])('inherits canonical and en/fr alternates for %s', (path) => {
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
});
