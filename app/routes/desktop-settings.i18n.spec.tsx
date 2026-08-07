/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  AppShell: ({ title, description, children }: { title: string; description: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </main>
  ),
  StatGrid: ({ stats }: { stats: Array<{ label: string; value: string; detail?: string }> }) => (
    <dl>
      {stats.map((stat) => (
        <div key={stat.label}>
          <dt>{stat.label}</dt>
          <dd>{stat.value}</dd>
          <dd>{stat.detail}</dd>
        </div>
      ))}
    </dl>
  ),
}));

vi.mock('~/components/dashboard/AsyncPanelState', () => ({
  AsyncPanelSkeleton: ({ label }: { label: string }) => <section aria-label={label} />,
  AsyncPanelError: ({ title, description, onRetry }: { title: string; description: string; onRetry: () => void }) => (
    <section role="alert">
      <h2>{title}</h2>
      <p>{description}</p>
      <button type="button" onClick={onRetry}>
        Réessayer
      </button>
    </section>
  ),
}));

vi.mock('~/components/ui/EmptyState', () => ({
  EmptyState: ({
    title,
    description,
    actionLabel,
    to,
  }: {
    title: string;
    description: string;
    actionLabel: string;
    to: string;
  }) => (
    <section>
      <h2>{title}</h2>
      <p>{description}</p>
      <a href={to}>{actionLabel}</a>
    </section>
  ),
}));

import DesktopSettingsRoute, { meta } from './desktop-settings';
import { getDesktopSettingsCopy } from '~/lib/i18n/catalogs/desktop-settings';
import { createI18nInstance } from '~/lib/i18n/runtime';

type Bridge = NonNullable<typeof window.vibecoreDesktop>;

function makeBridge(options: { failLoad?: boolean } = {}) {
  const settingsSet = vi.fn(async () => ({ ok: true }));
  const notificationShow = vi.fn(async () => ({ shown: true, supported: true }));
  const openLocalFolder = vi.fn(async () => '/Users/avi/E-Code');

  const bridge = {
    settings: {
      get: options.failLoad
        ? vi.fn(async () => {
            throw new Error('IPC channel disappeared');
          })
        : vi.fn(async () => ({
            proxy: { mode: 'manual', server: 'http://proxy.customer.example:8080' },
            trayEnabled: false,
            devicePolicy: { managed: true, source: 'organization-policy' },
          })),
      set: settingsSet,
    },
    auth: {
      get: vi.fn(async () => ({ encryptionAvailable: true, token: 'secret-token-never-rendered' })),
      set: vi.fn(),
      clear: vi.fn(),
    },
    notifications: { show: notificationShow },
    files: { openLocalFolder, importZip: vi.fn(), exportZip: vi.fn() },
    network: { status: vi.fn() },
    crashReporting: { status: vi.fn() },
    onDeepLink: vi.fn(),
    onMenuAction: vi.fn(),
  } as unknown as Bridge;

  return { bridge, settingsSet, notificationShow, openLocalFolder };
}

function renderRoute(language: 'en' | 'fr' = 'fr') {
  const i18n = createI18nInstance(language);

  return {
    i18n,
    ...render(
      <I18nextProvider i18n={i18n}>
        <DesktopSettingsRoute />
      </I18nextProvider>,
    ),
  };
}

afterEach(() => {
  cleanup();
  delete window.vibecoreDesktop;
  vi.restoreAllMocks();
});

describe('desktop settings i18n', () => {
  it('falls back to English and localizes metadata', () => {
    expect(getDesktopSettingsCopy('de')['desktopSettings.title']).toBe('Desktop settings');
    expect(meta({ matches: [{ id: 'root', data: { language: 'fr' } }] } as never)).toEqual([
      { title: 'Paramètres de l’application de bureau - E-Code' },
    ]);
  });

  it('renders a French native-app empty state when the desktop bridge is absent', async () => {
    renderRoute();

    expect(await screen.findByRole('heading', { name: 'Disponible dans l’application de bureau E-Code' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Obtenir l’application de bureau' }).getAttribute('href')).toBe('/desktop');
    expect(screen.queryByText('Available in the E-Code desktop app')).toBeNull();
  });

  it('renders every ready-state control in French and preserves technical values', async () => {
    const { bridge, notificationShow, settingsSet, openLocalFolder } = makeBridge();
    window.vibecoreDesktop = bridge;

    const { i18n } = renderRoute();

    expect(await screen.findByText('Connexion à l’application de bureau')).toBeTruthy();
    expect(screen.getByDisplayValue('http://proxy.customer.example:8080')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Système' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Direct' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Manuel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Activer la zone de notification' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tester la notification' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ouvrir un dossier local' })).toBeTruthy();
    expect(screen.getByText('Géré par l’organisation')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Paramètres de l’application de bureau chargés.');

    fireEvent.click(screen.getByRole('button', { name: 'Tester la notification' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Notification de test envoyée.'));
    expect(notificationShow).toHaveBeenCalledWith({
      title: 'E-Code',
      body: 'Les notifications natives sont activées.',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Activer la zone de notification' }));
    await waitFor(() => expect(settingsSet).toHaveBeenCalledWith(expect.objectContaining({ trayEnabled: true })));

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir un dossier local' }));
    await waitFor(() => expect(openLocalFolder).toHaveBeenCalledOnce());

    await act(() => i18n.changeLanguage('en'));
    expect(screen.getByRole('heading', { name: 'Desktop settings' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Folder selected.');
  });

  it('renders a safe French recovery state instead of the raw bridge failure', async () => {
    const { bridge } = makeBridge({ failLoad: true });
    window.vibecoreDesktop = bridge;
    renderRoute();

    expect(
      await screen.findByRole('heading', { name: 'Impossible de charger les paramètres de l’application de bureau' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
    expect(screen.queryByText('IPC channel disappeared')).toBeNull();
  });
});
