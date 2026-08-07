import { describe, expect, it } from 'vitest';
import { signConnectorAccessToken } from '@vibecore/connector-sdk';
import { buildConnectorProxyApp, type ConnectionResolution } from './app.js';
import { connectorProxyFr } from './public-i18n.js';

const secret = 'connector-proxy-spec-secret-do-not-ship';

const basePayload = {
  workspaceId: 'ws_1',
  projectId: 'proj_1',
  userId: 'user_1',
  organizationId: 'org_1',
};

function denyResolver(): ConnectionResolution {
  return {
    ok: false,
    status: 403,
    code: 'CONNECTOR_LINK_MISSING',
    error: 'denied for tests',
  };
}

function allowResolver(provider: string, accessToken: string): ConnectionResolution {
  return { ok: true, provider, accessToken };
}

function recordingFetch(handler: (input: URL, init: RequestInit) => Promise<Response>): {
  fn: typeof fetch;
  calls: Array<{ url: URL; init: RequestInit }>;
} {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const fn = (async (input: URL | string | Request, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(String(input));
    calls.push({ url, init: init ?? {} });

    return handler(url, init ?? {});
  }) as unknown as typeof fetch;

  return { fn, calls };
}

describe('connector-proxy', () => {
  it('rejects construction when the access token secret is too short', async () => {
    await expect(
      buildConnectorProxyApp({
        accessTokenSecret: 'short',
        resolveConnection: async () => denyResolver(),
      }),
    ).rejects.toThrow(/CONNECTOR_PROXY_ACCESS_TOKEN_SECRET/);
  });

  it('serves /health without authentication', async () => {
    const app = await buildConnectorProxyApp({
      accessTokenSecret: secret,
      resolveConnection: async () => denyResolver(),
    });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'connector-proxy' });

    await app.close();
  });

  it('returns 401 when the bearer token is missing on /proxy', async () => {
    const app = await buildConnectorProxyApp({
      accessTokenSecret: secret,
      resolveConnection: async () => denyResolver(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/proxy/conn_1/anything',
      headers: { 'accept-language': 'fr-FR,fr;q=0.9' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['content-language']).toBe('fr');
    expect(response.json()).toEqual({
      error: connectorProxyFr.CONNECTOR_TOKEN_MISSING,
      code: 'CONNECTOR_TOKEN_MISSING',
    });

    await app.close();
  });

  it('returns 401 when the bearer token signature is wrong', async () => {
    const app = await buildConnectorProxyApp({
      accessTokenSecret: secret,
      resolveConnection: async () => denyResolver(),
    });

    const tampered = signConnectorAccessToken({
      payload: { ...basePayload, expiresAt: Date.now() + 60_000 },
      secret: 'a-different-secret-not-shared-with-the-proxy',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/proxy/conn_1/anything',
      headers: { authorization: `Bearer ${tampered}` },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'CONNECTOR_TOKEN_INVALID' });

    await app.close();
  });

  it('returns 401 with EXPIRED code when the token is past its expiry', async () => {
    const app = await buildConnectorProxyApp({
      accessTokenSecret: secret,
      resolveConnection: async () => denyResolver(),
    });

    const expired = signConnectorAccessToken({
      payload: { ...basePayload, expiresAt: Date.now() - 1_000 },
      secret,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/proxy/conn_1/anything',
      headers: { authorization: `Bearer ${expired}` },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'CONNECTOR_TOKEN_EXPIRED' });

    await app.close();
  });

  it('maps ACL denials to localized stable copy without forwarding resolver details', async () => {
    const rawResolverError = 'Project secret=do-not-serialize is not linked';
    const app = await buildConnectorProxyApp({
      accessTokenSecret: secret,
      resolveConnection: async () => ({
        ok: false,
        status: 403,
        code: 'CONNECTOR_LINK_MISSING',
        error: rawResolverError,
      }),
    });

    const token = signConnectorAccessToken({
      payload: { ...basePayload, expiresAt: Date.now() + 60_000 },
      secret,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/proxy/conn_1/repos/octo/hello',
      headers: { authorization: `Bearer ${token}`, cookie: 'vibecore-lang=fr' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers['content-language']).toBe('fr');
    expect(response.json()).toEqual({
      error: 'Ce projet n’est pas lié à la connexion demandée.',
      code: 'CONNECTOR_LINK_MISSING',
    });
    expect(response.body).not.toContain(rawResolverError);

    await app.close();
  });

  it('returns 501 when the resolved provider is not yet wired', async () => {
    const app = await buildConnectorProxyApp({
      accessTokenSecret: secret,
      resolveConnection: async () => ({ ok: true, provider: 'unknown_provider', accessToken: 'x' }),
    });

    const token = signConnectorAccessToken({
      payload: { ...basePayload, expiresAt: Date.now() + 60_000 },
      secret,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/proxy/conn_1/anything',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(501);
    expect(response.json()).toMatchObject({ code: 'CONNECTOR_UNKNOWN_PROVIDER' });

    await app.close();
  });

  it('forwards GET to api.github.com with the injected Authorization header', async () => {
    const { fn, calls } = recordingFetch(
      async () =>
        new Response(JSON.stringify({ id: 42, name: 'hello' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const app = await buildConnectorProxyApp({
      accessTokenSecret: secret,
      resolveConnection: async () => allowResolver('github', 'gh-token-secret'),
      fetchImpl: fn,
    });

    const token = signConnectorAccessToken({
      payload: { ...basePayload, expiresAt: Date.now() + 60_000 },
      secret,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/proxy/conn_1/repos/octo/hello?per_page=5',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ id: 42, name: 'hello' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url.toString()).toBe('https://api.github.com/repos/octo/hello?per_page=5');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe('token gh-token-secret');
    expect(headers['user-agent']).toBe('e-code-connector-proxy');

    await app.close();
  });

  it('strips the inbound Authorization header so the workspace token never reaches the provider', async () => {
    const { fn, calls } = recordingFetch(
      async () =>
        new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const app = await buildConnectorProxyApp({
      accessTokenSecret: secret,
      resolveConnection: async () => allowResolver('github', 'gh-token-secret'),
      fetchImpl: fn,
    });

    const token = signConnectorAccessToken({
      payload: { ...basePayload, expiresAt: Date.now() + 60_000 },
      secret,
    });

    await app.inject({
      method: 'GET',
      url: '/proxy/conn_1/user',
      headers: { authorization: `Bearer ${token}` },
    });

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe('token gh-token-secret');
    expect(headers.authorization).not.toContain(token);
    await app.close();
  });

  it('reports CONNECTOR_NEEDS_RECONNECT and calls reportConnectionFailure on a 401 from GitHub', async () => {
    const failureReports: Array<{ userConnectionId: string; upstreamStatus: number }> = [];
    const fetchImpl = (async () => new Response('unauthorized', { status: 401 })) as unknown as typeof fetch;
    const app = await buildConnectorProxyApp({
      accessTokenSecret: secret,
      resolveConnection: async () => allowResolver('github', 'gh-token-secret'),
      fetchImpl,
      reportConnectionFailure: async (update) => {
        failureReports.push({ userConnectionId: update.userConnectionId, upstreamStatus: update.upstreamStatus });
      },
    });

    const token = signConnectorAccessToken({
      payload: { ...basePayload, expiresAt: Date.now() + 60_000 },
      secret,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/proxy/conn_revoked/user',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(401);
    expect(failureReports).toEqual([{ userConnectionId: 'conn_revoked', upstreamStatus: 401 }]);
    await app.close();
  });

  it('forwards GET to api.vercel.com with a Bearer Authorization header', async () => {
    const { fn, calls } = recordingFetch(
      async () =>
        new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const app = await buildConnectorProxyApp({
      accessTokenSecret: secret,
      resolveConnection: async () => allowResolver('vercel', 'vrc-token-secret'),
      fetchImpl: fn,
    });

    const token = signConnectorAccessToken({
      payload: { ...basePayload, expiresAt: Date.now() + 60_000 },
      secret,
    });

    await app.inject({
      method: 'GET',
      url: '/proxy/conn_v/v2/user',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url.toString()).toBe('https://api.vercel.com/v2/user');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer vrc-token-secret');
    expect(headers.accept).toBe('application/json');
    await app.close();
  });

  it('forwards GET to api.supabase.com with a Bearer Authorization header', async () => {
    const { fn, calls } = recordingFetch(
      async () =>
        new Response('[]', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const app = await buildConnectorProxyApp({
      accessTokenSecret: secret,
      resolveConnection: async () => allowResolver('supabase', 'sb-token-secret'),
      fetchImpl: fn,
    });

    const token = signConnectorAccessToken({
      payload: { ...basePayload, expiresAt: Date.now() + 60_000 },
      secret,
    });

    await app.inject({
      method: 'GET',
      url: '/proxy/conn_s/v1/projects',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(calls[0].url.toString()).toBe('https://api.supabase.com/v1/projects');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer sb-token-secret');
    expect(headers.accept).toBe('application/json');
    await app.close();
  });

  it('forwards GET to api.netlify.com with a Bearer Authorization header', async () => {
    const { fn, calls } = recordingFetch(
      async () =>
        new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const app = await buildConnectorProxyApp({
      accessTokenSecret: secret,
      resolveConnection: async () => allowResolver('netlify', 'nf-token-secret'),
      fetchImpl: fn,
    });

    const token = signConnectorAccessToken({
      payload: { ...basePayload, expiresAt: Date.now() + 60_000 },
      secret,
    });

    await app.inject({
      method: 'GET',
      url: '/proxy/conn_n/user',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(calls[0].url.toString()).toBe('https://api.netlify.com/api/v1/user');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer nf-token-secret');
    await app.close();
  });

  it('forwards GET to gitlab.com/api/v4 with a Bearer Authorization header', async () => {
    const { fn, calls } = recordingFetch(
      async () =>
        new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const app = await buildConnectorProxyApp({
      accessTokenSecret: secret,
      resolveConnection: async () => allowResolver('gitlab', 'gl-token-secret'),
      fetchImpl: fn,
    });

    const token = signConnectorAccessToken({
      payload: { ...basePayload, expiresAt: Date.now() + 60_000 },
      secret,
    });

    await app.inject({
      method: 'GET',
      url: '/proxy/conn_g/user',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(calls[0].url.toString()).toBe('https://gitlab.com/api/v4/user');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer gl-token-secret');
    await app.close();
  });

  it('returns 502 with CONNECTOR_PROVIDER_UNREACHABLE when the upstream fetch throws', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const app = await buildConnectorProxyApp({
      accessTokenSecret: secret,
      resolveConnection: async () => allowResolver('github', 'gh-token-secret'),
      fetchImpl,
    });

    const token = signConnectorAccessToken({
      payload: { ...basePayload, expiresAt: Date.now() + 60_000 },
      secret,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/proxy/conn_1/user',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ code: 'CONNECTOR_PROVIDER_UNREACHABLE' });
    expect(response.body).not.toContain('ECONNRESET');
    await app.close();
  });
});
