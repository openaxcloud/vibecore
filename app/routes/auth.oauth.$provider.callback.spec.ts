/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * enterprise-api.server is mocked at the module boundary so the success-path
 * tests below can drive the loader past the token-exchange fetch without a live
 * backend. The pre-fetch branches (provider error, invalid callback, etc.) never
 * reach these helpers, so stubbing them does not affect those cases.
 */
vi.mock('~/lib/enterprise-api.server', () => ({
  apiBaseUrl: () => 'https://api.test',
  cookieSecure: () => '; Secure',
  sessionCookie: (token: string) => `vc_session=${token}; Path=/; HttpOnly`,
}));

import { loader } from './auth.oauth.$provider.callback';

type LoaderContext = Parameters<typeof loader>[0]['context'];

const context = {
  cloudflare: { env: {}, cf: {}, ctx: {}, caches: {} },
} as unknown as LoaderContext;

function buildRequest(path: string, cookie?: string): Request {
  return new Request(`http://app.e-code.ai${path}`, {
    headers: cookie ? { host: 'app.e-code.ai', cookie } : { host: 'app.e-code.ai' },
  });
}

async function runLoader(path: string, params: Record<string, string>, cookie?: string) {
  try {
    await loader({ request: buildRequest(path, cookie), params, context });
  } catch (thrown) {
    if (thrown instanceof Response) {
      return thrown;
    }

    throw thrown;
  }

  throw new Error('expected loader to throw a redirect Response');
}

describe('oauth callback loader', () => {
  it('surfaces the provider error (e.g. access_denied from a Testing-mode app) instead of invalid_callback', async () => {
    const response = await runLoader(
      '/auth/oauth/google/callback?error=access_denied&error_description=The+app+is+in+testing',
      { provider: 'google' },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      '/login?oauth=google&error=access_denied&detail=The%20app%20is%20in%20testing',
    );

    // The single-use state cookie is cleared on the way out.
    expect(response.headers.get('set-cookie')).toContain('vc_oauth_state=;');
  });

  it('propagates the provider error even when error_description is absent', async () => {
    const response = await runLoader('/auth/oauth/google/callback?error=admin_policy_enforced', {
      provider: 'google',
    });

    expect(response.headers.get('location')).toBe('/login?oauth=google&error=admin_policy_enforced');
  });

  it('falls back to invalid_callback when code/state are missing without a provider error', async () => {
    const response = await runLoader('/auth/oauth/google/callback', { provider: 'google' });

    expect(response.headers.get('location')).toBe('/login?oauth=google&error=invalid_callback');
  });

  it('rejects a state that does not match the signed cookie', async () => {
    const response = await runLoader(
      '/auth/oauth/google/callback?code=abc&state=mismatch',
      { provider: 'google' },
      'vc_oauth_state=google%3Aexpected',
    );

    expect(response.headers.get('location')).toBe('/login?oauth=google&error=invalid_callback');
  });

  it('redirects unsupported providers before reading the query', async () => {
    const response = await runLoader('/auth/oauth/twitter/callback?error=access_denied', {
      provider: 'twitter',
    });

    expect(response.headers.get('location')).toBe('/login?oauth=unknown&error=unsupported_provider');
  });
});

describe('oauth callback success-path response parsing', () => {
  const validCookie = 'vc_oauth_state=google%3Atok';

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubFetch(response: Response) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response),
    );
  }

  it('redirects to /dashboard with a session cookie on a valid 200 token response', async () => {
    stubFetch(
      new Response(JSON.stringify({ token: 'jwt-123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    // The success branch RETURNS the redirect (rather than throwing it), so call the loader directly.
    const response = (await loader({
      request: buildRequest('/auth/oauth/google/callback?code=abc&state=tok', validCookie),
      params: { provider: 'google' },
      context,
    })) as Response;

    expect(response.headers.get('location')).toBe('/dashboard');
    expect(response.headers.getSetCookie().some((c) => c.startsWith('vc_session=jwt-123'))).toBe(true);
  });

  it('degrades to the login error screen when a 200 carries an empty body (no error boundary)', async () => {
    // Empty body: response.json() throws a SyntaxError that previously escaped the loader.
    stubFetch(new Response('', { status: 200, headers: { 'content-type': 'application/json' } }));

    const response = await runLoader(
      '/auth/oauth/google/callback?code=abc&state=tok',
      { provider: 'google' },
      validCookie,
    );

    expect(response.headers.get('location')).toBe('/login?oauth=google&error=callback_failed&detail=bad_response');
  });

  it('degrades to the login error screen when a 200 carries a non-JSON (HTML) body', async () => {
    // An upstream proxy error page served with a 200 status — json() throws.
    stubFetch(
      new Response('<html><body>Bad Gateway</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    const response = await runLoader(
      '/auth/oauth/google/callback?code=abc&state=tok',
      { provider: 'google' },
      validCookie,
    );

    expect(response.headers.get('location')).toBe('/login?oauth=google&error=callback_failed&detail=bad_response');
  });

  it('still rejects a well-formed 200 that is missing the token', async () => {
    stubFetch(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await runLoader(
      '/auth/oauth/google/callback?code=abc&state=tok',
      { provider: 'google' },
      validCookie,
    );

    expect(response.headers.get('location')).toBe('/login?oauth=google&error=callback_failed&detail=missing_token');
  });
});
