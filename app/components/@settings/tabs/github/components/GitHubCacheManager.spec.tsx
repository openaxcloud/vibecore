/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheManagerService } from './GitHubCacheManager';

/*
 * Regression coverage for the "Oldest timestamp is meaningless for entries without a
 * timestamp field" bug. Keys like github_connection store a raw object with no
 * `timestamp`, so the previous `parsed.timestamp || Date.now()` fallback pinned the
 * oldest date to "now" and made clearExpiredCache() never expire those entries.
 */

const KEY_WITH_TS = 'github_stats_cache';
const KEY_NO_TS = 'github_connection';

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

beforeEach(() => {
  localStorage.clear();
});

describe('CacheManagerService.getCacheEntries', () => {
  it('leaves timestamp undefined for entries that have no timestamp field', () => {
    localStorage.setItem(KEY_NO_TS, JSON.stringify({ user: { login: 'octocat' }, token: 'tok' }));

    const entries = CacheManagerService.getCacheEntries();
    const entry = entries.find((e) => e.key === KEY_NO_TS);

    expect(entry).toBeDefined();
    expect(entry?.timestamp).toBeUndefined();
  });

  it('keeps the real timestamp for entries that have one', () => {
    const ts = 1_000_000;
    localStorage.setItem(KEY_WITH_TS, JSON.stringify({ timestamp: ts, value: 1 }));

    const entries = CacheManagerService.getCacheEntries();
    const entry = entries.find((e) => e.key === KEY_WITH_TS);

    expect(entry?.timestamp).toBe(ts);
  });
});

describe('CacheManagerService.getCacheStats', () => {
  it('ignores timestamp-less entries when computing oldest/newest', () => {
    const realTs = 1_000_000;

    // Has a real timestamp far in the past.
    localStorage.setItem(KEY_WITH_TS, JSON.stringify({ timestamp: realTs }));

    // No timestamp at all — must NOT influence oldest/newest.
    localStorage.setItem(KEY_NO_TS, JSON.stringify({ user: { login: 'octocat' } }));

    const stats = CacheManagerService.getCacheStats();

    expect(stats.totalEntries).toBe(2);
    expect(stats.oldestEntry).toBe(realTs);
    expect(stats.newestEntry).toBe(realTs);
  });

  it('reports oldest/newest as 0 when no entry has a real timestamp', () => {
    localStorage.setItem(KEY_NO_TS, JSON.stringify({ user: { login: 'octocat' } }));

    const stats = CacheManagerService.getCacheStats();

    expect(stats.totalEntries).toBe(1);
    expect(stats.oldestEntry).toBe(0);
    expect(stats.newestEntry).toBe(0);
  });
});

describe('CacheManagerService.clearExpiredCache', () => {
  it('never expires entries that lack a timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    localStorage.setItem(KEY_NO_TS, JSON.stringify({ user: { login: 'octocat' } }));

    const removed = CacheManagerService.clearExpiredCache(24 * 60 * 60 * 1000);

    expect(removed).toBe(0);
    expect(localStorage.getItem(KEY_NO_TS)).not.toBeNull();
  });

  it('expires entries whose real timestamp is older than maxAge', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));

    const dayMs = 24 * 60 * 60 * 1000;
    const twoDaysAgo = Date.now() - 2 * dayMs;

    localStorage.setItem(KEY_WITH_TS, JSON.stringify({ timestamp: twoDaysAgo }));

    const removed = CacheManagerService.clearExpiredCache(dayMs);

    expect(removed).toBe(1);
    expect(localStorage.getItem(KEY_WITH_TS)).toBeNull();
  });

  it('keeps entries whose real timestamp is within maxAge', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));

    const dayMs = 24 * 60 * 60 * 1000;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    localStorage.setItem(KEY_WITH_TS, JSON.stringify({ timestamp: oneHourAgo }));

    const removed = CacheManagerService.clearExpiredCache(dayMs);

    expect(removed).toBe(0);
    expect(localStorage.getItem(KEY_WITH_TS)).not.toBeNull();
  });
});
