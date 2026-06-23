import { describe, expect, it } from 'vitest';
import {
  AUTO_CYCLE_INTERVAL_MS,
  AUTO_CYCLE_RESUME_DELAY_MS,
  nextFeatureIndex,
  shouldAutoCycle,
} from './mobile-auto-cycle';

describe('nextFeatureIndex', () => {
  it('advances by one within range', () => {
    expect(nextFeatureIndex(0, 6)).toBe(1);
    expect(nextFeatureIndex(3, 6)).toBe(4);
  });

  it('wraps around at the end', () => {
    expect(nextFeatureIndex(5, 6)).toBe(0);
  });

  it('does not move when there is nothing to cycle', () => {
    expect(nextFeatureIndex(0, 0)).toBe(0);
    expect(nextFeatureIndex(2, 1)).toBe(0); // single feature → always index 0
    expect(nextFeatureIndex(4, -1)).toBe(4);
  });

  it('tolerates non-finite / out-of-range inputs', () => {
    expect(nextFeatureIndex(NaN, 6)).toBe(1);
    expect(nextFeatureIndex(-3, 6)).toBe(1);
    expect(nextFeatureIndex(2.7, 6)).toBe(3);
    expect(nextFeatureIndex(NaN, NaN)).toBe(0);
  });
});

describe('shouldAutoCycle', () => {
  it('runs only when enabled and there is more than one feature', () => {
    expect(shouldAutoCycle(true, 6)).toBe(true);
    expect(shouldAutoCycle(true, 2)).toBe(true);
  });

  it('stops when paused (the fix: interacting with a demo pauses cycling)', () => {
    expect(shouldAutoCycle(false, 6)).toBe(false);
  });

  it('stops when there is nothing to cycle between', () => {
    expect(shouldAutoCycle(true, 1)).toBe(false);
    expect(shouldAutoCycle(true, 0)).toBe(false);
    expect(shouldAutoCycle(true, NaN)).toBe(false);
  });
});

describe('timing constants', () => {
  it('pauses noticeably longer than a single auto-advance interval', () => {
    /*
     * A user operating a demo should keep the panel for well over one cycle,
     * otherwise the fix would barely outlast the bug it replaces.
     */
    expect(AUTO_CYCLE_RESUME_DELAY_MS).toBeGreaterThan(AUTO_CYCLE_INTERVAL_MS);
  });
});
