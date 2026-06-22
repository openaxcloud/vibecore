/*
 * Server-free helpers for the GitHub stats route. Kept in ~/lib so the route
 * module (which imports `*.server`) exports only loader/action.
 */

/*
 * GitHub's /user/repos is requested with `sort=updated`, so the first N are the
 * most recently active — the ones whose aggregate metrics matter for a stats
 * summary.
 */
export const MAX_METRIC_REPOS = 25;

/*
 * Bound the concurrency of the per-repo metric fan-out instead of launching every
 * chain at once. Keeps outbound socket/rate pressure on api.github.com sane.
 */
export const METRICS_CONCURRENCY = 5;

/**
 * Run `mapper` over `items` with at most `concurrency` in-flight at a time,
 * settling every result the same way `Promise.allSettled` would (never rejects).
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  const limit = Math.max(1, Math.floor(concurrency));

  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) {
        return;
      }

      try {
        results[index] = { status: 'fulfilled', value: await mapper(items[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

/**
 * Map a GitHub events feed into the recentActivity shape, tolerating events whose
 * `repo` field is absent or null (e.g. some org/sponsorship/member events, or
 * events on deleted repos). Reading `.name` on an undefined `repo` would otherwise
 * throw and fail the entire stats response.
 */
export function mapRecentActivity(
  events: any[],
): { id: any; type: any; repo: { name: string; url: string }; created_at: any; payload: any }[] {
  return (Array.isArray(events) ? events : []).slice(0, 10).map((event) => ({
    id: event.id,
    type: event.type,
    repo: event.repo ? { name: event.repo.name ?? '', url: event.repo.url ?? '' } : { name: '', url: '' },
    created_at: event.created_at,
    payload: event.payload || {},
  }));
}
