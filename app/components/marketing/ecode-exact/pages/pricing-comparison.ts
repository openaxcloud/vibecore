import type { ReactNode } from 'react';
import { getMarketingPricingRouteCopy } from '~/lib/i18n/catalogs/marketing-pricing-route';

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

export function getComparisonColumns(language?: string | null): readonly ComparisonColumn[] {
  const copy = getMarketingPricingRouteCopy(language);

  return [
    {
      key: 'starter',
      label: copy['marketingPricing.comparison.starter.label'],
      sublabel: copy['marketingPricing.comparison.starter.sublabel'],
    },
    {
      key: 'core',
      label: copy['marketingPricing.comparison.core.label'],
      sublabel: copy['marketingPricing.comparison.core.sublabel'],
      accent: true,
    },
    {
      key: 'teams',
      label: copy['marketingPricing.comparison.pro.label'],
      sublabel: copy['marketingPricing.comparison.pro.sublabel'],
    },
    {
      key: 'enterprise',
      label: copy['marketingPricing.comparison.enterprise.label'],
      sublabel: copy['marketingPricing.comparison.enterprise.sublabel'],
    },
  ];
}

/**
 * Backward-compatible English columns for the frozen exact-pricing surface.
 * New localized consumers should call {@link getComparisonColumns}.
 */
export const COMPARISON_COLUMNS: readonly ComparisonColumn[] = getComparisonColumns('en');

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
