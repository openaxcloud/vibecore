import { describe, it, expect } from 'vitest';
import { clampProgress } from './Progress';

describe('clampProgress', () => {
  it('passes through in-range values', () => {
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(50)).toBe(50);
    expect(clampProgress(100)).toBe(100);
  });

  it('clamps values above 100', () => {
    expect(clampProgress(150)).toBe(100);
    expect(clampProgress(Number.MAX_SAFE_INTEGER)).toBe(100);
  });

  it('clamps negative values to 0', () => {
    expect(clampProgress(-10)).toBe(0);
    expect(clampProgress(-Infinity)).toBe(0);
  });

  it('returns 0 for NaN (e.g. current/total when total is 0)', () => {
    expect(clampProgress(NaN)).toBe(0);
    expect(clampProgress(0 / 0)).toBe(0);
  });

  it('returns 0 for non-finite or missing values', () => {
    expect(clampProgress(Infinity)).toBe(0);
    expect(clampProgress(undefined)).toBe(0);
  });
});
