import { describe, expect, it } from 'vitest';

import { formatRailBadgeValue } from './rail-badge';

describe('formatRailBadgeValue', () => {
  it('shows the exact count below 1000', () => {
    expect(formatRailBadgeValue(0)).toBe('0');
    expect(formatRailBadgeValue(1)).toBe('1');
    expect(formatRailBadgeValue(28)).toBe('28');
    expect(formatRailBadgeValue(99)).toBe('99');
    expect(formatRailBadgeValue(100)).toBe('100');
    expect(formatRailBadgeValue(999)).toBe('999');
  });

  it('switches to compact notation at 1000+', () => {
    expect(formatRailBadgeValue(1000)).toBe('1K');
    expect(formatRailBadgeValue(1234)).toBe('1.2K');
    expect(formatRailBadgeValue(12_000)).toBe('12K');
    expect(formatRailBadgeValue(150_000)).toBe('150K');
    expect(formatRailBadgeValue(2_500_000)).toBe('2.5M');
  });

  it('floors non-integer inputs', () => {
    expect(formatRailBadgeValue(28.9)).toBe('28');
    expect(formatRailBadgeValue(99.999)).toBe('99');
  });

  it('returns "0" for negative or non-finite inputs', () => {
    expect(formatRailBadgeValue(-1)).toBe('0');
    expect(formatRailBadgeValue(Number.NaN)).toBe('0');
    expect(formatRailBadgeValue(Number.POSITIVE_INFINITY)).toBe('0');
  });
});
