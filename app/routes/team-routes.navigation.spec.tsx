/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Request as FetchRequest } from 'node-fetch';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/components/enterprise/EnterpriseFormPage', () => ({
  EnterpriseFormPage: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));

vi.mock('~/components/teams/TeamAccessLogPanel', () => ({
  TeamAccessLogPanel: ({ basePath }: { basePath: string }) => <section data-testid="access-log">{basePath}</section>,
}));

import TeamAccessLogRoute from './teams.$id';
import TeamSettingsRoute from './teams.$id.settings';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const teamPath = '/teams/synthetic-team';

const data = (basePath: string) => ({
  language: 'en',
  teamId: 'synthetic-team',
  basePath,
  entries: [],
  listError: false,
  forbidden: false,
});

function renderTeamRoute(initialPath: string) {
  vi.stubGlobal('Request', FetchRequest);

  const router = createMemoryRouter(
    [
      {
        path: '/teams/:id',
        loader: () => data(teamPath),
        Component: TeamAccessLogRoute,
        HydrateFallback: () => null,
        children: [
          {
            path: 'settings',
            loader: () => data(`${teamPath}/settings`),
            Component: TeamSettingsRoute,
          },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  );

  render(
    <I18nextProvider i18n={createI18nInstance('en')}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );

  return router;
}

describe('nested team route navigation', () => {
  it('renders the settings child and its loader data on direct entry, with one shell', async () => {
    renderTeamRoute(`${teamPath}/settings`);

    expect(await screen.findByRole('heading', { name: 'Team settings' })).toBeTruthy();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByTestId('access-log')).toHaveLength(1);
    expect(screen.getByTestId('access-log').textContent).toBe(`${teamPath}/settings`);
    expect(screen.queryByRole('heading', { name: 'Team access log' })).toBeNull();
  });

  it('opens settings through its real link and restores the overview through browser history', async () => {
    const router = renderTeamRoute(teamPath);

    await screen.findByRole('heading', { name: 'Team access log' });
    fireEvent.click(screen.getByRole('link', { name: 'Open team settings' }));
    expect(await screen.findByRole('heading', { name: 'Team settings' })).toBeTruthy();
    expect(router.state.location.pathname).toBe(`${teamPath}/settings`);
    expect(screen.getAllByRole('main')).toHaveLength(1);

    await act(async () => {
      await router.navigate(-1);
    });

    expect(await screen.findByRole('heading', { name: 'Team access log' })).toBeTruthy();
    expect(router.state.location.pathname).toBe(teamPath);
    expect(screen.getByTestId('access-log').textContent).toBe(teamPath);
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });
});
