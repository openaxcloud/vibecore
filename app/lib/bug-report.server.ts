/**
 * Server-only helpers for the public, unauthenticated bug-report endpoint.
 *
 * Kept out of the route module so they can be unit-tested directly (a route
 * file under app/routes/ must export only route entrypoints) and so the rate
 * limiter has a single shared module-level store.
 */

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REPORTS_PER_WINDOW = 5;

/*
 * Bound the store so a flood of unique IPs on this public endpoint can't grow
 * the Map without limit. When exceeded we prune expired entries first, then
 * (if still over) evict the soonest-to-expire entries.
 */
const MAX_TRACKED_IPS = 10000;

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// Rate limiting store (in production, use Redis or similar).
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Remove every entry whose window has already elapsed. Without this an IP that
 * submits once and never returns would leave a permanent entry, leaking memory
 * on a public endpoint.
 */
export function pruneExpiredRateLimits(now: number = Date.now()): void {
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

function enforceStoreCap(now: number): void {
  if (rateLimitStore.size <= MAX_TRACKED_IPS) {
    return;
  }

  pruneExpiredRateLimits(now);

  if (rateLimitStore.size <= MAX_TRACKED_IPS) {
    return;
  }

  /*
   * Still over the cap with only live entries: evict the soonest-to-expire
   * until we're back under the limit.
   */
  const sorted = [...rateLimitStore.entries()].sort((a, b) => a[1].resetTime - b[1].resetTime);

  for (const [key] of sorted) {
    if (rateLimitStore.size <= MAX_TRACKED_IPS) {
      break;
    }

    rateLimitStore.delete(key);
  }
}

/**
 * Returns true if the IP is currently under its quota, WITHOUT consuming a
 * token. Expired windows are evicted on read so dormant IPs don't accumulate.
 */
export function isRateLimited(ip: string, now: number = Date.now()): boolean {
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetTime) {
    // Expired window: evict so it doesn't linger.
    if (entry) {
      rateLimitStore.delete(ip);
    }

    return false;
  }

  return entry.count >= MAX_REPORTS_PER_WINDOW;
}

/**
 * Consume one token for the IP. Call this ONLY after a submission has been
 * fully validated and accepted (e.g. just before creating the issue), so that
 * validation failures, spam false-positives and double-submits don't burn an
 * honest user's quota.
 */
export function consumeRateLimit(ip: string, now: number = Date.now()): void {
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    enforceStoreCap(now);

    return;
  }

  entry.count += 1;
  rateLimitStore.set(ip, entry);
}

/** Test-only: reset the shared store between cases. */
export function __resetRateLimitStore(): void {
  rateLimitStore.clear();
}

/** Test-only: current number of tracked IPs. */
export function __rateLimitStoreSize(): number {
  return rateLimitStore.size;
}

/**
 * Read process env the way the Node SSR pod actually exposes it. The Vite
 * polyfill shims bare `process.env` to {} in the web bundle, so we must go
 * through globalThis (matching app/lib/marketing/ecode-public-runtime.server.ts).
 */
function runtimeEnv(): Record<string, string | undefined> {
  return (
    (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
  );
}

export interface BugReportConfig {
  githubToken: string;
  owner: string;
  repo: string;
}

export type BugReportConfigResult = { ok: true; config: BugReportConfig } | { ok: false; reason: 'token' | 'repo' };

/**
 * Resolve the GitHub token + target repo from the request context, falling
 * back to globalThis.process.env. Fails closed: there is NO default repo, so a
 * missing BUG_REPORT_REPO never silently files user reports into an upstream
 * public repository.
 */
export function resolveBugReportConfig(cloudflareEnv?: Record<string, unknown>): BugReportConfigResult {
  const env = runtimeEnv();

  const githubToken =
    (cloudflareEnv?.GITHUB_BUG_REPORT_TOKEN as string | undefined) || env.GITHUB_BUG_REPORT_TOKEN || '';

  if (!githubToken) {
    return { ok: false, reason: 'token' };
  }

  const targetRepo = ((cloudflareEnv?.BUG_REPORT_REPO as string | undefined) || env.BUG_REPORT_REPO || '').trim();

  const [owner, repo] = targetRepo.split('/');

  if (!owner || !repo) {
    return { ok: false, reason: 'repo' };
  }

  return { ok: true, config: { githubToken, owner, repo } };
}
