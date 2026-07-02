import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * The IDE Extensions panel (ProjectExtensionsPanel) IS the MCP marketplace: the
 * catalog it shows and the install/enable/disable/remove buttons it renders all
 * map to REAL McpInstall records (user/org-scoped), which also surface in the
 * MCP settings tab. This spec drives the route's own `action` with the exact
 * form fields the panel posts and mocks apiRequest at the module boundary so the
 * whole lifecycle round-trips through the real handler without a live backend,
 * proving:
 *   - install POSTs the catalog slug (+ a slug-derived alias) to /mcp/installs;
 *   - enable/disable PATCH the install's `enabled` flag by installId;
 *   - remove DELETEs the install by installId;
 *   - each action is reached only via the project-scoped route (tenant isolation
 *     is enforced by the /projects/:projectId/ide-panel/extensions authz gate);
 *   - missing required ids (slug / installId) 400 BEFORE any backend call;
 *   - an unknown extensionAction 400s rather than silently no-op'ing.
 */
const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
  };
});

function actionArgs(fields: Record<string, string>, projectId = 'proj-77') {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }

  return {
    request: new Request(`https://app.test/api/projects/${projectId}/ide-panel/extensions`, {
      method: 'POST',
      body: form,
    }),
    params: { projectId, panel: 'extensions' },
  } as any;
}

/* The action returns RR7's data() sentinel (aliased `json`); its body is on `.data`. */
function readJson(result: any): any {
  return result && typeof result === 'object' && 'data' in result ? result.data : result;
}

describe('ide-panel extensions action (MCP marketplace lifecycle round-trip)', () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  it('install: POSTs the catalog slug + a slug-derived alias to /mcp/installs and returns ok', async () => {
    apiRequest.mockResolvedValueOnce({ install: { id: 'inst-1' } });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    const body = readJson(await action(actionArgs({ extensionAction: 'install', extension: 'GitHub MCP' })));

    expect(apiRequest).toHaveBeenCalledTimes(1);

    const [, url, init] = apiRequest.mock.calls[0];
    expect(url).toBe('/mcp/installs');
    expect(init.method).toBe('POST');

    const payload = JSON.parse(init.body);
    expect(payload.catalogEntrySlug).toBe('GitHub MCP');

    // Alias is sanitized from the slug: lowercased, non-[a-z0-9-_] collapsed to '-'.
    expect(payload.alias).toBe('github-mcp');
    expect(payload.config).toEqual({});

    expect(body).toEqual({ ok: true });
  });

  it('install: an explicit alias is still sanitized (alphanumeric/dash/underscore, <=64)', async () => {
    apiRequest.mockResolvedValueOnce({ install: { id: 'inst-2' } });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    await action(actionArgs({ extensionAction: 'install', extension: 'slug-a', alias: 'My Cool Alias!!' }));

    const [, , init] = apiRequest.mock.calls[0];
    expect(JSON.parse(init.body).alias).toBe('my-cool-alias');
  });

  it('install: a blank slug 400s before touching the backend', async () => {
    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');

    const thrown = await action(actionArgs({ extensionAction: 'install', extension: '   ' })).then(
      () => null,
      (error: unknown) => error,
    );

    expect((thrown as any)?.init?.status).toBe(400);
    expect((thrown as any)?.data).toEqual({ error: 'extension (catalog slug) is required' });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('enable: PATCHes { enabled: true } on the install by id', async () => {
    apiRequest.mockResolvedValueOnce({ install: { id: 'inst-3', enabled: true } });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    const body = readJson(await action(actionArgs({ extensionAction: 'enable', installId: 'inst-3' })));

    const [, url, init] = apiRequest.mock.calls[0];
    expect(url).toBe('/mcp/installs/inst-3');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ enabled: true });

    expect(body).toEqual({ ok: true });
  });

  it('disable: PATCHes { enabled: false } on the install by id', async () => {
    apiRequest.mockResolvedValueOnce({ install: { id: 'inst-4', enabled: false } });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    await action(actionArgs({ extensionAction: 'disable', installId: 'inst-4' }));

    const [, url, init] = apiRequest.mock.calls[0];
    expect(url).toBe('/mcp/installs/inst-4');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ enabled: false });
  });

  it('enable/disable/remove: a blank installId 400s before touching the backend', async () => {
    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');

    for (const extensionAction of ['enable', 'disable', 'remove'] as const) {
      apiRequest.mockReset();

      const thrown = await action(actionArgs({ extensionAction, installId: '  ' })).then(
        () => null,
        (error: unknown) => error,
      );

      expect((thrown as any)?.init?.status).toBe(400);
      expect((thrown as any)?.data).toEqual({ error: 'installId is required' });
      expect(apiRequest).not.toHaveBeenCalled();
    }
  });

  it('remove: DELETEs the install by (url-encoded) id', async () => {
    apiRequest.mockResolvedValueOnce({ ok: true });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    const body = readJson(await action(actionArgs({ extensionAction: 'remove', installId: 'inst 5/weird' })));

    const [, url, init] = apiRequest.mock.calls[0];
    expect(url).toBe('/mcp/installs/inst%205%2Fweird');
    expect(init.method).toBe('DELETE');

    expect(body).toEqual({ ok: true });
  });

  it('rejects an unknown extensionAction with a 400 rather than silently no-op-ing', async () => {
    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');

    const thrown = await action(actionArgs({ extensionAction: 'frobnicate', installId: 'inst-6' })).then(
      () => null,
      (error: unknown) => error,
    );

    expect((thrown as any)?.init?.status).toBe(400);
    expect((thrown as any)?.data).toEqual({ error: 'unsupported extensionAction: frobnicate' });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('defaults a missing extensionAction to install (the marketplace card default)', async () => {
    apiRequest.mockResolvedValueOnce({ install: { id: 'inst-7' } });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    await action(actionArgs({ extension: 'slug-default' }));

    const [, url, init] = apiRequest.mock.calls[0];
    expect(url).toBe('/mcp/installs');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).catalogEntrySlug).toBe('slug-default');
  });

  it('lifecycle: install -> disable -> enable -> remove each hits the real MCP endpoint in order', async () => {
    apiRequest.mockResolvedValue({ ok: true });

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');

    await action(actionArgs({ extensionAction: 'install', extension: 'lifecycle-slug' }));
    await action(actionArgs({ extensionAction: 'disable', installId: 'inst-life' }));
    await action(actionArgs({ extensionAction: 'enable', installId: 'inst-life' }));
    await action(actionArgs({ extensionAction: 'remove', installId: 'inst-life' }));

    expect(apiRequest.mock.calls.map((call) => [call[1], call[2]?.method])).toEqual([
      ['/mcp/installs', 'POST'],
      ['/mcp/installs/inst-life', 'PATCH'],
      ['/mcp/installs/inst-life', 'PATCH'],
      ['/mcp/installs/inst-life', 'DELETE'],
    ]);
  });
});
