/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GitHubOauthConnectButton } from './GitHubOauthConnectButton';

const mocks = vi.hoisted(() => ({
  initializeGitHubConnection: vi.fn(),
  logError: vi.fn(),
  logSystem: vi.fn(),
}));

let language = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

vi.mock('~/lib/stores/github', () => ({
  initializeGitHubConnection: mocks.initializeGitHubConnection,
}));

vi.mock('~/lib/stores/logs', () => ({
  logStore: {
    logError: mocks.logError,
    logSystem: mocks.logSystem,
  },
}));

describe('GitHubOauthConnectButton', () => {
  beforeEach(() => {
    language = 'en';
    mocks.initializeGitHubConnection.mockReset();
    mocks.logError.mockReset();
    mocks.logSystem.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the OAuth action in French', () => {
    language = 'fr';

    render(<GitHubOauthConnectButton />);

    expect(screen.getByRole('button', { name: 'Se connecter à GitHub (OAuth)' })).toBeTruthy();
    expect(screen.queryByText('Connect with GitHub (OAuth)')).toBeNull();
  });

  it('shows a localized waiting state while authorization starts', async () => {
    language = 'fr';
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    );

    render(<GitHubOauthConnectButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter à GitHub (OAuth)' }));

    expect((await screen.findByRole('status')).textContent).toContain('En attente de l’autorisation GitHub…');
  });

  it('masks a raw API error and logs only its non-secret code', async () => {
    language = 'fr';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ code: 'oauth_denied', error: 'secret=github_pat_private' }),
      }),
    );

    render(<GitHubOauthConnectButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter à GitHub (OAuth)' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Impossible de lancer l’autorisation GitHub. Réessayez.',
    );
    expect(screen.queryByText(/github_pat_private/u)).toBeNull();
    expect(mocks.logError).toHaveBeenCalledWith('GitHub OAuth flow failed to start', {
      code: 'oauth_denied',
      status: 401,
    });
  });

  it('masks an error message received from the OAuth popup', async () => {
    language = 'fr';

    render(<GitHubOauthConnectButton />);
    fireEvent(
      window,
      new MessageEvent('message', {
        origin: window.location.origin,
        data: {
          type: 'e-code.connector.connection.failed',
          provider: 'github',
          errorCode: 'provider_denied',
          errorMessage: 'Raw English provider failure secret=abc',
        },
      }),
    );

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Impossible d’établir la connexion OAuth à GitHub. Réessayez.',
      ),
    );
    expect(screen.queryByText(/Raw English provider failure/u)).toBeNull();
  });
});
