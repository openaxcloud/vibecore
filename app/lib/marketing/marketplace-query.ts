/**
 * Pure helpers for parsing marketplace query-string parameters.
 *
 * Lives in app/lib (not a route, not a *.server module) so it can be imported
 * from route loaders without affecting the client/server bundle split, and so
 * it can be unit-tested in isolation.
 */

/**
 * Parse a `?limit=` style query value into a safe, non-negative integer count.
 *
 * `Number.isFinite` is true for negative numbers, so a raw
 * `Number(searchParams.get('limit'))` lets `?limit=-3` flow into
 * `Array.prototype.slice(0, -3)`, which silently drops the trailing items
 * instead of returning a sane count. `?limit=0` similarly yields an empty list.
 *
 * This clamps the value: anything non-finite, negative, or otherwise invalid
 * falls back to `fallback`. Fractional values are floored.
 *
 * @param raw       The raw query value (e.g. `searchParams.get('limit')`).
 * @param fallback  The default count when `raw` is missing or invalid.
 */
export function parseLimit(raw: string | null | undefined, fallback = 5): number {
  if (raw === null || raw === undefined || raw === '') {
    return fallback;
  }

  const n = Number(raw);

  if (!Number.isFinite(n) || n < 0) {
    return fallback;
  }

  return Math.floor(n);
}
