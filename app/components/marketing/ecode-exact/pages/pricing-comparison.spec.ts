import { describe, expect, it } from 'vitest';
import { COMPARISON_COLUMNS, missingComparisonKeys, type ComparisonTierKey } from './pricing-comparison';

describe('pricing comparison columns', () => {
  it('exposes the four tiers in the pricing-card order, keyed to internal tier keys', () => {
    expect(COMPARISON_COLUMNS.map((c) => c.key)).toEqual<ComparisonTierKey[]>([
      'starter',
      'core',
      'teams',
      'enterprise',
    ]);
  });

  it('labels each column to match its data key (no header/data drift)', () => {
    /*
     * Regression: headers said Starter/Core/Teams/Enterprise while rows read
     * starter/pro/business/enterprise, so "Core" rendered the old "pro" values.
     */
    expect(COMPARISON_COLUMNS.map((c) => c.label)).toEqual(['Starter', 'Core', 'Pro', 'Enterprise']);
  });

  it('labels the $100 `teams` tier "Pro" to match the pricing cards (tierDisplayNames)', () => {
    // The cards rename internal `teams` → "Pro"; the comparison column must agree.
    const teams = COMPARISON_COLUMNS.find((c) => c.key === 'teams');
    expect(teams?.label).toBe('Pro');
  });

  it('marks exactly one column (Core) as the accented / most-popular column', () => {
    const accented = COMPARISON_COLUMNS.filter((c) => c.accent);
    expect(accented).toHaveLength(1);
    expect(accented[0].key).toBe('core');
  });

  it('detects a row missing the renamed keys', () => {
    // A row authored against the OLD tier set (pro/business) is now incomplete.
    const staleRow = {
      name: 'CPU cores',
      starter: '1 vCPU',
      pro: '4 vCPUs',
      business: '8 vCPUs',
      enterprise: 'Custom',
    };
    expect(missingComparisonKeys(staleRow)).toEqual<ComparisonTierKey[]>(['core', 'teams']);
  });

  it('accepts a row whose keys align with the columns', () => {
    const goodRow = {
      name: 'CPU cores',
      starter: '1 vCPU',
      core: '4 vCPUs',
      teams: '8 vCPUs',
      enterprise: 'Custom',
    };
    expect(missingComparisonKeys(goodRow)).toEqual([]);
  });
});
