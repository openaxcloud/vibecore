import { describe, expect, it } from 'vitest';

import { parseLimit } from './marketplace-query';

describe('parseLimit', () => {
  it('returns the fallback when the value is missing', () => {
    expect(parseLimit(null)).toBe(5);
    expect(parseLimit(undefined)).toBe(5);
    expect(parseLimit('')).toBe(5);
  });

  it('returns the fallback for non-numeric input', () => {
    expect(parseLimit('abc')).toBe(5);
    expect(parseLimit('NaN')).toBe(5);
  });

  it('parses valid positive integers', () => {
    expect(parseLimit('3')).toBe(3);
    expect(parseLimit('10')).toBe(10);
  });

  it('floors fractional values', () => {
    expect(parseLimit('3.9')).toBe(3);
  });

  /*
   * The bug: Number.isFinite(-3) is true, so the old code passed -3 into
   * slice(0, -3), dropping the trailing 3 items instead of clamping.
   */
  it('falls back instead of passing negative values through to slice', () => {
    expect(parseLimit('-3')).toBe(5);
    expect(parseLimit('-1')).toBe(5);
  });

  it('treats 0 as a valid explicit count (not a fallback)', () => {
    expect(parseLimit('0')).toBe(0);
  });

  it('rejects infinity', () => {
    expect(parseLimit('Infinity')).toBe(5);
    expect(parseLimit('-Infinity')).toBe(5);
  });

  it('honours a custom fallback', () => {
    expect(parseLimit(null, 12)).toBe(12);
    expect(parseLimit('-2', 12)).toBe(12);
  });
});
