import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteKubernetesRuntimeAdapter } from './index.js';

function harness(options: { projectId?: string; workspaceId?: string } = {}) {
  let unavailable = true;
  let readStatus = 502;
  let readCode = 'WORKSPACE_AGENT_REQUEST_FAILED';
  let deniedProject: string | undefined;
  let failedSwitch = false;

  const creates: Array<Record<string, any>> = [];
  const reads: string[] = [];

  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith('/workspaces') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      creates.push(body);

      if (failedSwitch && body.projectId === 'project-b') {
        return Response.json({ code: 'WORKSPACE_MANAGER_UNAVAILABLE' }, { status: 502 });
      }

      // Match the real API's project resolution. A workspace ID is not a project.
      const projectId = body.projectId ?? body.metadata?.projectId ?? body.workspaceId;

      if (!['project-a', 'project-b'].includes(projectId) || projectId === deniedProject) {
        return Response.json({ code: 'PROJECT_NOT_FOUND' }, { status: 404 });
      }

      unavailable = false;

      return Response.json({ id: projectId === 'project-a' ? 'ws-a' : 'ws-b', status: 'running' });
    }

    if (url.includes('/files?')) {
      reads.push(url);
      return unavailable ? Response.json({ code: readCode }, { status: readStatus }) : Response.json([]);
    }

    if (url.endsWith('/restart')) {
      return Response.json({ code: 'WORKSPACE_AGENT_REQUEST_FAILED' }, { status: 502 });
    }

    if (failedSwitch && url.endsWith('/workspaces/ws-b/status')) {
      return Response.json({ code: 'FORBIDDEN' }, { status: 403 });
    }

    throw new Error(`Unexpected request: ${url}`);
  });
  const adapter = new RemoteKubernetesRuntimeAdapter({
    baseUrl: 'https://runtime.example.test',
    authToken: 'test-token',
    fetchImpl,
    ...options,
  });

  return {
    adapter,
    creates,
    reads,
    failSwitch: () => {
      failedSwitch = true;
    },
    losePod: () => {
      unavailable = true;
    },
    deny: (project: string) => {
      deniedProject = project;
    },
    failRead: (status: number, code: string) => {
      readStatus = status;
      readCode = code;
      unavailable = true;
    },
  };
}

async function settle<T>(operation: Promise<T>) {
  const result = operation.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.runAllTimersAsync();

  return result;
}

