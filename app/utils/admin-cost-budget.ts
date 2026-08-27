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

/* Format an integer cent amount as a USD string using the active UI language. */
export function centsToUsd(cents: number, language: string | null | undefined = 'en'): string {
  const locale = language?.toLowerCase().startsWith('fr') ? 'fr-FR' : 'en-US';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
