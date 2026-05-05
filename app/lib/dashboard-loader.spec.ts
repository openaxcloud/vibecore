import { afterEach, describe, expect, it, vi } from 'vitest';
import { loader } from '~/routes/dashboard';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('dashboard loader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders project data when the current role cannot read billing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/orgs')) {
          return jsonResponse({ organizations: [{ id: 'org_1' }] });
        }

        if (url.endsWith('/orgs/org_1/projects')) {
          return jsonResponse({
            projects: [
              {
                id: 'project_1',
                name: 'Client Portal',
                updatedAt: '2026-05-04T08:00:00.000Z',
                sourceType: 'ai',
              },
            ],
          });
        }

        if (url.endsWith('/orgs/org_1/billing')) {
          return jsonResponse({ error: 'Missing permission: billing:read', code: 'RBAC_FORBIDDEN' }, 403);
        }

        throw new Error(`Unexpected dashboard request: ${url}`);
      }),
    );

    const data = await loader({
      request: new Request('https://vibecore.local/dashboard', {
        headers: { cookie: 'vc_session=session-token' },
      }),
      params: {},
      context: {} as never,
    });

    expect(data.billingAccessLimited).toBe(true);
    expect(data.usageSummary).toMatchObject({
      projects: 1,
      activeWorkspaces: 0,
      planName: 'Unavailable',
      usageEvents: 0,
    });
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0]).toMatchObject({ id: 'project_1', name: 'Client Portal', sourceType: 'ai' });
  });
});
