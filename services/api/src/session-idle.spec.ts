import { describe, expect, it } from 'vitest';
import { isSessionIdleExpired, sessionIdleTimeoutMs, shouldRefreshActivity } from './session-idle.js';

const H = 60 * 60 * 1000;

describe('sessionIdleTimeoutMs', () => {
  it('defaults to 72h and honours a valid override', () => {
    expect(sessionIdleTimeoutMs({})).toBe(72 * H);
    expect(sessionIdleTimeoutMs({ SESSION_IDLE_TIMEOUT_MS: String(2 * H) })).toBe(2 * H);
  });

  it('clamps a too-small value to the 1-minute floor and rejects garbage', () => {
    expect(sessionIdleTimeoutMs({ SESSION_IDLE_TIMEOUT_MS: '5' })).toBe(60_000);
    expect(sessionIdleTimeoutMs({ SESSION_IDLE_TIMEOUT_MS: 'nonsense' })).toBe(72 * H);
    expect(sessionIdleTimeoutMs({ SESSION_IDLE_TIMEOUT_MS: '-1' })).toBe(72 * H);
    expect(sessionIdleTimeoutMs({ SESSION_IDLE_TIMEOUT_MS: '0' })).toBe(72 * H);
  });

  it('supports an explicit disable (still bounded by the absolute expiry elsewhere)', () => {
    expect(sessionIdleTimeoutMs({ SESSION_IDLE_TIMEOUT_MS: 'off' })).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('isSessionIdleExpired', () => {
  const idle = 2 * H;
  it('is false within the window, true once the window elapses', () => {
    expect(isSessionIdleExpired(1000, 1000 + H, idle)).toBe(false); // 1h idle < 2h
    expect(isSessionIdleExpired(1000, 1000 + idle, idle)).toBe(true); // exactly at the boundary
    expect(isSessionIdleExpired(1000, 1000 + idle + 1, idle)).toBe(true);
  });

  it('never expires when the idle timeout is disabled (Infinity)', () => {
    expect(isSessionIdleExpired(0, 10 * 365 * 24 * H, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('shouldRefreshActivity (throttle)', () => {
  it('refreshes only once the stored value drifts past the throttle window', () => {
    expect(shouldRefreshActivity(1000, 1000 + 30_000, 60_000)).toBe(false);
    expect(shouldRefreshActivity(1000, 1000 + 60_000, 60_000)).toBe(true);
    expect(shouldRefreshActivity(1000, 1000 + 120_000, 60_000)).toBe(true);
  });
});
