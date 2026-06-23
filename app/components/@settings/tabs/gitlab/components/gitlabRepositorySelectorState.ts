export interface RepositorySpinnerState {
  /** True while a foreground (non-refresh) fetch is in flight. */
  isLoading: boolean;

  /** True once at least one fetch attempt has settled (success or error). */
  hasFetched: boolean;

  /** Number of repositories currently held in state. */
  repositoryCount: number;
}

/**
 * Decide whether the repository selector should render the loading spinner.
 *
 * The spinner is shown both while a fetch is actively running AND on the very
 * first render before the fetch effect has had a chance to flip `isLoading`.
 * This prevents the "No repositories found" empty state from flashing on the
 * initial paint for a freshly connected user (the fetch only starts in an
 * effect after the first commit, so `isLoading` is still `false` then).
 */
export function shouldShowRepositorySpinner({
  isLoading,
  hasFetched,
  repositoryCount,
}: RepositorySpinnerState): boolean {
  if (repositoryCount > 0) {
    return false;
  }

  // Actively loading, or we have not completed a fetch yet (initial paint).
  return isLoading || !hasFetched;
}
