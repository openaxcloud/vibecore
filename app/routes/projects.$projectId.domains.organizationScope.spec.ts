import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * R-1 bis — the domains page must scope itself to the PROJECT's organization.
 *
 * It used to resolve the organization with `firstOrganization` /
 * `firstOrganizationOrNull`, which return the caller's OLDEST membership
 * (`prisma-store.listOrganizations` orders by membership `createdAt asc`). For
 * anyone in more than one organization, opening a project of org B listed org
 * A's domains — and "Add domain" then created the domain in org A, with a 201
 * and a redirect that looked exactly like success.
 *
 * Not a leak: every `/orgs/:orgId/domains` route is behind
 * `requireOrg(... 'enterprise:read' | 'enterprise:write')`, so the user was
 * always a member of the org they were shown. It is a wrong-CONTEXT defect —
 * the page named one thing and acted on another.
 *
 * These tests exist because the correct behaviour is invisible in a
 * single-organization account, which is every developer account by default.
 */
const apiRequest = vi.fn();
const firstOrganization = vi.fn();
const firstOrganizationOrNull = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
    firstOrganization: (...args: unknown[]) => firstOrganization(...args),
    firstOrganizationOrNull: (...args: unknown[]) => firstOrganizationOrNull(...args),
  };
});

/** The project belongs to org B; the caller's oldest membership is org A. */
const PROJECT_ORG = 'org-B-owns-the-project';
const OLDEST_MEMBERSHIP_ORG = 'org-A-joined-first';

function request(): Request {
  return new Request('https://app.test/projects/p1/domains', { headers: { 'Accept-Language': 'en-GB' } });
}

