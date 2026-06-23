import { describe, it, expect } from 'vitest';
import { filterRepositories } from './RepositoryList';
import type { GitLabProjectInfo } from '~/types/GitLab';

function makeRepo(overrides: Partial<GitLabProjectInfo>): GitLabProjectInfo {
  return {
    id: 1,
    name: 'repo',
    path_with_namespace: 'group/repo',
    description: '',
    http_url_to_repo: 'https://gitlab.com/group/repo.git',
    star_count: 0,
    forks_count: 0,
    updated_at: '2026-01-01T00:00:00Z',
    default_branch: 'main',
    visibility: 'private',
    ...overrides,
  };
}

describe('filterRepositories', () => {
  const repos: GitLabProjectInfo[] = [
    makeRepo({ id: 1, name: 'Alpha', path_with_namespace: 'team/alpha', description: 'first project' }),
    makeRepo({ id: 2, name: 'Beta', path_with_namespace: 'team/beta', description: 'second project' }),
    makeRepo({ id: 3, name: 'Gamma', path_with_namespace: 'other/gamma', description: '' }),
  ];

  it('returns the same reference when query is empty (no filtering work)', () => {
    expect(filterRepositories(repos, '')).toBe(repos);
  });

  it('matches by name case-insensitively', () => {
    const result = filterRepositories(repos, 'alpha');
    expect(result.map((r) => r.id)).toEqual([1]);
  });

  it('matches by path_with_namespace', () => {
    const result = filterRepositories(repos, 'other/');
    expect(result.map((r) => r.id)).toEqual([3]);
  });

  it('matches by description', () => {
    const result = filterRepositories(repos, 'second');
    expect(result.map((r) => r.id)).toEqual([2]);
  });

  it('does not throw on falsy/empty descriptions', () => {
    expect(() => filterRepositories(repos, 'zzz')).not.toThrow();
    expect(filterRepositories(repos, 'zzz')).toEqual([]);
  });

  it('is a pure function with no side effects (safe to call during render/useMemo)', () => {
    const before = repos.map((r) => ({ ...r }));
    filterRepositories(repos, 'beta');
    expect(repos).toEqual(before);
  });
});
