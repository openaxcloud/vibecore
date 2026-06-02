import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import { TestApiStore } from './test-api-store.js';
import type { EmailProvider } from '../email.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

function buildTestApiApp(options: ApiAppOptions = {}) {
  return buildApiApp({ emailProvider: new QuietEmailProvider(), ...options });
}

async function registerUser(app: Awaited<ReturnType<typeof buildTestApiApp>>, email: string) {
  const register = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'password123', name: 'Key Tester', organizationName: 'KeyOrg' },
  });
  expect(register.statusCode).toBe(201);

  return (register.json() as { token: string }).token;
}

describe('API key routes', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'apikey-state-secret-do-not-ship';
    process.env.ENCRYPTION_SECRET = 'apikey-encryption-secret-do-not-ship';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('creates a key, returns the plaintext exactly once, and lists it without the secret', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const token = await registerUser(app, 'create@example.com');

    const created = await app.inject({
      method: 'POST',
      url: '/api/keys',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'CI bot', scopes: ['read', 'write'], expiresInDays: 30 },
    });

    expect(created.statusCode).toBe(201);
    const createdKey = (created.json() as { key: { id: string; token: string; keyPrefix: string; scopes: string[] } })
      .key;
    expect(createdKey.token.startsWith('vck_')).toBe(true);
    expect(createdKey.keyPrefix).toBe(createdKey.token.slice(0, 12));
    expect(createdKey.scopes).toEqual(['read', 'write']);

    const list = await app.inject({
      method: 'GET',
      url: '/api/keys',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    const listed = (list.json() as { keys: Array<{ id: string; token?: string; keyPrefix: string }> }).keys;
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(createdKey.id);
    expect(listed[0].token).toBeUndefined();
    expect(listed[0].keyPrefix).toBe(createdKey.keyPrefix);

    await app.close();
  });

  it('authenticates requests with the plaintext key and stamps lastUsedAt', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const token = await registerUser(app, 'auth@example.com');

    const created = await app.inject({
      method: 'POST',
      url: '/api/keys',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'reader', scopes: ['read'] },
    });
    const keyToken = (created.json() as { key: { token: string } }).key.token;

    // The key itself can authenticate a read request.
    const viaKey = await app.inject({
      method: 'GET',
      url: '/api/keys',
      headers: { authorization: `Bearer ${keyToken}` },
    });
    expect(viaKey.statusCode).toBe(200);

    // lastUsedAt is stamped after use.
    const afterUse = await app.inject({
      method: 'GET',
      url: '/api/keys',
      headers: { authorization: `Bearer ${token}` },
    });
    expect((afterUse.json() as { keys: Array<{ lastUsedAt: string | null }> }).keys[0].lastUsedAt).not.toBeNull();

    await app.close();
  });

  it('rejects a write request from a read-only key with a scope error', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const token = await registerUser(app, 'scope@example.com');

    const created = await app.inject({
      method: 'POST',
      url: '/api/keys',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'reader', scopes: ['read'] },
    });
    const readKeyToken = (created.json() as { key: { token: string; id: string } }).key.token;
    const readKeyId = (created.json() as { key: { id: string } }).key.id;

    const denied = await app.inject({
      method: 'DELETE',
      url: `/api/keys/${readKeyId}`,
      headers: { authorization: `Bearer ${readKeyToken}` },
    });
    expect(denied.statusCode).toBe(403);
    expect((denied.json() as { code: string }).code).toBe('API_KEY_SCOPE_INSUFFICIENT');

    await app.close();
  });

  it('revokes a key so it can no longer authenticate', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const token = await registerUser(app, 'revoke@example.com');

    const created = await app.inject({
      method: 'POST',
      url: '/api/keys',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'temp', scopes: ['read'] },
    });
    const { id, token: keyToken } = (created.json() as { key: { id: string; token: string } }).key;

    const revoke = await app.inject({
      method: 'DELETE',
      url: `/api/keys/${id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(revoke.statusCode).toBe(200);

    const afterRevoke = await app.inject({
      method: 'GET',
      url: '/api/keys',
      headers: { authorization: `Bearer ${keyToken}` },
    });
    expect(afterRevoke.statusCode).toBe(401);

    await app.close();
  });
});
