import { describe, expect, it } from 'vitest';
import { FixedWindowRateLimiter } from './fixed-window-rate-limiter';

describe('FixedWindowRateLimiter', () => {
  it('allows up to the limit then rejects within a window', () => {
    const now = 1000;
    const limiter = new FixedWindowRateLimiter({ limit: 3, windowMs: 1000, now: () => now });

    expect(limiter.check('a')).toBe(true);
    expect(limiter.check('a')).toBe(true);
    expect(limiter.check('a')).toBe(true);
    expect(limiter.check('a')).toBe(false);
  });

  it('resets the count once the window has elapsed', () => {
    let now = 1000;

    const limiter = new FixedWindowRateLimiter({ limit: 1, windowMs: 1000, now: () => now });

    expect(limiter.check('a')).toBe(true);
    expect(limiter.check('a')).toBe(false);

    now += 1001;

    expect(limiter.check('a')).toBe(true);
  });

  it('sweeps expired entries so the Map does not grow unbounded across keys', () => {
    let now = 0;

    const windowMs = 1000;
    const limiter = new FixedWindowRateLimiter({ limit: 5, windowMs, now: () => now });

    /*
     * Each unique key hits once, then time advances past its window. Without a
     * sweep this Map would retain one stale entry per key forever.
     */
    for (let i = 0; i < 1000; i += 1) {
      limiter.check(`ip-${i}`);
      now += windowMs + 1;
    }

    /*
     * The earlier 999 entries have all expired and been swept; only the most
     * recent live entry remains.
     */
    expect(limiter.size).toBeLessThanOrEqual(1);
  });

  it('caps the Map size under a single-window flood of unique keys', () => {
    const now = 5000;
    const limiter = new FixedWindowRateLimiter({ limit: 5, windowMs: 60_000, maxEntries: 50, now: () => now });

    for (let i = 0; i < 500; i += 1) {
      limiter.check(`ip-${i}`);
    }

    expect(limiter.size).toBeLessThanOrEqual(50);
  });

  it('tracks keys independently', () => {
    const now = 1000;
    const limiter = new FixedWindowRateLimiter({ limit: 1, windowMs: 1000, now: () => now });

    expect(limiter.check('a')).toBe(true);
    expect(limiter.check('b')).toBe(true);
    expect(limiter.check('a')).toBe(false);
    expect(limiter.check('b')).toBe(false);
  });
});
