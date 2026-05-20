import { describe, expect, it } from 'vitest';
import { signConnectorAccessToken } from '@vibecore/connector-sdk';
import { buildConnectorProxyApp } from './app.js';

const secret = 'connector-proxy-spec-secret-do-not-ship';

const basePayload = {
  workspaceId: 'ws_1',
  projectId: 'proj_1',
  userId: 'user_1',
  organizationId: 'org_1',
};

describe('connector-proxy', () => {
  it('rejects construction when the access token secret is too short', async () => {
    await expect(buildConnectorProxyApp({ accessTokenSecret: 'short' })).rejects.toThrow(
      /CONNECTOR_PROXY_ACCESS_TOKEN_SECRET/,
    );
  });

  it('serves /health without authentication', async () => {
    const app = await buildConnectorProxyApp({ accessTokenSecret: secret });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'connector-proxy' });

    await app.close();
  });

  it('returns 401 when the bearer token is missing on /proxy', async () => {
    const app = await buildConnectorProxyApp({ accessTokenSecret: secret });

    const response = await app.inject({
      method: 'POST',
      url: '/proxy/conn_1/anything',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'CONNECTOR_TOKEN_MISSING' });

    await app.close();
  });

  it('returns 401 when the bearer token signature is wrong', async () => {
    const app = await buildConnectorProxyApp({ accessTokenSecret: secret });

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
    const app = await buildConnectorProxyApp({ accessTokenSecret: secret });

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

  it('returns 501 with a stable code when the token is valid (Phase 0 skeleton)', async () => {
    const app = await buildConnectorProxyApp({ accessTokenSecret: secret });

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
});
