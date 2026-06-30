import { hashPassword } from '@vibecore/auth';
import { encryptJson } from '@vibecore/security';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/*
 * Owner-scoped connector token read (GET /api/integrations/:provider/token) that
 * backs the cross-device deploy/DB-connect flows: the decrypted UserConnection
 * token is returned to its OWNER so Vercel/Netlify/Supabase work from any device
 * (not just the one that pasted the localStorage token). Git providers are NOT
 * exposed here. Only the caller's own connection is ever returned.
 */
async function seedUser(store: TestApiStore, email: string, token: string) {
  const user = await store.createUser({ email, name: email, passwordHash: hashPassword('password123') });
  await store.createSession({ userId: user.id, token, expiresAt: new Date(Date.now() + 3600_000) });
  return user;
}

async function linkNetlify(store: TestApiStore, userId: string, secret: string, label = 'acme') {
  await store.upsertUserConnection({
    userId,
    provider: 'netlify',
    externalAccountId: `ext-${label}`,
    externalAccountLabel: label,
    accessTokenEncrypted: encryptJson({ value: secret }),
    scopes: [],
    createdByUserId: userId,
  });
}

describe('connector token read (cross-device deploy)', () => {
  it('returns the decrypted token to the owner for an api_key deploy connector', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
    const user = await seedUser(store, 'a@example.com', 'tok-a');
    await linkNetlify(store, user.id, 'nfp_secret_value');

    const res = await app.inject({ method: 'GET', url: '/api/integrations/netlify/token', headers: auth('tok-a') });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ provider: 'netlify', token: 'nfp_secret_value', accountLabel: 'acme' });

    await app.close();
  });

  it('404 CONNECTOR_NOT_LINKED when the user has no connection', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
    await seedUser(store, 'b@example.com', 'tok-b');

    const res = await app.inject({ method: 'GET', url: '/api/integrations/vercel/token', headers: auth('tok-b') });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('CONNECTOR_NOT_LINKED');

    await app.close();
  });

  it('never returns another user\'s token (owner-scoped)', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
    const owner = await seedUser(store, 'owner@example.com', 'tok-owner');
    await linkNetlify(store, owner.id, 'owner-secret');
    await seedUser(store, 'intruder@example.com', 'tok-intruder');

    const res = await app.inject({ method: 'GET', url: '/api/integrations/netlify/token', headers: auth('tok-intruder') });
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.json())).not.toContain('owner-secret');

    await app.close();
  });

  it('refuses to expose git-provider tokens (github) — 400', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
    await seedUser(store, 'c@example.com', 'tok-c');

    const res = await app.inject({ method: 'GET', url: '/api/integrations/github/token', headers: auth('tok-c') });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('CONNECTOR_TOKEN_NOT_EXPOSED');

    await app.close();
  });

  it('401 when unauthenticated', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

    const res = await app.inject({ method: 'GET', url: '/api/integrations/supabase/token' });
    expect(res.statusCode).toBe(401);

    await app.close();
  });
});
