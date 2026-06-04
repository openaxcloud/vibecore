import { describe, expect, it } from 'vitest';
import { netlifyConnector } from '../integrations/providers/netlify.js';

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

describe('netlifyConnector', () => {
  it('declares api_key as its auth type', () => {
    expect(netlifyConnector.provider).toBe('netlify');
    expect(netlifyConnector.authType).toBe('api_key');
    expect(netlifyConnector.buildAuthorizeUrl).toBeUndefined();
    expect(netlifyConnector.exchangeCodeForToken).toBeUndefined();
  });
});

describe('netlifyConnector.fetchUserInfo', () => {
  it('GETs /api/v1/user and returns id + full_name', async () => {
    const { fn, calls } = recordingFetch(async () => new Response(
      JSON.stringify({ id: 'usr-1', email: 'a@b.c', full_name: 'Octo Cat', slug: 'octo' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));

    const userInfo = await netlifyConnector.fetchUserInfo({ accessToken: 'nf', fetchImpl: fn });

    expect(userInfo.externalAccountId).toBe('usr-1');
    expect(userInfo.externalAccountLabel).toBe('Octo Cat');
    expect(calls[0].url.toString()).toBe('https://api.netlify.com/api/v1/user');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer nf');
  });

  it('falls back to email when full_name is missing', async () => {
    const fn = (async () => new Response(JSON.stringify({ id: 'usr-2', email: 'a@b.c' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

    const userInfo = await netlifyConnector.fetchUserInfo({ accessToken: 'nf', fetchImpl: fn });
    expect(userInfo.externalAccountId).toBe('usr-2');
    expect(userInfo.externalAccountLabel).toBe('a@b.c');
  });

  it('throws PROVIDER_USER_INFO_FAILED on non-2xx', async () => {
    const fn = (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    await expect(
      netlifyConnector.fetchUserInfo({ accessToken: 'nf', fetchImpl: fn }),
    ).rejects.toMatchObject({ code: 'PROVIDER_USER_INFO_FAILED', httpStatus: 500 });
  });

  it('throws PROVIDER_RESPONSE_MALFORMED when id is missing', async () => {
    const fn = (async () => new Response(JSON.stringify({ email: 'a@b.c' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

    await expect(
      netlifyConnector.fetchUserInfo({ accessToken: 'nf', fetchImpl: fn }),
    ).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_MALFORMED' });
  });
});

describe('netlifyConnector.testApiKey', () => {
  it('returns ok=true with userInfo on 200', async () => {
    const fn = (async () => new Response(
      JSON.stringify({ id: 'usr-1', full_name: 'Octo' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as unknown as typeof fetch;

    const result = await netlifyConnector.testApiKey!({ apiKey: 'good', fetchImpl: fn });
    expect(result.ok).toBe(true);
    expect(result.userInfo?.externalAccountId).toBe('usr-1');
  });

  it('returns API_KEY_INVALID on 401', async () => {
    const fn = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch;
    const result = await netlifyConnector.testApiKey!({ apiKey: 'bad', fetchImpl: fn });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('API_KEY_INVALID');
  });

  it('returns API_KEY_INSUFFICIENT_SCOPE on 403', async () => {
    const fn = (async () => new Response('forbidden', { status: 403 })) as unknown as typeof fetch;
    const result = await netlifyConnector.testApiKey!({ apiKey: 'bad', fetchImpl: fn });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('API_KEY_INSUFFICIENT_SCOPE');
  });

  it('returns PROVIDER_UNREACHABLE when fetch throws', async () => {
    const fn = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const result = await netlifyConnector.testApiKey!({ apiKey: 't', fetchImpl: fn });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PROVIDER_UNREACHABLE');
  });

  it('returns PROVIDER_RESPONSE_MALFORMED when id is missing', async () => {
    const fn = (async () => new Response(JSON.stringify({ email: 'a@b.c' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

    const result = await netlifyConnector.testApiKey!({ apiKey: 't', fetchImpl: fn });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PROVIDER_RESPONSE_MALFORMED');
  });
});
