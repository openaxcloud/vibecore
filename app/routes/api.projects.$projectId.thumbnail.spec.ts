import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * The Dashboard/Projects cards point <img src> at this route. It proxies the
 * REAL per-project backend `GET /projects/:id/thumbnail`, which returns a
 * short-lived signed object-storage URL, and 302s the <img> straight to it.
 * apiRequest is mocked at the module boundary (keeping the real framework
 * `redirect`) so the proxy behaviour is exercised without a live backend:
 *   - a signed url → 302 to that url (project-scoped upstream path);
 *   - no url / a backend 404 (feature off, no capture yet) → 404 so the card
 *     falls back to its "No preview yet" placeholder rather than a broken image.
 */
const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
  };
});

function loaderArgs(projectId = 'proj-42') {
  return {
    request: new Request(`https://app.test/api/projects/${projectId}/thumbnail`),
    params: { projectId },
  } as any;
}

describe('project thumbnail route (card image proxy)', () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  it('302-redirects to the signed object-storage URL when a thumbnail exists', async () => {
    apiRequest.mockResolvedValueOnce({ url: 'https://storage.example/signed-read', expiresAt: 'x' });

    const { loader } = await import('./api.projects.$projectId.thumbnail');
    const response = await loader(loaderArgs());

    // Upstream is project-scoped (tenant isolation).
    expect(apiRequest.mock.calls[0][1]).toBe('/projects/proj-42/thumbnail');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://storage.example/signed-read');
  });

  it('404s (card keeps its placeholder) when the backend returns no url', async () => {
    apiRequest.mockResolvedValueOnce({});

    const { loader } = await import('./api.projects.$projectId.thumbnail');
    const response = await loader(loaderArgs());

    expect(response.status).toBe(404);
  });

  it('404s when the backend throws (feature off / no bucket / no capture yet)', async () => {
    apiRequest.mockRejectedValueOnce(new Response(null, { status: 404 }));

    const { loader } = await import('./api.projects.$projectId.thumbnail');
    const response = await loader(loaderArgs());

    expect(response.status).toBe(404);
  });

  it('404s when the project id is missing', async () => {
    const { loader } = await import('./api.projects.$projectId.thumbnail');
    const response = await loader({ request: new Request('https://app.test/x'), params: {} } as any);

    expect(response.status).toBe(404);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
