import { describe, expect, it } from 'vitest';
import { shouldShowRepositorySpinner } from './gitlabRepositorySelectorState';

describe('shouldShowRepositorySpinner', () => {
  it('shows the spinner on the initial paint before any fetch has completed', () => {
    /*
     * Regression: first render is isLoading=false (effect has not run yet),
     * hasFetched=false. We must show the spinner, not the empty state.
     */
    expect(shouldShowRepositorySpinner({ isLoading: false, hasFetched: false, repositoryCount: 0 })).toBe(true);
  });

  it('shows the spinner while a fetch is actively running', () => {
    expect(shouldShowRepositorySpinner({ isLoading: true, hasFetched: false, repositoryCount: 0 })).toBe(true);
  });

  it('hides the spinner once a fetch completed with no repositories (empty state takes over)', () => {
    expect(shouldShowRepositorySpinner({ isLoading: false, hasFetched: true, repositoryCount: 0 })).toBe(false);
  });

  it('hides the spinner when repositories are already available', () => {
    expect(shouldShowRepositorySpinner({ isLoading: false, hasFetched: true, repositoryCount: 5 })).toBe(false);
  });

  it('hides the spinner when repositories exist even if a fetch never settled', () => {
    expect(shouldShowRepositorySpinner({ isLoading: false, hasFetched: false, repositoryCount: 3 })).toBe(false);
  });
});
