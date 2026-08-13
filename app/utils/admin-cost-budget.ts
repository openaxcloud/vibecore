/*
 * F26 pure helpers for the admin costs panel. Kept out of the route module so the
 * budget threshold logic can be unit-tested without server-only loader code.
 */

export type BudgetTone = 'ok' | 'warn' | 'over';

/*
 * Month-to-date budget usage → alert tone. Thresholds (F26): warn at >= 80%
 * (--status-warning), over at >= 100% (--status-error). Mirrors the API's
 * `alertLevel` (which uses the same 80/100 cutoffs) so the gauge and the server
 * agree. A null/undefined percentage (no budget set) is treated as ok.
 */
export function budgetTone(usedPct: number | null | undefined, thresholds = { warn: 80, over: 100 }): BudgetTone {
  if (usedPct == null || !Number.isFinite(usedPct)) {
    return 'ok';
  }

  if (usedPct >= thresholds.over) {
    return 'over';
  }

  if (usedPct >= thresholds.warn) {
    return 'warn';
  }

  return 'ok';
}

/* Format an integer cent amount as a USD string (e.g. 12345 → "$123.45"). */
export function centsToUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
