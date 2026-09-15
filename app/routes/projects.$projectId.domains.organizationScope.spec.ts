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
async function payload<T>(result: unknown): Promise<T> {
  if (result instanceof Response) {
    return (await result.json()) as T;
  }

  const wrapper = result as { type?: string; data?: T };

  return wrapper?.type === 'DataWithResponseInit' && wrapper.data !== undefined ? wrapper.data : (result as T);
}

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

  it("lists the PROJECT's organization domains, not the caller's oldest organization", async () => {
    firstOrganization.mockResolvedValue({ id: OLDEST_MEMBERSHIP_ORG });
    firstOrganizationOrNull.mockResolvedValue({ id: OLDEST_MEMBERSHIP_ORG });
    apiRequest
      .mockResolvedValueOnce({ project: { id: 'p1', name: 'Project one', organizationId: PROJECT_ORG } })
      .mockResolvedValueOnce({ domains: [] });

    const { loader } = await import('./projects.$projectId.domains');
    await loader({ request: request(), params: { projectId: 'p1' } } as any);

    expect(orgUrlsCalled()).toEqual([`/orgs/${PROJECT_ORG}/domains`]);
    expect(orgUrlsCalled().join(' ')).not.toContain(OLDEST_MEMBERSHIP_ORG);
  });

  /**
   * The write path is the one that did damage: a domain created against the
   * wrong organization is persisted, audited under that organization, and
   * counts against its `@@unique([organizationId, domain])`.
   */
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

    const data = await payload<{ error?: string; domains: unknown[] }>(
      await loader({ request: request(), params: { projectId: 'p1' } } as any),
    );

    expect(orgUrlsCalled()).toEqual([]);
    expect(data.domains).toEqual([]);
    expect(data.error).toMatch(/not attached to an organization/i);
  });

  it('refuses to write when the project has no organization', async () => {
    apiRequest.mockResolvedValueOnce({ project: { id: 'p1', name: 'Project one' } });

    const { action } = await import('./projects.$projectId.domains');

    const data = await payload<{ error?: string }>(
      await action({ request: formRequest({ domain: 'app.example.com' }), params: { projectId: 'p1' } } as any),
    );

    expect(orgUrlsCalled()).toEqual([]);
    expect(data.error).toMatch(/not attached to an organization/i);
  });
});
