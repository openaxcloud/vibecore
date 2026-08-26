import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/*
 * Admin management for the API-key connectors (Vercel / Netlify / Supabase):
 * GET lists them with status + the token console URL; POST toggles a connector
 * enabled platform-wide (step-up gated). These connectors have no platform OAuth
 * app — each user pastes their own token via /api/integrations/api-key/:provider
 * /configure — so the admin surface is status + enable/disable, not a secret.
 */
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
  await app.inject({ method: 'POST', url: '/auth/reauth', headers: auth('admin-token'), payload: { password: 'password123' } });

  return { app, store };
}

describe('admin api-key connector catalog', () => {
  it('lists Vercel / Netlify / Supabase with status + token console URL', async () => {
    const { app } = await setup();

    const res = await app.inject({ method: 'GET', url: '/admin/connectors/api-key', headers: auth('admin-token') });
    expect(res.statusCode).toBe(200);
    const connectors = res.json().connectors as Array<{ provider: string; authType: string; tokenConsoleUrl: string }>;
    expect(connectors.map((c) => c.provider).sort()).toEqual(['claude', 'figma', 'netlify', 'supabase', 'vercel']);
    for (const c of connectors) {
      expect(c.authType).toBe('api_key');
      expect(c.tokenConsoleUrl).toMatch(/^https:\/\//);
    }

    await app.close();
  });

  it('toggles a connector enabled (step-up gated)', async () => {
    const { app, store } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: '/admin/connectors/api-key',
      headers: auth('admin-token'),
      payload: { provider: 'vercel', enabled: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().connector).toMatchObject({ provider: 'vercel', enabled: true });
    expect((await store.getConnectorOAuthCatalog('vercel'))?.enabled).toBe(true);

    await app.close();
  });

  it('rejects the toggle without step-up reauth', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
    const admin = await store.createUser({
      email: 'a2@example.com',
      name: 'A2',
      passwordHash: hashPassword('password123'),
      platformAdmin: true,
    });
    await store.updateUser({ userId: admin.id, mfaEnabled: true });
    await store.createSession({ userId: admin.id, token: 'a2-token', expiresAt: new Date(Date.now() + 3600_000) });

    const res = await app.inject({
      method: 'POST',
      url: '/admin/connectors/api-key',
      headers: auth('a2-token'),
      payload: { provider: 'netlify', enabled: false },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('ADMIN_REAUTH_REQUIRED');

    await app.close();
  });
});
