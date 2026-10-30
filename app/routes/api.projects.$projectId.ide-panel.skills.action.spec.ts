import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * The IDE Skills panel (ProjectSkillsPanel) drives both the builtin catalog
 * toggles AND the installable GitHub-repo skills (F#27). This spec drives the
 * route's own `action` with the exact form fields the panel posts and mocks
 * apiRequest at the module boundary, proving:
 *   - install POSTs { ownerRepo, scope } to /projects/:id/skills/install;
 *   - uninstall DELETEs { ownerRepo, scope } from /projects/:id/skills/installed;
 *   - enable-installed/disable-installed PATCH { enabled } on the installed row;
 *   - the legacy enable/disable intents still toggle the builtin catalog;
 *   - a missing ownerRepo 400s before any backend call;
 *   - scope defaults to 'project' and honours 'workspace'.
 */
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

/* The action returns RR7's data() sentinel (aliased `json`); its body is on `.data`. */
function readJson(result: any): any {
  return result && typeof result === 'object' && 'data' in result ? result.data : result;
}

describe('ide-panel skills action (installable GitHub-repo skills, F#27)', () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  it('install: POSTs { ownerRepo, scope } to /skills/install (scope defaults to project)', async () => {
    apiRequest.mockResolvedValueOnce({ skill: { ownerRepo: 'anthropics/skills' }, source: 'SKILL.md' });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    const body = readJson(await action(actionArgs({ intent: 'install', ownerRepo: 'anthropics/skills' })));

    const [, url, init] = apiRequest.mock.calls[0];
    expect(url).toBe('/projects/proj-skills/skills/install');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ ownerRepo: 'anthropics/skills', scope: 'project' });
    expect(body.ok).toBe(true);
  });

  it('install: honours an explicit workspace scope', async () => {
    apiRequest.mockResolvedValueOnce({ skill: { scope: 'workspace' } });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    await action(actionArgs({ intent: 'install', ownerRepo: 'anthropics/skills', scope: 'workspace' }));

    expect(JSON.parse(apiRequest.mock.calls[0][2].body).scope).toBe('workspace');
  });

  it('uninstall: DELETEs { ownerRepo, scope } from /skills/installed', async () => {
    apiRequest.mockResolvedValueOnce({ removed: true });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    await action(actionArgs({ intent: 'uninstall', ownerRepo: 'anthropics/skills', scope: 'project' }));

    const [, url, init] = apiRequest.mock.calls[0];
    expect(url).toBe('/projects/proj-skills/skills/installed');
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body)).toEqual({ ownerRepo: 'anthropics/skills', scope: 'project' });
  });

  it('enable-installed / disable-installed: PATCH { enabled } on the installed row', async () => {
    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');

    apiRequest.mockResolvedValueOnce({ skill: { enabled: false } });
    await action(actionArgs({ intent: 'disable-installed', ownerRepo: 'anthropics/skills' }));

    let [, url, init] = apiRequest.mock.calls[0];
    expect(url).toBe('/projects/proj-skills/skills/installed');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ ownerRepo: 'anthropics/skills', scope: 'project', enabled: false });

    apiRequest.mockReset();
    apiRequest.mockResolvedValueOnce({ skill: { enabled: true } });
    await action(actionArgs({ intent: 'enable-installed', ownerRepo: 'anthropics/skills' }));

    [, url, init] = apiRequest.mock.calls[0];
    expect(JSON.parse(init.body).enabled).toBe(true);
  });

  it('install/uninstall: a blank ownerRepo 400s before touching the backend', async () => {
    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');

    for (const intent of ['install', 'uninstall', 'enable-installed'] as const) {
      apiRequest.mockReset();

      const thrown = await action(actionArgs({ intent, ownerRepo: '   ' })).then(
        () => null,
        (error: unknown) => error,
      );

      expect((thrown as any)?.init?.status).toBe(400);
      expect(apiRequest).not.toHaveBeenCalled();
    }
  });

  it('legacy enable/disable still toggles the builtin catalog by skillId', async () => {
    apiRequest.mockResolvedValueOnce({ skill: { id: 'code-review', enabled: false } });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    await action(actionArgs({ intent: 'disable', skillId: 'code-review' }));

    const [, url, init] = apiRequest.mock.calls[0];
    expect(url).toBe('/projects/proj-skills/skills/code-review/disable');
    expect(init.method).toBe('POST');
  });
});

describe('ide-panel skills loader failure recovery', () => {
  afterEach(() => apiRequest.mockReset());

  function args() {
    return {
      request: new Request('https://app.test/api/projects/proj-skills/ide-panel/skills'),
      params: { projectId: 'proj-skills', panel: 'skills' },
    } as any;
  }

  function sources(failedPath?: string, status = 503, hasWorkspace = true) {
    apiRequest.mockImplementation(async (_request: Request, path: string) => {
      if (path === failedPath) {
        throw new Response('{}', { status });
      }

      if (path === '/projects/proj-skills') {
        return { project: { id: 'proj-skills' } };
      }

      if (path.endsWith('/catalog')) {
        return { entries: [], hasWorkspace };
      }

      if (path.includes('/audit')) {
        return { events: [] };
      }

      return { skills: [{ id: 'synthetic', enabled: true }] };
    });
  }

  it.each(['', '/catalog', '/installed?scope=project', '/installed?scope=workspace', '/audit?scope=project'])(
    'shows a recoverable error instead of an empty success when %s fails',
    async (suffix) => {
      sources(`/projects/proj-skills/skills${suffix}`);

      const { loader } = await import('./api.projects.$projectId.ide-panel.$panel');
      const body = readJson(await loader(args()));
      expect(body.status).toBe('error');
      expect(body.error).toMatchObject({ code: 'PANEL_BACKEND_UNAVAILABLE', retryable: true });
    },
  );

  it('does not request workspace skills when no workspace exists', async () => {
    sources(undefined, 503, false);

    const { loader } = await import('./api.projects.$projectId.ide-panel.$panel');
    const body = readJson(await loader(args()));
    expect(body.status).toBe('ok');
    expect(body.data.installedWorkspace).toEqual([]);
    expect(apiRequest.mock.calls.some(([, path]) => path.endsWith('scope=workspace'))).toBe(false);
  });

  it('preserves forbidden state and recovers on a later reload', async () => {
    sources('/projects/proj-skills/skills', 403);

    const { loader } = await import('./api.projects.$projectId.ide-panel.$panel');
    expect(readJson(await loader(args())).error).toMatchObject({ code: 'PANEL_FORBIDDEN', retryable: false });
    sources();
    expect(readJson(await loader(args())).status).toBe('ok');
  });
});
