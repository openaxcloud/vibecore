/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { action, loader } from './admin.wallets';
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

const loaderArgs = (request: Request) =>
  ({ request, params: {}, context: {} }) as unknown as Parameters<typeof loader>[0];

/**
 * Stub fetch so requirePlatformAdmin (/auth/me) + /auth/reauth pass, and capture
 * the adjust POST body. Returns the recorded calls for assertions.
 */
function jsonResponse(body: unknown): Response {
  // content-type matters: apiRequest only JSON-parses application/json bodies.
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function stubAdminFetch(
  adjustResponse: unknown = { wallet: { organizationId: 'org-1', balanceCents: 1500 } },
  walletsResponse: unknown = { wallets: [] },
  reauthResponse: unknown = { reauthenticated: true },
) {
  const calls: Array<{ method: string; href: string; body?: string }> = [];
  const responseFor = (body: unknown) => (body instanceof Response ? body : jsonResponse(body));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = typeof url === 'string' ? url : url.toString();
      calls.push({ method: init?.method ?? 'GET', href, body: init?.body as string | undefined });

      if (href.endsWith('/auth/me')) {
        return jsonResponse({ user: { id: 'admin', platformAdmin: true } });
      }

      if (href.endsWith('/auth/reauth')) {
        return responseFor(reauthResponse);
      }

      if (href.includes('/admin/wallets/') && href.endsWith('/adjust')) {
        return responseFor(adjustResponse);
      }

      if (href.endsWith('/admin/wallets')) {
        return responseFor(walletsResponse);
      }

      return jsonResponse({});
    }),
  );

  return calls;
}

