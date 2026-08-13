import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * The IDE posts here when a preview becomes ready; the route proxies to the API's
 * server-side capture trigger. apiRequest is mocked at the module boundary so the
 * proxy behaviour is exercised without a live backend.
 */
const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

function actionArgs(url: string | null, projectId = 'proj-42') {
  const form = new URLSearchParams();

  if (url !== null) {
    form.set('url', url);
  }

  return {
    request: new Request(`https://app.test/api/projects/${projectId}/thumbnail/refresh`, {
      method: 'POST',
      body: form,
    }),
    params: { projectId },
  } as any;
}

function readData(result: any): any {
  return result && typeof result === 'object' && 'data' in result ? result.data : result;
}

describe('thumbnail refresh (preview-ready) proxy action', () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  it('forwards the preview url to the project-scoped capture trigger', async () => {
    apiRequest.mockResolvedValueOnce({ scheduled: true, enabled: true });

    const { action } = await import('./api.projects.$projectId.thumbnail.refresh');
    const body = readData(await action(actionArgs('https://ws-1.preview.e-code.ai/')));

    const [, url, init] = apiRequest.mock.calls[0];
    expect(url).toBe('/projects/proj-42/thumbnail/refresh');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ url: 'https://ws-1.preview.e-code.ai/' });
    expect(body).toEqual({ ok: true, scheduled: true, enabled: true });
  });

  it('400s a missing url without calling the backend', async () => {
    const { action } = await import('./api.projects.$projectId.thumbnail.refresh');
    const result = await action(actionArgs(null));

    expect(result.init.status).toBe(400);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('degrades to { enabled: false } when the screenshotter/storage is off (404)', async () => {
    apiRequest.mockRejectedValueOnce(new Response(null, { status: 404 }));

    const { action } = await import('./api.projects.$projectId.thumbnail.refresh');
    const result = await action(actionArgs('https://ws-1.preview.e-code.ai/'));

    expect(result.init.status).toBe(404);
    expect(readData(result)).toEqual({ ok: false, enabled: false });
  });
});
