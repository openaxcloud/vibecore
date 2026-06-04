import { describe, expect, it } from 'vitest';
import { supabaseConnector } from '../integrations/providers/supabase.js';

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

describe('supabaseConnector', () => {
  it('declares api_key as its auth type', () => {
    expect(supabaseConnector.provider).toBe('supabase');
    expect(supabaseConnector.authType).toBe('api_key');
    expect(supabaseConnector.buildAuthorizeUrl).toBeUndefined();
    expect(supabaseConnector.exchangeCodeForToken).toBeUndefined();
  });
});

describe('supabaseConnector.fetchUserInfo', () => {
  it('lists projects and derives the org id as externalAccountId', async () => {
    const { fn, calls } = recordingFetch(async () => new Response(
      JSON.stringify([{ ref: 'abc', name: 'my-proj', organization_id: 'org-1' }]),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));

    const userInfo = await supabaseConnector.fetchUserInfo({ accessToken: 'sb', fetchImpl: fn });

    expect(userInfo.externalAccountId).toBe('org-1');
    expect(userInfo.externalAccountLabel).toBe('Supabase org org-1');
    expect(calls[0].url.toString()).toBe('https://api.supabase.com/v1/projects');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer sb');
  });

  it('returns a synthetic account when the token has zero projects', async () => {
    const fn = (async () => new Response('[]', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

    const userInfo = await supabaseConnector.fetchUserInfo({ accessToken: 'sb', fetchImpl: fn });
    expect(userInfo.externalAccountId).toBe('supabase-account');
    expect(userInfo.externalAccountLabel).toContain('no projects');
  });

  it('throws PROVIDER_USER_INFO_FAILED on non-2xx', async () => {
    const fn = (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    await expect(
      supabaseConnector.fetchUserInfo({ accessToken: 'sb', fetchImpl: fn }),
    ).rejects.toMatchObject({ code: 'PROVIDER_USER_INFO_FAILED', httpStatus: 500 });
  });

  it('throws PROVIDER_RESPONSE_MALFORMED when the body is not an array', async () => {
    const fn = (async () => new Response(JSON.stringify({ projects: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

    await expect(
      supabaseConnector.fetchUserInfo({ accessToken: 'sb', fetchImpl: fn }),
    ).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_MALFORMED' });
  });
});

describe('supabaseConnector.testApiKey', () => {
  it('returns ok=true with userInfo on 200', async () => {
    const fn = (async () => new Response(
      JSON.stringify([{ ref: 'abc', name: 'my-proj', organization_id: 'org-1' }]),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as unknown as typeof fetch;

    const result = await supabaseConnector.testApiKey!({ apiKey: 'good', fetchImpl: fn });
    expect(result.ok).toBe(true);
    expect(result.userInfo?.externalAccountId).toBe('org-1');
  });

  it('returns API_KEY_INVALID on 401', async () => {
    const fn = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch;
    const result = await supabaseConnector.testApiKey!({ apiKey: 'bad', fetchImpl: fn });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('API_KEY_INVALID');
  });

  it('returns API_KEY_INSUFFICIENT_SCOPE on 403', async () => {
    const fn = (async () => new Response('forbidden', { status: 403 })) as unknown as typeof fetch;
    const result = await supabaseConnector.testApiKey!({ apiKey: 'bad', fetchImpl: fn });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('API_KEY_INSUFFICIENT_SCOPE');
  });

  it('returns PROVIDER_UNREACHABLE when fetch throws', async () => {
    const fn = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const result = await supabaseConnector.testApiKey!({ apiKey: 't', fetchImpl: fn });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PROVIDER_UNREACHABLE');
  });

  it('returns PROVIDER_RESPONSE_MALFORMED when payload is not an array', async () => {
    const fn = (async () => new Response(JSON.stringify({ projects: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

    const result = await supabaseConnector.testApiKey!({ apiKey: 't', fetchImpl: fn });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PROVIDER_RESPONSE_MALFORMED');
  });
});
