/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubStats } from './GitHubStats';
import type { GitHubConnection, GitHubStats as GitHubStatsType } from '~/types/GitHub';

/*
 * The component reads stats from the useGitHubStats hook. Mock the hooks barrel so we can
 * feed it a legacy/partial cached blob that lacks the `languages` field — the exact shape
 * an older cache schema (github_stats_cache in localStorage, or connection.stats) can produce.
 *
 * vi.mock is hoisted by vitest above these imports regardless of source position.
 */
const useGitHubStats = vi.fn();

vi.mock('~/lib/hooks', () => ({
  useGitHubStats: (...args: unknown[]) => useGitHubStats(...args),
}));

afterEach(() => {
  cleanup();
  useGitHubStats.mockReset();
});

const connection: GitHubConnection = {
  user: null,
  token: 'tok',
  tokenType: 'classic',
} as unknown as GitHubConnection;

function renderWithStats(stats: Partial<GitHubStatsType>) {
  useGitHubStats.mockReturnValue({
    stats,
    isLoading: false,
    isRefreshing: false,
    refreshStats: vi.fn(),
    isStale: false,
  });

  return render(<GitHubStats connection={connection} isExpanded={true} onToggleExpanded={() => {}} />);
}

describe('GitHubStats', () => {
  it('renders without crashing when cached stats lack the languages field', () => {
    // Legacy blob: has counts but no `languages` map at all.
    const partial = {
      publicRepos: 3,
      privateRepos: 1,
      totalBranches: 5,
      lastUpdated: new Date('2026-01-01T00:00:00Z').toISOString(),
    } as Partial<GitHubStatsType>;

    renderWithStats(partial);

    // Must NOT fall into the GitHubErrorBoundary error state.
    expect(screen.queryByText(/GitHub Integration Error/i)).toBeNull();

    // Stats content renders, and "Languages Used" count reads 0 from the empty default.
    expect(screen.getByText('GitHub Overview')).toBeTruthy();
    expect(screen.getByText('Languages Used')).toBeTruthy();
  });

  it('renders language entries when the languages map is present', () => {
    const full = {
      publicRepos: 2,
      privateRepos: 0,
      totalBranches: 4,
      languages: { TypeScript: 1000, CSS: 200 },
      lastUpdated: new Date('2026-01-01T00:00:00Z').toISOString(),
    } as Partial<GitHubStatsType>;

    renderWithStats(full);

    expect(screen.queryByText(/GitHub Integration Error/i)).toBeNull();
    expect(screen.getByText('TypeScript')).toBeTruthy();
    expect(screen.getByText('CSS')).toBeTruthy();
  });
});
