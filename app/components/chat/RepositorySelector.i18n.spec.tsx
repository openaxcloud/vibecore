/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: HTMLAttributes<HTMLDivElement> & {
      children?: ReactNode;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => <div {...props}>{children}</div>,
  },
}));
vi.mock('~/lib/hooks', () => ({
  useGitHubConnection: () => ({ connection: null, isConnected: false }),
  useGitHubStats: () => ({ stats: null, isLoading: false, refreshStats: vi.fn() }),
  useGitLabConnection: () => ({ connection: null, isConnected: false }),
}));
vi.mock('~/lib/hooks/useGit', () => ({
  useGit: () => ({ ready: true, gitClone: vi.fn() }),
}));
vi.mock('~/components/ui/LoadingOverlay', () => ({
  LoadingOverlay: ({ message }: { message: string }) => <div>{message}</div>,
}));

import { GitHubRepositoryCard } from '~/components/@settings/tabs/github/components/GitHubRepositoryCard';
import { GitHubRepositorySelector } from '~/components/@settings/tabs/github/components/GitHubRepositorySelector';
import { GitLabRepositorySelector } from '~/components/@settings/tabs/gitlab/components/GitLabRepositorySelector';
import { RepositoryCard as GitLabRepositoryCard } from '~/components/@settings/tabs/gitlab/components/RepositoryCard';
import GitCloneButton from '~/components/chat/GitCloneButton';
import { BranchSelector } from '~/components/ui/BranchSelector';
import {
  formatRepositorySelectorCopy,
  formatRepositorySelectorDate,
  formatRepositorySelectorNumber,
  formatRepositorySelectorSize,
  getRepositorySelectorCopy,
  getRepositorySelectorError,
} from '~/lib/i18n/catalogs/repository-selector';
import { createI18nInstance } from '~/lib/i18n/runtime';
import type { GitHubRepoInfo } from '~/types/GitHub';
import type { GitLabProjectInfo } from '~/types/GitLab';

function renderInFrench(node: ReactNode) {
  return render(<I18nextProvider i18n={createI18nInstance('fr')}>{node}</I18nextProvider>);
}

describe('repository selector i18n', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Raw server English detail' }),
      })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('uses English fallback and French number, date, size, and safe-error formatting', () => {
    const fallback = getRepositorySelectorCopy('de');
    const french = getRepositorySelectorCopy('fr');

    expect(fallback['repositorySelector.title']).toBe('Select a repository to clone');
    expect(formatRepositorySelectorCopy(french['repositorySelector.count'], { shown: 2, total: 4 })).toBe(
      '2 dépôts sur 4',
    );
    expect(formatRepositorySelectorNumber(12345, 'fr')).toBe('12 345');
    expect(formatRepositorySelectorSize(1536, 'fr')).toBe('1,5');
    expect(formatRepositorySelectorDate('2026-01-02T12:00:00Z', 'fr')).toContain('2026');
    expect(getRepositorySelectorError('fr', new Error('Raw server English detail'), 'Erreur sûre')).toBe('Erreur sûre');
  });

  it('renders disconnected GitHub and GitLab states in French', () => {
    const github = renderInFrench(<GitHubRepositorySelector />);

    expect(screen.getByText('Connectez-vous à GitHub pour parcourir vos dépôts.')).toBeTruthy();
    expect(screen.queryByText(/Please connect/)).toBeNull();
    github.unmount();

    renderInFrench(<GitLabRepositorySelector />);
    expect(screen.getByText('Connectez-vous à GitLab pour parcourir vos dépôts.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Actualiser la connexion' })).toBeTruthy();
  });

  it('keeps repository data intact while localizing GitHub and GitLab card chrome', () => {
    const githubRepo = {
      id: 1,
      name: 'user-owned-repo',
      full_name: 'octocat/user-owned-repo',
      html_url: 'https://github.com/octocat/user-owned-repo',
      description: 'User-owned description',
      private: true,
      fork: false,
      archived: false,
      stargazers_count: 1234,
      forks_count: 12,
      default_branch: 'main',
      language: 'TypeScript',
      updated_at: '2026-01-02T12:00:00Z',
      topics: ['i18n'],
      size: 1536,
    } as GitHubRepoInfo;

    const github = renderInFrench(<GitHubRepositoryCard repo={githubRepo} onClone={() => undefined} />);
    expect(screen.getByText('user-owned-repo')).toBeTruthy();
    expect(screen.getByText('User-owned description')).toBeTruthy();
    expect(screen.getByTitle('Dépôt privé')).toBeTruthy();
    expect(screen.getByTitle('Cloner le dépôt')).toBeTruthy();
    github.unmount();

    const gitlabRepo = {
      id: 2,
      name: 'gitlab-user-repo',
      path_with_namespace: 'person/gitlab-user-repo',
      http_url_to_repo: 'https://gitlab.com/person/gitlab-user-repo.git',
      description: 'GitLab user description',
      star_count: 5,
      forks_count: 2,
      default_branch: 'develop',
      updated_at: '2026-01-02T12:00:00Z',
    } as GitLabProjectInfo;

    renderInFrench(<GitLabRepositoryCard repo={gitlabRepo} onClone={() => undefined} />);
    expect(screen.getByText('gitlab-user-repo')).toBeTruthy();
    expect(screen.getByText('GitLab user description')).toBeTruthy();
    expect(screen.getByTitle('Branche par défaut')).toBeTruthy();
    expect(screen.getByTitle('Cloner le dépôt')).toBeTruthy();
  });

  it('masks a raw branch API error in French', async () => {
    renderInFrench(
      <BranchSelector
        provider="gitlab"
        repoOwner="person"
        repoName="repo"
        projectId={1}
        token="secret-user-token"
        onBranchSelect={() => undefined}
        onClose={() => undefined}
        isOpen
      />,
    );

    expect(await screen.findByText('Impossible de récupérer les branches.')).toBeTruthy();
    expect(screen.queryByText('Raw server English detail')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Sélectionner une branche' })).toBeTruthy();
  });

  it('renders the clone provider chooser in French with preserved provider brands', async () => {
    renderInFrench(<GitCloneButton />);

    fireEvent.click(screen.getByRole('button', { name: /Cloner un dépôt/ }));

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Choisir un hébergeur de dépôt' })).toBeTruthy());
    expect(screen.getByText('GitHub')).toBeTruthy();
    expect(screen.getByText('GitLab')).toBeTruthy();
    expect(screen.getByText('Cloner l’un de vos dépôts GitHub')).toBeTruthy();
    expect(screen.queryByText('Choose Repository Provider')).toBeNull();
  });
});
