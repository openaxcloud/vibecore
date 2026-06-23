import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * apiRequest is mocked at the module boundary so the loader can be exercised without a live
 * enterprise backend. The loader makes two ordered apiRequest calls: GET /orgs/:id/roles then
 * GET /orgs/:id/invitations. Passing ?orgId in the URL skips firstOrganizationOrNull, so only
 * apiRequest needs a double. The thrown error shapes mirror the real Responses apiRequest
 * produces (see enterprise-api.server.ts: a 403/4xx/5xx is a real `Response`, a re-auth is a
 * 3xx/401 redirect Response).
 */
const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
  };
});

function loaderRequest(orgId = 'org-1'): Request {
  return new Request(`https://app.test/invitations?orgId=${orgId}`);
}

/** Mirrors the real Response apiRequest throws on a non-2xx upstream status. */
function apiErrorResponse(status: number, error: string, code?: string): Response {
  return new Response(JSON.stringify({ ok: false, error, code }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function readJson(result: any): Promise<any> {
  /*
   * The loader returns RR7's data() sentinel (aliased `json` in enterprise-api.server),
   * which exposes the payload on `.data`. A thrown Response surfaces with `.json()`.
   */
  if (result instanceof Response) {
    return result.json();
  }

  return result && typeof result === 'object' && 'data' in result ? result.data : result;
}

describe('invitations loader graceful degradation', () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  it('returns full management state with custom roles when both calls succeed', async () => {
    apiRequest
      .mockResolvedValueOnce({ roles: [{ key: 'auditor', name: 'Auditor', permissions: ['org:read'] }] })
      .mockResolvedValueOnce({ invitations: [{ id: 'i1', email: 'a@b.test', roleKey: 'member', expiresAt: 'x' }] });

    const { loader } = await import('./invitations');

    const data = await readJson(await loader({ request: loaderRequest() } as any));

    expect(data.canManageInvitations).toBe(true);
    expect(data.invitations).toHaveLength(1);
    expect(data.roles.map((r: { key: string }) => r.key)).toContain('auditor');
  });

  it('degrades to read-only owner-only state when the roles call is forbidden (does not crash)', async () => {
    /*
     * The roles call 403s first. The bug: this previously threw before the invitations fallback,
     * collapsing the page into the error boundary. Now it must degrade gracefully.
     */
    apiRequest
      .mockRejectedValueOnce(apiErrorResponse(403, 'Insufficient role permissions.'))
      .mockRejectedValueOnce(apiErrorResponse(403, 'You cannot manage invitations.'));

    const { loader } = await import('./invitations');

    const data = await readJson(await loader({ request: loaderRequest() } as any));

    expect(data.canManageInvitations).toBe(false);
    expect(data.invitations).toEqual([]);

    // Custom roles are dropped, but the static role list remains intact.
    expect(data.roles.map((r: { key: string }) => r.key)).toEqual(['viewer', 'member', 'admin', 'owner']);
  });

  it('still degrades when only the roles call is forbidden but invitations succeed', async () => {
    apiRequest
      .mockRejectedValueOnce(apiErrorResponse(403, 'Insufficient role permissions.'))
      .mockResolvedValueOnce({ invitations: [] });

    const { loader } = await import('./invitations');

    const data = await readJson(await loader({ request: loaderRequest() } as any));

    // roles 403 sets canManageInvitations=false; the invitations call did not override it back.
    expect(data.canManageInvitations).toBe(false);
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it('re-throws a 5xx server error from the roles call to the error boundary', async () => {
    const serverError = apiErrorResponse(500, 'Upstream failure.');
    apiRequest.mockRejectedValueOnce(serverError);

    const { loader } = await import('./invitations');

    await expect(loader({ request: loaderRequest() } as any)).rejects.toBe(serverError);
  });

  it('re-throws a re-auth redirect (3xx) from the roles call so the browser follows it', async () => {
    const redirectResponse = new Response(null, { status: 302, headers: { Location: '/login' } });
    apiRequest.mockRejectedValueOnce(redirectResponse);

    const { loader } = await import('./invitations');

    await expect(loader({ request: loaderRequest() } as any)).rejects.toBe(redirectResponse);
  });

  it('re-throws a 401 re-auth response from the roles call', async () => {
    const unauthorized = apiErrorResponse(401, 'Session expired.');
    apiRequest.mockRejectedValueOnce(unauthorized);

    const { loader } = await import('./invitations');

    await expect(loader({ request: loaderRequest() } as any)).rejects.toBe(unauthorized);
  });
});
