/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ECODE_MARKETING_BRAND,
  PublicMarketingFooter,
  PublicMarketingHeader,
  publicCompareLinks,
  publicFooterActionLinks,
  publicFooterColumns,
  publicMarketingMenus,
} from './SaaSLayout';
import { legacyMarketingKeyByEnglish } from '~/lib/i18n/catalogs/legacy-marketing';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderFrench(element: React.ReactNode): void {
  render(
    <I18nextProvider i18n={createI18nInstance('fr')}>
      <MemoryRouter>{element}</MemoryRouter>
    </I18nextProvider>,
  );
}

afterEach(cleanup);

describe('legacy public marketing chrome i18n', () => {
  it('maps every exported piece of visible English copy to a catalog key', () => {
    const copies = [
      ECODE_MARKETING_BRAND.tagline,
      ECODE_MARKETING_BRAND.description,
      ...Object.values(publicMarketingMenus).flatMap((items) =>
        items.flatMap(([title, , description]) => [title, description]),
      ),
      ...publicFooterColumns.flatMap((column) => [column.title, ...column.links.map(([label]) => label)]),
      ...publicFooterActionLinks.map(([label]) => label),
      ...publicCompareLinks.map(([label]) => label),
    ];

    expect(copies.filter((copy) => !legacyMarketingKeyByEnglish[copy])).toEqual([]);
  });

  it('renders the header and footer in professional French', () => {
    renderFrench(
      <>
        <PublicMarketingHeader />
        <PublicMarketingFooter />
      </>,
    );

    expect(screen.getAllByText('Tarifs').length).toBeGreaterThan(0);
    expect(screen.getByText('Se connecter')).toBeInTheDocument();
    expect(screen.getByText('Parler à l’équipe commerciale')).toBeInTheDocument();
    expect(screen.getByText(/Tous droits réservés/)).toBeInTheDocument();
    expect(screen.queryByText('Pricing')).not.toBeInTheDocument();
    expect(screen.queryByText('Talk to sales')).not.toBeInTheDocument();
    expect(screen.queryByText(/All rights reserved/)).not.toBeInTheDocument();
  });
});
