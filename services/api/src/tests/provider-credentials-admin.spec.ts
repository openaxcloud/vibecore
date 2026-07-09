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
 * Admin-managed platform provider API key (write-only). Covers the guards
 * (platform-admin + step-up), the write-only contract (the key/ciphertext never
 * leaves the API), keyLast4 derived only from the submitted key, DELETE clearing
 * the key, the SSRF guard on baseUrl, and health flipping to source=db when a DB
 * key is set. CONFIG_ENCRYPTION_KEY defaults to the dev key outside production,
 * so encryptJson round-trips in tests without extra setup.
 */
describe('provider credentials admin (write-only key)', () => {
  const prevOpenAiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    if (prevOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = prevOpenAiKey;
    }
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

  it('stores an encrypted key and returns a write-only view (no key, no ciphertext)', async () => {
    const { app, store } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: '/admin/providers/OpenAI/credentials',
      headers: auth('admin-token'),
      payload: { apiKey: 'sk-secret-value-1234' },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body).toMatchObject({ provider: 'OpenAI', hasKey: true, source: 'db', keyLast4: '1234' });

    // The plaintext key and its ciphertext must never appear in the response.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('sk-secret-value-1234');
    expect(serialized).not.toContain('apiKeyEnc');
    expect(serialized).not.toContain('v1.');

    // The stored value is a real ciphertext, not the plaintext.
    const stored = (await store.listProviderConfigs()).find((p) => p.provider === 'OpenAI');
    expect(stored?.apiKeyEnc).toBeTruthy();
    expect(stored?.apiKeyEnc).not.toContain('sk-secret-value-1234');

    await app.close();
  });

  it('GET /admin/providers never leaks the ciphertext but reports hasKey/source', async () => {
    const { app } = await setup();

    await app.inject({
      method: 'POST',
      url: '/admin/providers/OpenAI/credentials',
      headers: auth('admin-token'),
      payload: { apiKey: 'sk-abcdef' },
    });

    const res = await app.inject({ method: 'GET', url: '/admin/providers', headers: auth('admin-token') });
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.json())).not.toContain('apiKeyEnc');

    const openai = (res.json().providers as Array<{ provider: string; hasKey: boolean; source: string }>).find(
      (p) => p.provider === 'OpenAI',
    );
    expect(openai).toMatchObject({ hasKey: true, source: 'db' });
    expect(openai).not.toHaveProperty('keyLast4');

    await app.close();
  });

  it('DELETE clears the key (env fallback resumes)', async () => {
    const { app, store } = await setup();

    await app.inject({
      method: 'POST',
      url: '/admin/providers/Anthropic/credentials',
      headers: auth('admin-token'),
      payload: { apiKey: 'sk-ant-xyz' },
    });
    expect((await store.listProviderConfigs()).find((p) => p.provider === 'Anthropic')?.apiKeyEnc).toBeTruthy();

    const del = await app.inject({
      method: 'DELETE',
      url: '/admin/providers/Anthropic/credentials',
      headers: auth('admin-token'),
    });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ provider: 'Anthropic', hasKey: false });
    expect((await store.listProviderConfigs()).find((p) => p.provider === 'Anthropic')?.apiKeyEnc).toBeUndefined();

    await app.close();
  });

  it('rejects an unknown provider with 404', async () => {
    const { app } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: '/admin/providers/NotARealProvider/credentials',
      headers: auth('admin-token'),
      payload: { apiKey: 'sk-x' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('PROVIDER_NOT_FOUND');

    await app.close();
  });

  it('rejects an SSRF/private base URL', async () => {
    const { app } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: '/admin/providers/OpenAILike/credentials',
      headers: auth('admin-token'),
      payload: { apiKey: 'sk-x', baseUrl: 'http://169.254.169.254/latest/meta-data' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('PROVIDER_BASE_URL_BLOCKED');

    await app.close();
  });

  it('accepts a public https base URL + byokAllowed', async () => {
    const { app, store } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: '/admin/providers/OpenAILike/credentials',
      headers: auth('admin-token'),
      payload: { apiKey: 'sk-x1234', baseUrl: 'https://api.example.com/v1', byokAllowed: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ baseUrl: 'https://api.example.com/v1', byokAllowed: true, keyLast4: '1234' });

    const stored = (await store.listProviderConfigs()).find((p) => p.provider === 'OpenAILike');
    expect(stored?.baseUrl).toBe('https://api.example.com/v1');

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
      url: '/admin/providers/OpenAI/credentials',
      headers: auth('admin2-token'),
      payload: { apiKey: 'sk-x' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('ADMIN_REAUTH_REQUIRED');

    await app.close();
  });

  it('rejects a non-admin user', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
    const user = await store.createUser({
      email: 'user@example.com',
      name: 'User',
      passwordHash: hashPassword('password123'),
    });
    await store.createSession({ userId: user.id, token: 'user-token', expiresAt: new Date(Date.now() + 3600_000) });

    const res = await app.inject({
      method: 'POST',
      url: '/admin/providers/OpenAI/credentials',
      headers: auth('user-token'),
      payload: { apiKey: 'sk-x' },
    });
    expect(res.statusCode).toBe(403);

    await app.close();
  });

  it('GET /internal/providers/credentials requires the internal shared secret', async () => {
    const { app } = await setup();

    // No bearer → 401.
    const unauth = await app.inject({ method: 'GET', url: '/internal/providers/credentials' });
    expect(unauth.statusCode).toBe(401);

    await app.close();
  });

  it('GET /internal/providers/credentials returns the decrypted key for an enabled provider', async () => {
    const prevSecret = process.env.INTERNAL_API_SHARED_SECRET;
    process.env.INTERNAL_API_SHARED_SECRET = 'internal-secret';

    try {
      const { app, store } = await setup();

      await store.upsertProviderConfig({ provider: 'OpenAI', displayName: 'OpenAI', enabled: true });
      await app.inject({
        method: 'POST',
        url: '/admin/providers/OpenAI/credentials',
        headers: auth('admin-token'),
        payload: { apiKey: 'sk-internal-secret-value' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/internal/providers/credentials',
        headers: { authorization: 'Bearer internal-secret' },
      });
      expect(res.statusCode).toBe(200);

      const providers = res.json().providers as Array<{ provider: string; apiKey: string; baseUrl: string | null }>;
      const openai = providers.find((p) => p.provider === 'OpenAI');
      expect(openai?.apiKey).toBe('sk-internal-secret-value');

      await app.close();
    } finally {
      if (prevSecret === undefined) {
        delete process.env.INTERNAL_API_SHARED_SECRET;
      } else {
        process.env.INTERNAL_API_SHARED_SECRET = prevSecret;
      }
    }
  });

  it('provider health flips to ready/source=db when a DB key is set', async () => {
    const { app, store } = await setup();

    // Enable the provider so a configured key makes it "ready".
    await store.upsertProviderConfig({ provider: 'OpenAI', displayName: 'OpenAI', enabled: true });

    await app.inject({
      method: 'POST',
      url: '/admin/providers/OpenAI/credentials',
      headers: auth('admin-token'),
      payload: { apiKey: 'sk-health-1234' },
    });

    const res = await app.inject({ method: 'GET', url: '/admin/provider-health', headers: auth('admin-token') });
    expect(res.statusCode).toBe(200);
    const openai = (res.json().providers as Array<{ provider: string; status: string; keySource: string }>).find(
      (p) => p.provider === 'OpenAI',
    );
    expect(openai?.keySource).toBe('db');
    expect(openai?.status).toBe('ready');

    await app.close();
  });
});
