/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import GitHubTab from './GitHubTab';
import {
  formatGitHubTabDateTime,
  formatGitHubTabNumber,
  formatGitHubTabPlural,
  getGitHubTabCopy,
  githubTabEn,
  githubTabFr,
  interpolateGitHubTabCopy,
} from '~/lib/i18n/catalogs/github-tab';

const mocks = vi.hoisted(() => ({
  testConnection: vi.fn(),
}));

let language = 'en';

let connectionState: {
  connection: Record<string, unknown> | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  testConnection: typeof mocks.testConnection;
};

let statsState: {
  stats: Record<string, unknown> | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isStale: boolean;
  refreshStats: () => Promise<void>;
  error: string | null;
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className }: { children?: ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
  },
}));

vi.mock('~/lib/hooks', () => ({
  useGitHubConnection: () => connectionState,
  useGitHubStats: () => statsState,
}));

vi.mock('./components/GitHubConnection', () => ({
  GitHubConnection: ({
    connectionTest,
    onTestConnection,
  }: {
    connectionTest: { message?: string } | null;
    onTestConnection: () => void;
  }) => (
    <div>
      <button type="button" onClick={onTestConnection}>
        run-connection-test
      </button>
      <span data-testid="connection-prop">{connectionTest?.message}</span>
    </div>
  ),
}));

