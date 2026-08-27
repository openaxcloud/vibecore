/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import GitLabTab from './GitLabTab';
import {
  formatGitLabTabDateTime,
  formatGitLabTabNumber,
  getGitLabTabCopy,
  gitLabTabEn,
  gitLabTabFr,
  interpolateGitLabTabCopy,
} from '~/lib/i18n/catalogs/gitlab-tab';
import type { GitLabConnection, GitLabProjectInfo, GitLabStats } from '~/types/GitLab';

const mocks = vi.hoisted(() => ({
  refreshStats: vi.fn(),
  testConnection: vi.fn(),
}));

let language = 'en';

let connectionState: {
  connection: GitLabConnection | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  refreshStats: typeof mocks.refreshStats;
  testConnection: typeof mocks.testConnection;
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      transition: _transition,
      ...props
    }: HTMLAttributes<HTMLDivElement> & {
      children?: ReactNode;
      initial?: unknown;
      animate?: unknown;
      transition?: unknown;
    }) => <div {...props}>{children}</div>,
  },
}));

vi.mock('~/lib/hooks', () => ({
  useGitLabConnection: () => connectionState,
}));

vi.mock('./components/GitLabConnection', () => ({
  default: ({
    connectionTest,
    onTestConnection,
  }: {
    connectionTest: { message?: string } | null;
    onTestConnection: () => void;
  }) => (
    <div data-testid="connection-component">
      <button type="button" data-testid="run-connection-test" onClick={onTestConnection} />
      <span data-testid="connection-prop">{connectionTest?.message}</span>
    </div>
  ),
}));

vi.mock('./components/StatsDisplay', () => ({
  StatsDisplay: ({
    isRefreshing,
    onRefresh,
    stats,
  }: {
    isRefreshing?: boolean;
    onRefresh?: () => void;
    stats: GitLabStats;
  }) => (
    <div data-testid="statistics-component" data-last-updated={stats.lastUpdated}>
      <button type="button" data-testid="refresh-statistics" disabled={isRefreshing} onClick={onRefresh} />
    </div>
  ),
}));

vi.mock('./components/RepositoryList', () => ({
  RepositoryList: ({
    isRefreshing,
    onRefresh,
    repositories,
  }: {
    isRefreshing?: boolean;
    onRefresh?: () => void;
    repositories: GitLabProjectInfo[];
  }) => (
    <div data-testid="repositories-component">
      <button type="button" data-testid="refresh-repositories" disabled={isRefreshing} onClick={onRefresh} />
      {repositories.map((repository) => (
        <a
          key={repository.id}
          href={repository.http_url_to_repo}
          data-project-id={repository.id}
          data-default-branch={repository.default_branch}
        >
          {repository.name}
        </a>
      ))}
    </div>
  ),
}));

vi.mock('~/components/@settings/shared/connectors', () => ({
  GitLabOauthConnectButton: () => <div data-testid="oauth-connect" />,
}));

const providerProject: GitLabProjectInfo = {
  id: 73_421,
  name: 'Customer English Project',
  path_with_namespace: 'customer/English_Project',
  description: 'Provider supplied content',
  http_url_to_repo: 'https://gitlab.example/customer/English_Project.git',
  star_count: 17,
  forks_count: 3,
  updated_at: '2026-08-05T12:34:00.000Z',
  default_branch: 'feature/keep-this-branch',
  visibility: 'private',
};

function makeStats(): GitLabStats {
  return {
    projects: [providerProject],
    recentActivity: [],
    totalSnippets: 0,
    publicProjects: 1,
    privateProjects: 1,
    stars: 17,
    forks: 3,
    followers: 2,
    snippets: 0,
    groups: [],
    lastUpdated: '2026-08-05T12:34:00.000Z',
  };
}

