import { describe, expect, it } from 'vitest';
import { bitbucketConnector, resolveBitbucketCredentials } from '../integrations/providers/bitbucket.js';
import { gitlabConnector, resolveGitLabCredentials } from '../integrations/providers/gitlab.js';

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

describe('gitlabConnector', () => {
  const credentials = {
    clientId: 'gl-client',
    clientSecret: 'gl-secret',
    scopes: ['read_user', 'read_repository'],
    redirectUri: 'https://app.e-code.ai/integrations/oauth/gitlab/callback',
  };

  it('builds an OAuth authorize URL for GitLab', () => {
    const url = new URL(gitlabConnector.buildAuthorizeUrl!({ credentials, state: 'state-gl' }));

    expect(url.origin + url.pathname).toBe('https://gitlab.com/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('gl-client');
    expect(url.searchParams.get('redirect_uri')).toBe(credentials.redirectUri);
    expect(url.searchParams.get('scope')).toBe('read_user read_repository');
    expect(url.searchParams.get('state')).toBe('state-gl');
  });

  it('exchanges a code for tokens and parses scopes', async () => {
    const { fn, calls } = recordingFetch(
      async () =>
        new Response(
          JSON.stringify({
            access_token: 'gl-access',
            refresh_token: 'gl-refresh',
            expires_in: 7200,
            scope: 'read_user read_repository',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );

    const result = await gitlabConnector.exchangeCodeForToken!({
      credentials,
      code: 'code-gl',
      fetchImpl: fn,
    });

    expect(result).toMatchObject({
      accessToken: 'gl-access',
      refreshToken: 'gl-refresh',
      expiresInSeconds: 7200,
      scopes: ['read_user', 'read_repository'],
    });
    expect(calls[0].url.toString()).toBe('https://gitlab.com/oauth/token');
    expect(String(calls[0].init.body)).toContain('grant_type=authorization_code');
    expect(String(calls[0].init.body)).toContain('client_id=gl-client');
  });

  it('fetches GitLab account identity', async () => {
    const { fn, calls } = recordingFetch(
      async () =>
        new Response(JSON.stringify({ id: 123, username: 'gitlab-user' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const result = await gitlabConnector.fetchUserInfo({ accessToken: 'gl-access', fetchImpl: fn });

    expect(result).toEqual({ externalAccountId: '123', externalAccountLabel: 'gitlab-user' });
    expect(calls[0].url.toString()).toBe('https://gitlab.com/api/v4/user');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer gl-access');
  });

  it('resolves GitLab credentials from integration env vars', () => {
    const result = resolveGitLabCredentials({
      INTEGRATION_GITLAB_CLIENT_ID: 'gl-client',
      INTEGRATION_GITLAB_CLIENT_SECRET: 'gl-secret',
      INTEGRATION_GITLAB_SCOPES: 'read_user,api',
    });

    expect(result).toMatchObject({
      clientId: 'gl-client',
      clientSecret: 'gl-secret',
      redirectUri: 'https://app.e-code.ai/integrations/oauth/gitlab/callback',
      scopes: ['read_user', 'api'],
    });
  });
});

describe('bitbucketConnector', () => {
  const credentials = {
    clientId: 'bb-client',
    clientSecret: 'bb-secret',
    scopes: ['account', 'repository'],
    redirectUri: 'https://app.e-code.ai/integrations/oauth/bitbucket/callback',
  };

  it('builds an OAuth authorize URL for Bitbucket', () => {
    const url = new URL(bitbucketConnector.buildAuthorizeUrl!({ credentials, state: 'state-bb' }));

    expect(url.origin + url.pathname).toBe('https://bitbucket.org/site/oauth2/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('bb-client');
    expect(url.searchParams.get('redirect_uri')).toBe(credentials.redirectUri);
    expect(url.searchParams.get('scope')).toBe('account repository');
    expect(url.searchParams.get('state')).toBe('state-bb');
  });

  it('exchanges a code with Basic auth and parses scopes', async () => {
    const { fn, calls } = recordingFetch(
      async () =>
        new Response(
          JSON.stringify({
            access_token: 'bb-access',
            refresh_token: 'bb-refresh',
            expires_in: 3600,
            scopes: 'account repository',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );

    const result = await bitbucketConnector.exchangeCodeForToken!({
      credentials,
      code: 'code-bb',
      fetchImpl: fn,
    });

    expect(result).toMatchObject({
      accessToken: 'bb-access',
      refreshToken: 'bb-refresh',
      expiresInSeconds: 3600,
      scopes: ['account', 'repository'],
    });
    expect(calls[0].url.toString()).toBe('https://bitbucket.org/site/oauth2/access_token');
    expect((calls[0].init.headers as Record<string, string>).authorization).toMatch(/^Basic /);
    expect(String(calls[0].init.body)).toContain('grant_type=authorization_code');
  });

  it('fetches Bitbucket account identity', async () => {
    const { fn, calls } = recordingFetch(
      async () =>
        new Response(JSON.stringify({ uuid: '{bb-user}', username: 'bitbucket-user' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const result = await bitbucketConnector.fetchUserInfo({ accessToken: 'bb-access', fetchImpl: fn });

    expect(result).toEqual({ externalAccountId: '{bb-user}', externalAccountLabel: 'bitbucket-user' });
    expect(calls[0].url.toString()).toBe('https://api.bitbucket.org/2.0/user');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer bb-access');
  });

  it('resolves Bitbucket credentials from integration env vars', () => {
    const result = resolveBitbucketCredentials({
      INTEGRATION_BITBUCKET_CLIENT_ID: 'bb-client',
      INTEGRATION_BITBUCKET_CLIENT_SECRET: 'bb-secret',
      INTEGRATION_BITBUCKET_SCOPES: 'account,pullrequest',
    });

    expect(result).toMatchObject({
      clientId: 'bb-client',
      clientSecret: 'bb-secret',
      redirectUri: 'https://app.e-code.ai/integrations/oauth/bitbucket/callback',
      scopes: ['account', 'pullrequest'],
    });
  });
});
