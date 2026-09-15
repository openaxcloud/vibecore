/**
 * @vitest-environment jsdom
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const routeState = vi.hoisted(() => ({ language: 'fr' }));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    NavLink: ({
      children,
      className,
      to,
    }: {
      children: ReactNode;
      className?: string | ((state: { isActive: boolean }) => string);
      to: string;
    }) => (
      <a
        href={to}
        className={typeof className === 'function' ? className({ isActive: to.endsWith('/data') }) : className}
      >
        {children}
      </a>
    ),
    Outlet: () => <div data-testid="account-settings-outlet" />,
    useLoaderData: () => ({ language: routeState.language }),

    /*
     * L'onglet actif (aria-selected) est dérivé du pathname — cohérent avec le
     * mock NavLink ci-dessus (isActive = /data).
     */
    useLocation: () => ({ pathname: '/account-settings/data' }),
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
      <AccountSettingsLayout />
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
    expect(screen.getByRole('tablist', { name: 'Paramètres du compte' })).toBeTruthy();
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

  it('keeps long French tabs scrollable without truncation on narrow screens', () => {
    renderLayout();

    const tablist = screen.getByRole('tablist', { name: 'Paramètres du compte' });
    const dataTab = screen.getByRole('link', { name: 'Données et confidentialité' });

    expect(tablist.className).toContain('overflow-x-auto');
    expect(dataTab.className).toContain('shrink-0');
    expect(dataTab.className).toContain('whitespace-nowrap');
    expect(dataTab.className).not.toContain('truncate');
  });
});
