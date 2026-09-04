import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
  };
});

function actionArgs(fields: Record<string, string>, projectId = 'proj-skills') {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }

  return {
    request: new Request(`https://app.test/api/projects/${projectId}/ide-panel/skills`, {
      method: 'POST',
      body: form,
    }),
    params: { projectId, panel: 'skills' },
  } as any;
}

function loaderArgs(projectId = 'proj-skills') {
  return {
    request: new Request(`https://app.test/api/projects/${projectId}/ide-panel/skills?workspaceId=ws-1`),
    params: { projectId, panel: 'skills' },
  } as any;
}

function readJson(result: any): any {
  return result && typeof result === 'object' && 'data' in result ? result.data : result;
}

describe('open-standard Agent Skills IDE proxy', () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  it('loads immutable artifacts, browse-only catalog, standard metadata, and the selected workspace', async () => {
    apiRequest.mockImplementation(async (_request: Request, path: string) => {
      if (path === '/projects/proj-skills') {
        return { project: { id: 'proj-skills' } };
      }

      if (path === '/projects/proj-skills/workspaces') {
        return { workspaces: [{ id: 'ws-1', createdAt: '2026-01-01T00:00:00.000Z' }] };
      }

      if (path === '/projects/proj-skills/skills?workspaceId=ws-1') {
        return {
          artifacts: [{ id: 'artifact-1', digest: 'a'.repeat(64) }],
          standard: { directory: '.agents/skills/<name>/SKILL.md' },
        };
      }

      if (path === '/projects/proj-skills/skills/catalog?workspaceId=ws-1') {
        return { entries: [{ id: 'catalog-1' }] };
      }

      throw new Error(`unexpected ${path}`);
    });

    const { loader } = await import('./api.projects.$projectId.ide-panel.$panel');
    const response = readJson(await loader(loaderArgs()));

    expect(response.status).toBe('ok');
    expect(response.data).toMatchObject({
      artifacts: [{ id: 'artifact-1' }],
      catalog: [{ id: 'catalog-1' }],
      workspaceId: 'ws-1',
      standard: { directory: '.agents/skills/<name>/SKILL.md' },
    });
    expect(apiRequest.mock.calls.map((call) => call[1])).not.toContain(
      '/projects/proj-skills/skills/installed?scope=project',
    );
  });

  it('imports a catalog folder into quarantine without calling the removed install endpoint', async () => {
    apiRequest.mockResolvedValueOnce({ artifact: { id: 'artifact-1', auditStatus: 'quarantined' }, created: true });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');

    const response = readJson(
      await action(actionArgs({ intent: 'import-catalog', catalogId: 'anthropics:skills/pdf', workspaceId: 'ws-1' })),
    );

    const [, path, init] = apiRequest.mock.calls[0];
    expect(path).toBe('/projects/proj-skills/skills/import');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ catalogId: 'anthropics:skills/pdf', workspaceId: 'ws-1' });
    expect(response).toMatchObject({ ok: true, created: true });
  });

  it('imports one exact custom folder and omits an empty mutable ref', async () => {
    apiRequest.mockResolvedValueOnce({ artifact: { id: 'artifact-custom' } });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    await action(
      actionArgs({
        intent: 'import-custom',
        ownerRepo: 'openai/example-skills',
        skillPath: 'skills/reviewer',
        ref: '',
        workspaceId: 'ws-1',
      }),
    );

    expect(JSON.parse(apiRequest.mock.calls[0][2].body)).toEqual({
      ownerRepo: 'openai/example-skills',
      skillPath: 'skills/reviewer',
      workspaceId: 'ws-1',
    });
  });

  it('returns raw SKILL.md and audit evidence through the scoped artifact detail endpoint', async () => {
    apiRequest.mockResolvedValueOnce({
      artifact: { id: 'artifact/a' },
      skillMarkdown: '---\nname: reviewer\n---',
      reviewFiles: [
        {
          path: 'SKILL.md',
          mode: '100644',
          byteLength: 26,
          sha256: 'a'.repeat(64),
          binary: false,
          content: '---\nname: reviewer\n---',
        },
      ],
      events: [],
    });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');

    const response = readJson(
      await action(actionArgs({ intent: 'inspect', artifactId: 'artifact/a', workspaceId: 'ws-1' })),
    );

    expect(apiRequest.mock.calls[0][1]).toBe('/projects/proj-skills/skills/artifacts/artifact%2Fa?workspaceId=ws-1');
    expect(response.detail.skillMarkdown).toContain('name: reviewer');
    expect(response.detail.reviewFiles[0].content).toContain('name: reviewer');
  });

  it('forwards an opaque audit cursor without decoding it in the IDE proxy', async () => {
    apiRequest.mockResolvedValueOnce({ artifact: { id: 'artifact/a' }, reviewFiles: [], events: [] });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    await action(
      actionArgs({
        intent: 'inspect',
        artifactId: 'artifact/a',
        workspaceId: 'ws-1',
        eventCursor: 'opaque_cursor-1',
      }),
    );

    expect(apiRequest.mock.calls[0][1]).toBe(
      '/projects/proj-skills/skills/artifacts/artifact%2Fa?workspaceId=ws-1&eventCursor=opaque_cursor-1',
    );
  });

  it.each(['approve', 'enable', 'disable', 'revoke'] as const)(
    '%s binds the decision to digest, workspace, and reason',
    async (intent) => {
      apiRequest.mockResolvedValueOnce({ artifact: { id: 'artifact-1' } });

      const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
      await action(
        actionArgs({
          intent,
          artifactId: 'artifact-1',
          digest: 'd'.repeat(64),
          workspaceId: 'ws-1',
          reason: 'Reviewed immutable source and scanner evidence.',
          ...(intent === 'approve' ? { acknowledgedUntrustedContent: 'true' } : {}),
        }),
      );

      const [, path, init] = apiRequest.mock.calls[0];
      expect(path).toBe(`/projects/proj-skills/skills/artifacts/artifact-1/${intent}`);
      expect(JSON.parse(init.body)).toEqual({
        digest: 'd'.repeat(64),
        reason: 'Reviewed immutable source and scanner evidence.',
        workspaceId: 'ws-1',
        ...(intent === 'approve' ? { acknowledgedUntrustedContent: true } : {}),
      });
    },
  );

  it('reject binds the reason and exact digest to the selected workspace', async () => {
    apiRequest.mockResolvedValueOnce({ artifact: { id: 'artifact-1', auditStatus: 'blocked' } });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    await action(
      actionArgs({
        intent: 'reject',
        artifactId: 'artifact-1',
        digest: 'e'.repeat(64),
        workspaceId: 'ws-1',
        reason: 'Prompt injection attempts request secret disclosure.',
      }),
    );

    expect(JSON.parse(apiRequest.mock.calls[0][2].body)).toEqual({
      digest: 'e'.repeat(64),
      reason: 'Prompt injection attempts request secret disclosure.',
      workspaceId: 'ws-1',
    });
  });

  it('rejects malformed decision fields before contacting the backend', async () => {
    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');

    for (const fields of [
      { intent: 'approve', artifactId: 'artifact-1', digest: 'wrong', workspaceId: 'ws-1', reason: 'valid' },
      { intent: 'approve', artifactId: 'artifact-1', digest: 'a'.repeat(64), reason: 'valid' },
      {
        intent: 'approve',
        artifactId: 'artifact-1',
        digest: 'a'.repeat(64),
        workspaceId: 'ws-1',
        reason: 'valid',
      },
      { intent: 'reject', artifactId: 'artifact-1', digest: 'a'.repeat(64), reason: 'x' },
      { intent: 'import-catalog', catalogId: 'anthropics:skills/pdf' },
    ]) {
      apiRequest.mockReset();

      const thrown = await action(actionArgs(fields)).then(
        () => null,
        (error: unknown) => error,
      );

      expect((thrown as any)?.init?.status).toBe(400);
      expect(apiRequest).not.toHaveBeenCalled();
    }
  });

  it('rejects removed proprietary builtin/install intents', async () => {
    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');

    const thrown = await action(actionArgs({ intent: 'install', artifactId: 'legacy' })).then(
      () => null,
      (error: unknown) => error,
    );

    expect((thrown as any)?.init?.status).toBe(400);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
