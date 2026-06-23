/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { action, loader } from './mfa-setup';
import { toResponse } from '~/lib/test/rr7-data';

const ENV_KEYS = ['SAAS_API_URL', 'API_BASE_URL'] as const;

function buildFormRequest(body: Record<string, string>): Request {
  return new Request('http://localhost/mfa-setup', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
}

const args = (request: Request) =>
  ({ request, params: {}, context: {} as unknown as Parameters<typeof action>[0]['context'] }) as Parameters<
    typeof action
  >[0];

describe('mfa-setup route', () => {
  let originals: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

  beforeEach(() => {
    originals = {};

    for (const key of ENV_KEYS) {
      originals[key] = process.env[key];
    }

    delete process.env.SAAS_API_URL;
    process.env.API_BASE_URL = 'https://api.example.com';
  });

  afterEach(() => {
    vi.unstubAllGlobals();

    for (const key of ENV_KEYS) {
      const value = originals[key];

      if (value === undefined) {
        delete process.env[key];
      } else {
        (process.env as Record<string, string>)[key] = value;
      }
    }
  });

  it('loader auto-creates the secret + QR when MFA is off (no extra click)', async () => {
    const fetchSpy = vi.fn(async (url: string | URL | Request) => {
      const href = typeof url === 'string' ? url : url.toString();

      if (href.endsWith('/auth/me')) {
        return new Response(JSON.stringify({ user: { mfaEnabled: false } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (href.endsWith('/auth/mfa/setup')) {
        return new Response(JSON.stringify({ secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/foo' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${href}`);
    });
    vi.stubGlobal('fetch', fetchSpy);

    const response = toResponse(await loader(args(new Request('http://localhost/mfa-setup'))));
    const payload = (await response.json()) as { status: string; secret?: string; otpauthUrl?: string };

    expect(payload.status).toBe('setup');
    expect(payload.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(payload.otpauthUrl).toBe('otpauth://totp/foo');
  });

  it('loader asks for a password step-up when setup needs a recent re-auth (403)', async () => {
    const fetchSpy = vi.fn(async (url: string | URL | Request) => {
      const href = typeof url === 'string' ? url : url.toString();

      if (href.endsWith('/auth/me')) {
        return new Response(JSON.stringify({ user: { mfaEnabled: false } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (href.endsWith('/auth/mfa/setup')) {
        return new Response(JSON.stringify({ error: 'Recent re-authentication required', code: 'REAUTH_REQUIRED' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${href}`);
    });
    vi.stubGlobal('fetch', fetchSpy);

    const response = toResponse(await loader(args(new Request('http://localhost/mfa-setup'))));
    const payload = (await response.json()) as { status: string };

    expect(payload.status).toBe('reauth');
  });

  it('loader short-circuits to already-enabled (and does not create a new secret)', async () => {
    const fetchSpy = vi.fn(async (url: string | URL | Request) => {
      const href = typeof url === 'string' ? url : url.toString();

      if (href.endsWith('/auth/me')) {
        return new Response(JSON.stringify({ user: { mfaEnabled: true } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`should not fetch ${href} when already enabled`);
    });
    vi.stubGlobal('fetch', fetchSpy);

    const response = toResponse(await loader(args(new Request('http://localhost/mfa-setup'))));
    const payload = (await response.json()) as { status: string };

    expect(payload.status).toBe('enabled');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('action verifies the code and mints recovery codes so the user leaves with backup access', async () => {
    const fetchSpy = vi.fn(async (url: string | URL | Request) => {
      const href = typeof url === 'string' ? url : url.toString();

      if (href.endsWith('/auth/mfa/verify')) {
        return new Response(JSON.stringify({ enabled: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (href.endsWith('/auth/recovery-codes')) {
        return new Response(JSON.stringify({ codes: ['aaaaaaaa-bbbbbbbb', 'cccccccc-dddddddd'] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${href}`);
    });
    vi.stubGlobal('fetch', fetchSpy);

    const response = toResponse(await action(args(buildFormRequest({ code: '123456' }))));
    expect(response.status).toBe(200);

    const payload = (await response.json()) as { enabled: boolean; codes: string[] };
    expect(payload.enabled).toBe(true);
    expect(payload.codes).toEqual(['aaaaaaaa-bbbbbbbb', 'cccccccc-dddddddd']);
  });

  it('action re-throws the login redirect when the session expires while minting recovery codes', async () => {
    const fetchSpy = vi.fn(async (url: string | URL | Request) => {
      const href = typeof url === 'string' ? url : url.toString();

      if (href.endsWith('/auth/mfa/verify')) {
        return new Response(JSON.stringify({ enabled: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      /*
       * Recovery-codes uses the default redirectOn401:true; an expired session
       * makes apiRequest throw a /login redirect Response.
       */
      if (href.endsWith('/auth/recovery-codes')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${href}`);
    });
    vi.stubGlobal('fetch', fetchSpy);

    let thrown: unknown;

    try {
      await action(args(buildFormRequest({ code: '123456' })));
    } catch (error) {
      thrown = error;
    }

    // The redirect must propagate — NOT be swallowed into a soft "enabled" result.
    expect(thrown).toBeInstanceOf(Response);

    const redirectResponse = thrown as Response;
    expect(redirectResponse.status).toBeGreaterThanOrEqual(300);
    expect(redirectResponse.status).toBeLessThan(400);
    expect(redirectResponse.headers.get('location')).toContain('/login');
  });

  it('action surfaces the API error and skips recovery-code generation when verify fails', async () => {
    const fetchSpy = vi.fn(async (url: string | URL | Request) => {
      const href = typeof url === 'string' ? url : url.toString();

      if (href.endsWith('/auth/mfa/verify')) {
        return new Response(JSON.stringify({ error: 'Invalid MFA code', code: 'MFA_INVALID_CODE' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch for failing verify: ${href}`);
    });
    vi.stubGlobal('fetch', fetchSpy);

    const response = toResponse(await action(args(buildFormRequest({ code: '000000' }))));
    expect(response.status).toBe(401);

    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe('Invalid MFA code');

    const recoveryCalls = fetchSpy.mock.calls.filter(([url]) =>
      (typeof url === 'string' ? url : url.toString()).endsWith('/auth/recovery-codes'),
    );
    expect(recoveryCalls).toHaveLength(0);
  });
});
