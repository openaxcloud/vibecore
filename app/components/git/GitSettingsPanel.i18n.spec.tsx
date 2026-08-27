/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('react-toastify', () => ({ toast: toastMocks }));
vi.mock('~/lib/chat/use-connector-popup', () => ({
  useConnectorPopup: () => ({
    state: { phase: 'idle' as const },
    launch: vi.fn(),
    reset: vi.fn(),
  }),
}));

import { GitSettingsPanel } from './GitSettingsPanel';
import {
  formatGitSettingsCopy,
  getGitSettingsCopy,
  getGitSettingsErrorMessage,
} from '~/lib/i18n/catalogs/git-settings';
import { createI18nInstance } from '~/lib/i18n/runtime';

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => '',
  } as Response;
}

describe('Git settings i18n', () => {
  beforeEach(() => {
    toastMocks.error.mockReset();
    toastMocks.success.mockReset();
    localStorage.clear();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === '/api/git/connections') {
          return jsonResponse({ connections: [] });
        }

        if (url.endsWith('/ide-panel/terminal')) {
          return jsonResponse({ data: { terminalState: { sshConnections: [] } } });
        }

        if (url.endsWith('/files/.gitignore')) {
          return jsonResponse({});
        }

        if (url.endsWith('/ide-panel/git') && init?.method === 'POST') {
          return jsonResponse({ error: 'Raw backend English detail' }, false, 500);
        }

        return jsonResponse({});
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('falls back to English and masks raw errors in French', () => {
    const english = getGitSettingsCopy('de');
    const french = getGitSettingsCopy('fr-FR');

    expect(english['gitSettings.panel.title']).toBe('Git settings');
    expect(french['gitSettings.panel.title']).toBe('Paramètres Git');
    expect(
      formatGitSettingsCopy(french['gitSettings.toast.providerConnected'], {
        provider: 'GitHub',
        account: 'octocat',
      }),
    ).toBe('GitHub est connecté avec le compte octocat');
    expect(getGitSettingsErrorMessage('fr', new Error('Raw backend English detail'), 'Erreur localisée')).toBe(
      'Erreur localisée',
    );
    expect(getGitSettingsErrorMessage('en', new Error('Server detail'), 'Fallback')).toBe('Server detail');
  });

  it('renders the complete panel chrome in French while preserving Git brands and identifiers', async () => {
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <GitSettingsPanel projectId="project-1" onClose={() => undefined} />
      </I18nextProvider>,
    );

    expect(screen.getByLabelText('Paramètres Git')).toBeTruthy();
    expect(screen.getByText('Dépôt distant')).toBeTruthy();
    expect(screen.getByText('Connexions')).toBeTruthy();
    expect(screen.getByText('Clés SSH')).toBeTruthy();
    expect(screen.getByText('Auteur des commits')).toBeTruthy();
    expect(screen.getByText('GitHub')).toBeTruthy();
    expect(screen.getByPlaceholderText('main')).toBeTruthy();
    expect(await screen.findByText('Aucune clé SSH pour le moment.')).toBeTruthy();
    expect(screen.queryByText('Git settings')).toBeNull();
    expect(screen.queryByText('Connections')).toBeNull();
    expect(screen.queryByText('No SSH keys yet.')).toBeNull();
  });

  it('does not expose a raw API error when saving a remote in French', async () => {
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <GitSettingsPanel projectId="project-1" onClose={() => undefined} />
      </I18nextProvider>,
    );

    fireEvent.change(screen.getByLabelText('URL du dépôt distant origin'), {
      target: { value: 'git@github.com:openaxcloud/vibecore.git' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith('Impossible d’enregistrer ce dépôt distant Git.'),
    );
    expect(toastMocks.error).not.toHaveBeenCalledWith('Raw backend English detail');
  });
});
