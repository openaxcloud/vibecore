import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * The IDE Object Storage browser (ProjectObjectStoragePanel) self-fetches this
 * route's `action` with intents list / upload-url / download-url / move /
 * delete-object / ensure-bucket / delete-bucket. Each intent proxies to the REAL
 * per-project backend under `/projects/:id/object-storage/*`. apiRequest is
 * mocked at the module boundary so the whole browser round-trip can be exercised
 * without a live enterprise backend, proving:
 *   - the projectId is threaded into every upstream URL (tenant isolation);
 *   - list → upload-url → delete-object return the backend shapes the panel needs;
 *   - a flag-off backend (404 FEATURE_NOT_ENABLED) degrades to { enabled: false }
 *     rather than surfacing a 502.
 */
const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
  };
});

function actionArgs(fields: Record<string, string>, projectId = 'proj-42') {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }

  return {
    request: new Request(`https://app.test/api/projects/${projectId}/ide-panel/object-storage`, {
      method: 'POST',
      body: form,
    }),
    params: { projectId, panel: 'object-storage' },
  } as any;
}

/* The action returns RR7's data() sentinel (aliased `json`), whose body is on `.data`. */
function readJson(result: any): any {
  return result && typeof result === 'object' && 'data' in result ? result.data : result;
}

/** Mirrors the Response apiRequest throws when the backend 404s with a JSON body. */
function apiNotFound(code: string): Response {
  return new Response(JSON.stringify({ code, error: 'nope' }), {
    status: 404,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ide-panel object-storage action (functional browser round-trip)', () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  it('list: proxies to the project bucket with a delimiter + prefix and returns objects/folders', async () => {
    apiRequest.mockResolvedValueOnce({
      objects: [{ key: 'assets/logo.png', size: 2048, updated: '2026-07-01T00:00:00.000Z' }],
      folders: ['assets/icons/'],
    });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    const body = readJson(await action(actionArgs({ intent: 'list', prefix: 'assets/' })));

    // The upstream URL is project-scoped (tenant isolation) and carries prefix + delimiter.
    const [, url] = apiRequest.mock.calls[0];
    expect(url).toContain('/projects/proj-42/object-storage/objects');
    expect(url).toContain('prefix=assets%2F');
    expect(url).toContain('delimiter=%2F');

    expect(body.enabled).toBe(true);
    expect(body.objects).toEqual([{ key: 'assets/logo.png', size: 2048, updated: '2026-07-01T00:00:00.000Z' }]);
    expect(body.folders).toEqual(['assets/icons/']);
  });

  it('upload-url: requests a signed PUT for the given key and hands the panel the URL + headers', async () => {
    apiRequest.mockResolvedValueOnce({
      url: 'https://storage.example/signed-put',
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      expiresAt: '2026-07-01T01:00:00.000Z',
    });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');

    const body = readJson(
      await action(actionArgs({ intent: 'upload-url', key: 'assets/logo.png', contentType: 'image/png' })),
    );

    const [, url, init] = apiRequest.mock.calls[0];
    expect(url).toBe('/projects/proj-42/object-storage/objects/upload-url');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ key: 'assets/logo.png', contentType: 'image/png' });

    expect(body.enabled).toBe(true);
    expect(body.url).toBe('https://storage.example/signed-put');
    expect(body.method).toBe('PUT');
    expect(body.headers).toEqual({ 'Content-Type': 'image/png' });
  });

  it('upload-url: rejects a missing key with a 400 before touching the backend', async () => {
    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');

    const thrown = await action(actionArgs({ intent: 'upload-url', key: '   ' })).then(
      () => null,
      (error: unknown) => error,
    );

    // `throw json(..., { status })` throws RR7's data() sentinel carrying the init.
    expect((thrown as any)?.init?.status).toBe(400);
    expect((thrown as any)?.data).toEqual({ error: 'key is required for upload-url' });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('delete-object: proxies a DELETE with the object key and reports the deleted count', async () => {
    apiRequest.mockResolvedValueOnce({ deleted: true, count: 1 });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    const body = readJson(await action(actionArgs({ intent: 'delete-object', key: 'assets/logo.png' })));

    const [, url, init] = apiRequest.mock.calls[0];
    expect(url).toBe('/projects/proj-42/object-storage/objects');
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body)).toEqual({ key: 'assets/logo.png' });

    expect(body).toMatchObject({ enabled: true, ok: true, deleted: true, count: 1 });
  });

  it('delete-object: a folder delete sends a prefix (bulk delete) not a key', async () => {
    apiRequest.mockResolvedValueOnce({ deleted: true, count: 3 });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    await action(actionArgs({ intent: 'delete-object', prefix: 'assets/icons/' }));

    const [, , init] = apiRequest.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ prefix: 'assets/icons/' });
  });

  it('list: a flag-off backend (404 FEATURE_NOT_ENABLED) degrades to { enabled: false } not a 502', async () => {
    apiRequest.mockRejectedValueOnce(apiNotFound('FEATURE_NOT_ENABLED'));

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    const body = readJson(await action(actionArgs({ intent: 'list' })));

    expect(body).toEqual({ enabled: false, objects: [], folders: [] });
  });

  it('list: an unclassified 404 surfaces as a panel failure instead of a disabled feature', async () => {
    const upstream = new Response(JSON.stringify({ error: 'bucket missing' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
    apiRequest.mockRejectedValueOnce(upstream);

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');

    const thrown = await action(actionArgs({ intent: 'list' })).then(
      () => null,
      (error: unknown) => error,
    );

    expect((thrown as any)?.init?.status).toBe(404);
    expect((thrown as any)?.data).toMatchObject({ code: 'PANEL_REQUEST_FAILED' });
    expect((thrown as any)?.data?.error).toMatch(/not found/i);
    expect((thrown as any)?.data).not.toMatchObject({ enabled: false });
  });

  it('status: reports the durable read-only share mode from the project-scoped status endpoint', async () => {
    apiRequest.mockResolvedValueOnce({ enabled: true, provisioned: true, mode: 'SHARED_READ_ONLY' });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    const body = readJson(await action(actionArgs({ intent: 'status' })));

    expect(apiRequest.mock.calls[0][1]).toBe('/projects/proj-42/object-storage/status');
    expect(body).toEqual({ enabled: true, provisioned: true, mode: 'SHARED_READ_ONLY' });
  });

  it('revoke-share: proxies a target-scoped DELETE so the read-only grant is explicitly revocable', async () => {
    apiRequest.mockResolvedValueOnce({ revoked: true, revokedAt: '2026-08-26T00:00:00.000Z' });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    const body = readJson(await action(actionArgs({ intent: 'revoke-share' })));

    const [, url, init] = apiRequest.mock.calls[0];
    expect(url).toBe('/projects/proj-42/object-storage/share');
    expect(init.method).toBe('DELETE');
    expect(body).toMatchObject({ enabled: true, ok: true, revoked: true });
  });

  it('status: FEATURE_NOT_ENABLED degrades to { enabled: false, provisioned: false }', async () => {
    apiRequest.mockRejectedValueOnce(apiNotFound('FEATURE_NOT_ENABLED'));

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    const body = readJson(await action(actionArgs({ intent: 'status' })));

    expect(body).toEqual({ enabled: false, provisioned: false });
  });

  it('status: an unrelated 404 remains an honest panel failure', async () => {
    apiRequest.mockRejectedValueOnce(apiNotFound('BUCKET_NOT_FOUND'));

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');

    const thrown = await action(actionArgs({ intent: 'status' })).then(
      () => null,
      (error: unknown) => error,
    );

    expect((thrown as any)?.init?.status).toBe(404);
    expect((thrown as any)?.data).toMatchObject({ code: 'PANEL_REQUEST_FAILED' });
    expect((thrown as any)?.data?.error).toMatch(/not found/i);
    expect((thrown as any)?.data).not.toMatchObject({ enabled: false });
  });
});
