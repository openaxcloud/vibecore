import type { ReactNode } from 'react';

/**
 * Single source of truth for the detailed comparison table's tier columns.
 *
 * The header cells AND every data row are keyed off this same list so the
 * column labels can never drift away from the values rendered beneath them
 * (the previous bug: headers said Starter/Core/Teams/Enterprise while rows
 * read `starter`/`pro`/`business`/`enterprise`, so the "Core" column actually
 * showed the values authored under the old "pro" tier).
 *
 * Keys intentionally match the internal pricing tier keys used elsewhere on
 * the page (free→Starter, core→Core, teams→Pro, enterprise→Enterprise). The
 * labels must mirror the `tierDisplayNames` mapping in Pricing.tsx so the same
 * $100 tier is not called "Pro" in the cards yet "Teams" in this table.
 */
export type ComparisonTierKey = 'starter' | 'core' | 'teams' | 'enterprise';

export interface ComparisonColumn {
  key: ComparisonTierKey;

  /** Header label shown to users. */
  label: string;

  /** Short qualifier under the header (e.g. "Most popular"). */
  sublabel: string;

  /** Whether this column is the highlighted / accented column. */
  accent?: boolean;
}

export const COMPARISON_COLUMNS: readonly ComparisonColumn[] = [
  { key: 'starter', label: 'Starter', sublabel: 'Free forever' },
  { key: 'core', label: 'Core', sublabel: 'Most popular', accent: true },
  { key: 'teams', label: 'Pro', sublabel: 'For growing teams' },
  { key: 'enterprise', label: 'Enterprise', sublabel: 'Custom' },
] as const;

/** A single comparison row: a feature name plus a value per tier column. */
export type ComparisonFeature = { name: string } & Record<ComparisonTierKey, ReactNode>;

export interface ComparisonCategory {
  category: string;
  features: ComparisonFeature[];
}

/**
 * Returns the comparison-column keys that a feature row is missing.
 * Empty array means the row is fully aligned with {@link COMPARISON_COLUMNS}.
 */
export function missingComparisonKeys(feature: { name: string } & Record<string, unknown>): ComparisonTierKey[] {
  return COMPARISON_COLUMNS.map((c) => c.key).filter((key) => !(key in feature));
}
