import { describe, expect, it } from 'vitest';
import { vercelConnector } from '../integrations/providers/vercel.js';

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

describe('vercelConnector', () => {
  it('declares api_key as its auth type', () => {
    expect(vercelConnector.provider).toBe('vercel');
    expect(vercelConnector.authType).toBe('api_key');
    expect(vercelConnector.buildAuthorizeUrl).toBeUndefined();
    expect(vercelConnector.exchangeCodeForToken).toBeUndefined();
  });
});

describe('vercelConnector.fetchUserInfo', () => {
  it('GETs /v2/user with the access token and returns id + username', async () => {
    const { fn, calls } = recordingFetch(async () => new Response(
      JSON.stringify({ user: { id: 'user-1', username: 'octocat', email: 'octo@vercel.com' } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));

    const userInfo = await vercelConnector.fetchUserInfo({ accessToken: 'vrc-token', fetchImpl: fn });

    expect(userInfo.externalAccountId).toBe('user-1');
    expect(userInfo.externalAccountLabel).toBe('octocat');
    expect(calls).toHaveLength(1);
    expect(calls[0].url.toString()).toBe('https://api.vercel.com/v2/user');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer vrc-token');
  });

  it('falls back to email or name when username is missing', async () => {
    const fn = (async () => new Response(JSON.stringify({ user: { uid: 'u-2', email: 'a@b.c' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

    const userInfo = await vercelConnector.fetchUserInfo({ accessToken: 't', fetchImpl: fn });
    expect(userInfo.externalAccountId).toBe('u-2');
    expect(userInfo.externalAccountLabel).toBe('a@b.c');
  });

  it('throws PROVIDER_USER_INFO_FAILED on a non-2xx response', async () => {
    const fn = (async () => new Response('boom', { status: 502 })) as unknown as typeof fetch;
    await expect(
      vercelConnector.fetchUserInfo({ accessToken: 't', fetchImpl: fn }),
    ).rejects.toMatchObject({ code: 'PROVIDER_USER_INFO_FAILED', httpStatus: 502 });
  });

  it('throws PROVIDER_RESPONSE_MALFORMED when the user object is missing', async () => {
    const fn = (async () => new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

    await expect(
      vercelConnector.fetchUserInfo({ accessToken: 't', fetchImpl: fn }),
    ).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_MALFORMED' });
  });
});

describe('vercelConnector.testApiKey', () => {
  it('returns ok=true with userInfo when the token is accepted', async () => {
    const fn = (async () => new Response(
      JSON.stringify({ user: { id: 'user-1', username: 'octocat' } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as unknown as typeof fetch;

    const result = await vercelConnector.testApiKey!({ apiKey: 'good', fetchImpl: fn });

    expect(result.ok).toBe(true);
    expect(result.userInfo?.externalAccountId).toBe('user-1');
    expect(result.userInfo?.externalAccountLabel).toBe('octocat');
  });

  it('returns API_KEY_INVALID on 401', async () => {
    const fn = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch;
    const result = await vercelConnector.testApiKey!({ apiKey: 'bad', fetchImpl: fn });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('API_KEY_INVALID');
  });

  it('returns API_KEY_INVALID on 403', async () => {
    const fn = (async () => new Response('forbidden', { status: 403 })) as unknown as typeof fetch;
    const result = await vercelConnector.testApiKey!({ apiKey: 'bad', fetchImpl: fn });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('API_KEY_INVALID');
  });

  it('returns PROVIDER_UNREACHABLE when fetch throws', async () => {
    const fn = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const result = await vercelConnector.testApiKey!({ apiKey: 't', fetchImpl: fn });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PROVIDER_UNREACHABLE');
    expect(result.detail).toContain('network down');
  });

  it('returns PROVIDER_UNREACHABLE on 5xx', async () => {
    const fn = (async () => new Response('boom', { status: 503 })) as unknown as typeof fetch;
    const result = await vercelConnector.testApiKey!({ apiKey: 't', fetchImpl: fn });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PROVIDER_UNREACHABLE');
  });

  it('returns PROVIDER_RESPONSE_MALFORMED when body is not JSON', async () => {
    const fn = (async () => new Response('<html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })) as unknown as typeof fetch;
    const result = await vercelConnector.testApiKey!({ apiKey: 't', fetchImpl: fn });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PROVIDER_RESPONSE_MALFORMED');
  });
});
