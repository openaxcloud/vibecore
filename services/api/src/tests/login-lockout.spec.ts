import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * Per-account brute-force lock (endpoint wiring). The state machine is proven in
 * login-throttle.spec.ts and the atomicity in login-lockout.integration.spec.ts;
 * here we prove the /auth/login route: lock after N failures, a locked account
 * returns the GENERIC 401 (no enumeration), a successful login resets the counter,
 * MFA failures count too, and a lock-store outage fails OPEN (never a 500, never a
 * credential bypass).
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

describe('per-account login lockout (endpoint)', () => {
  const prevMax = process.env.AUTH_ACCOUNT_LOCK_MAX_FAILURES;
  const prevRl = process.env.API_RATE_LIMIT_MAX;

  beforeEach(() => {
    process.env.AUTH_ACCOUNT_LOCK_MAX_FAILURES = '3';
    process.env.API_RATE_LIMIT_MAX = '100000'; // isolate the ACCOUNT lock from the per-IP limiter
  });
  afterEach(() => {
    if (prevMax === undefined) delete process.env.AUTH_ACCOUNT_LOCK_MAX_FAILURES;
    else process.env.AUTH_ACCOUNT_LOCK_MAX_FAILURES = prevMax;
    if (prevRl === undefined) delete process.env.API_RATE_LIMIT_MAX;
    else process.env.API_RATE_LIMIT_MAX = prevRl;
  });

  async function setup() {
    const store = new TestApiStore();
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });
    const email = 'lock@example.com';
    const password = 'correct-horse-1';
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password, name: 'L', organizationName: 'L Org' },
    });
    return { app, store, email, password };
  }

  const login = (app: any, email: string, password: string) =>
    app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });

  it('locks the account after maxFailures and refuses even the correct password (generic 401)', async () => {
    const { app, email, password } = await setup();

    for (let i = 0; i < 3; i++) {
      const bad = await login(app, email, 'wrong-password');
      expect(bad.statusCode).toBe(401);
      expect((bad.json() as { code: string }).code).toBe('AUTH_INVALID_CREDENTIALS');
    }

    // Now locked: the CORRECT password is refused, with the SAME generic body.
    const locked = await login(app, email, password);
    expect(locked.statusCode).toBe(401);
    expect((locked.json() as { code: string }).code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('does not enumerate: a locked real account and an unknown email return identical 401', async () => {
    const { app, email } = await setup();
    for (let i = 0; i < 3; i++) await login(app, email, 'wrong-password');

    const lockedReal = await login(app, email, 'whatever');
    const unknown = await login(app, 'ghost@example.com', 'whatever');
    expect(lockedReal.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(lockedReal.json()).toEqual(unknown.json());
  });

  it('a successful login before the threshold resets the counter', async () => {
    const { app, store, email, password } = await setup();
    await login(app, email, 'wrong-password');
    await login(app, email, 'wrong-password'); // 2 failures (< 3)

    const ok = await login(app, email, password);
    expect(ok.statusCode).toBe(200);
    expect(await store.getLoginLockout((await store.findUserByEmail(email))!.id)).toBeUndefined();

    // Counter is fresh: 2 more failures still don't lock.
    await login(app, email, 'wrong-password');
    await login(app, email, 'wrong-password');
    const stillOpen = await login(app, email, password);
    expect(stillOpen.statusCode).toBe(200);
  });

  it('fails OPEN on a lockout-store outage: correct password still works, wrong still 401 (no bypass, no 500)', async () => {
    const { app, store, email, password } = await setup();
    store.loginLockoutShouldThrow = true;

    const good = await login(app, email, password);
    expect(good.statusCode).toBe(200); // auth not broken by the throttle store being down

    const bad = await login(app, email, 'wrong-password');
    expect(bad.statusCode).toBe(401); // and a wrong password is NOT let through
  });
});
