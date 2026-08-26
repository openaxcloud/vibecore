import { describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  return { ...actual, apiRequest };
});

const { loader } = await import('./api.projects.$projectId.database');

function request() {
  return new Request('https://example.test/api/projects/project-1/database', {
    headers: { 'accept-language': 'en' },
  });
}

describe('project database resource loader', () => {
  it('returns an actionable fetcher payload instead of unmounting the IDE on a backend failure', async () => {
    apiRequest.mockRejectedValueOnce(
      new Response(JSON.stringify({ code: 'DATABASE_PROVISION_UNAVAILABLE' }), { status: 503 }),
    );

    const response = (await loader({ request: request(), params: { projectId: 'project-1' } } as never)) as Response;

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, status: 503, code: 'DATABASE_PANEL_FAILED' });
  });

  it('keeps the feature-disabled response dormant and explicit', async () => {
    apiRequest.mockRejectedValueOnce(new Response(null, { status: 404 }));

    const response = await loader({ request: request(), params: { projectId: 'project-1' } } as never);

    expect(response).toMatchObject({ data: { ok: false, enabled: false }, init: { status: 404 } });
  });
});
