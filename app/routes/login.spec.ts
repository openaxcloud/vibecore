/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { action, loader, loginFeedbackFromFailure, meta, oauthErrorTranslationKey } from './login';
import { toResponse } from '~/lib/test/rr7-data';

function buildRequest(host: string): Request {
  return new Request(`http://${host}/login`, {
    headers: { host },
  });
}

describe('login route loader', () => {
  it('redirects e-code.ai/login to app.e-code.ai/login with 301', async () => {
    const response = toResponse(
      await loader({
        request: buildRequest('e-code.ai'),
        params: {},
        context: { cloudflare: { env: {}, cf: {}, ctx: {}, caches: {} } } as unknown as Parameters<
          typeof loader
        >[0]['context'],
      }),
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(301);
    expect((response as Response).headers.get('location')).toBe('https://app.e-code.ai/login');
  });

  it('redirects www.e-code.ai/login the same way', async () => {
    const response = toResponse(
      await loader({
        request: buildRequest('www.e-code.ai'),
        params: {},
        context: { cloudflare: { env: {}, cf: {}, ctx: {}, caches: {} } } as unknown as Parameters<
          typeof loader
        >[0]['context'],
      }),
    );

    expect((response as Response).status).toBe(301);
    expect((response as Response).headers.get('location')).toBe('https://app.e-code.ai/login');
  });

  it('preserves a safe returnTo when redirecting the marketing host to the app login', async () => {
    const response = toResponse(
      await loader({
        request: new Request(`http://e-code.ai/login?returnTo=${encodeURIComponent('/community')}`, {
          headers: { host: 'e-code.ai' },
        }),
        params: {},
        context: { cloudflare: { env: {}, cf: {}, ctx: {}, caches: {} } } as unknown as Parameters<
          typeof loader
        >[0]['context'],
      }),
    );

    expect((response as Response).status).toBe(301);
    expect((response as Response).headers.get('location')).toBe(
      `https://app.e-code.ai/login?returnTo=${encodeURIComponent('/community')}`,
    );
  });

  it('does not preserve an unsafe returnTo when redirecting from the marketing host', async () => {
    const response = toResponse(
      await loader({
        request: new Request(`http://e-code.ai/login?returnTo=${encodeURIComponent('https://evil.com/steal')}`, {
          headers: { host: 'e-code.ai' },
        }),
        params: {},
        context: { cloudflare: { env: {}, cf: {}, ctx: {}, caches: {} } } as unknown as Parameters<
          typeof loader
        >[0]['context'],
      }),
    );

    expect((response as Response).status).toBe(301);
    expect((response as Response).headers.get('location')).toBe('https://app.e-code.ai/login');
  });

  it('treats the host case-insensitively', async () => {
    const response = toResponse(
      await loader({
        request: buildRequest('E-Code.AI'),
        params: {},
        context: { cloudflare: { env: {}, cf: {}, ctx: {}, caches: {} } } as unknown as Parameters<
          typeof loader
        >[0]['context'],
      }),
    );

    expect((response as Response).status).toBe(301);
  });

  it('returns no oauth error on the app subdomain so the form renders', async () => {
    const response = toResponse(
      await loader({
        request: buildRequest('app.e-code.ai'),
        params: {},
        context: { cloudflare: { env: {}, cf: {}, ctx: {}, caches: {} } } as unknown as Parameters<
          typeof loader
        >[0]['context'],
      }),
    );

    expect(response).toBeInstanceOf(Response);

    const body = (await (response as Response).json()) as { oauth: unknown };
    expect(body.oauth).toBeNull();
  });

  it('returns no oauth error on localhost so dev mode keeps working', async () => {
    const response = toResponse(
      await loader({
        request: buildRequest('localhost:5173'),
        params: {},
        context: { cloudflare: { env: {}, cf: {}, ctx: {}, caches: {} } } as unknown as Parameters<
          typeof loader
        >[0]['context'],
      }),
    );

    expect(response).toBeInstanceOf(Response);

    const body = (await (response as Response).json()) as { oauth: unknown };
    expect(body.oauth).toBeNull();
  });

  it('resolves French from Accept-Language for localized metadata', async () => {
    const response = toResponse(
      await loader({
        request: new Request('http://app.e-code.ai/login', {
          headers: { host: 'app.e-code.ai', 'Accept-Language': 'fr-FR, en;q=0.8' },
        }),
        params: {},
        context: { cloudflare: { env: {}, cf: {}, ctx: {}, caches: {} } } as unknown as Parameters<
          typeof loader
        >[0]['context'],
      }),
    );

    expect((await response.json()) as { language: string }).toMatchObject({ language: 'fr' });
  });

  it('surfaces the oauth error from query params', async () => {
    const request = new Request(
      'http://app.e-code.ai/login?oauth=google&error=callback_failed&detail=OAUTH_TOKEN_EXCHANGE_FAILED',
      {
        headers: { host: 'app.e-code.ai' },
      },
    );
    const response = toResponse(
      await loader({
        request,
        params: {},
        context: { cloudflare: { env: {}, cf: {}, ctx: {}, caches: {} } } as unknown as Parameters<
          typeof loader
        >[0]['context'],
      }),
    );

    expect(response).toBeInstanceOf(Response);

    const body = (await (response as Response).json()) as {
      oauth: { provider: string; error: string; detail: string | null } | null;
    };
    expect(body.oauth).toEqual({
      provider: 'google',
      error: 'callback_failed',
      detail: 'OAUTH_TOKEN_EXCHANGE_FAILED',
    });
  });
});

describe('login visible branding', () => {
  it('keeps the E-Code auth shell instead of the imported E-Code marketing login', () => {
    const loginSource = readFileSync('app/routes/login.tsx', 'utf8');
    const authScreenSource = readFileSync('app/components/auth/AuthScreen.tsx', 'utf8');

    /*
     * The auth shell renders the inline EcodeBrandMark (no external <img> logo)
     * and the "E-Code" wordmark — not the old Vibecore bolt or the marketing login.
     */
    expect(authScreenSource).toContain('EcodeBrandMark');
    expect(authScreenSource).toContain("t('auth.shell.brandName')");
    expect(authScreenSource).not.toContain('src="/logo.svg"');
    expect(authScreenSource).not.toContain('src="/assets/logo.svg"');
    expect(authScreenSource).not.toContain('>E-code<');
    expect(authScreenSource).not.toContain('Vibecore');
    expect(loginSource).toContain("'auth.login.metaTitle'");
    expect(loginSource).toContain("t('auth.login.description')");
    expect(loginSource).not.toContain('E-code IDE');
  });

  it('publishes localized French route metadata', () => {
    const metadata = meta({ data: { language: 'fr', oauth: null, providers: [] } } as Parameters<typeof meta>[0]);

    expect(metadata).toContainEqual({ title: 'Connexion - E-Code' });
    expect(metadata).toContainEqual({
      name: 'description',
      content: 'Connectez-vous à votre espace de travail E-Code.',
    });
  });
});

describe('login localized failure mapping', () => {
  it('maps OAuth query codes without exposing callback details', () => {
    expect(oauthErrorTranslationKey('access_denied')).toBe('auth.oauth.accessDenied');
    expect(oauthErrorTranslationKey('OAUTH_TOKEN_EXCHANGE_FAILED')).toBe('auth.oauth.generic');
  });

  it('keeps precise rate-limit values as interpolation parameters', () => {
    expect(loginFeedbackFromFailure(undefined, 429, '45')).toEqual({
      errorCode: 'RATE_LIMITED_SECONDS',
      errorParams: { count: 45 },
    });
    expect(loginFeedbackFromFailure(undefined, 429, '120')).toEqual({
      errorCode: 'RATE_LIMITED_MINUTES',
      errorParams: { count: 2 },
    });
  });

  it('maps SSO enforcement to a stable client-side code', () => {
    expect(loginFeedbackFromFailure('SSO_ENFORCED', 403, null)).toEqual({ errorCode: 'SSO_ENFORCED' });
  });
});

describe('login route action', () => {
  let originalApiBaseUrl: string | undefined;
  let originalSaasApiUrl: string | undefined;

  beforeEach(() => {
    originalApiBaseUrl = process.env.API_BASE_URL;
    originalSaasApiUrl = process.env.SAAS_API_URL;
    delete process.env.SAAS_API_URL;
    process.env.API_BASE_URL = 'https://api.example.com';
  });

  afterEach(() => {
    vi.unstubAllGlobals();

    if (originalApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL;
    } else {
      process.env.API_BASE_URL = originalApiBaseUrl;
    }

    if (originalSaasApiUrl === undefined) {
      delete process.env.SAAS_API_URL;
    } else {
      process.env.SAAS_API_URL = originalSaasApiUrl;
    }
  });

  function stubLoginOk() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ token: 'tok_123', user: { email: 'a@b.c' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
  }

  function buildActionRequest(url: string, fields: Record<string, string>) {
    const body = new URLSearchParams(fields).toString();

    return new Request(url, {
      method: 'POST',
      headers: {
        host: 'app.e-code.ai',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    });
  }

  it('redirects to the safe returnTo from the URL after a successful sign-in', async () => {
    stubLoginOk();

    const response = toResponse(
      await action({
        request: buildActionRequest(`http://app.e-code.ai/login?returnTo=${encodeURIComponent('/projects/abc/ide')}`, {
          email: 'a@b.c',
          password: 'pw',
        }),
        params: {},
        context: { cloudflare: { env: {}, cf: {}, ctx: {}, caches: {} } } as unknown as Parameters<
          typeof action
        >[0]['context'],
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/projects/abc/ide');
  });

  it('falls back to /dashboard when no returnTo is present', async () => {
    stubLoginOk();

    const response = toResponse(
      await action({
        request: buildActionRequest('http://app.e-code.ai/login', { email: 'a@b.c', password: 'pw' }),
        params: {},
        context: { cloudflare: { env: {}, cf: {}, ctx: {}, caches: {} } } as unknown as Parameters<
          typeof action
        >[0]['context'],
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/dashboard');
  });

  it('ignores a hostile absolute-URL returnTo (open-redirect guard)', async () => {
    stubLoginOk();

    const response = toResponse(
      await action({
        request: buildActionRequest(
          `http://app.e-code.ai/login?returnTo=${encodeURIComponent('https://evil.com/steal')}`,
          { email: 'a@b.c', password: 'pw' },
        ),
        params: {},
        context: { cloudflare: { env: {}, cf: {}, ctx: {}, caches: {} } } as unknown as Parameters<
          typeof action
        >[0]['context'],
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/dashboard');
  });

  it('returns a stable localized-code contract instead of raw API prose', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'Internal identity lookup detail', code: 'AUTH_INVALID_CREDENTIALS' }, { status: 401 }),
      ),
    );

    const response = toResponse(
      await action({
        request: buildActionRequest('http://app.e-code.ai/login', {
          email: 'a@b.c',
          password: 'incorrect',
        }),
        params: {},
        context: { cloudflare: { env: {}, cf: {}, ctx: {}, caches: {} } } as unknown as Parameters<
          typeof action
        >[0]['context'],
      }),
    );

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toMatchObject({
      errorCode: 'AUTH_INVALID_CREDENTIALS',
      code: 'AUTH_INVALID_CREDENTIALS',
    });
    expect(payload).not.toHaveProperty('error');
    expect(JSON.stringify(payload)).not.toContain('Internal identity lookup detail');
  });
});
