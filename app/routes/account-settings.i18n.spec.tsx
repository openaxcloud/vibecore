/**
 * @vitest-environment jsdom
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

const routeState = vi.hoisted(() => ({ language: 'fr' }));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    Outlet: () => <div data-testid="account-settings-outlet" />,
    useLoaderData: () => ({ language: routeState.language }),
  };
});

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  AppShell: ({ title, description, children }: { title: string; description: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </main>
  ),
}));

import AccountSettingsLayout, { meta } from './account-settings';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderLayout() {
  const i18n = createI18nInstance('fr');

  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/account-settings/data']}>
        <AccountSettingsLayout />
      </MemoryRouter>
    </I18nextProvider>,
  );

  return i18n;
}

afterEach(() => cleanup());

describe('account settings layout i18n', () => {
  it('localizes metadata, shell and every tab in French and switches live', async () => {
    const tags = meta({ data: { language: 'fr' }, matches: [] } as never);

    expect(tags).toContainEqual({ title: 'Paramètres du compte — E-Code' });
    expect(tags).toContainEqual(
      expect.objectContaining({ name: 'description', content: expect.stringContaining('comptes connectés') }),
    );

    const i18n = renderLayout();

    expect(screen.getByRole('heading', { level: 1, name: 'Compte' })).toBeTruthy();
    expect(screen.getByText('Profil, comptes connectés, données et confidentialité de votre compte.')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Paramètres du compte' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Compte' }).getAttribute('href')).toBe('/account-settings');
    expect(screen.getByRole('link', { name: 'Comptes connectés' }).getAttribute('href')).toBe(
      '/account-settings/connected',
    );
    expect(screen.getByRole('link', { name: 'Données et confidentialité' }).getAttribute('href')).toBe(
      '/account-settings/data',
    );
    expect(screen.queryByText('Data & privacy')).toBeNull();

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Connected accounts' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Data & privacy' })).toBeTruthy();
  });

  it('keeps account destinations as native links that can wrap on narrow screens', () => {
    renderLayout();

    const tablist = screen.getByRole('navigation', { name: 'Paramètres du compte' });
    const dataTab = screen.getByRole('link', { name: 'Données et confidentialité' });

    expect(tablist.className).toContain('flex-wrap');
    expect(dataTab.className).toContain('min-w-0');
    expect(dataTab.className).toContain('whitespace-normal');
    expect(dataTab.className).not.toContain('truncate');
    expect(dataTab.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Compte' }).getAttribute('aria-current')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});
