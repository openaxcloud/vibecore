/*
 * F18 pure helpers for the admin AI-providers panel. Kept out of the route module
 * so they can be unit-tested without pulling in server-only loader/action code.
 */

export type MetricTone = 'ok' | 'warn' | 'danger';

/*
 * 24h provider error-rate → status tone. Thresholds (F18): warn at >= 2%
 * (--status-warning), error at >= 5% (--status-error), otherwise ok. Mirrors the
 * `thresholds` the API returns from /admin/providers/fallback-order so the panel
 * colours consistently once per-request instrumentation lands.
 */
export function errorRateTone(errorPct: number, thresholds = { warnErrorPct: 2, errorErrorPct: 5 }): MetricTone {
  if (!Number.isFinite(errorPct)) {
    return 'ok';
  }

  if (errorPct >= thresholds.errorErrorPct) {
    return 'danger';
  }

  if (errorPct >= thresholds.warnErrorPct) {
    return 'warn';
  }

  return 'ok';
}

/*
 * Return a new array with the element at `index` moved one slot up (dir=-1) or
 * down (dir=+1). Out-of-range moves (top row up, bottom row down) are no-ops that
 * return the original array reference so callers can skip a redundant submit.
 */
export function moveItem<T>(items: readonly T[], index: number, dir: -1 | 1): T[] {
  const target = index + dir;

  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return items as T[];
  }

  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];

  return next;
}
