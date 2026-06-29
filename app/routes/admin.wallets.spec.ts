/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { action } from './admin.wallets';
import { toResponse } from '~/lib/test/rr7-data';

const ENV_KEYS = ['SAAS_API_URL', 'API_BASE_URL'] as const;

function actionRequest(body: Record<string, string>, cookie = 'vc_session=admin-token'): Request {
  return new Request('http://localhost/admin/wallets', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams(body).toString(),
  });
}

const args = (request: Request) => ({ request, params: {}, context: {} }) as unknown as Parameters<typeof action>[0];

/**
 * Stub fetch so requirePlatformAdmin (/auth/me) + /auth/reauth pass, and capture
 * the adjust POST body. Returns the recorded calls for assertions.
 */
function jsonResponse(body: unknown): Response {
  // content-type matters: apiRequest only JSON-parses application/json bodies.
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function stubAdminFetch(adjustResponse: unknown = { wallet: { organizationId: 'org-1', balanceCents: 1500 } }) {
  const calls: Array<{ method: string; href: string; body?: string }> = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = typeof url === 'string' ? url : url.toString();
      calls.push({ method: init?.method ?? 'GET', href, body: init?.body as string | undefined });

      if (href.endsWith('/auth/me')) {
        return jsonResponse({ user: { id: 'admin', platformAdmin: true } });
      }

      if (href.endsWith('/auth/reauth')) {
        return jsonResponse({ reauthenticated: true });
      }

      if (href.includes('/admin/wallets/') && href.endsWith('/adjust')) {
        return jsonResponse(adjustResponse);
      }

      return jsonResponse({});
    }),
  );

  return calls;
}

describe('admin.wallets action — credit adjustment', () => {
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

  it('rejects a missing organization', async () => {
    stubAdminFetch();

    const response = toResponse(
      await action(args(actionRequest({ direction: 'credit', amount: '10', reason: 'x', password: 'p' }))),
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/organization/i);
  });

  it('rejects a non-positive amount', async () => {
    stubAdminFetch();

    const response = toResponse(
      await action(
        args(actionRequest({ organizationId: 'org-1', direction: 'credit', amount: '0', reason: 'x', password: 'p' })),
      ),
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/amount/i);
  });

  it('requires a reason and a password', async () => {
    stubAdminFetch();

    const noReason = toResponse(
      await action(args(actionRequest({ organizationId: 'org-1', direction: 'credit', amount: '10', password: 'p' }))),
    );
    expect(noReason.status).toBe(400);
    expect(((await noReason.json()) as { error: string }).error).toMatch(/reason/i);

    const noPassword = toResponse(
      await action(args(actionRequest({ organizationId: 'org-1', direction: 'credit', amount: '10', reason: 'x' }))),
    );
    expect(noPassword.status).toBe(400);
    expect(((await noPassword.json()) as { error: string }).error).toMatch(/password/i);
  });

  it('credits: converts dollars→cents and POSTs a positive deltaCents after reauth', async () => {
    const calls = stubAdminFetch();

    const response = toResponse(
      await action(
        args(
          actionRequest({
            organizationId: 'org-1',
            direction: 'credit',
            amount: '12.34',
            reason: 'goodwill',
            password: 'pw',
          }),
        ),
      ),
    );

    expect(response.status).toBe(200);

    const reauthCall = calls.find((c) => c.href.endsWith('/auth/reauth'));
    expect(reauthCall?.method).toBe('POST');

    const adjustCall = calls.find((c) => c.href.endsWith('/adjust'));
    expect(adjustCall?.href).toContain('/admin/wallets/org-1/adjust');
    expect(adjustCall?.method).toBe('POST');
    expect(JSON.parse(adjustCall?.body ?? '{}')).toMatchObject({ deltaCents: 1234, reason: 'goodwill' });
  });

  it('debits: sends a negative deltaCents', async () => {
    const calls = stubAdminFetch();

    await action(
      args(
        actionRequest({
          organizationId: 'org-1',
          direction: 'debit',
          amount: '5',
          reason: 'correction',
          password: 'pw',
        }),
      ),
    );

    const adjustCall = calls.find((c) => c.href.endsWith('/adjust'));
    expect(JSON.parse(adjustCall?.body ?? '{}')).toMatchObject({ deltaCents: -500, reason: 'correction' });
  });
});
