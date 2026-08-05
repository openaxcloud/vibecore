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

function loaderRequest(orgId = 'org-1', language = 'en'): Request {
  return new Request(`https://app.test/invitations?orgId=${encodeURIComponent(orgId)}`, {
    headers: { 'accept-language': language },
  });
}

function actionRequest(body: Record<string, string>, language = 'en'): Request {
  return new Request('https://app.test/invitations', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'accept-language': language },
    body: new URLSearchParams(body),
  });
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
    expect(data.loadErrorCode).toBeNull();
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
    expect(data.loadErrorCode).toBe('permission');
    expect(data.invitations).toEqual([]);

    // Custom roles are dropped, but the static role list remains intact.
    expect(data.roles.map((r: { key: string }) => r.key)).toEqual(['viewer', 'member', 'editor', 'admin', 'owner']);
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

  it('degrades a 5xx roles failure to a stable unavailable state without exposing upstream copy', async () => {
    const upstreamError = 'Prisma connection failed at private-db.internal';
    const serverError = apiErrorResponse(500, upstreamError);
    apiRequest.mockRejectedValueOnce(serverError);

    const { loader } = await import('./invitations');
    const data = await readJson(await loader({ request: loaderRequest() } as any));

    expect(data.loadErrorCode).toBe('unavailable');
    expect(data.canManageInvitations).toBe(false);
    expect(JSON.stringify(data)).not.toContain(upstreamError);
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

  it('resolves the request locale for SSR and keeps custom role names unchanged', async () => {
    apiRequest
      .mockResolvedValueOnce({ roles: [{ key: 'release-captain', name: 'Release Captain', permissions: [] }] })
      .mockResolvedValueOnce({ invitations: [] });

    const { loader } = await import('./invitations');
    const data = await readJson(await loader({ request: loaderRequest('org-1', 'fr-FR,fr;q=0.9') } as any));

    expect(data.language).toBe('fr');
    expect(data.roles).toContainEqual({ key: 'release-captain', name: 'Release Captain', system: false });
  });

  it('turns malformed upstream payloads into a safe retry state', async () => {
    apiRequest.mockResolvedValueOnce({ roles: 'not-an-array' });

    const { loader } = await import('./invitations');
    const data = await readJson(await loader({ request: loaderRequest() } as any));

    expect(data.loadErrorCode).toBe('unavailable');
    expect(data.invitations).toEqual([]);
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});

describe('invitations action stable contracts', () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  it('creates an invitation with a stable success code and trimmed values', async () => {
    apiRequest.mockResolvedValueOnce({ invitation: { id: 'invite-1' } });

    const { action } = await import('./invitations');

    const data = await readJson(
      await action({
        request: actionRequest({
          intent: 'create',
          orgId: 'org-1',
          email: '  teammate@example.com  ',
          roleKey: 'member',
        }),
      } as any),
    );

    expect(data).toEqual({ statusCode: 'created' });
    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Request),
      '/orgs/org-1/invitations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'teammate@example.com', roleKey: 'member' }),
      }),
    );
  });

  it('encodes organization and invitation identifiers for resend', async () => {
    apiRequest.mockResolvedValueOnce({ invitation: { id: 'invite/2' } });

    const { action } = await import('./invitations');

    const data = await readJson(
      await action({
        request: actionRequest({ intent: 'resend', orgId: 'org/1', inviteId: 'invite/2' }),
      } as any),
    );

    expect(data).toEqual({ statusCode: 'resent' });
    expect(apiRequest).toHaveBeenCalledWith(expect.any(Request), '/orgs/org%2F1/invitations/invite%2F2/resend', {
      method: 'POST',
    });
  });

  it('maps upstream failures to safe stable codes without exposing their body', async () => {
    const upstreamError = 'PostgreSQL postgres://secret@private-db.internal';
    apiRequest.mockRejectedValueOnce(apiErrorResponse(429, upstreamError, 'INVITE_RESEND_THROTTLED'));

    const { action } = await import('./invitations');

    const data = await readJson(
      await action({
        request: actionRequest({ intent: 'resend', orgId: 'org-1', inviteId: 'invite-1' }),
      } as any),
    );

    expect(data).toEqual({ errorCode: 'rateLimited' });
    expect(JSON.stringify(data)).not.toContain(upstreamError);
    expect(JSON.stringify(data)).not.toContain('postgres://');
  });

  it('maps forbidden, not-found and network failures without returning upstream errors', async () => {
    const { action } = await import('./invitations');

    apiRequest.mockRejectedValueOnce(apiErrorResponse(403, 'private permission trace'));

    const forbidden = await readJson(
      await action({
        request: actionRequest({ intent: 'expire', orgId: 'org-1', inviteId: 'invite-1' }),
      } as any),
    );

    apiRequest.mockRejectedValueOnce(apiErrorResponse(404, 'private lookup trace'));

    const missing = await readJson(
      await action({
        request: actionRequest({ intent: 'expire', orgId: 'org-1', inviteId: 'invite-1' }),
      } as any),
    );

    apiRequest.mockRejectedValueOnce(new Error('socket exposed internal host'));

    const unavailable = await readJson(
      await action({
        request: actionRequest({ intent: 'expire', orgId: 'org-1', inviteId: 'invite-1' }),
      } as any),
    );

    expect(forbidden).toEqual({ errorCode: 'permission' });
    expect(missing).toEqual({ errorCode: 'notFound' });
    expect(unavailable).toEqual({ errorCode: 'unavailable' });
  });

  it('validates required fields and rejects unknown intents before calling the API', async () => {
    const { action } = await import('./invitations');

    const missingOrganization = await readJson(
      await action({ request: actionRequest({ intent: 'create', email: 'a@example.com' }) } as any),
    );
    const missingEmail = await readJson(
      await action({ request: actionRequest({ intent: 'create', orgId: 'org-1' }) } as any),
    );
    const missingInvitation = await readJson(
      await action({ request: actionRequest({ intent: 'expire', orgId: 'org-1' }) } as any),
    );
    const invalidIntent = await readJson(
      await action({ request: actionRequest({ intent: 'delete-all', orgId: 'org-1' }) } as any),
    );
    const malformedForm = await readJson(
      await action({
        request: new Request('https://app.test/invitations', {
          method: 'POST',
          headers: { 'content-type': 'multipart/form-data; boundary=missing-boundary' },
          body: 'malformed form body',
        }),
      } as any),
    );

    expect(missingOrganization).toEqual({ errorCode: 'organizationUnavailable' });
    expect(missingEmail).toEqual({ errorCode: 'emailRequired' });
    expect(missingInvitation).toEqual({ errorCode: 'invitationRequired' });
    expect(invalidIntent).toEqual({ errorCode: 'invalidAction' });
    expect(malformedForm).toEqual({ errorCode: 'invalidAction' });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('re-throws authentication redirects instead of turning them into inline failures', async () => {
    const redirectResponse = new Response(null, { status: 302, headers: { Location: '/login' } });
    apiRequest.mockRejectedValueOnce(redirectResponse);

    const { action } = await import('./invitations');

    await expect(
      action({
        request: actionRequest({ intent: 'resend', orgId: 'org-1', inviteId: 'invite-1' }),
      } as any),
    ).rejects.toBe(redirectResponse);
  });
});
