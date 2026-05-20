/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { action } from './mfa-setup';

const ENV_KEYS = ['SAAS_API_URL', 'API_BASE_URL'] as const;

function buildFormRequest(body: Record<string, string>): Request {
  const formData = new URLSearchParams(body).toString();

  return new Request('http://localhost/mfa-setup', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formData,
  });
}

describe('mfa-setup route action', () => {
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

  it('returns secret and otpauthUrl from /auth/mfa/setup on intent=setup', async () => {
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => {
      return new Response(JSON.stringify({ secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/foo' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const response = (await action({
      request: buildFormRequest({ intent: 'setup' }),
      params: {},
      context: {} as unknown as Parameters<typeof action>[0]['context'],
    })) as Response;

    expect(response).toBeInstanceOf(Response);

    const payload = (await response.json()) as { secret: string; otpauthUrl: string };
    expect(payload.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(payload.otpauthUrl).toBe('otpauth://totp/foo');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.example.com/auth/mfa/setup',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('mints recovery codes after a successful verify so the user leaves with backup access', async () => {
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

    const response = (await action({
      request: buildFormRequest({
        intent: 'verify',
        code: '123456',
        secret: 'JBSWY3DPEHPK3PXP',
        otpauthUrl: 'otpauth://totp/foo',
      }),
      params: {},
      context: {} as unknown as Parameters<typeof action>[0]['context'],
    })) as Response;

    expect(response.status).toBe(200);

    const payload = (await response.json()) as { enabled: boolean; codes: string[] };
    expect(payload.enabled).toBe(true);
    expect(payload.codes).toEqual(['aaaaaaaa-bbbbbbbb', 'cccccccc-dddddddd']);

    const verifyCall = fetchSpy.mock.calls.find(([url]) =>
      (typeof url === 'string' ? url : url.toString()).endsWith('/auth/mfa/verify'),
    );
    expect(verifyCall).toBeDefined();

    const recoveryCall = fetchSpy.mock.calls.find(([url]) =>
      (typeof url === 'string' ? url : url.toString()).endsWith('/auth/recovery-codes'),
    );
    expect(recoveryCall).toBeDefined();
  });

  it('surfaces the API error and skips recovery code generation when verify fails', async () => {
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

    const response = (await action({
      request: buildFormRequest({
        intent: 'verify',
        code: '000000',
        secret: 'JBSWY3DPEHPK3PXP',
        otpauthUrl: 'otpauth://totp/foo',
      }),
      params: {},
      context: {} as unknown as Parameters<typeof action>[0]['context'],
    })) as Response;

    expect(response.status).toBe(401);

    const payload = (await response.json()) as { error: string; secret?: string; otpauthUrl?: string };
    expect(payload.error).toBe('Invalid MFA code');
    expect(payload.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(payload.otpauthUrl).toBe('otpauth://totp/foo');

    const recoveryCalls = fetchSpy.mock.calls.filter(([url]) =>
      (typeof url === 'string' ? url : url.toString()).endsWith('/auth/recovery-codes'),
    );
    expect(recoveryCalls).toHaveLength(0);
  });

  it('rejects unknown intents with a 400 so stray submissions cannot reach the API', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error('fetch should not be called for unknown intent');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const response = (await action({
      request: buildFormRequest({ intent: 'nope' }),
      params: {},
      context: {} as unknown as Parameters<typeof action>[0]['context'],
    })) as Response;

    expect(response.status).toBe(400);

    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe('Unknown form submission.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
