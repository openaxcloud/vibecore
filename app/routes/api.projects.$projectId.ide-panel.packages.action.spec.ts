import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
  };
});

function actionArgs(language = 'en') {
  const form = new FormData();
  form.append('intent', 'install-package');
  form.append('packageManager', 'pnpm');
  form.append('packages', '@scope/widget');

  return {
    request: new Request('https://app.test/api/projects/proj-packages/ide-panel/packages', {
      method: 'POST',
      headers: { 'Accept-Language': language },
      body: form,
    }),
    params: { projectId: 'proj-packages', panel: 'packages' },
  } as any;
}

function resultData(result: any): any {
  return result && typeof result === 'object' && 'data' in result ? result.data : result;
}

function resultStatus(result: any): number | undefined {
  if (!result || typeof result !== 'object') {
    return undefined;
  }

  return typeof result.init === 'number' ? result.init : result.init?.status;
}

function mockPackagesPrelude() {
  apiRequest
    .mockResolvedValueOnce({
      packageManager: 'pnpm',
      workspace: { id: 'workspace-real', status: 'RUNNING' },
    })
    .mockResolvedValueOnce({ envVars: [] });
}

describe('ide-panel packages action result contract', () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  it('returns a structured 422 after persisting a failed package run', async () => {
    mockPackagesPrelude();
    apiRequest
      .mockResolvedValueOnce({
        command: 'pnpm add @scope/widget',
        exitCode: 17,
        success: false,
        output: 'private registry diagnostic that must not cross the action response',
      })
      .mockResolvedValueOnce({ ok: true });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    const result = await action(actionArgs());
    const body = resultData(result);

    expect(resultStatus(result)).toBe(422);
    expect(body).toMatchObject({
      ok: false,
      code: 'PACKAGE_RUN_FAILED',
      error: 'The package action failed (exit 17). Review the recorded output, correct the issue, and try again.',
      run: { status: 'failed', exitCode: 17 },
    });
    expect(JSON.stringify(body)).not.toContain('private registry diagnostic');

    expect(apiRequest).toHaveBeenCalledTimes(4);
    expect(apiRequest.mock.calls[2][1]).toBe('/projects/proj-packages/packages/install');
    expect(JSON.parse(apiRequest.mock.calls[2][2].body)).toMatchObject({
      packageManager: 'pnpm',
      packages: ['@scope/widget'],
      workspaceId: 'workspace-real',
    });

    const [, persistedUrl, persistedInit] = apiRequest.mock.calls[3];
    expect(persistedUrl).toBe('/projects/proj-packages/env-vars');
    expect(persistedInit.method).toBe('PUT');

    const persisted = JSON.parse(persistedInit.body);
    expect(persisted.key).toBe('VIBECORE_PACKAGES_STATE');

    const state = JSON.parse(persisted.value);
    expect(state.runs[0]).toMatchObject({
      status: 'failed',
      exitCode: 17,
      output: 'private registry diagnostic that must not cross the action response',
    });
  });

  it('localizes the actionable failure without leaking command output', async () => {
    mockPackagesPrelude();
    apiRequest
      .mockResolvedValueOnce({ command: 'pnpm add @scope/widget', exitCode: 2, success: false, output: 'secret-ish' })
      .mockResolvedValueOnce({ ok: true });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    const body = resultData(await action(actionArgs('fr-FR')));

    expect(body.error).toBe(
      'L’action sur les paquets a échoué (code 2). Consultez la sortie enregistrée, corrigez le problème, puis réessayez.',
    );
    expect(JSON.stringify(body)).not.toContain('secret-ish');
  });

  it('keeps the existing success response for a completed package run', async () => {
    mockPackagesPrelude();
    apiRequest
      .mockResolvedValueOnce({ command: 'pnpm add @scope/widget', exitCode: 0, success: true, output: 'installed' })
      .mockResolvedValueOnce({ ok: true });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    const result = await action(actionArgs());

    expect(resultStatus(result)).toBeUndefined();
    expect(resultData(result)).toEqual({ ok: true });
  });
});
