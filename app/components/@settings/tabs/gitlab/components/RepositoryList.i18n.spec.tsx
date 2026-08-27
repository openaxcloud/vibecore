/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepositoryList } from './RepositoryList';
import { createI18nInstance } from '~/lib/i18n/runtime';
import type { GitLabProjectInfo } from '~/types/GitLab';

vi.mock('./RepositoryCard', () => ({
  RepositoryCard: ({ repo }: { repo: GitLabProjectInfo }) => <article>{repo.name}</article>,
}));

function repository(index: number, name = `Repository ${index}`): GitLabProjectInfo {
  return {
    id: index,
    name,
    path_with_namespace: `team/repository-${index}`,
    description: `User-authored description ${index}`,
    http_url_to_repo: `https://gitlab.example/team/repository-${index}.git`,
    star_count: index,
    forks_count: index,
    updated_at: '2026-08-04T00:00:00.000Z',
    default_branch: 'main',
    visibility: 'private',
  };
}

function renderList(repositories: GitLabProjectInfo[], language: 'en' | 'fr' = 'fr') {
  return render(
    <I18nextProvider i18n={createI18nInstance(language)}>
      <RepositoryList repositories={repositories} onRefresh={vi.fn()} />
    </I18nextProvider>,
  );
}

describe('GitLab RepositoryList i18n', () => {
  afterEach(cleanup);

  it('formats French counts and pagination without truncating repository names', () => {
    const repositories = Array.from({ length: 21 }, (_, index) =>
      repository(index + 1, index === 0 ? 'Customer Checkout' : `Repository ${index + 1}`),
    );

    renderList(repositories);

    expect(screen.getByRole('heading', { name: '21 dépôts' })).toBeTruthy();
    expect(screen.getByText('Affichage de 1 à 20 sur 21 dépôts')).toBeTruthy();
    expect(screen.getByText('Page 1 sur 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Page suivante' })).toBeTruthy();
    expect(screen.getByText('Customer Checkout')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Showing');
  });

  it('renders the localized filtered empty state and preserves search behavior', () => {
    renderList([repository(1, 'Customer Checkout')]);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher des dépôts' }), {
      target: { value: 'missing' },
    });

    expect(screen.getByRole('heading', { name: '0 dépôt' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Aucun dépôt ne correspond à votre recherche.');
  });

  it('keeps English as the fallback catalog', () => {
    renderList([], 'en');

    expect(screen.getByRole('heading', { name: '0 repositories' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('No repositories are available.');
  });
});
