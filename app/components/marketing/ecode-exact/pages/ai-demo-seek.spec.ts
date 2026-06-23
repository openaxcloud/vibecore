import { describe, expect, it } from 'vitest';
import { resolveSeekTime } from './ai-demo-seek';

describe('resolveSeekTime', () => {
  it('returns 0 when duration is not yet known (metadata not loaded)', () => {
    expect(resolveSeekTime(0.5, NaN)).toBe(0);
    expect(resolveSeekTime(0.5, 0)).toBe(0);
    expect(resolveSeekTime(0.5, Infinity)).toBe(0);
  });

  it('maps a fractional position onto the real duration', () => {
    // 72s clip (~1:12), like the shared platform-demo.mp4 asset.
    expect(resolveSeekTime(0, 72)).toBe(0);
    expect(resolveSeekTime(1 / 3, 72)).toBeCloseTo(24, 5);
    expect(resolveSeekTime(2 / 3, 72)).toBeCloseTo(48, 5);
  });

  it('never overshoots the clip — clamps strictly below the end', () => {
    /*
     * The old code used absolute cues (65s, 132s) that overshot a ~72s clip and
     * clamped to the tail. With fractional positions and end-margin clamping,
     * distinct cards resolve to distinct, in-bounds timestamps.
     */
    const duration = 72;
    const first = resolveSeekTime(1 / 3, duration);
    const second = resolveSeekTime(2 / 3, duration);

    expect(first).toBeLessThan(duration);
    expect(second).toBeLessThan(duration);
    expect(first).not.toBe(second);

    // A position of 1.0 must still stay below the absolute end.
    expect(resolveSeekTime(1, duration)).toBeLessThan(duration);
    expect(resolveSeekTime(1, duration)).toBe(duration - 0.5);
  });

  it('clamps out-of-range and non-finite positions into [0, 1]', () => {
    expect(resolveSeekTime(-5, 72)).toBe(0);
    expect(resolveSeekTime(2, 72)).toBe(72 - 0.5);
    expect(resolveSeekTime(NaN, 72)).toBe(0);
  });
});
