import { beforeEach, expect, it, vi } from 'vitest';
import { toResponse } from '~/lib/test/rr7-data';

const apiRequest = vi.fn();
vi.mock('~/lib/enterprise-api.server', async () => ({
  ...(await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server')),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

let projectOrganization: string | undefined;
beforeEach(() => {
  projectOrganization = 'second-org';
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_request, path: string) => {
    if (path === '/projects/fixture' || path.endsWith('/settings')) {
      return { project: { id: 'fixture', organizationId: projectOrganization } };
    }

    if (path === '/orgs') {
      return { organizations: [{ id: 'first-org' }, { id: 'second-org' }] };
    }

    if (path.startsWith('/ai/usage')) {
      return { usage: [{ costCents: 100 }] };
    }

    return {};
  });
});

async function settings() {
  const { loader } = await import('./api.projects.$projectId.ide-panel.$panel');
  return toResponse(
    await loader({
      request: new Request('http://local.test/api/projects/fixture/ide-panel/settings'),
      params: { projectId: 'fixture', panel: 'settings' },
    } as any),
  );
}

it('scopes usage and billing to the project organization, not the first organization', async () => {
  expect((await settings()).status).toBe(200);

  const paths = apiRequest.mock.calls.map((call) => call[1]);
  expect(paths).toContain('/ai/usage?organizationId=second-org');
  expect(paths).toContain('/orgs/second-org/billing');
  expect(paths).not.toContain('/ai/usage');
  expect(paths).not.toContain('/orgs/first-org/billing');
});

it('does not fall back to another organization when the project scope is absent', async () => {
  projectOrganization = undefined;
  expect((await settings()).status).toBe(200);

  const paths = apiRequest.mock.calls.map((call) => call[1] as string);
  expect(paths.some((path) => path.startsWith('/ai/usage'))).toBe(false);
  expect(paths.some((path) => path.endsWith('/billing'))).toBe(false);
});
