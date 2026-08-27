/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GitHubConnection } from './GitHubConnection';

const connect = vi.fn(() => Promise.resolve());
const disconnect = vi.fn();

let language = 'en';

let connectionState: {
  isConnected: boolean;
  isLoading: boolean;
  isConnecting: boolean;
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

vi.mock('./GitHubOauthConnectButton', () => ({
  GitHubOauthConnectButton: () => <div data-testid="github-oauth" />,
}));

vi.mock('~/lib/hooks', () => ({
  useGitHubConnection: () => ({
    ...connectionState,
    connect,
    disconnect,
  }),
}));

const SECRET_TOKEN = 'github_pat_private_123456';

describe('GitHubConnection', () => {
  beforeEach(() => {
    language = 'en';
    connectionState = {
      isConnected: false,
      isLoading: false,
      isConnecting: false,
      error: null,
    };
    connect.mockClear();
    disconnect.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not log a personal access token during connection', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    render(<GitHubConnection connectionTest={null} onTestConnection={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Personal Access Token'), { target: { value: SECRET_TOKEN } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(connect).toHaveBeenCalledWith(SECRET_TOKEN, 'classic'));
    expect(logSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain(SECRET_TOKEN);
  });

  it('renders professional French and masks a raw hook error', () => {
    language = 'fr';
    connectionState.error = 'Bad credentials: github_pat_private_123456';

    render(<GitHubConnection connectionTest={null} onTestConnection={vi.fn()} />);

    expect(screen.getByText('Se connecter à GitHub (OAuth)')).toBeTruthy();
    expect(screen.getByLabelText('Type de jeton')).toBeTruthy();
    expect(screen.getByLabelText('Jeton d’accès personnel').getAttribute('placeholder')).toBe(
      'Saisissez votre jeton d’accès personnel GitHub',
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Impossible d’établir la connexion. Vérifiez vos paramètres, puis réessayez.',
    );
    expect(screen.queryByText(/github_pat_private/u)).toBeNull();
    expect(screen.queryByText('Token Type')).toBeNull();
  });

  it('renders an explicit localized loading state', () => {
    language = 'fr';
    connectionState.isLoading = true;

    render(<GitHubConnection connectionTest={null} onTestConnection={vi.fn()} />);

    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('Chargement de la connexion…')).toBeTruthy();
  });

  it('localizes connected actions and preserves the GitHub dashboard URL', () => {
    language = 'fr';
    connectionState.isConnected = true;

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const onTestConnection = vi.fn();

    render(<GitHubConnection connectionTest={null} onTestConnection={onTestConnection} />);

    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tableau de bord' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tester la connexion' }));

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith('https://github.com/dashboard', '_blank', 'noopener,noreferrer');
    expect(onTestConnection).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Connecté à GitHub')).toBeTruthy();
  });
});
