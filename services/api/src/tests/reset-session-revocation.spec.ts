import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * Password reset must invalidate the account's live sessions — a reset is how a
 * victim recovers a compromised account, so it MUST kick out any hijacker. It also
 * must be single-use (per token AND per user) and enumeration-safe. Proven here at
 * the endpoint; the atomicity/concurrency guarantees are in the *.integration spec.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

describe('password reset — session revocation + single-use (endpoint)', () => {
  const prevRl = process.env.API_RATE_LIMIT_MAX;
  beforeEach(() => {
    process.env.API_RATE_LIMIT_MAX = '100000';
  });
  afterEach(() => {
    if (prevRl === undefined) delete process.env.API_RATE_LIMIT_MAX;
    else process.env.API_RATE_LIMIT_MAX = prevRl;
  });

  async function setup() {
    const store = new TestApiStore();
    const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });
    const email = 'reset@example.com';
    const password = 'old-password-1';
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password, name: 'R', organizationName: 'R Org' },
    });
    const session1 = (reg.json() as { token: string }).token;
    // A second device / session.
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
    const session2 = (login.json() as { token: string }).token;
    return { app, store, email, password, session1, session2 };
  }

  const requestReset = (app: any, email: string) =>
    app.inject({ method: 'POST', url: '/auth/password-reset/request', payload: { email } });
  const confirmReset = (app: any, token: string, password: string) =>
    app.inject({ method: 'POST', url: '/auth/password-reset/confirm', payload: { token, password } });
  const authed = (app: any, token: string) =>
    app.inject({ method: 'GET', url: '/auth/sessions', headers: { authorization: `Bearer ${token}` } });

  it('revokes ALL sessions on reset — old tokens are rejected, the new password works', async () => {
    const { app, store, email, session1, session2 } = await setup();
    expect((await authed(app, session1)).statusCode).toBe(200);
    expect((await authed(app, session2)).statusCode).toBe(200);

    const token = (await requestReset(app, email).then((r: any) => r.json())).resetToken as string;
    const confirmed = await confirmReset(app, token, 'brand-new-pass-9');
    expect(confirmed.statusCode).toBe(200);

    // Both pre-reset sessions are now dead — at the HTTP layer AND in the store.
    expect((await authed(app, session1)).statusCode).toBe(401);
    expect((await authed(app, session2)).statusCode).toBe(401);
    expect(await store.findSessionByToken(session1)).toBeUndefined();
    expect(await store.findSessionByToken(session2)).toBeUndefined();

    // The new password logs in; the old one does not.
    expect((await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: 'brand-new-pass-9' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: 'old-password-1' } })).statusCode).toBe(401);
  });

  it('is single-use: replaying the same reset token fails', async () => {
    const { app, email } = await setup();
    const token = (await requestReset(app, email).then((r: any) => r.json())).resetToken as string;
    expect((await confirmReset(app, token, 'first-new-pass-1')).statusCode).toBe(200);
    const replay = await confirmReset(app, token, 'second-new-pass-2');
    expect(replay.statusCode).toBe(400);
    expect((replay.json() as { code: string }).code).toBe('AUTH_INVALID_RESET_TOKEN');
  });

  it('invalidates OTHER outstanding reset tokens for the user (per-user single-use)', async () => {
    const { app, email } = await setup();
    const tokenA = (await requestReset(app, email).then((r: any) => r.json())).resetToken as string;
    const tokenB = (await requestReset(app, email).then((r: any) => r.json())).resetToken as string;
    expect(tokenA).not.toBe(tokenB);

    expect((await confirmReset(app, tokenB, 'used-b-pass-1')).statusCode).toBe(200);
    // A, issued earlier, can no longer reset the password.
    expect((await confirmReset(app, tokenA, 'attacker-pass-1')).statusCode).toBe(400);
  });

  it('the reset REQUEST does not enumerate accounts', async () => {
    const { app, email } = await setup();
    const existing = await requestReset(app, email);
    const unknown = await requestReset(app, 'nobody@example.com');
    expect(existing.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(200);
    expect((existing.json() as { accepted: boolean }).accepted).toBe(true);
    expect((unknown.json() as { accepted: boolean }).accepted).toBe(true);
  });

  it('a FAILED reset (bad token) leaves the session and password intact (no partial state)', async () => {
    const { app, store, email, session1 } = await setup();
    const bad = await confirmReset(app, 'not-a-real-token', 'whatever-pass-1');
    expect(bad.statusCode).toBe(400);

    // Nothing changed: the old session still works and the old password still logs in.
    expect((await authed(app, session1)).statusCode).toBe(200);
    expect(await store.findSessionByToken(session1)).toBeDefined();
    expect((await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: 'old-password-1' } })).statusCode).toBe(200);
  });
});
