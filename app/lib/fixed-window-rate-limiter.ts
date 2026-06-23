/**
 * A small in-memory fixed-window rate limiter that bounds its own memory.
 *
 * Backed by a `Map<key, { count, resetTime }>`. On every `check()` call it
 * opportunistically sweeps entries whose window has expired so the Map does not
 * grow unbounded across unique keys (e.g. one entry per distinct client IP on a
 * public, internet-facing endpoint). As a hard backstop, the Map is also capped
 * at `maxEntries`; when the cap would be exceeded, the entries closest to
 * expiry are evicted first.
 */
export interface FixedWindowRateLimiterOptions {
  /** Maximum number of allowed hits within a single window. */
  limit: number;

  /** Window duration in milliseconds. */
  windowMs: number;

  /**
   * Hard cap on the number of tracked keys. Prevents unbounded growth even
   * under a flood of unique keys within a single window. Defaults to 10000.
   */
  maxEntries?: number;

  /** Clock injection point for tests. Defaults to `Date.now`. */
  now?: () => number;
}

interface Bucket {
  count: number;
  resetTime: number;
}

export class FixedWindowRateLimiter {
  private readonly _store = new Map<string, Bucket>();
  private readonly _limit: number;
  private readonly _windowMs: number;
  private readonly _maxEntries: number;
  private readonly _now: () => number;

  constructor(options: FixedWindowRateLimiterOptions) {
    this._limit = options.limit;
    this._windowMs = options.windowMs;
    this._maxEntries = options.maxEntries ?? 10000;
    this._now = options.now ?? Date.now;
  }

  /** Current number of tracked keys. Primarily for tests/observability. */
  get size(): number {
    return this._store.size;
  }

  /**
   * Records a hit for `key` and returns `true` if it is within the limit,
   * `false` if the limit has been exceeded for the current window.
   */
  check(key: string): boolean {
    const now = this._now();

    this._sweep(now);

    const bucket = this._store.get(key);

    if (!bucket || now > bucket.resetTime) {
      this._enforceCap();
      this._store.set(key, { count: 1, resetTime: now + this._windowMs });

      return true;
    }

    if (bucket.count >= this._limit) {
      return false;
    }

    bucket.count += 1;

    return true;
  }

  /** Removes all entries whose window has already elapsed. */
  private _sweep(now: number): void {
    for (const [key, bucket] of this._store) {
      if (now > bucket.resetTime) {
        this._store.delete(key);
      }
    }
  }

  /**
   * Backstop against a single-window flood of unique keys: if the Map is at
   * capacity, evict the entries that expire soonest to make room.
   */
  private _enforceCap(): void {
    if (this._store.size < this._maxEntries) {
      return;
    }

    const overflow = this._store.size - this._maxEntries + 1;
    const byResetTime = [...this._store.entries()].sort((a, b) => a[1].resetTime - b[1].resetTime);

    for (let i = 0; i < overflow && i < byResetTime.length; i += 1) {
      this._store.delete(byResetTime[i][0]);
    }
  }
}