function apiError(status: number, code: string, error: string): Response {
  return new Response(JSON.stringify({ code, error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
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
    expect((await response.json()) as { errorCode: string; field: string }).toEqual({
      errorCode: 'organizationRequired',
      field: 'organizationId',
    });
  });

  it('rejects a non-positive amount', async () => {
    stubAdminFetch();

    const response = toResponse(
      await action(
        args(actionRequest({ organizationId: 'org-1', direction: 'credit', amount: '0', reason: 'x', password: 'p' })),
      ),
    );
    expect(response.status).toBe(400);
    expect((await response.json()) as { errorCode: string; field: string }).toEqual({
      errorCode: 'amountInvalid',
      field: 'amount',
    });
  });

  it('rejects invalid directions, excess precision and malformed organization IDs', async () => {
    stubAdminFetch();

    const invalidDirection = toResponse(
      await action(
        args(
          actionRequest({
            organizationId: 'org-1',
            direction: 'refund',
            amount: '10',
            reason: 'x',
            password: 'p',
          }),
        ),
      ),
    );
    expect(invalidDirection.status).toBe(400);
    expect((await invalidDirection.json()) as { errorCode: string }).toEqual({ errorCode: 'directionInvalid' });

    const excessPrecision = toResponse(
      await action(
        args(
          actionRequest({
            organizationId: 'org-1',
            direction: 'credit',
            amount: '10.001',
            reason: 'x',
            password: 'p',
          }),
        ),
      ),
    );
    expect(excessPrecision.status).toBe(400);
    expect((await excessPrecision.json()) as { errorCode: string; field: string }).toEqual({
      errorCode: 'amountPrecision',
      field: 'amount',
    });

    const invalidOrganization = toResponse(
      await action(
        args(
          actionRequest({
            organizationId: 'org 1',
            direction: 'credit',
            amount: '10',
            reason: 'x',
            password: 'p',
          }),
        ),
      ),
    );
    expect(invalidOrganization.status).toBe(400);
    expect((await invalidOrganization.json()) as { errorCode: string; field: string }).toEqual({
      errorCode: 'organizationInvalid',
      field: 'organizationId',
    });
  });

  it('requires a reason and a password', async () => {
    stubAdminFetch();

    const noReason = toResponse(
      await action(args(actionRequest({ organizationId: 'org-1', direction: 'credit', amount: '10', password: 'p' }))),
    );
    expect(noReason.status).toBe(400);
    expect((await noReason.json()) as { errorCode: string; field: string }).toEqual({
      errorCode: 'reasonRequired',
      field: 'reason',
    });

    const noPassword = toResponse(
      await action(args(actionRequest({ organizationId: 'org-1', direction: 'credit', amount: '10', reason: 'x' }))),
    );
    expect(noPassword.status).toBe(400);
    expect((await noPassword.json()) as { errorCode: string; field: string }).toEqual({
      errorCode: 'passwordRequired',
      field: 'password',
    });
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
    expect((await response.json()) as Record<string, unknown>).toEqual({
      statusCode: 'credited',
      organizationId: 'org-1',
      amountCents: 1234,
      balanceCents: 1500,
      currency: 'USD',
    });
  });

  it('accepts a French decimal comma, trims the audited reason and URL-encodes the organization ID', async () => {
    const calls = stubAdminFetch();

    const response = toResponse(
      await action(
        args(
          actionRequest({
            organizationId: 'org/customer',
            direction: 'credit',
            amount: '12,34',
            reason: '  correction auditée  ',
            password: 'pw',
          }),
        ),
      ),
    );

    expect(response.status).toBe(200);

    const adjustCall = calls.find((call) => call.href.endsWith('/adjust'));
    expect(adjustCall?.href).toContain('/admin/wallets/org%2Fcustomer/adjust');
    expect(JSON.parse(adjustCall?.body ?? '{}')).toEqual({ deltaCents: 1234, reason: 'correction auditée' });
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

  it('maps re-authentication failures to stable codes without leaking backend prose', async () => {
    stubAdminFetch(
      undefined,
      undefined,
      apiError(401, 'AUTH_INVALID_CREDENTIALS', 'Raw English upstream password failure'),
    );

    const response = toResponse(
      await action(
        args(
          actionRequest({
            organizationId: 'org-1',
            direction: 'credit',
            amount: '10',
            reason: 'correction',
            password: 'wrong',
          }),
        ),
      ),
    );

    expect(response.status).toBe(401);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      errorCode: 'incorrectPassword',
      field: 'password',
    });
  });

  it('redirects an expired session to login instead of rendering a stale inline error', async () => {
    stubAdminFetch(undefined, undefined, apiError(401, 'SESSION_REQUIRED', 'Raw expired session'));

    let thrown: unknown;

    try {
      await action(
        args(
          actionRequest({
            organizationId: 'org-1',
            direction: 'credit',
            amount: '10',
            reason: 'correction',
            password: 'pw',
          }),
        ),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(302);
    expect((thrown as Response).headers.get('location')).toBe('/login?returnTo=%2Fadmin%2Fwallets');
  });

  it('masks an unavailable adjustment service behind a localized stable code', async () => {
    stubAdminFetch(apiError(503, 'UPSTREAM_FAILURE', 'Raw English database outage'));

    const response = toResponse(
      await action(
        args(
          actionRequest({
            organizationId: 'org-1',
            direction: 'credit',
            amount: '10',
            reason: 'correction',
            password: 'pw',
          }),
        ),
      ),
    );

    expect(response.status).toBe(502);
    expect((await response.json()) as Record<string, unknown>).toEqual({ errorCode: 'serviceUnavailable' });
  });

  it('resolves the loader locale server-side and filters malformed wallet rows', async () => {
    stubAdminFetch(undefined, {
      wallets: [
        {
          id: 'wallet-1',
          organizationId: 'org-1',
          balanceCents: 1234,
          currency: 'USD',
          updatedAt: '2026-08-05T03:04:00.000Z',
        },
        { id: 'malformed', organizationId: 'org-2', balanceCents: 'not-cents' },
      ],
    });

    const request = new Request('http://localhost/admin/wallets', {
      headers: { cookie: 'vc_session=admin-token', 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' },
    });

    const response = toResponse(await loader(loaderArgs(request)));

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      language: 'fr',
      walletsUnavailable: false,
      wallets: [
        {
          id: 'wallet-1',
          organizationId: 'org-1',
          balanceCents: 1234,
          currency: 'USD',
          updatedAt: '2026-08-05T03:04:00.000Z',
        },
      ],
    });
  });

  it('returns a recoverable unavailable state for malformed loader payloads', async () => {
    stubAdminFetch(undefined, { unexpected: 'Raw English upstream payload' });

    const request = new Request('http://localhost/admin/wallets?lang=fr', {
      headers: { cookie: 'vc_session=admin-token' },
    });

    const response = toResponse(await loader(loaderArgs(request)));

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      language: 'fr',
      walletsUnavailable: true,
      wallets: [],
    });
  });
});
