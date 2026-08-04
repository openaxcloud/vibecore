/*
 * Per-account brute-force / credential-stuffing protection.
 *
 * The global per-IP rate limit (10 login attempts / min / IP) does NOT stop a
 * DISTRIBUTED credential-stuffing attack: a botnet with thousands of IPs, each
 * staying under 10/min, can still hammer ONE account. This adds an account-scoped
 * lock: after `maxFailures` failed attempts inside `windowMs`, the account is
 * temporarily locked for `lockMs`. A successful login clears it.
 *
 * This module is the pure, unit-testable state machine — no I/O, no clock (the
 * caller passes `nowMs`). The DB row + the atomic increment live in the store; the
 * login route wires it in. Design constraints proven by the tests:
 *  - fail-open on a store error is SAFE here: the lock is defence-in-depth ON TOP
 *    of the password check, so degrading it never grants access without the right
 *    password (the route keeps verifying credentials).
 *  - no account enumeration: a locked real account returns the SAME generic 401 as
 *    invalid credentials, so an attacker can't use the lock to probe which emails
 *    exist.
 *  - the lock is BOUNDED (auto-expires after lockMs) so an attacker locking a
 *    victim causes only a short, self-healing denial — never a permanent one.
 */

export interface LoginThrottleConfig {
  /** Failed attempts within `windowMs` that trigger a lock. */
  maxFailures: number;
  /** Sliding window in which failures accumulate toward `maxFailures`. */
  windowMs: number;
  /** How long an account stays locked once triggered. */
  lockMs: number;
}

export const DEFAULT_LOGIN_THROTTLE: LoginThrottleConfig = {
  maxFailures: 10,
  windowMs: 15 * 60 * 1000,
  lockMs: 15 * 60 * 1000,
};

export interface LoginLockoutState {
  failedCount: number;
  firstFailedAtMs: number | null;
  lockedUntilMs: number | null;
}

export const CLEARED_LOCKOUT: LoginLockoutState = {
  failedCount: 0,
  firstFailedAtMs: null,
  lockedUntilMs: null,
};

/** True while the account is inside an active lock window. */
export function isLockedNow(state: LoginLockoutState, nowMs: number): boolean {
  return state.lockedUntilMs !== null && nowMs < state.lockedUntilMs;
}

/** Milliseconds until the current lock lifts (0 if not locked). */
export function retryAfterMs(state: LoginLockoutState, nowMs: number): number {
  return isLockedNow(state, nowMs) ? Math.max(0, state.lockedUntilMs! - nowMs) : 0;
}

/**
 * Compute the next lockout state after ONE failed attempt at `nowMs`. Starts a
 * fresh counting window when there was none, when the previous window has elapsed,
 * or when a previous lock has expired; otherwise increments, arming a lock the
 * moment the count reaches `maxFailures`. A failure recorded while STILL locked
 * leaves the existing lock untouched (no indefinite extension → no permanent DoS).
 */
export function nextStateOnFailure(
  state: LoginLockoutState,
  nowMs: number,
  config: LoginThrottleConfig = DEFAULT_LOGIN_THROTTLE,
): LoginLockoutState {
  if (isLockedNow(state, nowMs)) {
    return state;
  }

  const lockExpired = state.lockedUntilMs !== null && nowMs >= state.lockedUntilMs;
  const windowElapsed = state.firstFailedAtMs === null || nowMs - state.firstFailedAtMs >= config.windowMs;

  if (lockExpired || windowElapsed) {
    // Fresh window.
    return {
      failedCount: 1,
      firstFailedAtMs: nowMs,
      lockedUntilMs: 1 >= config.maxFailures ? nowMs + config.lockMs : null,
    };
  }

  const failedCount = state.failedCount + 1;

  return {
    failedCount,
    firstFailedAtMs: state.firstFailedAtMs,
    lockedUntilMs: failedCount >= config.maxFailures ? nowMs + config.lockMs : null,
  };
}

/** Read the throttle config from the environment, falling back to the defaults. */
export function loginThrottleConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LoginThrottleConfig {
  const int = (value: string | undefined, fallback: number) => {
    const n = Number(value);

    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };

  return {
    maxFailures: int(env.AUTH_ACCOUNT_LOCK_MAX_FAILURES, DEFAULT_LOGIN_THROTTLE.maxFailures),
    windowMs: int(env.AUTH_ACCOUNT_LOCK_WINDOW_MS, DEFAULT_LOGIN_THROTTLE.windowMs),
    lockMs: int(env.AUTH_ACCOUNT_LOCK_MS, DEFAULT_LOGIN_THROTTLE.lockMs),
  };
}
