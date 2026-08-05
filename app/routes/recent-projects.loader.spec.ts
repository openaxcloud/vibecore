import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * firstOrganizationOrNull and apiRequest are mocked at the module boundary so
 * the loader runs without a live enterprise backend. apiRequest does NO shape
 * validation (see enterprise-api.server.ts) — for any 2xx it returns the parsed
 * JSON body cast to the generic type. These tests pin the loader's resilience to
 * a degraded/wrapper-drifted payload that lacks a `projects` array, which used
 * to throw `TypeError: Cannot read properties of undefined (reading 'sort')` and
 * take the whole page to the root error boundary.
 */
const apiRequest = vi.fn();
const firstOrganizationOrNull = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
    firstOrganizationOrNull: (...args: unknown[]) => firstOrganizationOrNull(...args),
  };
});

function loaderRequest(acceptLanguage = 'en-GB'): Request {
  return new Request('https://app.test/recent-projects', { headers: { 'Accept-Language': acceptLanguage } });
}

describe('recent-projects loader', () => {
  afterEach(() => {
    apiRequest.mockReset();
    firstOrganizationOrNull.mockReset();
  });

  it('renders an empty grid when the API omits the projects array', async () => {
    firstOrganizationOrNull.mockResolvedValueOnce({ id: 'org-1', name: 'Acme' });
    apiRequest.mockResolvedValueOnce({});

    const { loader } = await import('./recent-projects');

    const data = (await loader({ request: loaderRequest() } as any)) as { projects: unknown[] };

    expect(data.projects).toEqual([]);
  });

  it('renders an empty grid when projects is null', async () => {
    firstOrganizationOrNull.mockResolvedValueOnce({ id: 'org-1', name: 'Acme' });
    apiRequest.mockResolvedValueOnce({ projects: null });

    const { loader } = await import('./recent-projects');

    const data = (await loader({ request: loaderRequest() } as any)) as { projects: unknown[] };

    expect(data.projects).toEqual([]);
  });

  it('sorts projects newest-first and maps them when the payload is well-formed', async () => {
    firstOrganizationOrNull.mockResolvedValueOnce({ id: 'org-1', name: 'Acme' });
    apiRequest.mockResolvedValueOnce({
      projects: [
        { id: 'old', name: 'Old', updatedAt: '2024-01-01T00:00:00.000Z' },
        { id: 'new', name: 'New', updatedAt: '2024-06-01T00:00:00.000Z' },
      ],
    });

    const { loader } = await import('./recent-projects');

    const data = (await loader({ request: loaderRequest() } as any)) as {
      projects: Array<{ id: string; status: string; lifecycle: string; updatedAtIso?: string }>;
    };

    expect(data.projects.map((project) => project.id)).toEqual(['new', 'old']);
    expect(data.projects[0]).toMatchObject({
      status: 'Draft',
      lifecycle: 'draft',
      updatedAtIso: '2024-06-01T00:00:00.000Z',
    });
  });

  it('marks a project with deployments as deployed', async () => {
    firstOrganizationOrNull.mockResolvedValueOnce({ id: 'org-1', name: 'Acme' });
    apiRequest.mockResolvedValueOnce({
      projects: [{ id: 'live', name: 'Live project', deploymentCount: 1 }],
    });

    const { loader } = await import('./recent-projects');

    const data = (await loader({ request: loaderRequest() } as any)) as {
      projects: Array<{ status: string; lifecycle: string; deploymentCount?: number }>;
    };

    expect(data.projects[0]).toMatchObject({ status: 'Deployed', lifecycle: 'deployed', deploymentCount: 1 });
  });

  it('returns French SSR metadata and date formatting for a French request', async () => {
    firstOrganizationOrNull.mockResolvedValueOnce({ id: 'org-1', name: 'Acme' });
    apiRequest.mockResolvedValueOnce({
      projects: [{ id: 'recent', name: 'Projet récent', updatedAt: '2024-06-01T00:00:00.000Z' }],
    });

    const { loader, meta } = await import('./recent-projects');

    const data = (await loader({ request: loaderRequest('fr-FR, en;q=0.8') } as any)) as {
      language: string;
      projects: Array<{ updated: string }>;
    };

    expect(data.language).toBe('fr');
    expect(data.projects[0]?.updated).toContain('juin');
    expect(meta({ data } as never)).toContainEqual({ title: 'Projets récents - E-Code' });
  });
});