function formRequest(body: Record<string, string>): Request {
  const form = new URLSearchParams(body);

  return new Request('https://app.test/projects/p1/domains', {
    method: 'POST',
    headers: { 'Accept-Language': 'en-GB', 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
}

/**
 * `json()` from react-router returns a `DataWithResponseInit` wrapper (`.data`)
 * under single fetch, and a `Response` otherwise. Unwrap whichever came back so
 * the assertions read the same either way — probed, not assumed: asserting on
 * the wrapper is how a body-shape test silently checks nothing.
 */
/** Every `/orgs/:id/...` URL the route asked the API for. */
function orgUrlsCalled(): string[] {
  return apiRequest.mock.calls.map((call) => String(call[1])).filter((url) => url.startsWith('/orgs/'));
}

describe('project domains — organization scope', () => {
  afterEach(() => {
    apiRequest.mockReset();
    firstOrganization.mockReset();
    firstOrganizationOrNull.mockReset();
  });

  it('authorizes the project before redirecting to its deployment domains', async () => {
    firstOrganization.mockResolvedValue({ id: OLDEST_MEMBERSHIP_ORG });
    firstOrganizationOrNull.mockResolvedValue({ id: OLDEST_MEMBERSHIP_ORG });
    apiRequest
      .mockResolvedValueOnce({ project: { id: 'p1', name: 'Project one', organizationId: PROJECT_ORG } })
      .mockResolvedValueOnce({ domains: [] });

    const { loader } = await import('./projects.$projectId.domains');
    const result = await loader({ request: request(), params: { projectId: 'p1' } } as any);

    expect(apiRequest.mock.calls[0][1]).toBe('/projects/p1');
    expect(result.headers.get('Location')).toBe('/projects/p1/ide?panel=domains');
    expect(orgUrlsCalled()).toEqual([]);
    expect(orgUrlsCalled().join(' ')).not.toContain(OLDEST_MEMBERSHIP_ORG);
  });

  /**
   * The write path is the one that did damage: a domain created against the
   * wrong organization is persisted, audited under that organization, and
   * counts against its `@@unique([organizationId, domain])`.
   */
  it.each([401, 403, 404])('does not redirect before a project access failure (%s)', async (status) => {
    const denied = new Response(null, { status });
    apiRequest.mockRejectedValueOnce(denied);

    const { loader } = await import('./projects.$projectId.domains');
    await expect(loader({ request: request(), params: { projectId: 'p1' } } as any)).rejects.toBe(denied);
    expect(orgUrlsCalled()).toEqual([]);
  });

  it('preserves the session reauthentication redirect', async () => {
    const login = new Response(null, { status: 302, headers: { Location: '/login?returnTo=domains' } });
    apiRequest.mockRejectedValueOnce(login);

    const { loader } = await import('./projects.$projectId.domains');
    await expect(loader({ request: request(), params: { projectId: 'p1' } } as any)).rejects.toBe(login);
  });

  it("creates the domain in the PROJECT's organization", async () => {
    firstOrganization.mockResolvedValue({ id: OLDEST_MEMBERSHIP_ORG });
    apiRequest
      .mockResolvedValueOnce({ project: { id: 'p1', name: 'Project one', organizationId: PROJECT_ORG } })
      .mockResolvedValueOnce({});

    const { action } = await import('./projects.$projectId.domains');
    await action({ request: formRequest({ domain: 'app.example.com' }), params: { projectId: 'p1' } } as any);

    expect(orgUrlsCalled()).toEqual([`/orgs/${PROJECT_ORG}/domains`]);
  });

  it("verifies the domain against the PROJECT's organization", async () => {
    firstOrganization.mockResolvedValue({ id: OLDEST_MEMBERSHIP_ORG });
    apiRequest
      .mockResolvedValueOnce({ project: { id: 'p1', name: 'Project one', organizationId: PROJECT_ORG } })
      .mockResolvedValueOnce({});

    const { action } = await import('./projects.$projectId.domains');
    await action({
      request: formRequest({ intent: 'verify', domain: 'app.example.com' }),
      params: { projectId: 'p1' },
    } as any);

    expect(orgUrlsCalled()).toEqual([`/orgs/${PROJECT_ORG}/domains/app.example.com/verify`]);
  });

  /**
   * Counter-proof (méthode, règle 6): the helpers that caused the defect must
   * not merely be un-preferred — they must be OFF this route entirely. If a
   * later change reintroduces one as a fallback, the wrong-org behaviour comes
   * back for exactly the accounts these tests exist to protect.
   */
  it('never consults the caller-oldest-organization helpers at all', async () => {
    firstOrganization.mockResolvedValue({ id: OLDEST_MEMBERSHIP_ORG });
    firstOrganizationOrNull.mockResolvedValue({ id: OLDEST_MEMBERSHIP_ORG });
    apiRequest
      .mockResolvedValueOnce({ project: { id: 'p1', name: 'Project one', organizationId: PROJECT_ORG } })
      .mockResolvedValueOnce({ domains: [] });

    const { loader } = await import('./projects.$projectId.domains');
    await loader({ request: request(), params: { projectId: 'p1' } } as any);

    expect(firstOrganization).not.toHaveBeenCalled();
    expect(firstOrganizationOrNull).not.toHaveBeenCalled();
  });

  /**
   * A project with no organization must say so and stop, rather than silently
   * falling back to some other organization — which is precisely what the old
   * `firstOrganization` path did.
   */
  it('reports the missing organization instead of falling back to another one', async () => {
    apiRequest.mockResolvedValueOnce({ project: { id: 'p1', name: 'Project one' } });

    const { loader } = await import('./projects.$projectId.domains');

    await expect(loader({ request: request(), params: { projectId: 'p1' } } as any)).rejects.toMatchObject({
      data: { error: expect.stringMatching(/not attached to an organization/i) },
    });
    expect(orgUrlsCalled()).toEqual([]);
  });

  it.each(['text/html', 'application/json'])(
    'preserves the failed legacy POST diagnostic for %s without replay',
    async (accept) => {
      apiRequest.mockResolvedValueOnce({ project: { id: 'p1', organizationId: PROJECT_ORG } });
      apiRequest.mockRejectedValueOnce(new Response(null, { status: 422 }));

      const { action } = await import('./projects.$projectId.domains');
      const submitted = formRequest({ intent: 'verify', domain: 'pending.example.com' });
      submitted.headers.set('accept', accept);
      await expect(action({ request: submitted, params: { projectId: 'p1' } } as any)).rejects.toMatchObject({
        data: { code: 'DOMAIN_ACTION_FAILED', error: expect.stringMatching(/verification/i) },
        init: { status: 400 },
      });
      expect(apiRequest).toHaveBeenCalledTimes(2);
      expect(orgUrlsCalled()).toEqual([`/orgs/${PROJECT_ORG}/domains/pending.example.com/verify`]);
    },
  );

  it('preserves the legacy action login redirect without sending a domain mutation', async () => {
    const login = new Response(null, { status: 302, headers: { Location: '/login' } });
    apiRequest.mockRejectedValueOnce(login);

    const { action } = await import('./projects.$projectId.domains');
    await expect(
      action({ request: formRequest({ domain: 'app.example.com' }), params: { projectId: 'p1' } } as any),
    ).rejects.toBe(login);
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(orgUrlsCalled()).toEqual([]);
  });

  it('refuses to write when the project has no organization', async () => {
    apiRequest.mockResolvedValueOnce({ project: { id: 'p1', name: 'Project one' } });

    const { action } = await import('./projects.$projectId.domains');

    await expect(
      action({ request: formRequest({ domain: 'app.example.com' }), params: { projectId: 'p1' } } as any),
    ).rejects.toMatchObject({
      data: { error: expect.stringMatching(/not attached to an organization/i), code: 'DOMAIN_ACTION_FAILED' },
      init: { status: 400 },
    });
    expect(orgUrlsCalled()).toEqual([]);
  });
});
