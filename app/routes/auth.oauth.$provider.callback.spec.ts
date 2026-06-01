/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';

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
