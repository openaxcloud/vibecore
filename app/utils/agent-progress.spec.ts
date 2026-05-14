import { describe, expect, it } from 'vitest';
import { estimateETA, formatDuration } from './agent-progress';

describe('agent progress estimates', () => {
  it('returns null until progress is measurable', () => {
    expect(estimateETA(10_000, 0)).toBeNull();
    expect(estimateETA(10_000, 100)).toBeNull();
    expect(estimateETA(0, 50)).toBeNull();
  });

  it('estimates remaining time from elapsed time and percent complete', () => {
    expect(estimateETA(10_000, 25)).toBe(30_000);
    expect(estimateETA(45_000, 75)).toBe(15_000);
  });

  it('formats durations for compact agent UI labels', () => {
    expect(formatDuration(null)).toBe('calculating');
    expect(formatDuration(9_200)).toBe('10s');
    expect(formatDuration(65_000)).toBe('1m 5s');
    expect(formatDuration(3_600_000)).toBe('1h');
    expect(formatDuration(3_900_000)).toBe('1h 5m');
  });
});
