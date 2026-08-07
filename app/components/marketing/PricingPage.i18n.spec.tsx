/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  PublicShell: ({ children }: { children: ReactNode }) => <div data-testid="public-shell">{children}</div>,
}));

import { EcodePricingPage } from './EcodeProductMarketingPages';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(cleanup);

describe('localized Pricing page behavior', () => {
  it('switches billing periods and languages without clipping critical controls', async () => {
    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <EcodePricingPage />
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Des tarifs qui évoluent');
    expect(screen.getByRole('group', { name: 'Période de facturation' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Comparaison détaillée des offres tarifaires E-Code' })).toBeTruthy();

    const annual = screen.getByRole('button', { name: 'Afficher les tarifs annuels' });
    fireEvent.click(annual);

    expect(annual.getAttribute('aria-pressed')).toBe('true');
    expect(
      screen.getAllByText(/facturé annuellement/u).some((item) => /240[\u00a0\u202f]€/u.test(item.textContent ?? '')),
    ).toBe(true);

    const contactLinks = screen.getAllByRole('link', { name: 'Contacter l’équipe commerciale' });
    expect(contactLinks.length).toBeGreaterThan(0);
    expect(contactLinks.every((link) => link.className.includes('min-h-11'))).toBe(true);

    await i18n.changeLanguage('en');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Pricing that scales');
    });

    expect(screen.getByRole('group', { name: 'Billing period' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show annual pricing' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText('Des tarifs qui évoluent')).toBeNull();
  });
});
