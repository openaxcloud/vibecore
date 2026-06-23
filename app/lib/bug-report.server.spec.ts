import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  __rateLimitStoreSize,
  __resetRateLimitStore,
  consumeRateLimit,
  isRateLimited,
  pruneExpiredRateLimits,
  resolveBugReportConfig,
} from './bug-report.server';

const WINDOW_MS = 60 * 60 * 1000;

describe('bug-report rate limiter', () => {
  beforeEach(() => {
    __resetRateLimitStore();
  });

  it('does not consume a token on a check (validation failures must not burn quota)', () => {
    const ip = '1.2.3.4';

    // Simulate many failed submissions: each only checks, never consumes.
    for (let i = 0; i < 20; i++) {
      expect(isRateLimited(ip)).toBe(false);
    }

    // Nothing was consumed, so a later valid submission still has full quota.
    expect(__rateLimitStoreSize()).toBe(0);
  });

  it('blocks only after 5 successful (consumed) submissions in the window', () => {
    const ip = '1.2.3.4';

    for (let i = 0; i < 5; i++) {
      expect(isRateLimited(ip)).toBe(false);
      consumeRateLimit(ip);
    }

    // 6th submission is now blocked.
    expect(isRateLimited(ip)).toBe(true);
  });

  it('resets the window after resetTime elapses', () => {
    const ip = '5.6.7.8';
    const t0 = 1_000_000;

    for (let i = 0; i < 5; i++) {
      consumeRateLimit(ip, t0);
    }
    expect(isRateLimited(ip, t0)).toBe(true);

    const later = t0 + WINDOW_MS + 1;
    expect(isRateLimited(ip, later)).toBe(false);

    // Expired entry is evicted on the read.
    expect(__rateLimitStoreSize()).toBe(0);
  });

  it('prunes expired entries so dormant IPs do not leak memory', () => {
    const t0 = 2_000_000;

    consumeRateLimit('a', t0);
    consumeRateLimit('b', t0);
    consumeRateLimit('c', t0);
    expect(__rateLimitStoreSize()).toBe(3);

    /*
     * One IP starts a fresh window after the original one expired; the others
     * go dormant and never return.
     */
    const afterExpiry = t0 + WINDOW_MS + 1;
    consumeRateLimit('a', afterExpiry); // resets a's window to a live one

    pruneExpiredRateLimits(afterExpiry);

    // a's window is live again; b and c expired and were pruned.
    expect(__rateLimitStoreSize()).toBe(1);
    expect(isRateLimited('b', afterExpiry)).toBe(false);
    expect(isRateLimited('c', afterExpiry)).toBe(false);
  });
});

describe('resolveBugReportConfig', () => {
  const KEYS = ['GITHUB_BUG_REPORT_TOKEN', 'BUG_REPORT_REPO'] as const;

  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};

    for (const k of KEYS) {
      saved[k] = (globalThis as any).process?.env?.[k];
      delete (globalThis as any).process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) {
        delete (globalThis as any).process.env[k];
      } else {
        (globalThis as any).process.env[k] = saved[k];
      }
    }
  });

  it('fails closed with reason "token" when no token is configured', () => {
    const result = resolveBugReportConfig(undefined);
    expect(result).toEqual({ ok: false, reason: 'token' });
  });

  it('fails closed with reason "repo" when token is set but repo is not (no upstream default)', () => {
    const result = resolveBugReportConfig({ GITHUB_BUG_REPORT_TOKEN: 'ghp_x' });
    expect(result).toEqual({ ok: false, reason: 'repo' });
  });

  it('does NOT default to the upstream bolt.diy repo', () => {
    const result = resolveBugReportConfig({ GITHUB_BUG_REPORT_TOKEN: 'ghp_x' });
    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.reason).toBe('repo');
    }
  });

  it('resolves owner/repo from the cloudflare env context', () => {
    const result = resolveBugReportConfig({
      GITHUB_BUG_REPORT_TOKEN: 'ghp_x',
      BUG_REPORT_REPO: 'openaxcloud/vibecore',
    });
    expect(result).toEqual({ ok: true, config: { githubToken: 'ghp_x', owner: 'openaxcloud', repo: 'vibecore' } });
  });

  it('reads from globalThis.process.env when context env is absent', () => {
    (globalThis as any).process.env.GITHUB_BUG_REPORT_TOKEN = 'ghp_from_env';
    (globalThis as any).process.env.BUG_REPORT_REPO = 'acme/app';

    const result = resolveBugReportConfig(undefined);
    expect(result).toEqual({ ok: true, config: { githubToken: 'ghp_from_env', owner: 'acme', repo: 'app' } });
  });

  it('rejects a malformed repo (missing slash)', () => {
    const result = resolveBugReportConfig({ GITHUB_BUG_REPORT_TOKEN: 'ghp_x', BUG_REPORT_REPO: 'no-slash' });
    expect(result).toEqual({ ok: false, reason: 'repo' });
  });
});