vi.mock('./components/GitHubErrorBoundary', () => ({
  GitHubErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('./components/GitHubStats', () => ({
  GitHubStats: () => <div data-testid="github-stats" />,
}));

vi.mock('./components/GitHubUserProfile', () => ({
  GitHubUserProfile: () => <div data-testid="github-user" />,
}));

vi.mock('./components/GitHubCacheManager', () => ({
  GitHubCacheManager: () => <div data-testid="github-cache" />,
}));

vi.mock('./components/shared', () => ({
  LoadingState: ({ message }: { message: string }) => <div>{message}</div>,
  ErrorState: ({ title, message, retryLabel }: { title: string; message: string; retryLabel: string }) => (
    <div role="alert">
      <h3>{title}</h3>
      <p>{message}</p>
      <button type="button">{retryLabel}</button>
    </div>
  ),
  ConnectionTestIndicator: ({ message }: { message?: string }) => <output data-testid="test-result">{message}</output>,
  RepositoryCard: ({ repository, onSelect }: { repository: { full_name: string }; onSelect: () => void }) => (
    <button type="button" onClick={onSelect}>
      {repository.full_name}
    </button>
  ),
}));

function repository(index: number) {
  return {
    full_name: `owner/repository-${index}`,
    html_url: `https://github.com/owner/repository-${index}`,
  };
}

function setConnected() {
  connectionState = {
    connection: {
      token: 'token-not-rendered',
      user: { login: 'octocat' },
      rateLimit: { remaining: 1_234, limit: 5_000 },
    },
    isConnected: true,
    isLoading: false,
    error: null,
    testConnection: mocks.testConnection,
  };
}

describe('GitHubTab i18n surface', () => {
  beforeEach(() => {
    language = 'en';
    connectionState = {
      connection: null,
      isConnected: false,
      isLoading: false,
      error: null,
      testConnection: mocks.testConnection,
    };
    statsState = {
      stats: null,
      isLoading: false,
      isRefreshing: false,
      isStale: false,
      refreshStats: () => Promise.resolve(),
      error: null,
    };
    mocks.testConnection.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps flat EN/FR parity and falls back to English', () => {
    expect(Object.keys(githubTabFr)).toEqual(Object.keys(githubTabEn));
    expect(Object.values(githubTabEn).every((value) => typeof value === 'string')).toBe(true);
    expect(Object.values(githubTabFr).every((value) => typeof value === 'string')).toBe(true);
    expect(getGitHubTabCopy('de-DE')['githubTab.title']).toBe('GitHub Integration');

    for (const key of Object.keys(githubTabEn) as (keyof typeof githubTabEn)[]) {
      if (key !== 'githubTab.test.withTimestamp') {
        expect(githubTabFr[key], key).not.toBe(githubTabEn[key]);
      }
    }
  });

  it('formats French counts, dates and plural repository labels', () => {
    const copy = githubTabFr;

    expect(formatGitHubTabNumber(12_345, 'fr')).toMatch(/^12[\s\u202f]345$/u);
    expect(formatGitHubTabDateTime(new Date('2026-08-05T12:34:00.000Z'), 'fr')).toMatch(/août 2026/u);
    expect(
      formatGitHubTabPlural('fr', 1, {
        one: copy['githubTab.repositories.showMore.one'],
        other: copy['githubTab.repositories.showMore.other'],
      }),
    ).toBe('Afficher 1 dépôt supplémentaire');
    expect(
      formatGitHubTabPlural('fr', 1_200, {
        one: copy['githubTab.repositories.showMore.one'],
        other: copy['githubTab.repositories.showMore.other'],
      }),
    ).toMatch(/^Afficher 1[\s\u202f]200 dépôts supplémentaires$/u);
    expect(interpolateGitHubTabCopy(copy['githubTab.test.success'], { username: 'My English Login' })).toContain(
      'My English Login',
    );
  });

  it('renders the initial loading state in French with live-region semantics', () => {
    language = 'fr';
    connectionState.isLoading = true;

    render(<GitHubTab />);

    expect(screen.getByText('Intégration GitHub')).toBeTruthy();
    expect(screen.getByText('Vérification de la connexion GitHub…')).toBeTruthy();
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
  });

  it('masks a raw connection error in the localized recovery state', () => {
    language = 'fr';
    connectionState.error = 'HTTP 401 Bad credentials secret=github_pat_private';

    render(<GitHubTab />);

    expect(screen.getByRole('alert').textContent).toContain('Impossible de charger la connexion GitHub.');
    expect(screen.getByRole('button', { name: 'Recharger la page' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('github_pat_private');
  });

  it('renders the disconnected guidance in French', () => {
    language = 'fr';

    render(<GitHubTab />);

    expect(screen.getByText(/Connectez votre compte GitHub/u)).toBeTruthy();
    expect(screen.queryByText(/Connect your GitHub account/u)).toBeNull();
  });

  it('localizes connected badges, repository counts and the expandable control', () => {
    language = 'fr';
    setConnected();
    statsState = {
      ...statsState,
      stats: { repos: Array.from({ length: 14 }, (_, index) => repository(index)) },
      isRefreshing: true,
    };

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<GitHubTab />);

    expect(screen.getByText('Actualisation…')).toBeTruthy();
    expect(screen.getByText(/API/u).textContent).toBe('API : 1 234/5 000');
    expect(screen.getByText('Tous les dépôts (14)')).toBeTruthy();

    const showMore = screen.getByRole('button', { name: 'Afficher 2 dépôts supplémentaires' });
    expect(showMore.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(showMore);

    expect(screen.getByRole('button', { name: 'Afficher moins de dépôts' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'owner/repository-0' }));
    expect(openSpy).toHaveBeenCalledWith('https://github.com/owner/repository-0', '_blank', 'noopener,noreferrer');
  });

  it('localizes connection-test success while preserving the GitHub login', async () => {
    language = 'fr';
    setConnected();
    mocks.testConnection.mockResolvedValue(true);

    render(<GitHubTab />);
    fireEvent.click(screen.getByRole('button', { name: 'run-connection-test' }));

    await waitFor(() => expect(screen.getByTestId('test-result').textContent).toContain('octocat'));
    expect(screen.getByTestId('test-result').textContent).toContain('Connexion réussie avec le compte');
    expect(screen.getByTestId('test-result').textContent).toContain('·');
  });

  it('masks rejected connection tests and raw statistics errors', async () => {
    language = 'fr';
    setConnected();
    statsState.error = 'Upstream English stats error secret=abc';
    mocks.testConnection.mockRejectedValue(new Error('Raw provider error secret=def'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<GitHubTab />);
    fireEvent.click(screen.getByRole('button', { name: 'run-connection-test' }));

    await waitFor(() => expect(screen.getByTestId('test-result').textContent).toContain('Échec du test de connexion.'));
    expect(screen.getByRole('alert').textContent).toContain('Impossible de charger les statistiques GitHub.');
    expect(document.body.textContent).not.toContain('secret=abc');
    expect(document.body.textContent).not.toContain('secret=def');
  });

  it('has zero scanner findings and explicit responsive, theme and recovery safeguards', async () => {
    const source = readFileSync('app/components/@settings/tabs/github/GitHubTab.tsx', 'utf8');
    const { scanSource } = await import('../../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, 'app/components/@settings/tabs/github/GitHubTab.tsx');

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('sm:flex-row');
    expect(source).toContain('grid-cols-1');
    expect(source).toContain('min-h-11');
    expect(source).toContain('dark:');
    expect(source).toContain('role="status"');
    expect(source).not.toContain('message={error}');
    expect(source).not.toContain('message={statsError}');
    expect(source).not.toContain('error.message');
    expect(source).toContain('repo.html_url');
  });
});
