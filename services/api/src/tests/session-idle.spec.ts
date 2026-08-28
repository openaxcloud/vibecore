import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * Session idle-timeout (endpoint wiring). A session's absolute expiry is a 30-day
 * cap; this proves the inactivity bound: an unused session is rejected after the
 * idle window, activity refreshes it, the absolute cap still holds, and a failed
 * activity-write never breaks the request nor keeps an idle session alive.
 *
 * Time is faked (Date only) so the windows are deterministic without sleeping.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const IDLE = 120_000; // 2 min idle window for the test
const T0 = 1_900_000_000_000;

describe('session idle timeout (endpoint)', () => {
  const prevIdle = process.env.SESSION_IDLE_TIMEOUT_MS;
  const prevRl = process.env.API_RATE_LIMIT_MAX;

  beforeEach(() => {
    process.env.SESSION_IDLE_TIMEOUT_MS = String(IDLE);
    process.env.API_RATE_LIMIT_MAX = '100000';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
    if (prevIdle === undefined) delete process.env.SESSION_IDLE_TIMEOUT_MS;
    else process.env.SESSION_IDLE_TIMEOUT_MS = prevIdle;
    if (prevRl === undefined) delete process.env.API_RATE_LIMIT_MAX;
    else process.env.API_RATE_LIMIT_MAX = prevRl;
  });

  async function setup() {
    const store = new TestApiStore();
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'idle@example.com', password: 'password123', name: 'I', organizationName: 'I Org' },
    });
    const token = (reg.json() as { token: string }).token;
    return { app, store, token };
  }

  const authed = (app: any, token: string) =>
    app.inject({ method: 'GET', url: '/auth/sessions', headers: { authorization: `Bearer ${token}` } });

  it('rejects a session left idle past the timeout (before its absolute expiry)', async () => {
    const { app, token } = await setup();
    expect((await authed(app, token)).statusCode).toBe(200); // fresh

    vi.setSystemTime(T0 + IDLE + 1_000); // idle > window, no activity in between
    expect((await authed(app, token)).statusCode).toBe(401);
  });

  it('activity within the window keeps the session alive (heartbeat extends it)', async () => {
    const { app, token } = await setup();

    vi.setSystemTime(T0 + 70_000); // past the 60s touch throttle, within idle
    expect((await authed(app, token)).statusCode).toBe(200); // refreshes lastActiveAt to now

    vi.setSystemTime(T0 + 130_000); // 130s since login, but only 60s since last activity
    expect((await authed(app, token)).statusCode).toBe(200); // still valid — activity extended it
  });

  it('a failed activity-write fails OPEN (request still 200) and never revives an idle session', async () => {
    const { app, store, token } = await setup();
    store.touchSessionShouldThrow = true;

    // within the window: the heartbeat throws but the request still succeeds
    vi.setSystemTime(T0 + 70_000);
    expect((await authed(app, token)).statusCode).toBe(200);

    // and because the write failed, lastActiveAt was NOT bumped → the session
    // still ages out on schedule (fail-open on write, fail-closed on enforcement)
    vi.setSystemTime(T0 + IDLE + 1_000);
    expect((await authed(app, token)).statusCode).toBe(401);
  });

  it('the absolute expiry still applies independently of activity (idle disabled)', async () => {
    process.env.SESSION_IDLE_TIMEOUT_MS = 'off';
    const { app, token } = await setup();
    expect((await authed(app, token)).statusCode).toBe(200);

    vi.setSystemTime(T0 + 31 * 24 * 60 * 60 * 1000); // past the 30-day absolute cap
    expect((await authed(app, token)).statusCode).toBe(401);
  });

  it('an idle-expired session is indistinguishable from a garbage token (no enumeration)', async () => {
    const { app, token } = await setup();
    vi.setSystemTime(T0 + IDLE + 1_000);
    const idle = await authed(app, token);
    const garbage = await authed(app, 'session_totally-bogus');
    expect(idle.statusCode).toBe(401);
    expect(garbage.statusCode).toBe(401);
    expect(idle.json()).toEqual(garbage.json());
  });
});
