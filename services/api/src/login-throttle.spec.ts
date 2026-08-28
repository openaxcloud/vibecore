import { describe, expect, it } from 'vitest';
import {
  CLEARED_LOCKOUT,
  DEFAULT_LOGIN_THROTTLE,
  isLockedNow,
  type LoginLockoutState,
  loginThrottleConfigFromEnv,
  nextStateOnFailure,
  retryAfterMs,
} from './login-throttle.js';

const CFG = { maxFailures: 3, windowMs: 1000, lockMs: 5000 };
const T0 = 1_000_000;

/** Replay N failures starting from CLEARED, one per `stepMs`, and return the state. */
function replay(count: number, stepMs = 10, start = CLEARED_LOCKOUT, t0 = T0): LoginLockoutState {
  let state = start;
  for (let i = 0; i < count; i++) {
    state = nextStateOnFailure(state, t0 + i * stepMs, CFG);
  }
  return state;
}

describe('login-throttle state machine', () => {
  it('locks exactly at maxFailures within the window', () => {
    const two = replay(2);
    expect(two.lockedUntilMs).toBeNull();
    expect(isLockedNow(two, T0 + 20)).toBe(false);

    const three = replay(3);
    expect(three.failedCount).toBe(3);
    expect(three.lockedUntilMs).toBe(T0 + 20 + CFG.lockMs); // locked at the 3rd failure (t = T0+20)
    expect(isLockedNow(three, T0 + 21)).toBe(true);
  });

  it('a failure while locked does NOT extend the lock (no permanent DoS)', () => {
    const locked = replay(3);
    const lockUntil = locked.lockedUntilMs!;
    const again = nextStateOnFailure(locked, lockUntil - 100, CFG);
    expect(again.lockedUntilMs).toBe(lockUntil); // unchanged
  });

  it('the lock auto-expires; a later failure starts a fresh window', () => {
    const locked = replay(3);
    const afterLock = locked.lockedUntilMs! + 1;
    expect(isLockedNow(locked, afterLock)).toBe(false); // lock lifted
    const fresh = nextStateOnFailure(locked, afterLock, CFG);
    expect(fresh).toEqual({ failedCount: 1, firstFailedAtMs: afterLock, lockedUntilMs: null });
  });

  it('failures spread beyond the window never accumulate to a lock', () => {
    // one failure every windowMs+1 → the window always resets, count stays 1
    const state = replay(10, CFG.windowMs + 1);
    expect(state.failedCount).toBe(1);
    expect(state.lockedUntilMs).toBeNull();
  });

  it('retryAfterMs reports remaining lock time and 0 when unlocked', () => {
    const locked = replay(3);
    expect(retryAfterMs(locked, locked.lockedUntilMs! - 1000)).toBe(1000);
    expect(retryAfterMs(locked, locked.lockedUntilMs! + 10)).toBe(0);
    expect(retryAfterMs(CLEARED_LOCKOUT, T0)).toBe(0);
  });

  it('a cleared state (successful login) resets the counter', () => {
    const afterReset = replay(2, 10, CLEARED_LOCKOUT); // 2 failures, not locked
    expect(afterReset.failedCount).toBe(2);
    // success → CLEARED, then 2 more failures start from 1, not 3
    const postSuccess = replay(2, 10, CLEARED_LOCKOUT, T0 + 100_000);
    expect(postSuccess.failedCount).toBe(2);
    expect(postSuccess.lockedUntilMs).toBeNull();
  });

  it('a maxFailures=1 config locks on the very first failure', () => {
    const one = nextStateOnFailure(CLEARED_LOCKOUT, T0, { maxFailures: 1, windowMs: 1000, lockMs: 5000 });
    expect(one.failedCount).toBe(1);
    expect(one.lockedUntilMs).toBe(T0 + 5000);
  });

  it('env config parses with sane fallbacks', () => {
    expect(loginThrottleConfigFromEnv({})).toEqual(DEFAULT_LOGIN_THROTTLE);
    expect(loginThrottleConfigFromEnv({ AUTH_ACCOUNT_LOCK_MAX_FAILURES: '5', AUTH_ACCOUNT_LOCK_MS: '60000' })).toEqual({
      maxFailures: 5,
      windowMs: DEFAULT_LOGIN_THROTTLE.windowMs,
      lockMs: 60000,
    });
    // garbage / non-positive → fallback
    expect(loginThrottleConfigFromEnv({ AUTH_ACCOUNT_LOCK_MAX_FAILURES: '-3' }).maxFailures).toBe(
      DEFAULT_LOGIN_THROTTLE.maxFailures,
    );
  });
});
