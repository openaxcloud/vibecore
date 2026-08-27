/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-toastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import GitLabConnection from './GitLabConnection';

const connect = vi.fn(() => Promise.resolve());
const disconnect = vi.fn();

let language = 'en';

let connectionState: {
  isConnected: boolean;
  isConnecting: boolean;
  connection: unknown;
  error: string | null;
};

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('~/lib/hooks', () => ({
  useGitLabConnection: () => ({
    ...connectionState,
    connect,
    disconnect,
  }),
}));

const SECRET_TOKEN = 'glpat-supersecrettoken123456';

describe('GitLabConnection', () => {
  beforeEach(() => {
    connectionState = { isConnected: false, isConnecting: false, connection: null, error: null };
    connect.mockClear();
    disconnect.mockClear();
    vi.mocked(toast.success).mockClear();
    language = 'en';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not log the access token (or any console.log) on a manual connect attempt', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    render(<GitLabConnection connectionTest={null} onTestConnection={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Access Token'), { target: { value: SECRET_TOKEN } });
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => expect(connect).toHaveBeenCalledWith(SECRET_TOKEN, 'https://gitlab.com'));

    // No console.log at all on the connect path, and certainly nothing carrying the token prefix.
    expect(logSpy).not.toHaveBeenCalled();

    const loggedText = JSON.stringify(logSpy.mock.calls);
    expect(loggedText).not.toContain(SECRET_TOKEN.substring(0, 10));
  });

  it('does not render the debug "Test Values" button', () => {
    render(<GitLabConnection connectionTest={null} onTestConnection={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /test values/i })).toBeNull();
  });

  it('renders professional French and masks a raw provider error', () => {
    language = 'fr';
    connectionState.error = 'HTTP 401 Invalid token secret=glpat-private';

    render(<GitLabConnection connectionTest={null} onTestConnection={vi.fn()} />);

    expect(screen.getByText('Connexion GitLab')).toBeTruthy();
    expect(screen.getByLabelText('Jeton d’accès').getAttribute('placeholder')).toBe(
      'Saisissez votre jeton d’accès GitLab',
    );
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain(
      'Impossible d’établir la connexion. Vérifiez vos paramètres, puis réessayez.',
    );
    expect(screen.queryByText(/glpat-private/u)).toBeNull();
  });

  it('localizes the connected state and disconnect toast', () => {
    language = 'fr';
    connectionState = {
      isConnected: true,
      isConnecting: false,
      connection: { gitlabUrl: 'https://gitlab.example' },
      error: null,
    };

    render(<GitLabConnection connectionTest={null} onTestConnection={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('Déconnexion de GitLab réussie.');
    expect(screen.getByText('Connecté à GitLab')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tableau de bord' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tester la connexion' })).toBeTruthy();
  });
});
