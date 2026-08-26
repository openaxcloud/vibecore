import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
  };
});

function actionArgs(fields: Record<string, string>) {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }

  return {
    request: new Request('https://app.test/api/projects/project-git/ide-panel/git', {
      method: 'POST',
      body: form,
    }),
    params: { projectId: 'project-git', panel: 'git' },
  } as any;
}

function resultData(result: any): any {
  return result && typeof result === 'object' && 'data' in result ? result.data : result;
}

describe('ide-panel Git mutation contract', () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  it('routes a form-encoded commit intent to the real commit endpoint', async () => {
    apiRequest.mockResolvedValueOnce({ commit: { sha: 'abc123' } });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');

    const result = await action(
      actionArgs({
        intent: 'commit',
        stagedFiles: 'src/a.ts,src/b.ts',
        message: 'Save real changes',
        workspaceId: 'workspace-1',
        authorName: 'Avi',
        authorEmail: 'avi@example.test',
      }),
    );

    expect(resultData(result)).toEqual({ ok: true });
    expect(apiRequest).toHaveBeenCalledTimes(1);

    const [, url, init] = apiRequest.mock.calls[0];
    expect(url).toBe('/projects/project-git/git/commit');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      message: 'Save real changes',
      files: ['src/a.ts', 'src/b.ts'],
      workspaceId: 'workspace-1',
      authorName: 'Avi',
      authorEmail: 'avi@example.test',
    });
  });

  it('never reports success when the commit endpoint fails', async () => {
    apiRequest.mockRejectedValueOnce(
      new Response(JSON.stringify({ code: 'GIT_COMMIT_FAILED' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');

    const thrown = await action(
      actionArgs({ intent: 'commit', stagedFiles: 'src/a.ts', message: 'Must not be a false success' }),
    ).then(
      () => null,
      (error: unknown) => error,
    );

    expect((thrown as any)?.init?.status).toBe(409);
    expect((thrown as any)?.data).toMatchObject({ code: 'PANEL_REQUEST_FAILED' });
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
