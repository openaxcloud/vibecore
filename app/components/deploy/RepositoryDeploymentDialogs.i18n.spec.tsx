/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/components/@settings/tabs/github/components/GitHubAuthDialog', () => ({
  GitHubAuthDialog: () => null,
}));
vi.mock('~/components/@settings/tabs/gitlab/components/GitLabAuthDialog', () => ({
  GitLabAuthDialog: () => null,
}));
vi.mock('~/lib/persistence/localStorage', () => ({
  getLocalStorage: () => null,
}));
vi.mock('~/lib/persistence/useChatHistory', async () => {
  const { atom } = await import('nanostores');

  return { chatId: atom<string | undefined>(undefined) };
});
vi.mock('~/lib/stores/logs', () => ({
  logStore: {
    logError: vi.fn(),
    logInfo: vi.fn(),
  },
}));

import { GitHubDeploymentDialog } from './GitHubDeploymentDialog';
import { GitLabDeploymentDialog } from './GitLabDeploymentDialog';
import {
  formatRepositoryDeploymentCopy,
  formatRepositoryDeploymentSize,
  getRepositoryDeploymentCopy,
} from '~/lib/i18n/catalogs/repository-deployment';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderInFrench(node: ReactNode) {
  return render(<I18nextProvider i18n={createI18nInstance('fr')}>{node}</I18nextProvider>);
}

describe('repository deployment dialogs i18n', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('uses an English fallback and locale-aware French formatting', () => {
    const fallback = getRepositoryDeploymentCopy('de');
    const french = getRepositoryDeploymentCopy('fr');

    expect(formatRepositoryDeploymentCopy(fallback.form.title, { provider: 'GitHub' })).toBe('Deploy to GitHub');
    expect(formatRepositoryDeploymentCopy(french.form.title, { provider: 'GitLab' })).toBe('Déployer vers GitLab');
    expect(formatRepositoryDeploymentSize(1536, 'fr')).toBe('1,5 KB');
  });

  it('renders the disconnected GitHub flow entirely in French', () => {
    renderInFrench(<GitHubDeploymentDialog isOpen onClose={() => undefined} projectName="Projet Démo" files={{}} />);

    expect(screen.getAllByText('Connexion GitHub requise').length).toBeGreaterThan(0);
    expect(screen.getByText('Connecter le compte GitHub')).toBeTruthy();
    expect(screen.queryByText('GitHub Connection Required')).toBeNull();
    expect(screen.queryByText('Connect GitHub Account')).toBeNull();
  });

  it('renders the disconnected GitLab flow entirely in French', () => {
    renderInFrench(<GitLabDeploymentDialog isOpen onClose={() => undefined} projectName="Projet Démo" files={{}} />);

    expect(screen.getAllByText('Connexion GitLab requise').length).toBeGreaterThan(0);
    expect(screen.getByText('Connecter le compte GitLab')).toBeTruthy();
    expect(screen.queryByText('GitLab Connection Required')).toBeNull();
    expect(screen.queryByText('Connect GitLab Account')).toBeNull();
  });
});
