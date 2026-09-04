import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

function readData(result: any): any {
  return result && typeof result === 'object' && 'data' in result ? result.data : result;
}

afterEach(() => apiRequest.mockReset());

describe('File History same-origin proxies', () => {
  it('forwards the collection query without dropping the workspace scope or cursor', async () => {
    apiRequest.mockResolvedValueOnce({ versions: [], total: 0 });

    const { loader } = await import('./api.projects.$projectId.file-history');

    const request = new Request(
      'https://app.test/api/projects/project%201/file-history?workspaceId=ws-1&path=src%2FApp.tsx&cursor=opaque',
    );

    const result = await loader({ request, params: { projectId: 'project 1' } } as any);

    expect(apiRequest.mock.calls[0][1]).toBe(
      '/projects/project%201/file-history?workspaceId=ws-1&path=src%2FApp.tsx&cursor=opaque',
    );
    expect(readData(result)).toEqual({ versions: [], total: 0 });
  });

  it('does not expose direct capture and forwards restore only to its version-scoped endpoint', async () => {
    const collection = await import('./api.projects.$projectId.file-history');
    expect('action' in collection).toBe(false);
    expect(apiRequest).not.toHaveBeenCalled();

    apiRequest.mockResolvedValueOnce({ version: { id: 'restore-1' }, restored: true });

    const restore = await import('./api.projects.$projectId.file-history.$versionId.restore');
    const restoreBody = JSON.stringify({ workspaceId: 'ws-1', expectedLatestVersionId: 'latest', operationId: 'op' });

    const restored = await restore.action({
      request: new Request('https://app.test/api/projects/p/file-history/v/restore', {
        method: 'POST',
        body: restoreBody,
      }),
      params: { projectId: 'p', versionId: 'version/old' },
    } as any);

    expect(apiRequest.mock.calls[0][1]).toBe('/projects/p/file-history/version%2Fold/restore');
    expect(apiRequest.mock.calls[0][2]).toMatchObject({ method: 'POST', body: restoreBody });
    expect(readData(restored)).toMatchObject({ restored: true });
  });

  it('forwards a version detail query and rejects a missing project id locally', async () => {
    apiRequest.mockResolvedValueOnce({ version: { id: 'v' }, content: 'body' });

    const detail = await import('./api.projects.$projectId.file-history.$versionId');
    await detail.loader({
      request: new Request('https://app.test/api/projects/p/file-history/v?workspaceId=ws-2'),
      params: { projectId: 'p', versionId: 'v' },
    } as any);
    expect(apiRequest.mock.calls[0][1]).toBe('/projects/p/file-history/v?workspaceId=ws-2');

    const collection = await import('./api.projects.$projectId.file-history');

    const missing = await collection.loader({
      request: new Request('https://app.test/api/projects/missing/file-history'),
      params: {},
    } as any);
    expect(missing.init.status).toBe(404);
  });

  it('does not flatten a restore conflict Response', async () => {
    const conflict = new Response(
      JSON.stringify({ error: 'changed', code: 'FILE_HISTORY_CONFLICT', latestVersionId: 'latest-2' }),
      { status: 409, headers: { 'content-type': 'application/json' } },
    );
    apiRequest.mockRejectedValueOnce(conflict);

    const restore = await import('./api.projects.$projectId.file-history.$versionId.restore');

    await expect(
      restore.action({
        request: new Request('https://app.test/api/projects/p/file-history/v/restore', {
          method: 'POST',
          body: '{}',
        }),
        params: { projectId: 'p', versionId: 'v' },
      } as any),
    ).rejects.toBe(conflict);
  });
});
