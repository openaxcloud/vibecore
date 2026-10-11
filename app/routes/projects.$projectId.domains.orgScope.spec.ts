import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * AUDX-169 — domains must be scoped to the PROJECT's organization.
 *
 * The loader listed, and the action added and verified, against
 * `firstOrganizationOrNull(user)` — the user's FIRST organization, not the one
 * owning the project.
 *
 * ⚠️ Why no test caught it, and why this one is shaped the way it is: the defect
 * is LATENT BEHIND A DATASET THAT HOLDS 0 OR 1. With no multi-organization user,
 * "first" is always "the right one", so observing real data proves nothing. The
 * test has to CREATE the second organization — that is the whole point.
 *
 * The first multi-organization customer is by construction an Enterprise
 * account, i.e. the worst possible moment to discover a domain was written and
 * verified on the wrong organization.
 */
const PROJECT_ORG = 'org_project_owner';
const USER_FIRST_ORG = 'org_user_first';

const apiRequest = vi.fn();
const firstOrganization = vi.fn(async () => ({ id: USER_FIRST_ORG, name: 'First Org' }));
const firstOrganizationOrNull = vi.fn(async () => ({ id: USER_FIRST_ORG, name: 'First Org' }));

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return { ...actual, apiRequest, firstOrganization, firstOrganizationOrNull };
});

const { loader, action } = await import('./projects.$projectId.domains');

/** Requested org ids, in order, across every apiRequest that touched /orgs/. */
function orgIdsTouched(): string[] {
  return apiRequest.mock.calls
    .map((call) => String(call[1] ?? ''))
    .filter((path) => path.startsWith('/orgs/'))
    .map((path) => path.split('/')[2]);
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_request: unknown, path: string) => {
    if (path.startsWith('/projects/')) {
      return { project: { id: 'p1', name: 'P', organizationId: PROJECT_ORG } };
    }

    return { domains: [] };
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

function args(body?: Record<string, string>) {
  const request = body
    ? new Request('https://app.e-code.ai/projects/p1/domains', { method: 'POST', body: new URLSearchParams(body) })
    : new Request('https://app.e-code.ai/projects/p1/domains');

  return { request, params: { projectId: 'p1' }, context: {} } as never;
}

describe('AUDX-169 domains are scoped to the project organization', () => {
  it('lists domains for the PROJECT organization, not the user first one', async () => {
    await loader(args());

    expect(orgIdsTouched()).toContain(PROJECT_ORG);
    expect(orgIdsTouched()).not.toContain(USER_FIRST_ORG);
  });

  it('adds a domain to the PROJECT organization', async () => {
    await action(args({ intent: 'create', domain: 'example.com' }));

    expect(orgIdsTouched()).toContain(PROJECT_ORG);
    expect(orgIdsTouched()).not.toContain(USER_FIRST_ORG);
  });

  it('verifies a domain against the PROJECT organization', async () => {
    await action(args({ intent: 'verify', domain: 'example.com' }));

    expect(orgIdsTouched()).toContain(PROJECT_ORG);
    expect(orgIdsTouched()).not.toContain(USER_FIRST_ORG);
  });

  /*
   * Rule 19: the single-organization case — every user today — must keep
   * working exactly as before. A fix that only serves the future customer while
   * breaking the present one gets reverted.
   */
  it('still works when the project organization IS the user first one', async () => {
    apiRequest.mockImplementation(async (_request: unknown, path: string) => {
      if (path.startsWith('/projects/')) {
        return { project: { id: 'p1', name: 'P', organizationId: USER_FIRST_ORG } };
      }

      return { domains: [] };
    });

    await loader(args());

    expect(orgIdsTouched()).toContain(USER_FIRST_ORG);
  });
});
