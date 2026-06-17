/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { action } from './admin.$section';

const ENV_KEYS = ['SAAS_API_URL', 'API_BASE_URL'] as const;

function actionRequest(body: Record<string, string>, cookie = 'vc_session=admin-token'): Request {
  return new Request('http://localhost/admin/users', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams(body).toString(),
  });
}

const args = (request: Request) => ({ request, params: {}, context: {} }) as unknown as Parameters<typeof action>[0];

describe('admin.$section action — user management', () => {
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

  it('requires a password before mutating', async () => {
    const response = (await action(
      args(actionRequest({ intent: 'platform-admin', userId: 'u1', value: 'true' })),
    )) as Response;
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/password/i);
  });

  it('reauthenticates then PATCHes platform-admin (the promote button)', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const href = typeof url === 'string' ? url : url.toString();
        calls.push(`${init?.method ?? 'GET'} ${href}`);

        if (href.endsWith('/auth/reauth')) {
          return new Response(JSON.stringify({ reauthenticated: true }), { status: 200 });
        }

        if (href.endsWith('/admin/users/u1/platform-admin')) {
          return new Response(JSON.stringify({ user: { id: 'u1', platformAdmin: true } }), { status: 200 });
        }

        throw new Error(`unexpected ${href}`);
      }),
    );

    const response = (await action(
      args(actionRequest({ intent: 'platform-admin', userId: 'u1', value: 'true', password: 'pw' })),
    )) as Response;

    expect(response.status).toBe(200);
    expect(((await response.json()) as { message: string }).message).toMatch(/platform admin/i);

    // reauth happened before the PATCH
    expect(calls[0]).toContain('/auth/reauth');
    expect(calls.some((c) => c === 'PATCH https://api.example.com/admin/users/u1/platform-admin')).toBe(true);
  });

  it('surfaces a wrong-password step-up failure as 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const href = typeof url === 'string' ? url : url.toString();

        if (href.endsWith('/auth/reauth')) {
          return new Response(JSON.stringify({ error: 'Invalid credentials', code: 'AUTH_INVALID_CREDENTIALS' }), {
            status: 401,
          });
        }

        throw new Error(`should not call ${href} after a failed reauth`);
      }),
    );

    const response = (await action(
      args(actionRequest({ intent: 'suspend', userId: 'u1', password: 'wrong' })),
    )) as Response;

    expect(response.status).toBe(401);
  });

  it('issues a strike (reauth then POST /strikes)', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const href = typeof url === 'string' ? url : url.toString();
        calls.push(`${init?.method ?? 'GET'} ${href}`);

        if (href.endsWith('/auth/reauth')) {
          return new Response(JSON.stringify({ reauthenticated: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (href.endsWith('/admin/users/u1/strikes')) {
          return new Response(JSON.stringify({ strikes: [{ severity: 'minor' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        throw new Error(`unexpected ${href}`);
      }),
    );

    const response = (await action(
      args(actionRequest({ intent: 'strike', userId: 'u1', severity: 'minor', password: 'pw' })),
    )) as Response;

    expect(response.status).toBe(200);
    expect(calls.some((c) => c === 'POST https://api.example.com/admin/users/u1/strikes')).toBe(true);
    expect(((await response.json()) as { message: string }).message).toMatch(/strike/i);
  });

  it('toggles a model on (reauth then POST /admin/models/toggle, no userId needed)', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const href = typeof url === 'string' ? url : url.toString();
        calls.push(`${init?.method ?? 'GET'} ${href}`);

        if (href.endsWith('/auth/reauth')) {
          return new Response(JSON.stringify({ reauthenticated: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (href.endsWith('/admin/models/toggle')) {
          return new Response(JSON.stringify({ model: { enabled: true } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        throw new Error(`unexpected ${href}`);
      }),
    );

    const response = (await action(
      args(
        actionRequest({
          intent: 'model-toggle',
          provider: 'Anthropic',
          modelId: 'claude',
          value: 'true',
          password: 'pw',
        }),
      ),
    )) as Response;

    expect(response.status).toBe(200);
    expect(((await response.json()) as { message: string }).message).toMatch(/model enabled/i);
    expect(calls.some((c) => c === 'POST https://api.example.com/admin/models/toggle')).toBe(true);
  });

  it('impersonate redirects to the dashboard with a new session cookie', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const href = typeof url === 'string' ? url : url.toString();

        if (href.endsWith('/auth/reauth')) {
          return new Response(JSON.stringify({ reauthenticated: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (href.endsWith('/admin/users/u9/impersonate')) {
          return new Response(JSON.stringify({ token: 'imp-token-xyz' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        throw new Error(`unexpected ${href}`);
      }),
    );

    const response = (await action(
      args(actionRequest({ intent: 'impersonate', userId: 'u9', password: 'pw' })),
    )) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/dashboard');
    expect(response.headers.get('set-cookie') ?? '').toContain('vc_session=imp-token-xyz');
  });
});
