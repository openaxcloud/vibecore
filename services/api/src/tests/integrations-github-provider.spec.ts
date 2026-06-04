import { describe, expect, it } from 'vitest';
import { githubConnector, resolveGithubCredentials } from '../integrations/providers/github.js';
import { ConnectorProviderError } from '../integrations/providers/types.js';

const credentials = {
  clientId: 'gh-client',
  clientSecret: 'gh-secret',
  scopes: ['repo', 'user:email'],
  redirectUri: 'https://app.e-code.ai/integrations/oauth/github/callback',
};

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

describe('githubConnector.buildAuthorizeUrl', () => {
  it('encodes the client id, redirect URI, scope list and state', () => {
    const url = githubConnector.buildAuthorizeUrl!({
      credentials,
      state: 'state-abc',
    });

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(parsed.searchParams.get('client_id')).toBe('gh-client');
    expect(parsed.searchParams.get('redirect_uri')).toBe(credentials.redirectUri);
    expect(parsed.searchParams.get('scope')).toBe('repo user:email');
    expect(parsed.searchParams.get('state')).toBe('state-abc');
    expect(parsed.searchParams.get('response_type')).toBe('code');
  });
});

describe('githubConnector.exchangeCodeForToken', () => {
  it('POSTs the code to GitHub and returns the access token + scopes', async () => {
    const { fn, calls } = recordingFetch(async () => new Response(
      JSON.stringify({ access_token: 'gh-access', scope: 'repo,user:email', token_type: 'bearer' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));

    const result = await githubConnector.exchangeCodeForToken!({
      credentials,
      code: 'auth-code-123',
      fetchImpl: fn,
    });

    expect(result.accessToken).toBe('gh-access');
    expect(result.scopes).toEqual(['repo', 'user:email']);

    expect(calls).toHaveLength(1);
    expect(calls[0].url.toString()).toBe('https://github.com/login/oauth/access_token');
    expect(calls[0].init.method).toBe('POST');
    const body = String(calls[0].init.body ?? '');
    expect(body).toContain('client_id=gh-client');
    expect(body).toContain('code=auth-code-123');
    expect(body).toContain('redirect_uri=');
  });

  it('throws PROVIDER_TOKEN_EXCHANGE_FAILED on a non-2xx response', async () => {
    const fn = (async () => new Response('boom', { status: 502 })) as unknown as typeof fetch;

    await expect(
      githubConnector.exchangeCodeForToken!({ credentials, code: 'x', fetchImpl: fn }),
    ).rejects.toMatchObject({ code: 'PROVIDER_TOKEN_EXCHANGE_FAILED', httpStatus: 502 });
  });

  it('throws PROVIDER_TOKEN_EXCHANGE_FAILED when GitHub returns an error JSON', async () => {
    const fn = (async () => new Response(
      JSON.stringify({ error: 'bad_verification_code', error_description: 'The code expired' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as unknown as typeof fetch;

    await expect(
      githubConnector.exchangeCodeForToken!({ credentials, code: 'x', fetchImpl: fn }),
    ).rejects.toBeInstanceOf(ConnectorProviderError);
  });

  it('throws PROVIDER_RESPONSE_MALFORMED when the access token is missing', async () => {
    const fn = (async () => new Response(JSON.stringify({ token_type: 'bearer' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

    await expect(
      githubConnector.exchangeCodeForToken!({ credentials, code: 'x', fetchImpl: fn }),
    ).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_MALFORMED' });
  });
});

describe('githubConnector.fetchUserInfo', () => {
  it('GETs /user with the access token and returns id + login', async () => {
    const { fn, calls } = recordingFetch(async () => new Response(
      JSON.stringify({ id: 42, login: 'octocat', name: 'Octo Cat' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));

    const userInfo = await githubConnector.fetchUserInfo({ accessToken: 'gh-access', fetchImpl: fn });

    expect(userInfo.externalAccountId).toBe('42');
    expect(userInfo.externalAccountLabel).toBe('octocat');

    expect(calls).toHaveLength(1);
    expect(calls[0].url.toString()).toBe('https://api.github.com/user');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe('token gh-access');
  });

  it('throws PROVIDER_USER_INFO_FAILED on a non-2xx response', async () => {
    const fn = (async () => new Response('unauthorized', { status: 401 })) as unknown as typeof fetch;
    await expect(
      githubConnector.fetchUserInfo({ accessToken: 'gh-access', fetchImpl: fn }),
    ).rejects.toMatchObject({ code: 'PROVIDER_USER_INFO_FAILED', httpStatus: 401 });
  });

  it('throws PROVIDER_RESPONSE_MALFORMED when id or login is missing', async () => {
    const fn = (async () => new Response(JSON.stringify({ name: 'no id' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

    await expect(
      githubConnector.fetchUserInfo({ accessToken: 'gh-access', fetchImpl: fn }),
    ).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_MALFORMED' });
  });
});

describe('resolveGithubCredentials', () => {
  it('returns null when client id or secret is missing', () => {
    expect(resolveGithubCredentials({})).toBeNull();
    expect(resolveGithubCredentials({ INTEGRATION_GITHUB_CLIENT_ID: 'x' })).toBeNull();
  });

  it('parses the scope list and applies the default redirect URI', () => {
    const creds = resolveGithubCredentials({
      INTEGRATION_GITHUB_CLIENT_ID: 'cid',
      INTEGRATION_GITHUB_CLIENT_SECRET: 'csec',
    });

    expect(creds).not.toBeNull();
    expect(creds!.clientId).toBe('cid');
    expect(creds!.clientSecret).toBe('csec');
    expect(creds!.redirectUri).toBe('https://app.e-code.ai/integrations/oauth/github/callback');
    expect(creds!.scopes).toContain('repo');
    expect(creds!.scopes).toContain('user:email');
  });

  it('overrides scopes when INTEGRATION_GITHUB_SCOPES is set', () => {
    const creds = resolveGithubCredentials({
      INTEGRATION_GITHUB_CLIENT_ID: 'cid',
      INTEGRATION_GITHUB_CLIENT_SECRET: 'csec',
      INTEGRATION_GITHUB_SCOPES: 'repo,read:org',
    });
    expect(creds!.scopes).toEqual(['repo', 'read:org']);
  });
});