function setConnected(): void {
  connectionState = {
    connection: {
      user: {
        id: 10_042,
        username: 'release_bot/EN',
        name: 'My English Display Name',
        avatar_url: 'https://gitlab.example/avatars/release_bot.png',
        web_url: 'https://gitlab.example/release_bot',
        created_at: '2025-01-01T00:00:00.000Z',
        bio: 'User supplied biography',
        public_repos: 1,
        followers: 2,
        following: 3,
      },
      token: 'glpat-never-render-this-value',
      tokenType: 'oauth',
      stats: makeStats(),
      rateLimit: { remaining: 1_234, limit: 5_000, reset: 0 },
      gitlabUrl: 'https://gitlab.example',
    },
    isConnected: true,
    isLoading: false,
    error: null,
    refreshStats: mocks.refreshStats,
    testConnection: mocks.testConnection,
  };
}

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

describe('GitLabTab i18n surface', () => {
  beforeEach(() => {
    language = 'en';
    mocks.refreshStats.mockReset();
    mocks.refreshStats.mockResolvedValue(undefined);
    mocks.testConnection.mockReset();
    connectionState = {
      connection: null,
      isConnected: false,
      isLoading: false,
      error: null,
      refreshStats: mocks.refreshStats,
      testConnection: mocks.testConnection,
    };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('keeps flat EN/FR parity, interpolation parity, and an English fallback', () => {
    expect(Object.keys(gitLabTabFr)).toEqual(Object.keys(gitLabTabEn));

    for (const key of Object.keys(gitLabTabEn) as (keyof typeof gitLabTabEn)[]) {
      expect(gitLabTabEn[key].trim().length, key).toBeGreaterThan(0);
      expect(gitLabTabFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(gitLabTabFr[key]), key).toEqual(interpolationTokens(gitLabTabEn[key]));
      expect(gitLabTabFr[key], key).not.toBe(gitLabTabEn[key]);
    }

    expect(getGitLabTabCopy('de-DE')['gitLabTab.title']).toBe('GitLab Integration');
    expect(
      interpolateGitLabTabCopy(gitLabTabFr['gitLabTab.connectionTest.success'], {
        username: 'Provider_English_ID',
      }),
    ).toContain('Provider_English_ID');
  });

  it('formats French API counts and timestamps', () => {
    expect(formatGitLabTabNumber(12_345, 'fr')).toMatch(/^12[\s\u202f]345$/u);
    expect(formatGitLabTabDateTime(new Date('2026-08-05T12:34:00.000Z'), 'fr')).toMatch(/août 2026/u);
  });

  it('renders the initial loading state in French with live-region semantics', () => {
    language = 'fr';
    connectionState.isLoading = true;

    render(<GitLabTab />);

    expect(screen.getByText('Intégration GitLab')).toBeTruthy();
    expect(screen.getByText('Chargement de votre connexion GitLab…')).toBeTruthy();
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText('Loading...')).toBeNull();
  });

  it('masks a raw provider error in the localized recovery state', () => {
    language = 'fr';
    connectionState.error = 'HTTP 401 Unauthorized secret=glpat-private-value';

    render(<GitLabTab />);

    expect(screen.getByRole('alert').textContent).toContain('Connexion GitLab indisponible');
    expect(screen.getByRole('alert').textContent).toContain('Impossible de charger votre connexion GitLab.');
    expect(screen.getByRole('button', { name: 'Recharger la page' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('glpat-private-value');
    expect(document.body.textContent).not.toContain('Unauthorized');
  });

  it('renders disconnected guidance and the OAuth recommendation in French', () => {
    language = 'fr';

    render(<GitLabTab />);

    expect(screen.getByText(/Connectez votre compte GitLab/u)).toBeTruthy();
    expect(screen.getByText(/Recommandé\s*: connectez-vous avec OAuth GitLab/u)).toBeTruthy();
    expect(screen.getByText(/jeton d’accès personnel/u)).toBeTruthy();
    expect(screen.getByTestId('oauth-connect')).toBeTruthy();
    expect(screen.queryByText(/Connect your GitLab account/u)).toBeNull();
  });

  it('localizes connected chrome while preserving provider data, identifiers, branches, and URLs', () => {
    language = 'fr';
    setConnected();

    render(<GitLabTab />);

    expect(screen.getByText('Intégration GitLab')).toBeTruthy();
    expect(
      screen.getByText('Gérez votre intégration GitLab, vos dépôts et les statistiques de votre compte.'),
    ).toBeTruthy();
    expect(screen.getByText('Statistiques')).toBeTruthy();
    expect(screen.getByText(/API/u).textContent).toMatch(/^API : 1[\s\u202f]234\/5[\s\u202f]000$/u);
    expect(screen.getByText('My English Display Name')).toBeTruthy();
    expect(screen.getByText('release_bot/EN')).toBeTruthy();

    const avatar = screen.getByAltText('Avatar de My English Display Name');
    expect(avatar.getAttribute('src')).toBe('https://gitlab.example/avatars/release_bot.png');

    const project = screen.getByRole('link', { name: 'Customer English Project' });
    expect(project.getAttribute('href')).toBe('https://gitlab.example/customer/English_Project.git');
    expect(project.getAttribute('data-project-id')).toBe('73421');
    expect(project.getAttribute('data-default-branch')).toBe('feature/keep-this-branch');
    expect(document.body.textContent).not.toContain('glpat-never-render-this-value');
  });

  it('localizes a successful connection test across a live language switch and preserves the GitLab username', async () => {
    language = 'fr';
    setConnected();
    mocks.testConnection.mockResolvedValue(true);

    const { rerender } = render(<GitLabTab />);
    fireEvent.click(screen.getByTestId('run-connection-test'));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Connexion réussie avec le compte release_bot/EN.');
    });
    expect(screen.getByRole('status').textContent).toContain('Vérification effectuée le');

    language = 'en';
    rerender(<GitLabTab />);

    expect(screen.getByRole('status').textContent).toContain('Connected successfully as release_bot/EN.');
    expect(screen.getByRole('status').textContent).toContain('Checked');
  });

  it('masks rejected connection tests instead of rendering provider details', async () => {
    language = 'fr';
    setConnected();
    mocks.testConnection.mockRejectedValue(new Error('Raw English provider error secret=glpat-hidden'));

    render(<GitLabTab />);
    fireEvent.click(screen.getByTestId('run-connection-test'));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Le test de la connexion GitLab a échoué.');
    });
    expect(document.body.textContent).not.toContain('Raw English provider error');
    expect(document.body.textContent).not.toContain('glpat-hidden');
  });

  it('provides a localized, retryable refresh error without exposing provider details', async () => {
    language = 'fr';
    setConnected();
    mocks.refreshStats.mockRejectedValueOnce(new Error('Upstream English error secret=refresh-private'));

    render(<GitLabTab />);
    fireEvent.click(screen.getByTestId('refresh-statistics'));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Échec de l’actualisation');
    });
    expect(screen.getByRole('alert').textContent).toContain('Impossible d’actualiser les données GitLab.');
    expect(document.body.textContent).not.toContain('refresh-private');

    mocks.refreshStats.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(mocks.refreshStats).toHaveBeenCalledTimes(2);
  });

  it('has zero scanner findings and explicit responsive, theme, accessibility, and safety safeguards', async () => {
    const sourcePath = 'app/components/@settings/tabs/gitlab/GitLabTab.tsx';
    const source = readFileSync(sourcePath, 'utf8');
    const { scanSource } = await import('../../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, sourcePath);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('sm:flex-row');
    expect(source).toContain('min-[420px]:flex-row');
    expect(source).toContain('min-h-11');
    expect(source).toContain('dark:');
    expect(source).toContain('role="status"');
    expect(source).toContain('role="alert"');
    expect(source).not.toContain('{error}');
    expect(source).not.toContain('error.message');
    expect(source).toContain('connection.user.username');
    expect(source).toContain('connection.user.avatar_url');
    expect(source).toContain('connection.stats.projects');
  });
});
