import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * firstOrganization and apiRequest are mocked at the module boundary so the
 * loader runs without a live enterprise backend. firstOrganization() resolves
 * the org (its own internal /orgs apiRequest call is not the mocked binding, so
 * it is mocked directly), then the loader calls apiRequest for the tickets. The
 * thrown error shapes mirror the real Responses these produce (see
 * enterprise-api.server.ts): a 4xx/5xx is a real `Response`, a session-expiry
 * re-auth is a 3xx redirect Response (loginRedirectFromRequest) or an MFA 302.
 */
const apiRequest = vi.fn();
const firstOrganization = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
    firstOrganization: (...args: unknown[]) => firstOrganization(...args),
  };
});

function loaderRequest(): Request {
  return new Request('https://app.test/support');
}

/** Mirrors the real Response apiRequest throws on a non-2xx upstream status. */
function apiErrorResponse(status: number, error: string, code?: string): Response {
  return new Response(JSON.stringify({ ok: false, error, code }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('support loader re-auth handling', () => {
  afterEach(() => {
    apiRequest.mockReset();
    firstOrganization.mockReset();
  });

  it('re-throws a 302 login redirect instead of degrading into a banner', async () => {
    // firstOrganization() -> GET /orgs throws the framework login redirect.
    const loginRedirect = new Response(null, { status: 302, headers: { location: '/login' } });
    firstOrganization.mockRejectedValueOnce(loginRedirect);

    const { loader } = await import('./support');

    await expect(loader({ request: loaderRequest() } as any)).rejects.toBe(loginRedirect);
  });

  it('re-throws a 303 MFA_REQUIRED redirect instead of degrading into a banner', async () => {
    const mfaRedirect = new Response(null, { status: 303, headers: { location: '/auth/mfa' } });
    firstOrganization.mockRejectedValueOnce(mfaRedirect);

    const { loader } = await import('./support');

    await expect(loader({ request: loaderRequest() } as any)).rejects.toBe(mfaRedirect);
  });

  it('still degrades a non-redirect API error into the support banner', async () => {
    // org resolves, but the tickets fetch returns a 503 the user can recover from inline.
    firstOrganization.mockResolvedValueOnce({ id: 'org-1', name: 'Acme' });
    apiRequest.mockRejectedValueOnce(apiErrorResponse(503, 'Support tickets are temporarily unavailable.'));

    const { loader } = await import('./support');

    const data = (await loader({ request: loaderRequest() } as any)) as {
      organization: unknown;
      tickets: unknown[];
      supportAccessLimited: string | null;
    };

    expect(data.tickets).toEqual([]);
    expect(typeof data.supportAccessLimited).toBe('string');
    expect(data.supportAccessLimited).toBeTruthy();
  });

  it('returns an empty tickets array when the 200 payload omits the tickets array', async () => {
    /*
     * Regression: apiRequest does NO shape validation, so a payload skew (`{}`)
     * left `tickets.tickets` undefined and the component's `tickets.filter(Boolean)`
     * crashed the whole Support page to the root error boundary.
     */
    firstOrganization.mockResolvedValueOnce({ id: 'org-1', name: 'Acme' });
    apiRequest.mockResolvedValueOnce({}).mockResolvedValueOnce({ plan: { key: 'pro' } });

    const { loader } = await import('./support');

    const data = (await loader({ request: loaderRequest() } as any)) as {
      tickets: unknown[];
      supportAccessLimited: string | null;
    };

    expect(data.tickets).toEqual([]);
    expect(data.supportAccessLimited).toBeNull();
  });

  it('returns an empty tickets array when tickets is null', async () => {
    firstOrganization.mockResolvedValueOnce({ id: 'org-1', name: 'Acme' });
    apiRequest.mockResolvedValueOnce({ tickets: null }).mockResolvedValueOnce({ plan: { key: 'pro' } });

    const { loader } = await import('./support');

    const data = (await loader({ request: loaderRequest() } as any)) as { tickets: unknown[] };

    expect(data.tickets).toEqual([]);
  });

  it('returns tickets normally when both calls succeed', async () => {
    firstOrganization.mockResolvedValueOnce({ id: 'org-1', name: 'Acme' });
    apiRequest
      .mockResolvedValueOnce({ tickets: [{ id: 't1', subject: 'Runtime down', status: 'open' }] })
      .mockResolvedValueOnce({ plan: { key: 'pro' } });

    const { loader } = await import('./support');

    const data = (await loader({ request: loaderRequest() } as any)) as {
      tickets: Array<{ id: string }>;
      supportAccessLimited: string | null;
    };

    expect(data.supportAccessLimited).toBeNull();
    expect(data.tickets).toHaveLength(1);
  });
});
