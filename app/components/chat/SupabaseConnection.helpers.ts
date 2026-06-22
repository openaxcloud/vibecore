/**
 * Pure helpers for SupabaseConnection.tsx, extracted so the async error
 * handling can be unit-tested without rendering the component.
 */

export interface RefreshSupabaseProjectsOptions {
  /** Invoked when the refresh fails (e.g. expired/revoked token, API error). */
  onError?: (error: unknown) => void;

  /** Logger used for the underlying console.error. Defaults to console.error. */
  logError?: (...args: unknown[]) => void;
}

/**
 * Refreshes the Supabase projects list, always catching any rejection so the
 * fire-and-forget onClick handler never leaks an unhandled promise rejection.
 *
 * The previous implementation called `fetchSupabaseStats(token)` directly with
 * no `.catch`, so an expired/revoked token (which makes `fetchSupabaseStats`
 * throw) produced an unhandled rejection and gave the user no feedback.
 *
 * Returns the underlying promise so callers can `await` it in tests; it never
 * rejects because the error is handled internally.
 */
export async function refreshSupabaseProjects(
  fetchStats: (token: string) => Promise<unknown>,
  token: string,
  options: RefreshSupabaseProjectsOptions = {},
): Promise<void> {
  const { onError, logError = console.error } = options;

  try {
    await fetchStats(token);
  } catch (error) {
    logError(error);
    onError?.(error);
  }
}
