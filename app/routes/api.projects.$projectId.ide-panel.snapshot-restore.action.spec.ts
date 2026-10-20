import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnterpriseActionArgs } from '~/lib/enterprise-api.server';

const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

function args(fields: Record<string, unknown>, language = 'en'): EnterpriseActionArgs {
  return {
    request: new Request('https://app.test/api/projects/project-restore/ide-panel/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Language': language },
      body: JSON.stringify({ intent: 'restore', snapshotId: 'snapshot/one', ...fields }),
    }),
    params: { projectId: 'project-restore', panel: 'snapshots' },
    context: {},
  };
}

async function invoke(fields: Record<string, unknown>, language = 'en') {
  const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
  const result = await action(args(fields, language)).catch((error: unknown) => error);

  return result as { data: Record<string, unknown>; init: { status?: number } };
}

function writes() {
  return apiRequest.mock.calls.filter(([, , init]) => init?.method && init.method !== 'GET');
}

describe('snapshot restore orchestration refuses unavailable combined operations before mutations', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (_request: Request, path: string) => {
      if (path.endsWith('/database/restores')) {
        throw new Response(JSON.stringify({ code: 'RESTORE_APPLICATION_CUTOVER_UNAVAILABLE' }), { status: 503 });
      }

      return { project: { id: 'project-restore' }, ok: true };
    });
  });
  afterEach(() => apiRequest.mockReset());

  it.each(['true', 'TRUE', '1', 'on', 'yes', true])(
    'rejects combined restoreDatabase=%s before files, DB or agent memory writes',
    async (restoreDatabase) => {
      const result = await invoke({ restoreDatabase, restoreAgentMemory: 'true', since: '2026-10-19T10:00:00Z' });
      expect(writes()).toEqual([]);
      expect(apiRequest.mock.calls.map(([, path]) => path)).toEqual(['/projects/project-restore']);
      expect(result.init.status).toBe(503);
      expect(result.data).toMatchObject({
        ok: false,
        outcome: 'not_started',
        code: 'CHECKPOINT_DATABASE_RESTORE_UNAVAILABLE',
        filesRestore: 'not_started',
        databaseRestore: 'unavailable',
        agentMemoryRestore: 'not_started',
      });
    },
  );

  it('preserves authorization before reporting capability and never writes on forbidden reads', async () => {
    apiRequest.mockRejectedValue(new Response('{}', { status: 403 }));

    const result = await invoke({ restoreDatabase: 'true' });
    expect(result.init.status).toBe(403);
    expect(writes()).toEqual([]);
  });

  it.each(['false', false, undefined])(
    'preserves explicitly file-only or legacy file-only restoration (%s)',
    async (restoreDatabase) => {
      const result = await invoke({ restoreDatabase });
      expect(writes().map(([, path]) => path)).toEqual(['/projects/project-restore/snapshots/snapshot%2Fone/restore']);
      expect(result.data).toMatchObject({
        ok: true,
        outcome: 'completed',
        filesRestore: 'restored',
        databaseRestore: 'skipped',
        agentMemoryRestore: 'skipped',
      });
    },
  );

  it('reports successful requested agent-memory restoration separately from skipped database restoration', async () => {
    const result = await invoke({
      restoreDatabase: 'false',
      restoreAgentMemory: 'true',
      since: '2026-10-19T10:00:00Z',
    });
    expect(writes().map(([, path]) => path)).toEqual([
      '/projects/project-restore/snapshots/snapshot%2Fone/restore',
      '/projects/project-restore/agent-memory/rollback',
    ]);
    expect(result.data).toMatchObject({
      ok: true,
      outcome: 'completed',
      filesRestore: 'restored',
      databaseRestore: 'skipped',
      agentMemoryRestore: 'restored',
    });
  });

  it('reports a partial outcome instead of success when files changed but agent-memory restoration failed', async () => {
    apiRequest.mockImplementation(async (_request: Request, path: string) => {
      if (path.endsWith('/agent-memory/rollback')) {
        throw new Error('private upstream detail');
      }

      return { ok: true };
    });

    const result = await invoke(
      { restoreDatabase: 'false', restoreAgentMemory: 'true', since: '2026-10-19T10:00:00Z' },
      'fr',
    );
    expect(result.init.status).toBe(502);
    expect(result.data).toMatchObject({
      ok: false,
      outcome: 'partial',
      code: 'CHECKPOINT_RESTORE_PARTIAL',
      filesRestore: 'restored',
      databaseRestore: 'skipped',
      agentMemoryRestore: 'failed',
    });
    expect(result.data.error).toMatch(/fichiers.*restaurés/u);
    expect(JSON.stringify(result.data)).not.toContain('private upstream detail');
  });

  it.each(['', 'not-a-date'])('validates requested agent-memory date %s before restoring files', async (since) => {
    const result = await invoke({ restoreDatabase: 'false', restoreAgentMemory: 'true', since });
    expect(result.init.status).toBe(400);
    expect(writes()).toEqual([]);
  });

  it('stops after a file restore rejection and never starts agent-memory rollback', async () => {
    apiRequest.mockRejectedValue(new Response('{}', { status: 409 }));

    const result = await invoke({
      restoreDatabase: 'false',
      restoreAgentMemory: 'true',
      since: '2026-10-19T10:00:00Z',
    });
    expect(result.init.status).toBe(409);
    expect(writes().map(([, path]) => path)).toEqual(['/projects/project-restore/snapshots/snapshot%2Fone/restore']);
    expect(result.data.ok).not.toBe(true);
  });
});
