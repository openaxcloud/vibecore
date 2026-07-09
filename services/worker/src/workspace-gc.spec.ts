import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_WORKSPACE_MANAGER_URL = process.env.WORKSPACE_MANAGER_URL;
const ORIGINAL_WORKSPACE_RUNTIME_NAMESPACE = process.env.WORKSPACE_RUNTIME_NAMESPACE;
const ORIGINAL_WORKSPACE_IDLE_STOP_MINUTES = process.env.WORKSPACE_IDLE_STOP_MINUTES;
const ORIGINAL_WORKSPACE_DELETE_STOPPED_HOURS = process.env.WORKSPACE_DELETE_STOPPED_HOURS;

function restoreEnv(key: string, original: string | undefined) {
  if (original === undefined) {
    delete (process.env as Record<string, string | undefined>)[key];
  } else {
    process.env[key] = original;
  }
}

afterEach(() => {
  restoreEnv('WORKSPACE_MANAGER_URL', ORIGINAL_WORKSPACE_MANAGER_URL);
  restoreEnv('WORKSPACE_RUNTIME_NAMESPACE', ORIGINAL_WORKSPACE_RUNTIME_NAMESPACE);
  restoreEnv('WORKSPACE_IDLE_STOP_MINUTES', ORIGINAL_WORKSPACE_IDLE_STOP_MINUTES);
  restoreEnv('WORKSPACE_DELETE_STOPPED_HOURS', ORIGINAL_WORKSPACE_DELETE_STOPPED_HOURS);

  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  delete (process.env as Record<string, string | undefined>).WORKSPACE_MANAGER_URL;
  delete (process.env as Record<string, string | undefined>).WORKSPACE_IDLE_STOP_MINUTES;
  delete (process.env as Record<string, string | undefined>).WORKSPACE_DELETE_STOPPED_HOURS;
});

describe('triggerWorkspaceGarbageCollect', () => {
  it('throws when WORKSPACE_MANAGER_URL is missing so the CronJob fails loudly', async () => {
    const { triggerWorkspaceGarbageCollect } = await import('./index.js');
    await expect(triggerWorkspaceGarbageCollect({})).rejects.toThrowError(/WORKSPACE_MANAGER_URL is required/);
  });

  it('POSTs to /workspaces/gc with default inactive/delete windows and namespace', async () => {
    process.env.WORKSPACE_MANAGER_URL = 'http://wsm.test:3010';
    process.env.WORKSPACE_RUNTIME_NAMESPACE = 'workspaces';

    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const { triggerWorkspaceGarbageCollect } = await import('./index.js');
    await triggerWorkspaceGarbageCollect({});

    expect(fetchSpy).toHaveBeenCalledOnce();
    const firstCall = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(firstCall[0]).toBe('http://wsm.test:3010/workspaces/gc');
    expect(firstCall[1].method).toBe('POST');

    const body = JSON.parse(firstCall[1].body as string);
    expect(body).toEqual({
      namespace: 'workspaces',
      inactiveMs: 30 * 60_000,
      deleteMs: 24 * 60 * 60_000,
    });
  });

  it('honours per-job overrides on inactiveMs / deleteMs / namespace', async () => {
    process.env.WORKSPACE_MANAGER_URL = 'http://wsm.test:3010';

    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const { triggerWorkspaceGarbageCollect } = await import('./index.js');
    await triggerWorkspaceGarbageCollect({
      namespace: 'staging-workspaces',
      inactiveMs: 5 * 60_000,
      deleteMs: 60 * 60_000,
    });

    const lastCall = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(lastCall[1].body as string);
    expect(body).toEqual({
      namespace: 'staging-workspaces',
      inactiveMs: 5 * 60_000,
      deleteMs: 60 * 60_000,
    });
  });

  it('reads WORKSPACE_IDLE_STOP_MINUTES / WORKSPACE_DELETE_STOPPED_HOURS env overrides when jobData omits them', async () => {
    process.env.WORKSPACE_MANAGER_URL = 'http://wsm.test:3010';
    process.env.WORKSPACE_RUNTIME_NAMESPACE = 'workspaces';
    process.env.WORKSPACE_IDLE_STOP_MINUTES = '10';
    process.env.WORKSPACE_DELETE_STOPPED_HOURS = '48';

    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const { triggerWorkspaceGarbageCollect } = await import('./index.js');
    await triggerWorkspaceGarbageCollect({});

    const body = JSON.parse((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toEqual({
      namespace: 'workspaces',
      inactiveMs: 10 * 60_000,
      deleteMs: 48 * 60 * 60_000,
    });
  });

  it('falls back to the built-in 30m / 24h defaults when the env overrides are malformed', async () => {
    process.env.WORKSPACE_MANAGER_URL = 'http://wsm.test:3010';
    process.env.WORKSPACE_RUNTIME_NAMESPACE = 'workspaces';
    process.env.WORKSPACE_IDLE_STOP_MINUTES = 'not-a-number';
    process.env.WORKSPACE_DELETE_STOPPED_HOURS = '0';

    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const { triggerWorkspaceGarbageCollect } = await import('./index.js');
    await triggerWorkspaceGarbageCollect({});

    const body = JSON.parse((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.inactiveMs).toBe(30 * 60_000);
    expect(body.deleteMs).toBe(24 * 60 * 60_000);
  });

  it('lets per-job overrides win over the env defaults (jobData > env > built-in)', async () => {
    process.env.WORKSPACE_MANAGER_URL = 'http://wsm.test:3010';
    process.env.WORKSPACE_RUNTIME_NAMESPACE = 'workspaces';
    process.env.WORKSPACE_IDLE_STOP_MINUTES = '10';
    process.env.WORKSPACE_DELETE_STOPPED_HOURS = '48';

    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const { triggerWorkspaceGarbageCollect } = await import('./index.js');
    await triggerWorkspaceGarbageCollect({ inactiveMs: 5 * 60_000, deleteMs: 60 * 60_000 });

    const body = JSON.parse((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.inactiveMs).toBe(5 * 60_000);
    expect(body.deleteMs).toBe(60 * 60_000);
  });

  it('throws when workspace-manager replies non-2xx so BullMQ retries', async () => {
    process.env.WORKSPACE_MANAGER_URL = 'http://wsm.test:3010';

    const fetchSpy = vi.fn(async () => new Response('boom', { status: 503 }));
    vi.stubGlobal('fetch', fetchSpy);

    const { triggerWorkspaceGarbageCollect } = await import('./index.js');
    await expect(triggerWorkspaceGarbageCollect({})).rejects.toThrowError(/workspace.gc upstream failed: 503/);
  });
});
