/*
 * Session idle (inactivity) timeout.
 *
 * A session's `expiresAt` is an ABSOLUTE cap (default 30 days). Without an idle
 * timeout, a stolen session token stays valid for that whole window even if never
 * used. This adds an inactivity bound: a session unused for longer than the idle
 * timeout is rejected at auth time — shrinking the stolen-token window to the idle
 * period. Activity (an authenticated request) refreshes `lastActiveAt`, so a
 * genuinely-used session stays alive up to the absolute cap.
 *
 * Pure helpers only — no I/O. The store enforces the check in findSessionByToken;
 * requireAuth refreshes lastActiveAt (throttled, best-effort).
 */

const DEFAULT_IDLE_TIMEOUT_MS = 72 * 60 * 60 * 1000; // 72h
const MIN_IDLE_TIMEOUT_MS = 60 * 1000; // never below 1min (guards against a fat-fingered tiny value)

/**
 * Idle timeout in ms from the env (SESSION_IDLE_TIMEOUT_MS), clamped to a sane
 * floor. 0 / negative / non-numeric ⇒ the default. Returns Infinity only if
 * explicitly disabled via SESSION_IDLE_TIMEOUT_MS=off (kept for an operator escape
 * hatch; the absolute expiry still applies).
 */
export function sessionIdleTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SESSION_IDLE_TIMEOUT_MS;

  if (raw === 'off') {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_IDLE_TIMEOUT_MS;
  }

  return Math.max(MIN_IDLE_TIMEOUT_MS, Math.floor(parsed));
}

/**
 * Refresh the stored lastActiveAt only when it has drifted past `throttleMs` from
 * now — so an active session writes at most once per throttle window instead of on
 * every request. Returns true when a write is warranted.
 */
export function shouldRefreshActivity(lastActiveAtMs: number, nowMs: number, throttleMs = 60_000): boolean {
  return nowMs - lastActiveAtMs >= throttleMs;
}

/**
 * A session is idle-expired when the last observed activity is older than the idle
 * timeout. `lastActiveAtMs` should fall back to the session's createdAt for rows
 * that predate the column (never seen activity).
 */
export function isSessionIdleExpired(lastActiveAtMs: number, nowMs: number, idleMs: number): boolean {
  return Number.isFinite(idleMs) && nowMs - lastActiveAtMs >= idleMs;
}
