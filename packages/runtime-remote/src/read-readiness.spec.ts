import { describe, it, expect, vi } from 'vitest';
import { RemoteKubernetesRuntimeAdapter } from './index.js';

describe('bound workspace reads during a known in-flight start', () => {
  for (const operation of ['listFiles', 'readFile'] as const) {
    it(`${operation} waits for the same adapter start to finish before agent I/O`, async () => {
      let release!: (response: Response) => void;

      const startResponse = new Promise<Response>((resolve) => {
        release = resolve;
      });

      const order: string[] = [];

      const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/workspaces')) {
          order.push('start-request');
          return startResponse;
        }

        if (url.includes('/files')) {
          order.push('file-request');
          return Response.json(operation === 'listFiles' ? [] : { content: 'saved' });
        }

        throw new Error(`Unexpected request ${url}`);
      });
      const runtime = new RemoteKubernetesRuntimeAdapter({
        baseUrl: 'https://local-proof.invalid',
        workspaceId: 'ws-known',
        projectId: 'project-known',
        fetchImpl,
      });

      const start = runtime.startWorkspace({ id: 'ws-known', metadata: { projectId: 'project-known' } });
      const read = operation === 'listFiles' ? runtime.listFiles('src') : runtime.readFile('src/App.tsx');

      // Let pending authentication/fetch microtasks settle without resolving start.
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }

      const beforeReady = [...order];
      release(Response.json({ id: 'ws-known', status: 'running' }));
      await start;
      await read;
      expect(beforeReady).toEqual(['start-request']);
      expect(order).toEqual(['start-request', 'file-request']);
    });
  }
});

function controlled() {
  const starts: Array<(value: Response) => void> = [];
  const calls: string[] = [];

  const adapter = new RemoteKubernetesRuntimeAdapter({
    baseUrl: 'https://local-proof.invalid',
    workspaceId: 'ws-a',
    projectId: 'project-a',
    fetchImpl: async (input) => {
      const url = String(input);
      calls.push(url);

      if (url.endsWith('/workspaces')) {
        return new Promise<Response>((resolve) => {
          starts.push(resolve);
        });
      }

      if (url.endsWith('/status')) {
        return Response.json({ id: 'ws-a', status: 'running' });
      }

      return Response.json(url.includes('/files/read') ? { content: 'saved' } : []);
    },
  });

  return { adapter, starts, calls, files: () => calls.filter((url) => url.includes('/files')) };
}

async function tick() {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

const running = (id = 'ws-a') => Response.json({ id, status: 'running' });

describe.each(['listFiles', 'readFile'] as const)('%s readiness boundary', (operation) => {
  it.each([403, 499])('propagates refused/cancelled start HTTP %s without file I/O', async (status) => {
    const h = controlled();
    const start = h.adapter.startWorkspace().catch((error: unknown) => error);
    const read = h.adapter[operation]('a').catch((error: unknown) => error);
    await tick();
    h.starts[0](Response.json({ code: status === 499 ? 'STREAM_ABORTED' : 'FORBIDDEN' }, { status }));

    const error = await start;
    expect(await read).toBe(error);
    expect(h.files()).toEqual([]);
  });
  it('allows status polling to finish start without a dependency cycle', async () => {
    const h = controlled();
    const start = h.adapter.startWorkspace();
    const read = h.adapter[operation]('a');
    await tick();
    h.starts[0](Response.json({ id: 'ws-a', status: 'starting' }));
    await start;
    await read;
    expect(h.calls.findIndex((url) => url.endsWith('/status'))).toBeLessThan(
      h.calls.findIndex((url) => url.includes('/files')),
    );
  });
  it.each(['workspace', 'project'])('rejects a %s identity change while the read waits', async (change) => {
    const h = controlled();

    const start = h.adapter.startWorkspace(
      change === 'project' ? { id: 'ws-a', metadata: { projectId: 'project-b' } } : {},
    );

    const read = h.adapter[operation]('a').catch((error: unknown) => error);
    await tick();
    h.starts[0](running(change === 'workspace' ? 'ws-b' : 'ws-a'));
    await start;
    expect(await read).toMatchObject({ code: 'WORKSPACE_CONTEXT_CHANGED' });
    expect(h.files()).toEqual([]);
  });
  it('rejects a read superseded by another start even if the workspace ID is unchanged', async () => {
    const h = controlled();
    const first = h.adapter.startWorkspace();
    const read = h.adapter[operation]('a').catch((error: unknown) => error);
    const second = h.adapter.startWorkspace();
    await tick();
    h.starts[0](running());
    await first;
    expect(await read).toMatchObject({ code: 'WORKSPACE_CONTEXT_CHANGED' });
    expect(h.files()).toEqual([]);
    h.starts[1](running());
    await second;
  });
  it('does not provision or poll when no start is active', async () => {
    const h = controlled();
    await h.adapter.listFiles();
    await h.adapter[operation]('a');
    expect(h.calls).toHaveLength(2);
    expect(h.files()).toHaveLength(2);
  });
});