describe('runtime reprovision project identity', () => {
  afterEach(() => vi.useRealTimers());

  it('retains normal start metadata when recovering the resolved workspace', async () => {
    vi.useFakeTimers();

    const h = harness();
    await h.adapter.startWorkspace({ id: 'project-a', metadata: { projectId: 'project-a' } });
    h.losePod();
    expect(await settle(h.adapter.listFiles('src'))).toEqual({ value: [] });
    expect(h.creates).toHaveLength(2);
    expect(h.creates[1]).toMatchObject({ workspaceId: 'ws-a', projectId: 'project-a' });
  });

  it('recovers an adopted workspace using its supplied project identity', async () => {
    vi.useFakeTimers();

    const h = harness({ workspaceId: 'ws-a', projectId: 'project-a' });
    expect(await settle(h.adapter.listFiles('src'))).toEqual({ value: [] });
    expect(h.creates).toEqual([{ workspaceId: 'ws-a', projectId: 'project-a' }]);
  });

  it('does not guess a project from a workspace ID when identity is missing', async () => {
    vi.useFakeTimers();

    const h = harness({ workspaceId: 'ws-a' });
    expect(await settle(h.adapter.listFiles('src'))).toMatchObject({ error: { status: 502 } });
    expect(h.creates).toEqual([]);
  });

  it('keeps a successful explicit project switch for later recovery', async () => {
    vi.useFakeTimers();

    const h = harness({ workspaceId: 'ws-a', projectId: 'project-a' });
    await h.adapter.startWorkspace({ id: 'project-b', metadata: { projectId: 'project-b' } });
    h.losePod();
    expect(await settle(h.adapter.listFiles('src'))).toEqual({ value: [] });
    expect(h.creates[1]).toMatchObject({ workspaceId: 'ws-b', projectId: 'project-b' });
  });

  it('preserves the original 425 without a guessed provision or extra read when project identity is missing', async () => {
    vi.useFakeTimers();

    const h = harness({ workspaceId: 'ws-a' });
    h.failRead(425, 'WORKSPACE_NOT_STARTED');
    expect(await settle(h.adapter.listFiles('src'))).toMatchObject({
      error: { status: 425, code: 'WORKSPACE_NOT_STARTED' },
    });
    expect(h.creates).toEqual([]);
    expect(h.reads).toHaveLength(1);
  });

  it('recovers a 425 missing pod with its known project identity', async () => {
    vi.useFakeTimers();

    const h = harness({ workspaceId: 'ws-a', projectId: 'project-a' });
    h.failRead(425, 'WORKSPACE_NOT_STARTED');
    expect(await settle(h.adapter.listFiles('src'))).toEqual({ value: [] });
    expect(h.creates).toEqual([{ workspaceId: 'ws-a', projectId: 'project-a' }]);
    expect(h.reads).toHaveLength(2);
  });

  it('retains bounded WORKSPACE_STARTING polling without guessing a project', async () => {
    vi.useFakeTimers();

    const h = harness({ workspaceId: 'ws-a' });
    h.failRead(425, 'WORKSPACE_STARTING');
    expect(await settle(h.adapter.listFiles('src'))).toMatchObject({
      error: { status: 425, code: 'WORKSPACE_STARTING' },
    });
    expect(h.creates).toEqual([]);
    expect(h.reads).toHaveLength(7);
  });

  it('does not pair an unverified switched workspace with the previous project after readiness fails', async () => {
    vi.useFakeTimers();

    const h = harness({ workspaceId: 'ws-a', projectId: 'project-a' });
    h.failSwitch();
    expect(await settle(h.adapter.startWorkspace({ id: 'ws-b', metadata: { projectId: 'project-b' } }))).toMatchObject({
      error: { status: 403 },
    });
    expect(await settle(h.adapter.listFiles('src'))).toEqual({ value: [] });
    expect(h.creates.at(-1)).toEqual({ workspaceId: 'ws-a', projectId: 'project-a' });
    expect(h.reads.every((url) => url.includes('/workspaces/ws-a/'))).toBe(true);
  });

  it('starts with constructor project identity and no adopted workspace', async () => {
    const h = harness({ projectId: 'project-a' });
    await expect(h.adapter.startWorkspace()).resolves.toMatchObject({ id: 'ws-a' });
    expect(h.creates).toEqual([{ projectId: 'project-a' }]);
  });

  it('does not send the old workspace on a metadata-only project switch', async () => {
    vi.useFakeTimers();

    const h = harness({ workspaceId: 'ws-a', projectId: 'project-a' });
    await h.adapter.startWorkspace({ metadata: { projectId: 'project-b' } });
    expect(h.creates[0]).toEqual({ projectId: 'project-b', metadata: { projectId: 'project-b' } });
    h.losePod();
    expect(await settle(h.adapter.listFiles('src'))).toEqual({ value: [] });
    expect(h.creates[1]).toMatchObject({ workspaceId: 'ws-b', projectId: 'project-b' });
  });

  it('does not retain a denied project switch', async () => {
    vi.useFakeTimers();

    const h = harness({ workspaceId: 'ws-a', projectId: 'project-a' });
    h.deny('project-b');
    await expect(
      h.adapter.startWorkspace({ id: 'project-b', metadata: { projectId: 'project-b' } }),
    ).rejects.toMatchObject({ status: 404 });
    expect(await settle(h.adapter.listFiles('src'))).toEqual({ value: [] });
    expect(h.creates[1]).toMatchObject({ workspaceId: 'ws-a', projectId: 'project-a' });
  });

  it('does not associate a different explicit ID with the previous project', async () => {
    vi.useFakeTimers();

    const h = harness({ workspaceId: 'ws-a', projectId: 'project-a' });

    await h.adapter.startWorkspace({ id: 'project-b' });
    expect(h.creates[0]).toEqual({ workspaceId: 'project-b' });
    h.losePod();
    expect(await settle(h.adapter.listFiles('src'))).toMatchObject({ error: { status: 502 } });
    expect(h.creates).toHaveLength(1);
  });

  it('preserves identity for explicit restart fallback', async () => {
    const h = harness({ workspaceId: 'ws-a', projectId: 'project-a' });
    await expect(h.adapter.restartWorkspace()).resolves.toMatchObject({ id: 'ws-a' });
    expect(h.creates[0]).toMatchObject({ workspaceId: 'ws-a', projectId: 'project-a' });
  });

  it('does not provision on restart failure without project identity', async () => {
    const h = harness({ workspaceId: 'ws-a' });
    await expect(h.adapter.restartWorkspace()).rejects.toMatchObject({ status: 502 });
    expect(h.creates).toEqual([]);
  });

  it.each([400, 404])('does not reinterpret a genuine file HTTP %s as missing infrastructure', async (status) => {
    vi.useFakeTimers();

    const h = harness({ workspaceId: 'ws-a', projectId: 'project-a' });
    h.failRead(status, 'FILE_REQUEST_FAILED');
    expect(await settle(h.adapter.listFiles('src'))).toMatchObject({ error: { status } });
    expect(h.creates).toEqual([]);
    expect(h.reads).toHaveLength(1);
  });
});
