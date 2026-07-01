import { encryptJson } from '@vibecore/security';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

/*
 * Admin-disabled connectors must be fully off (Replit-parity admin intent). An
 * admin who disables a connector in the catalog must block: (1) the OAuth connect
 * flow even when INTEGRATION_* env creds exist (connectorCredentialsFor no longer
 * falls through to env for a disabled row); (2) new API-key configuration; and
 * (3) reading the stored token for cross-device deploys.
 */
async function register(app: any, email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'password123', name: 'Tester', organizationName: 'Org' },
  });
  expect(res.statusCode).toBe(201);

  return res.json() as { token: string; organization: { id: string }; user: { id: string } };
}

describe('admin-disabled connectors are fully off', () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.INTEGRATION_GITHUB_CLIENT_ID = 'env-gh-id';
    process.env.INTEGRATION_GITHUB_CLIENT_SECRET = 'env-gh-secret';
    process.env.OAUTH_STATE_SECRET = 'test-state-secret';
    process.env.ENCRYPTION_SECRET = 'test-encryption-secret';
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it('#1 OAuth connect returns 503 when the connector is admin-disabled (no env fallback)', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
    const t = await register(app, 'gh@example.com');

    // Sanity: enabled (default) + env creds → connect succeeds.
    const ok = await app.inject({
      method: 'POST',
      url: '/api/integrations/oauth/github/connect',
      headers: { authorization: `Bearer ${t.token}` },
      payload: {},
    });
    expect(ok.statusCode).toBe(200);

    // Admin disables github → connect must 503 even though env creds are set.
    await store.upsertConnectorOAuthConfig({ provider: 'github', enabled: false });

    const blocked = await app.inject({
      method: 'POST',
      url: '/api/integrations/oauth/github/connect',
      headers: { authorization: `Bearer ${t.token}` },
      payload: {},
    });
    expect(blocked.statusCode).toBe(503);
    expect(blocked.json().code).toBe('PROVIDER_NOT_CONFIGURED');

    await app.close();
  });

  it('#3a API-key configure is refused (403) when the connector is admin-disabled', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
    const t = await register(app, 'vc@example.com');

    await store.upsertConnectorOAuthConfig({ provider: 'vercel', enabled: false });

    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/api-key/vercel/configure',
      headers: { authorization: `Bearer ${t.token}` },
      payload: { apiKey: 'some-token' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('CONNECTOR_DISABLED');

    await app.close();
  });

  it('#3b token read is refused (403) when the connector is admin-disabled', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
    const t = await register(app, 'nf@example.com');

    // Seed an active Netlify connection, then disable the connector.
    await store.upsertUserConnection({
      userId: t.user.id,
      provider: 'netlify',
      externalAccountId: 'ext-nf',
      externalAccountLabel: 'acme',
      accessTokenEncrypted: encryptJson({ value: 'nfp_secret' }),
      scopes: [],
      createdByUserId: t.user.id,
    });
    await store.upsertConnectorOAuthConfig({ provider: 'netlify', enabled: false });

    const res = await app.inject({
      method: 'GET',
      url: '/api/integrations/netlify/token',
      headers: { authorization: `Bearer ${t.token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('CONNECTOR_DISABLED');
    expect(JSON.stringify(res.json())).not.toContain('nfp_secret');

    await app.close();
  });

  it('#4 unknown sign-in provider is rejected with 400 (no env-name construction)', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/oauth/notaprovider/callback',
      payload: { code: 'x', state: 'y' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('OAUTH_PROVIDER_UNKNOWN');

    await app.close();
  });
});
