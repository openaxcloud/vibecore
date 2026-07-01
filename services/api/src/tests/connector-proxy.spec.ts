import { encryptJson } from '@vibecore/security';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

/*
 * Server-side GitLab / Bitbucket API proxy (parity with /api/github-proxy): the
 * user's token is resolved + decrypted on the API pod and forwarded with a Bearer
 * header; the browser never sees it. Per-user isolation, admin-disable gate, and
 * 401 → needs_reconnect are all exercised here with a mocked upstream.
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

async function linkConnection(store: TestApiStore, userId: string, provider: string, secret: string) {
  await store.upsertUserConnection({
    userId,
    provider,
    externalAccountId: `ext-${provider}`,
    externalAccountLabel: 'acct',
    accessTokenEncrypted: encryptJson({ value: secret }),
    scopes: [],
    createdByUserId: userId,
  });
}

describe('GitLab / Bitbucket server-side proxy', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('forwards to the GitLab API with the server-side Bearer token (never client-side)', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
    const t = await register(app, 'gl@example.com');
    await linkConnection(store, t.user.id, 'gitlab', 'glpat-secret');

    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify([{ id: 1 }]), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.inject({
      method: 'POST',
      url: '/api/gitlab-proxy',
      headers: { authorization: `Bearer ${t.token}` },
      payload: { path: '/api/v4/projects', query: { membership: 'true' } },
    });

    expect(res.statusCode).toBe(200);
    const glCall = fetchMock.mock.calls[0] as unknown as [unknown, { headers: Record<string, string> }];
    const calledUrl = String(glCall[0]);
    expect(calledUrl).toContain('https://gitlab.com/api/v4/projects');
    expect(calledUrl).toContain('membership=true');
    expect(glCall[1].headers.authorization).toBe('Bearer glpat-secret');

    await app.close();
  });

  it('forwards to the Bitbucket API host', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
    const t = await register(app, 'bb@example.com');
    await linkConnection(store, t.user.id, 'bitbucket', 'bb-secret');

    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ values: [] }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.inject({
      method: 'POST',
      url: '/api/bitbucket-proxy',
      headers: { authorization: `Bearer ${t.token}` },
      payload: { path: '/2.0/repositories', query: { role: 'member' } },
    });

    expect(res.statusCode).toBe(200);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('https://api.bitbucket.org/2.0/repositories');

    await app.close();
  });

  it('401 CONNECTOR_NOT_LINKED when the user has no connection', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
    const t = await register(app, 'nl@example.com');

    const res = await app.inject({
      method: 'POST',
      url: '/api/gitlab-proxy',
      headers: { authorization: `Bearer ${t.token}` },
      payload: { path: '/api/v4/projects' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('CONNECTOR_NOT_LINKED');

    await app.close();
  });

  it('403 CONNECTOR_DISABLED when the connector is admin-disabled', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
    const t = await register(app, 'dis@example.com');
    await linkConnection(store, t.user.id, 'gitlab', 'glpat-secret');
    await store.upsertConnectorOAuthConfig({ provider: 'gitlab', enabled: false });

    const res = await app.inject({
      method: 'POST',
      url: '/api/gitlab-proxy',
      headers: { authorization: `Bearer ${t.token}` },
      payload: { path: '/api/v4/projects' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('CONNECTOR_DISABLED');

    await app.close();
  });

  it('a 401 from upstream flips the connection to needs_reconnect', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
    const t = await register(app, 'rc@example.com');
    await linkConnection(store, t.user.id, 'gitlab', 'stale-token');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('unauthorized', { status: 401 })));

    const res = await app.inject({
      method: 'POST',
      url: '/api/gitlab-proxy',
      headers: { authorization: `Bearer ${t.token}` },
      payload: { path: '/api/v4/projects' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('CONNECTOR_NEEDS_RECONNECT');

    const connections = await store.listUserConnectionsByUser(t.user.id, { provider: 'gitlab' });
    expect(connections[0].status).toBe('needs_reconnect');

    await app.close();
  });
});
