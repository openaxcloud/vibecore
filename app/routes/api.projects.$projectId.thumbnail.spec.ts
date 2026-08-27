import { afterEach, describe, expect, it, vi } from 'vitest';
import { toResponse } from '~/lib/test/rr7-data';

/*
 * The Dashboard/Projects cards point <img src> at this route. It proxies the
 * REAL per-project backend `GET /projects/:id/thumbnail`, which returns a
 * short-lived signed object-storage URL, and 302s the <img> straight to it.
 * apiRequest is mocked at the module boundary (keeping the real framework
 * `redirect`) so the proxy behaviour is exercised without a live backend:
 *   - a signed url → 302 to that url (project-scoped upstream path);
 *   - no url / a backend 404 (feature off, no capture yet) → 204 (No Content) so the
 *     card falls back to its "No preview yet" placeholder via <img> onError WITHOUT
 *     logging a console "Failed to load resource" error on every render (BUG-USR-002).
 *   - an auth / upstream failure keeps its real status instead of being masked.
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

  it('returns a non-cacheable 204 (card keeps its placeholder) when the backend returns no url', async () => {
    apiRequest.mockResolvedValueOnce({});

    const { loader } = await import('./api.projects.$projectId.thumbnail');
    const response = await loader(loaderArgs());

    expect(response.status).toBe(204);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.text()).toBe('');
  });

  it('returns 204 when the backend reports that no capture exists yet', async () => {
    apiRequest.mockRejectedValueOnce(new Response(null, { status: 404 }));

    const { loader } = await import('./api.projects.$projectId.thumbnail');
    const response = await loader(loaderArgs());

    expect(response.status).toBe(204);
  });

  it('preserves authorization and upstream failures instead of masking them as a missing capture', async () => {
    const { loader } = await import('./api.projects.$projectId.thumbnail');

    for (const status of [401, 403, 500]) {
      apiRequest.mockRejectedValueOnce(new Response(null, { status }));

      const response = await loader(loaderArgs());

      expect(response.status).toBe(status);
    }

    apiRequest.mockRejectedValueOnce(new Error('upstream unavailable'));
    expect((await loader(loaderArgs())).status).toBe(502);
  });

  it('404s when the project id is missing', async () => {
    const { loader } = await import('./api.projects.$projectId.thumbnail');
    const response = await loader({ request: new Request('https://app.test/x'), params: {} } as any);

    expect(response.status).toBe(404);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

function actionArgs(projectId = 'proj-42') {
  return {
    request: new Request(`https://app.test/api/projects/${projectId}/thumbnail`, { method: 'POST' }),
    params: { projectId },
  } as any;
}

/* The action returns RR7's data() sentinel (aliased `json`): body on `.data`, status on `.init`. */
function readData(result: any): any {
  return result && typeof result === 'object' && 'data' in result ? result.data : result;
}

describe('project thumbnail upload proxy (action)', () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  it('mints a signed PUT from the project-scoped upload-url endpoint', async () => {
    apiRequest.mockResolvedValueOnce({
      url: 'https://storage.example/signed-put',
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
    });

    const { action } = await import('./api.projects.$projectId.thumbnail');
    const body = readData(await action(actionArgs()));

    const [, url, init] = apiRequest.mock.calls[0];
    expect(url).toBe('/projects/proj-42/thumbnail/upload-url');
    expect(init.method).toBe('POST');
    expect(body).toEqual({
      ok: true,
      url: 'https://storage.example/signed-put',
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
    });
  });

  it('degrades to { enabled: false } (not an error) when object storage is off', async () => {
    apiRequest.mockRejectedValueOnce(new Response(null, { status: 404 }));

    const { action } = await import('./api.projects.$projectId.thumbnail');
    const result = await action(actionArgs());

    expect(result.init.status).toBe(404);
    expect(readData(result)).toEqual({ ok: false, enabled: false });
  });

  it('404s without touching the backend when the project id is missing', async () => {
    const { action } = await import('./api.projects.$projectId.thumbnail');
    const result = await action({ request: new Request('https://app.test/x', { method: 'POST' }), params: {} } as any);
    const response = toResponse(result) as Response;

    expect(response.status).toBe(404);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
