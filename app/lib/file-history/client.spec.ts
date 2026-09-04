import { describe, expect, it, vi } from 'vitest';
import { createFileHistoryClient, FileHistoryApiError, normalizeFileHistoryPath } from './client';

const version = {
  id: 'version-2',
  workspaceId: 'workspace-1',
  path: 'src/App.tsx',
  sequence: '2',
  operation: 'write',
  source: 'editor',
  actor: { id: 'user-1', name: 'Avi' },
  encoding: 'utf8',
  sizeBytes: 24,
  contentHash: 'hash-2',
  tombstone: false,
  createdAt: '2026-07-15T10:00:00.000Z',
};

const continuity = { complete: true, reasons: [], droppedEvents: 0 };

describe('File History browser client', () => {
  it('normalizes workbench paths and requests workspace-scoped metadata', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({ versions: [version], latestVersionId: version.id, total: 1, continuity }),
    );

    const client = createFileHistoryClient({ fetch: fetchMock });

    await expect(
      client.listVersions({
        projectId: 'project / one',
        workspaceId: 'workspace-1',
        filePath: '/home/project/src/App.tsx',
        limit: 40,
      }),
    ).resolves.toMatchObject({ latestVersionId: 'version-2', total: 1 });

    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url), 'https://e-code.test');

    expect(parsed.pathname).toBe('/api/projects/project%20%2F%20one/file-history');
    expect(parsed.searchParams.get('workspaceId')).toBe('workspace-1');
    expect(parsed.searchParams.get('path')).toBe('src/App.tsx');
    expect(parsed.searchParams.get('limit')).toBe('40');
    expect(init).toMatchObject({ method: 'GET', credentials: 'include' });
  });

  it('posts an idempotent append-only restore request to the selected revision', async () => {
    const restored = {
      ...version,
      id: 'version-3',
      sequence: '3',
      operation: 'restore',
      restoredFromVersionId: version.id,
      createdAt: '2026-07-15T10:01:00.000Z',
    };

    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ version: restored, restored: true }, 201));
    const client = createFileHistoryClient({ fetch: fetchMock });

    const result = await client.restoreVersion(
      { projectId: 'project-1', workspaceId: 'workspace-1', filePath: '/home/project/src/App.tsx' },
      'version-2',
      {
        workspaceId: 'workspace-1',
        expectedLatestVersionId: 'version-2',
        operationId: 'restore-operation-1',
      },
    );

    expect(result).toMatchObject({ restored: true, version: { id: 'version-3', operation: 'restore' } });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/projects/project-1/file-history/version-2/restore');
    expect(JSON.parse(String(init?.body))).toEqual({
      workspaceId: 'workspace-1',
      expectedLatestVersionId: 'version-2',
      operationId: 'restore-operation-1',
    });
  });

  it('surfaces stable conflict metadata instead of collapsing it into a generic network error', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse(
        {
          error: 'The file changed.',
          code: 'FILE_HISTORY_CONFLICT',
          latestVersionId: 'version-9',
        },
        409,
      ),
    );

    const client = createFileHistoryClient({ fetch: fetchMock });

    const error = await client
      .restoreVersion({ projectId: 'project-1', workspaceId: 'workspace-1', filePath: 'src/App.tsx' }, 'version-1', {
        workspaceId: 'workspace-1',
        expectedLatestVersionId: 'version-2',
        operationId: 'restore-operation-1',
      })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(FileHistoryApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'FILE_HISTORY_CONFLICT',
      latestVersionId: 'version-9',
    });
  });

  it('rejects malformed success payloads before they can corrupt the timeline', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ versions: 'not-an-array', total: 1 }));
    const client = createFileHistoryClient({ fetch: fetchMock });

    await expect(
      client.listVersions({ projectId: 'project-1', workspaceId: 'workspace-1', filePath: 'src/App.tsx' }),
    ).rejects.toMatchObject({ code: 'FILE_HISTORY_INVALID_RESPONSE' });
  });

  it('rejects missing sequence and continuity metadata instead of guessing timeline order', async () => {
    const { sequence: _sequence, ...withoutSequence } = version;

    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({ versions: [withoutSequence], latestVersionId: version.id, total: 1, continuity }),
    );

    const client = createFileHistoryClient({ fetch: fetchMock });

    await expect(
      client.listVersions({ projectId: 'project-1', workspaceId: 'workspace-1', filePath: 'src/App.tsx' }),
    ).rejects.toMatchObject({ code: 'FILE_HISTORY_INVALID_RESPONSE' });
  });
});

describe('normalizeFileHistoryPath', () => {
  it('keeps only the project-relative path and rejects traversal', () => {
    expect(normalizeFileHistoryPath('\\home\\project\\src\\main.ts')).toBe('src/main.ts');
    expect(normalizeFileHistoryPath('/home/project/src/main.ts')).toBe('src/main.ts');
    expect(() => normalizeFileHistoryPath('/home/project/../secret')).toThrow(/valid project file/i);
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
