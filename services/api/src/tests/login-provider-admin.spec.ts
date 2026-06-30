import { hashPassword } from '@vibecore/auth';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/*
 * Admin self-service social-login provider config (GitHub / Google sign-in): the
 * store contract that backs GET/POST /admin/login-providers plus the route-level
 * proof that the login flow reads these DB-first (admin client_id wins over env)
 * and that disabling a provider turns its sign-in off. The encrypted secret must
 * round-trip but never surface in the masked write-result (only hasSecret).
 */
describe('login provider admin config (store)', () => {
  it('returns null before any admin write (env-fallback path)', async () => {
    const store = new TestApiStore();
    expect(await store.getLoginProviderConfig('github')).toBeNull();
  });

  it('stores client id + encrypted secret and masks the secret in the result', async () => {
    const store = new TestApiStore();
    const result = await store.upsertLoginProviderConfig({
      provider: 'github',
      clientId: 'gh-login-id',
      clientSecretEnc: 'enc:super-secret',
      enabled: true,
    });

    expect(result).toEqual({ provider: 'github', enabled: true, clientId: 'gh-login-id', hasSecret: true });
    expect(JSON.stringify(result)).not.toContain('super-secret');

    const stored = await store.getLoginProviderConfig('github');
    expect(stored?.clientId).toBe('gh-login-id');
    expect(stored?.clientSecretEnc).toBe('enc:super-secret');
    expect(stored?.enabled).toBe(true);
  });

  it('updates fields independently — toggling enabled keeps id + secret + scopes', async () => {
    const store = new TestApiStore();
    await store.upsertLoginProviderConfig({
      provider: 'google',
      clientId: 'g-id',
      clientSecretEnc: 'enc:g',
      scopes: ['openid', 'email', 'profile'],
      enabled: true,
    });

    const toggled = await store.upsertLoginProviderConfig({ provider: 'google', enabled: false });

    expect(toggled.enabled).toBe(false);
    expect(toggled.clientId).toBe('g-id');
    expect(toggled.hasSecret).toBe(true);
    expect((await store.getLoginProviderConfig('google'))?.scopes).toEqual(['openid', 'email', 'profile']);
  });
});

describe('login provider admin config (routes + login flow)', () => {
  const prevId = process.env.GITHUB_CLIENT_ID;
  const prevSecret = process.env.GITHUB_CLIENT_SECRET;

  beforeEach(() => {
    process.env.GITHUB_CLIENT_ID = 'env-github-id';
    process.env.GITHUB_CLIENT_SECRET = 'env-github-secret';
  });

  afterEach(() => {
    process.env.GITHUB_CLIENT_ID = prevId;
    process.env.GITHUB_CLIENT_SECRET = prevSecret;
  });

  async function setup() {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

    const admin = await store.createUser({
      email: 'admin@example.com',
      name: 'Admin',
      passwordHash: hashPassword('password123'),
      platformAdmin: true,
    });
    await store.updateUser({ userId: admin.id, mfaEnabled: true });
    await store.createSession({ userId: admin.id, token: 'admin-token', expiresAt: new Date(Date.now() + 3600_000) });

    const reauth = await app.inject({
      method: 'POST',
      url: '/auth/reauth',
      headers: auth('admin-token'),
      payload: { password: 'password123' },
    });
    expect(reauth.statusCode).toBe(200);

    return { app, store };
  }

  it('falls back to env credentials when no admin row exists', async () => {
    const { app } = await setup();

    const start = await app.inject({ method: 'GET', url: '/auth/oauth/github/start' });
    expect(start.statusCode).toBe(200);
    expect(start.json().ready).toBe(true);
    expect(start.json().authorizationUrl).toContain('client_id=env-github-id');

    await app.close();
  });

  it('GET /admin/login-providers lists providers without leaking secrets', async () => {
    const { app } = await setup();

    const res = await app.inject({ method: 'GET', url: '/admin/login-providers', headers: auth('admin-token') });
    expect(res.statusCode).toBe(200);
    const providers = res.json().providers as Array<{ provider: string; hasSecret: boolean; envClientIdPresent: boolean }>;
    const github = providers.find((p) => p.provider === 'github');
    expect(github?.envClientIdPresent).toBe(true);
    expect(github?.hasSecret).toBe(false);
    expect(JSON.stringify(res.json())).not.toContain('clientSecretEnc');
  });

  it('admin-saved client id wins over env (DB-first) in the authorize URL', async () => {
    const { app } = await setup();

    const save = await app.inject({
      method: 'POST',
      url: '/admin/login-providers',
      headers: auth('admin-token'),
      payload: { provider: 'github', clientId: 'admin-github-id', clientSecret: 'admin-github-secret', enabled: true },
    });
    expect(save.statusCode).toBe(200);
    expect(save.json().provider).toMatchObject({ provider: 'github', enabled: true, hasSecret: true });
    expect(JSON.stringify(save.json())).not.toContain('admin-github-secret');

    const start = await app.inject({ method: 'GET', url: '/auth/oauth/github/start' });
    expect(start.json().ready).toBe(true);
    expect(start.json().authorizationUrl).toContain('client_id=admin-github-id');

    await app.close();
  });

  it('disabling a provider turns sign-in off (start + callback)', async () => {
    const { app } = await setup();

    await app.inject({
      method: 'POST',
      url: '/admin/login-providers',
      headers: auth('admin-token'),
      payload: { provider: 'github', clientId: 'admin-github-id', clientSecret: 'admin-github-secret', enabled: false },
    });

    const start = await app.inject({ method: 'GET', url: '/auth/oauth/github/start' });
    expect(start.json().ready).toBe(false);
    expect(start.json().authorizationUrl).toBeNull();

    await app.close();
  });

  it('requires step-up reauth for the mutation', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
    const admin = await store.createUser({
      email: 'admin2@example.com',
      name: 'Admin2',
      passwordHash: hashPassword('password123'),
      platformAdmin: true,
    });
    await store.updateUser({ userId: admin.id, mfaEnabled: true });
    await store.createSession({ userId: admin.id, token: 'admin2-token', expiresAt: new Date(Date.now() + 3600_000) });

    // No /auth/reauth → mutation must be rejected (step-up required).
    const res = await app.inject({
      method: 'POST',
      url: '/admin/login-providers',
      headers: auth('admin2-token'),
      payload: { provider: 'github', clientId: 'x', clientSecret: 'y', enabled: true },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('ADMIN_REAUTH_REQUIRED');

    await app.close();
  });
});
