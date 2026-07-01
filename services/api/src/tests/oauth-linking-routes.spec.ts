import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/*
 * Account linking (Replit "connected accounts"): a signed-in user can link a
 * second OAuth provider to their existing account and unlink it, without account
 * takeover or locking themselves out. Uses the test-mode pre-resolved profile
 * (email+externalId+accessToken) so no real code exchange runs.
 */
async function register(app: any, email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'password123', name: 'Tester', organizationName: 'Org' },
  });
  expect(res.statusCode).toBe(201);

  return res.json() as { token: string; user: { id: string } };
}

describe('OAuth account linking routes', () => {
  it('links a second provider to the signed-in user (bound to currentUser, not by email)', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
    const { token } = await register(app, 'a@example.com');

    const link = await app.inject({
      method: 'POST',
      url: '/auth/oauth/github/link',
      headers: auth(token),
      payload: { email: 'a@example.com', externalId: 'gh_1', accessToken: 'tok' },
    });
    expect(link.statusCode).toBe(200);
    expect(link.json()).toMatchObject({ provider: 'github', externalId: 'gh_1' });

    const list = await app.inject({ method: 'GET', url: '/auth/connections', headers: auth(token) });
    expect((list.json().connections as Array<{ provider: string }>).map((c) => c.provider)).toContain('github');

    await app.close();
  });

  it('rejects linking a provider identity already bound to another user (takeover guard, 409)', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
    const a = await register(app, 'a@example.com');
    const b = await register(app, 'b@example.com');

    const first = await app.inject({
      method: 'POST',
      url: '/auth/oauth/github/link',
      headers: auth(a.token),
      payload: { email: 'a@example.com', externalId: 'gh_shared', accessToken: 'tok' },
    });
    expect(first.statusCode).toBe(200);

    const stolen = await app.inject({
      method: 'POST',
      url: '/auth/oauth/github/link',
      headers: auth(b.token),
      payload: { email: 'b@example.com', externalId: 'gh_shared', accessToken: 'tok2' },
    });
    expect(stolen.statusCode).toBe(409);
    expect(stolen.json().code).toBe('OAUTH_ALREADY_LINKED');

    await app.close();
  });

  it('rejects an unauthenticated link (401) and an unknown provider (400)', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
    const { token } = await register(app, 'a@example.com');

    const anon = await app.inject({
      method: 'POST',
      url: '/auth/oauth/github/link',
      payload: { email: 'a@example.com', externalId: 'gh_1', accessToken: 'tok' },
    });
    expect(anon.statusCode).toBe(401);

    const unknown = await app.inject({
      method: 'POST',
      url: '/auth/oauth/twitter/link',
      headers: auth(token),
      payload: { email: 'a@example.com', externalId: 'x', accessToken: 'tok' },
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().code).toBe('OAUTH_PROVIDER_UNKNOWN');

    await app.close();
  });

  it('unlinks a provider when the user still has another sign-in method', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
    const { token } = await register(app, 'a@example.com'); // has a password

    await app.inject({
      method: 'POST',
      url: '/auth/oauth/github/link',
      headers: auth(token),
      payload: { email: 'a@example.com', externalId: 'gh_1', accessToken: 'tok' },
    });

    const res = await app.inject({ method: 'DELETE', url: '/auth/connections/github', headers: auth(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().deleted).toBe(true);

    const list = await app.inject({ method: 'GET', url: '/auth/connections', headers: auth(token) });
    expect((list.json().connections as unknown[]).length).toBe(0);

    await app.close();
  });

  it('refuses to unlink the ONLY sign-in method of a passwordless OAuth user', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

    // Passwordless user (no usable password) with a single github connection.
    const user = await store.createUser({ email: 'oauth@example.com', name: 'OAuth User', passwordHash: '' });
    await store.upsertOAuthConnection({ userId: user.id, provider: 'github', externalId: 'gh_only', accessToken: 't' });
    await store.createSession({ userId: user.id, token: 'oauth-token', expiresAt: new Date(Date.now() + 3600_000) });

    const res = await app.inject({ method: 'DELETE', url: '/auth/connections/github', headers: auth('oauth-token') });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('LAST_LOGIN_METHOD');

    await app.close();
  });
});

describe('GET /auth/oauth/providers (login readiness)', () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.GITHUB_CLIENT_ID = 'gh-id';
    delete process.env.GOOGLE_CLIENT_ID;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it('reports each provider ready flag (configured vs not)', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

    const res = await app.inject({ method: 'GET', url: '/auth/oauth/providers' });
    expect(res.statusCode).toBe(200);
    const providers = res.json().providers as Array<{ provider: string; ready: boolean }>;
    expect(providers.find((p) => p.provider === 'github')?.ready).toBe(true);
    expect(providers.find((p) => p.provider === 'google')?.ready).toBe(false);

    await app.close();
  });
});
