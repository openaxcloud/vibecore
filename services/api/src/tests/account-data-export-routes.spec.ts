import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

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
    payload: { email, password: 'password123', name: 'Export Tester', organizationName: 'ExportOrg' },
  });
  expect(register.statusCode).toBe(201);

  const body = register.json() as { token: string; user: { id: string } };

  return { token: body.token, userId: body.user.id };
}

/**
 * Recursively collect every object key present anywhere in a JSON value. Used to
 * assert that no secret-bearing key name ever appears in the export.
 */
function collectKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeys(item, out);
    }
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      out.add(key);
      collectKeys(child, out);
    }
  }

  return out;
}

describe('GET /account/data-export', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'dataexport-state-secret-do-not-ship';
    process.env.ENCRYPTION_SECRET = 'dataexport-encryption-secret-do-not-ship';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("assembles the current user's data with the expected shape", async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const { token, userId } = await registerUser(app, 'owner@example.com');

    /*
     * Seed an API key (with a secret hash) and a connected account (with an
     * encrypted token) so we can prove they are surfaced as metadata-only.
     */
    await store.createApiKey({
      userId,
      name: 'CI key',
      keyHash: 'super-secret-hash-value',
      keyPrefix: 'vck_abc',
      scopes: ['read'],
    });
    await store.upsertUserConnection({
      userId,
      provider: 'github',
      externalAccountId: 'gh-123',
      externalAccountLabel: 'octocat',
      accessTokenEncrypted: 'ENCRYPTED-ACCESS-TOKEN-SHOULD-NOT-LEAK',
      refreshTokenEncrypted: 'ENCRYPTED-REFRESH-TOKEN-SHOULD-NOT-LEAK',
      scopes: ['repo'],
      createdByUserId: userId,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/account/data-export',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.headers['content-disposition']).toContain('.json');

    const { export: doc } = response.json() as {
      export: {
        kind: string;
        user: { id: string; email: string };
        organizations: Array<{ organization: { id: string }; projects: unknown[]; membership: unknown }>;
        apiKeys: Array<{ id: string; name: string; keyPrefix: string | null }>;
        connectedAccounts: Array<{ provider: string; status: string }>;
      };
    };

    expect(doc.kind).toBe('gdpr-data-export');
    expect(doc.user.id).toBe(userId);
    expect(doc.user.email).toBe('owner@example.com');
    expect(doc.organizations.length).toBeGreaterThanOrEqual(1);
    expect(doc.organizations[0].membership).toEqual({ roleKey: 'owner' });

    expect(doc.apiKeys).toHaveLength(1);
    expect(doc.apiKeys[0].name).toBe('CI key');
    expect(doc.apiKeys[0].keyPrefix).toBe('vck_abc');

    expect(doc.connectedAccounts).toHaveLength(1);
    expect(doc.connectedAccounts[0].provider).toBe('github');
    expect(doc.connectedAccounts[0].status).toBe('active');

    await app.close();
  });

  it('never includes secret fields or values', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const { token, userId } = await registerUser(app, 'secrets@example.com');

    await store.createApiKey({
      userId,
      name: 'Secretful key',
      keyHash: 'HASH-MUST-NOT-LEAK',
      keyPrefix: 'vck_zzz',
      scopes: ['read'],
    });
    await store.upsertUserConnection({
      userId,
      provider: 'gitlab',
      externalAccountId: 'gl-9',
      externalAccountLabel: 'user9',
      accessTokenEncrypted: 'ACCESS-TOKEN-MUST-NOT-LEAK',
      refreshTokenEncrypted: 'REFRESH-TOKEN-MUST-NOT-LEAK',
      scopes: ['api'],
      createdByUserId: userId,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/account/data-export',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);

    const raw = response.body;

    // No secret VALUES anywhere in the serialized document.
    for (const secretValue of [
      'HASH-MUST-NOT-LEAK',
      'ACCESS-TOKEN-MUST-NOT-LEAK',
      'REFRESH-TOKEN-MUST-NOT-LEAK',
      'password123',
    ]) {
      expect(raw).not.toContain(secretValue);
    }

    // No secret KEY NAMES anywhere in the document structure.
    const keys = collectKeys(response.json());

    for (const forbidden of [
      'passwordHash',
      'keyHash',
      'tokenHash',
      'accessTokenEncrypted',
      'refreshTokenEncrypted',
      'apiKeyFieldsEncrypted',
      'mfaSecretEncrypted',
      'accessHash',
      'refreshHash',
    ]) {
      expect(keys.has(forbidden)).toBe(false);
    }

    await app.close();
  });

  it("is user-scoped: user B cannot obtain user A's data", async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const userA = await registerUser(app, 'alice@example.com');
    const userB = await registerUser(app, 'bob@example.com');

    // Give A an API key and a connection that must never appear in B's export.
    await store.createApiKey({
      userId: userA.userId,
      name: 'Alice private key',
      keyHash: 'alice-hash',
      keyPrefix: 'vck_alice',
      scopes: ['read'],
    });
    await store.upsertUserConnection({
      userId: userA.userId,
      provider: 'github',
      externalAccountId: 'alice-gh',
      externalAccountLabel: 'alice',
      accessTokenEncrypted: 'alice-token',
      scopes: ['repo'],
      createdByUserId: userA.userId,
    });

    const responseB = await app.inject({
      method: 'GET',
      url: '/account/data-export',
      headers: { authorization: `Bearer ${userB.token}` },
    });
    expect(responseB.statusCode).toBe(200);

    const { export: docB } = responseB.json() as {
      export: {
        user: { id: string; email: string };
        apiKeys: unknown[];
        connectedAccounts: unknown[];
      };
    };

    expect(docB.user.id).toBe(userB.userId);
    expect(docB.user.email).toBe('bob@example.com');
    expect(docB.apiKeys).toHaveLength(0);
    expect(docB.connectedAccounts).toHaveLength(0);
    expect(responseB.body).not.toContain('Alice private key');
    expect(responseB.body).not.toContain('alice@example.com');

    await app.close();
  });

  it('rejects an unauthenticated request', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    const response = await app.inject({ method: 'GET', url: '/account/data-export' });
    expect(response.statusCode).toBe(401);

    await app.close();
  });
});
