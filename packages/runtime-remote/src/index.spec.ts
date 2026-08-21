import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RemoteKubernetesRuntimeAdapter,
  isAuthSocketClose,
  shouldRefreshAuthToken,
  type WebSocketLike,
} from './index.js';

type FakeWebSocketListener = (event: unknown) => void;

class FakeWebSocket implements WebSocketLike {
  readyState = 1;
  sent: Array<string | ArrayBufferLike | Blob | ArrayBufferView> = [];
  listeners = new Map<string, FakeWebSocketListener[]>();
  static instances: FakeWebSocket[] = [];
  static failNextOpenCount = 0;

  /*
   * When > 0, the next N constructed sockets reject the connect with an auth
   * close (code 4401) instead of opening — exercises the token self-heal path.
   */
  static authCloseNextOpenCount = 0;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      if (FakeWebSocket.authCloseNextOpenCount > 0) {
        FakeWebSocket.authCloseNextOpenCount -= 1;
        this.emit('close', { code: 4401 });

        return;
      }

      if (FakeWebSocket.failNextOpenCount > 0) {
        FakeWebSocket.failNextOpenCount -= 1;
        this.emit('error', {});

        return;
      }

      this.emit('open', {});
    });
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    this.sent.push(data);
  }

  close(code?: number) {
    this.emit('close', { code });
  }

  addEventListener(type: 'open' | 'message' | 'error' | 'close', listener: FakeWebSocketListener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(type: 'open' | 'message' | 'error' | 'close', listener: FakeWebSocketListener) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((item) => item !== listener),
    );
  }

  emit(type: string, event: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function createFetchMock() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith('/runtime/boot')) {
      return new Response(null, { status: 204 });
    }

    if (url.endsWith('/workspaces') && init?.method === 'POST') {
      return Response.json({
        id: 'ws-1',
        runtimeMode: 'remote-kubernetes',
        status: 'running',
        workdir: '/workspace',
        createdAt: '2026-04-28T00:00:00.000Z',
        updatedAt: '2026-04-28T00:00:00.000Z',
      });
    }

    if (url.endsWith('/files?path=src')) {
      return Response.json([{ path: 'src/App.tsx', name: 'App.tsx', type: 'file', content: 'export default null;' }]);
    }

    if (url.includes('/files/read')) {
      return Response.json({ content: 'hello', encoding: 'utf8' });
    }

    if (url.endsWith('/files/write') || url.endsWith('/patch')) {
      return url.endsWith('/patch')
        ? Response.json([{ path: 'a.ts', type: 'update' }])
        : new Response(null, { status: 204 });
    }

    if (url.endsWith('/ports')) {
      return Response.json([{ port: 5173, type: 'open', url: 'https://preview.example.com', ready: true }]);
    }

    if (url.endsWith('/preview/5173')) {
      return Response.json({ port: 5173, url: 'https://preview.example.com', ready: true });
    }

    if (url.includes('/export')) {
      return new Response(new Uint8Array([1, 2, 3]));
    }

    /*
     * Content search: model the real runtime endpoint at the network boundary.
     * The endpoint scans the workspace-pod filesystem and returns per-line
     * FileSearchMatch hits. Here we deterministically derive matches from the
     * posted { query, options } so a test can assert both the request contract
     * (URL is per-workspace, body carries the toggles) and the response mapping.
     */
    if (url.includes('/files/search') && init?.method === 'POST') {
      const payload = JSON.parse(String(init.body)) as {
        query: string;
        options?: {
          isRegex?: boolean;
          caseSensitive?: boolean;
          includes?: string[];
          excludes?: string[];
          resultLimit?: number;
        };
      };

      if (payload.query === '__none__') {
        return Response.json([]);
      }

      if (payload.options?.isRegex && payload.query === 'v[0-9]+') {
        return Response.json([
          { path: 'src/api.ts', lineNumber: 3, line: 'const route = "/v2/users";', startColumn: 20, endColumn: 22 },
        ]);
      }

      return Response.json([
        {
          path: 'src/App.tsx',
          lineNumber: 12,
          line: 'export const Widget = () => null;',
          startColumn: 14,
          endColumn: 20,
        },
        { path: 'src/util.ts', lineNumber: 4, line: 'const Widget = 1;', startColumn: 7, endColumn: 13 },
      ]);
    }

    return Response.json([]);
  });
}

describe('RemoteKubernetesRuntimeAdapter', () => {
  it('hasWorkspaceId() reflects whether a workspace is bound (stores skip watching until configured)', async () => {
    // ID-less (module singleton before configureRuntime wires the project adapter).
    const unbound = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token',
      fetchImpl: createFetchMock() as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });
    expect(unbound.hasWorkspaceId()).toBe(false);

    // Seeded with a workspace id (project-scoped adapter).
    const bound = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token',
      workspaceId: 'ws-42',
      fetchImpl: createFetchMock() as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });
    expect(bound.hasWorkspaceId()).toBe(true);

    // Becomes bound after startWorkspace().
    await unbound.startWorkspace({ id: 'ws-99' });
    expect(unbound.hasWorkspaceId()).toBe(true);
  });

  it('exposes the LOGICAL workdir (/home/project), matching WORK_DIR + the WebContainer adapter — NOT the agent disk root', async () => {
    /*
     * Regression: when this was the agent's physical root ('/workspace'), the
     * strip helpers that relativise '/home/project/...' app paths (FilesStore /
     * snapshot-restore keys) failed to match, sent 'home/project/...', and the
     * agent wrote files under '/workspace/home/project/...' while the install/dev
     * command ran in '/workspace' → ENOENT on reopen. The adapter must report the
     * logical app root; the agent maps it onto WORKSPACE_ROOT internally.
     */
    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token',
      workspaceId: 'ws-1',
      fetchImpl: createFetchMock() as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    // Hardcoded, not adopted from the API response (which reports the disk root).
    await adapter.startWorkspace();
    expect(adapter.workdir).toBe('/home/project');
  });

  it('opens project workspace, loads file tree, saves edits, runs patches, and opens previews', async () => {
    const fetchMock = createFetchMock();

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token-123',
      fetchImpl: fetchMock as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    await adapter.boot();
    await adapter.startWorkspace();
    await expect(adapter.listFiles('src')).resolves.toEqual([
      { path: 'src/App.tsx', name: 'App.tsx', type: 'file', content: 'export default null;' },
    ]);
    await adapter.writeFile('a.ts', 'hello');

    expect(await adapter.readFile('a.ts')).toEqual({ content: 'hello', encoding: 'utf8' });
    await expect(adapter.getPreviewUrl(5173)).resolves.toEqual({
      port: 5173,
      ready: true,
      url: 'https://preview.example.com',
    });
    await expect(
      adapter.applyPatch({ operations: [{ type: 'write', path: 'a.ts', content: 'updated' }] }),
    ).resolves.toEqual([{ path: 'a.ts', type: 'update' }]);

    const writeCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/files/write'));
    expect((writeCall?.[1]?.headers as Headers).get('authorization')).toBe('Bearer token-123');
  });

  it('retries an idempotent file write through a transient api 5xx so a pod rollout does not silently drop generated files', async () => {
    let writeAttempts = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/runtime/boot')) {
        return new Response(null, { status: 204 });
      }

      if (url.endsWith('/workspaces') && init?.method === 'POST') {
        return Response.json({
          id: 'ws-1',
          runtimeMode: 'remote-kubernetes',
          status: 'running',
          workdir: '/workspace',
          createdAt: '2026-04-28T00:00:00.000Z',
          updatedAt: '2026-04-28T00:00:00.000Z',
        });
      }

      if (url.endsWith('/files/write')) {
        writeAttempts += 1;

        /*
         * First attempt hits a draining/starting api pod during a rollout → 502.
         * A single-shot write would drop the generated file here; the retry rides it.
         */
        return writeAttempts === 1 ? new Response('bad gateway', { status: 502 }) : new Response(null, { status: 204 });
      }

      return Response.json([]);
    });

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token-123',
      fetchImpl: fetchMock as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    await adapter.boot();
    await adapter.startWorkspace();

    await expect(adapter.writeFile('src/App.tsx', 'export default null;')).resolves.toBeUndefined();
    expect(writeAttempts).toBe(2); // failed once (502), retried, succeeded — file not lost
  });

  it('retries an idempotent write through a provisioning 404 (op raced ahead of workspace creation) instead of hard-failing', async () => {
    let writeAttempts = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/runtime/boot')) {
        return new Response(null, { status: 204 });
      }

      if (url.endsWith('/workspaces') && init?.method === 'POST') {
        return Response.json({
          id: 'ws-1',
          runtimeMode: 'remote-kubernetes',
          status: 'running',
          workdir: '/workspace',
          createdAt: '2026-04-28T00:00:00.000Z',
          updatedAt: '2026-04-28T00:00:00.000Z',
        });
      }

      if (url.endsWith('/files/write')) {
        writeAttempts += 1;

        // First attempt lands before authorizeRuntimeWorkspace can resolve the id →
        // 404 PROJECT_NOT_FOUND (the reported "Remote runtime request failed: 404").
        // The record exists by the retry.
        return writeAttempts === 1
          ? Response.json({ code: 'PROJECT_NOT_FOUND', error: 'not found' }, { status: 404 })
          : new Response(null, { status: 204 });
      }

      return Response.json([]);
    });

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token-123',
      fetchImpl: fetchMock as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    await adapter.boot();
    await adapter.startWorkspace();

    await expect(adapter.writeFile('src/App.tsx', 'export default null;')).resolves.toBeUndefined();
    expect(writeAttempts).toBe(2); // provisioning 404 on attempt 1, self-healed on retry
  });

  it('does NOT retry a 404 that is not a provisioning-not-found (a genuine 4xx stays a hard failure)', async () => {
    let writeAttempts = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/runtime/boot')) {
        return new Response(null, { status: 204 });
      }

      if (url.endsWith('/workspaces') && init?.method === 'POST') {
        return Response.json({
          id: 'ws-1',
          runtimeMode: 'remote-kubernetes',
          status: 'running',
          workdir: '/workspace',
          createdAt: '2026-04-28T00:00:00.000Z',
          updatedAt: '2026-04-28T00:00:00.000Z',
        });
      }

      if (url.endsWith('/files/write')) {
        writeAttempts += 1;
        return Response.json({ code: 'SOME_OTHER_404', error: 'nope' }, { status: 404 });
      }

      return Response.json([]);
    });

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token-123',
      fetchImpl: fetchMock as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    await adapter.boot();
    await adapter.startWorkspace();

    await expect(adapter.writeFile('src/App.tsx', 'export default null;')).rejects.toMatchObject({ status: 404 });
    expect(writeAttempts).toBe(1); // thrown immediately, not retried
  });

  it('re-provisions a GC-reaped workspace (stale ws-id) on WORKSPACE_AGENT_REQUEST_FAILED, then retries — no ENOTFOUND loop', async () => {
    let podAlive = true;
    let provisionCount = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/runtime/boot')) {
        return new Response(null, { status: 204 });
      }

      if (url.endsWith('/workspaces') && init?.method === 'POST') {
        provisionCount += 1;
        podAlive = true; // provisioning (re)creates the pod

        return Response.json({
          id: 'ws-1',
          runtimeMode: 'remote-kubernetes',
          status: 'running',
          workdir: '/workspace',
          createdAt: '2026-04-28T00:00:00.000Z',
          updatedAt: '2026-04-28T00:00:00.000Z',
        });
      }

      if (url.includes('/files?path=src')) {
        // A GC'd pod: the api can't reach the agent (ENOTFOUND) and 502s with the code.
        if (!podAlive) {
          return Response.json({ code: 'WORKSPACE_AGENT_REQUEST_FAILED', error: 'agent unreachable' }, { status: 502 });
        }

        return Response.json([{ path: 'src/App.tsx', name: 'App.tsx', type: 'file', content: 'x' }]);
      }

      return Response.json([]);
    });

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token-123',
      fetchImpl: fetchMock as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    await adapter.startWorkspace(); // initial provision (#1)
    podAlive = false; // the inactivity GC reaps the pod while the tab is open

    await expect(adapter.listFiles('src')).resolves.toEqual([
      { path: 'src/App.tsx', name: 'App.tsx', type: 'file', content: 'x' },
    ]);

    // Exactly ONE re-provision (initial + heal), not an endless ENOTFOUND loop.
    expect(provisionCount).toBe(2);
  });

  it('restartWorkspace re-provisions when the pod is gone (restart 502) instead of no-op', async () => {
    let provisionCount = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/runtime/boot')) {
        return new Response(null, { status: 204 });
      }

      if (url.endsWith('/workspaces') && init?.method === 'POST') {
        provisionCount += 1;

        return Response.json({
          id: 'ws-1',
          runtimeMode: 'remote-kubernetes',
          status: 'running',
          workdir: '/workspace',
          createdAt: '2026-04-28T00:00:00.000Z',
          updatedAt: '2026-04-28T00:00:00.000Z',
        });
      }

      if (url.endsWith('/restart')) {
        // Nothing to restart — the pod was reaped.
        return Response.json({ code: 'WORKSPACE_AGENT_REQUEST_FAILED', error: 'agent unreachable' }, { status: 502 });
      }

      return Response.json([]);
    });

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token-123',
      fetchImpl: fetchMock as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    await adapter.startWorkspace(); // #1

    const session = await adapter.restartWorkspace(); // restart 502 → falls back to provision (#2)

    expect(provisionCount).toBe(2);
    expect(session.status).toBe('running');
  });

  it('runs project-wide content search against the runtime files/search endpoint (per-tenant, options + results round-trip)', async () => {
    /*
     * Certifies the real search path the IDE uses in remote-kubernetes mode: the
     * Search pane calls runtimeAdapter.searchFiles(query, options), which must POST
     * to the CURRENT project's workspace pod endpoint (tenant isolation) carrying
     * the query and every toggle, then map the runtime's FileSearchMatch rows back
     * to the UI. No in-memory file-map shortcut — full repo coverage via the pod.
     */
    const fetchMock = createFetchMock();

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token-search',
      workspaceId: 'ws-tenant-7',
      fetchImpl: fetchMock as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    const results = await adapter.searchFiles('Widget', {
      caseSensitive: true,
      isRegex: false,
      includes: ['**/*'],
      excludes: ['**/node_modules/**'],
      resultLimit: 500,
    });

    // Response mapped straight through from the runtime endpoint (real content hits).
    expect(results).toEqual([
      {
        path: 'src/App.tsx',
        lineNumber: 12,
        line: 'export const Widget = () => null;',
        startColumn: 14,
        endColumn: 20,
      },
      { path: 'src/util.ts', lineNumber: 4, line: 'const Widget = 1;', startColumn: 7, endColumn: 13 },
    ]);

    const searchCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/files/search'));
    expect(searchCall).toBeDefined();

    // Tenant isolation: the call targets THIS project's workspace, not a shared/global path.
    expect(String(searchCall![0])).toBe('https://runtime.example.com/workspaces/ws-tenant-7/files/search');
    expect(searchCall![1]?.method).toBe('POST');
    expect((searchCall![1]?.headers as Headers).get('authorization')).toBe('Bearer token-search');

    // Every search toggle is forwarded to the backend that actually applies it.
    expect(JSON.parse(String(searchCall![1]?.body))).toEqual({
      query: 'Widget',
      options: {
        caseSensitive: true,
        isRegex: false,
        includes: ['**/*'],
        excludes: ['**/node_modules/**'],
        resultLimit: 500,
      },
    });
  });

  it('forwards the regex toggle and returns regex content matches from the runtime endpoint', async () => {
    const fetchMock = createFetchMock();

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token',
      workspaceId: 'ws-1',
      fetchImpl: fetchMock as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    const results = await adapter.searchFiles('v[0-9]+', { isRegex: true });

    expect(results).toEqual([
      { path: 'src/api.ts', lineNumber: 3, line: 'const route = "/v2/users";', startColumn: 20, endColumn: 22 },
    ]);

    const searchCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/files/search'));
    expect(JSON.parse(String(searchCall![1]?.body)).options.isRegex).toBe(true);
  });

  it('returns an empty result set (no-results state) without throwing when the runtime finds nothing', async () => {
    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token',
      workspaceId: 'ws-1',
      fetchImpl: createFetchMock() as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    await expect(adapter.searchFiles('__none__')).resolves.toEqual([]);
  });

  it('refuses to search before a workspace is bound (no cross-tenant / global search)', async () => {
    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token',
      fetchImpl: createFetchMock() as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    await expect(adapter.searchFiles('anything')).rejects.toThrow(/workspace has not been started/i);
  });

  it('grows the file-watch reconnect backoff when the socket opens then immediately closes (no 1s flood)', async () => {
    /*
     * Regression: a watch socket that the server accepts then closes within the
     * stability window (post-upgrade auth failure / GC'd workspace) used to reset
     * `attempts` to 0 on every open, reconnecting every ~1s forever — the prod
     * WebSocket CLOSING/CLOSED flood. The backoff must keep growing instead.
     */
    vi.useFakeTimers();

    try {
      FakeWebSocket.instances = [];

      const adapter = new RemoteKubernetesRuntimeAdapter({
        baseUrl: 'https://runtime.example.com',
        authToken: 'token-789',
        workspaceId: 'ws-1',
        fetchImpl: createFetchMock() as typeof fetch,
        WebSocketImpl: FakeWebSocket,
      });

      const stop = await adapter.watchFiles(['src'], () => {});
      expect(FakeWebSocket.instances.length).toBe(1);

      // Socket #1 opened; close it well before the 5s stability window.
      FakeWebSocket.instances.at(-1)!.close(1006);

      // First reconnect lands at ~1s.
      await vi.advanceTimersByTimeAsync(1000);
      expect(FakeWebSocket.instances.length).toBe(2);

      // Socket #2 also closes immediately — the next reconnect must NOT be at +1s.
      FakeWebSocket.instances.at(-1)!.close(1006);
      await vi.advanceTimersByTimeAsync(1000);
      expect(FakeWebSocket.instances.length).toBe(2); // backoff grew past 1s

      // It reconnects once the grown (~2s) backoff elapses.
      await vi.advanceTimersByTimeAsync(1000);
      expect(FakeWebSocket.instances.length).toBe(3);

      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up reconnecting a watch socket after a bounded number of never-stable attempts (no infinite auth-close flood)', async () => {
    /*
     * Regression: #watchSocket reconnected FOREVER. An expired/revoked session
     * (every reconnect opens with no token and 4401-closes) or a permanently-gone
     * workspace flapped every ≤15s for the whole page lifetime — the thousands of
     * files/watch + ports/watch "WebSocket CLOSING/CLOSED" errors reported in the
     * IDE. The reconnect must give up once the socket never holds long enough to
     * prove stable. A socket that DOES stabilise resets the counter (covered by
     * the backoff test above), so a healthy session is unaffected.
     */
    vi.useFakeTimers();

    try {
      FakeWebSocket.instances = [];
      FakeWebSocket.failNextOpenCount = 0;
      FakeWebSocket.authCloseNextOpenCount = 0;

      const adapter = new RemoteKubernetesRuntimeAdapter({
        baseUrl: 'https://runtime.example.com',
        authToken: 'token-cap',
        workspaceId: 'ws-1',
        fetchImpl: createFetchMock() as typeof fetch,
        WebSocketImpl: FakeWebSocket,
      });

      const stop = await adapter.watchPorts(() => {});
      expect(FakeWebSocket.instances.length).toBe(1);

      /*
       * Close every socket the instant it opens — well inside the 5s stability
       * window — so `attempts` only ever climbs toward the cap and never resets.
       */
      let prevLen = FakeWebSocket.instances.length;
      FakeWebSocket.instances.at(-1)!.close(1006);

      for (let i = 0; i < 200; i += 1) {
        await vi.advanceTimersByTimeAsync(2000);

        const len = FakeWebSocket.instances.length;

        if (len > prevLen) {
          prevLen = len;
          FakeWebSocket.instances.at(-1)!.close(1006);
        }
      }

      // 1 initial connect + 15 bounded reconnects, then it stops — NOT unbounded.
      expect(FakeWebSocket.instances.length).toBe(16);

      // Advancing far past every backoff window spawns no further sockets: flood over.
      await vi.advanceTimersByTimeAsync(120_000);
      expect(FakeWebSocket.instances.length).toBe(16);

      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('supports terminal, file watch, and log WebSockets with realistic messages', async () => {
    FakeWebSocket.instances = [];

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: () => 'token-456',
      workspaceId: 'ws-1',
      fetchImpl: createFetchMock() as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    const terminal = await adapter.openTerminal({ terminal: { cols: 120, rows: 40 } });
    terminal.write('pnpm test\n');
    await terminal.resize(100, 30);

    const terminalSocket = FakeWebSocket.instances[0];
    expect(terminalSocket.url).toContain('wss://runtime.example.com/workspaces/ws-1/terminal');
    expect(terminalSocket.url).toContain('token=token-456');
    expect(terminalSocket.sent).toContain(JSON.stringify({ type: 'stdin', data: 'pnpm test\n' }));
    expect(terminalSocket.sent).toContain(JSON.stringify({ type: 'resize', cols: 100, rows: 30 }));

    const changes: string[] = [];
    const stopWatching = await adapter.watchFiles(['src'], (change) => changes.push(`${change.type}:${change.path}`));
    FakeWebSocket.instances[1].emit('message', { data: JSON.stringify({ type: 'update', path: 'src/App.tsx' }) });
    stopWatching();
    expect(changes).toEqual(['update:src/App.tsx']);

    const logs: string[] = [];
    const stopLogs = await adapter.watchLogs((event) => logs.push(event.data ?? ''));
    FakeWebSocket.instances[2].emit('message', {
      data: JSON.stringify({ type: 'stdout', data: 'server ready', timestamp: 'now' }),
    });
    stopLogs();
    expect(logs).toEqual(['server ready']);
  });

  it('marks the managed shell with managed=1 so the API skips the terminals.concurrent quota', async () => {
    FakeWebSocket.instances = [];

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: () => 'token-456',
      workspaceId: 'ws-1',
      fetchImpl: createFetchMock() as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    // A user-opened terminal must NOT carry the managed flag (it stays metered).
    await adapter.openTerminal({ terminal: { cols: 80, rows: 24 } });
    expect(FakeWebSocket.instances[0].url).not.toContain('managed=1');

    // The IDE's always-on managed shell carries managed=1 so it is not charged
    // against terminals.concurrent (otherwise free-tier limit 1 flaps forever).
    await adapter.openTerminal({ terminal: { cols: 80, rows: 24 }, managed: true });
    expect(FakeWebSocket.instances[1].url).toContain('&managed=1');
  });

  it('reconnects watch sockets and terminal sockets after disconnects', async () => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    FakeWebSocket.failNextOpenCount = 0;

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token-reconnect',
      workspaceId: 'ws-1',
      fetchImpl: createFetchMock() as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    try {
      const changes: string[] = [];
      const stopWatching = await adapter.watchFiles(['src'], (change) => changes.push(`${change.type}:${change.path}`));
      FakeWebSocket.instances[0].emit('close', {});
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
      FakeWebSocket.instances[1].emit('message', { data: JSON.stringify({ type: 'update', path: 'src/App.tsx' }) });
      stopWatching();

      expect(changes).toEqual(['update:src/App.tsx']);

      const terminal = await adapter.openTerminal();
      const firstTerminalSocket = FakeWebSocket.instances.at(-1)!;
      firstTerminalSocket.emit('close', {});
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
      terminal.write('echo after reconnect\n');
      expect(FakeWebSocket.instances.at(-1)!.sent).toContain(
        JSON.stringify({ type: 'stdin', data: 'echo after reconnect\n' }),
      );
      terminal.kill();
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries a few times on WORKSPACE_NOT_STARTED then halts the flap (no infinite reconnect)', async () => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    FakeWebSocket.failNextOpenCount = 0;

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token-notstarted',
      workspaceId: 'ws-1',
      fetchImpl: createFetchMock() as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    const notStarted = () =>
      JSON.stringify({
        type: 'error',
        error: { message: 'Workspace is not running. Click Run to start it.', code: 'WORKSPACE_NOT_STARTED' },
      });

    try {
      await adapter.openTerminal();
      expect(FakeWebSocket.instances).toHaveLength(1);

      /*
       * First WORKSPACE_NOT_STARTED → does NOT halt (the workspace may be cold-starting),
       * so it reconnects (a new socket appears) rather than giving up immediately.
       */
      const first = FakeWebSocket.instances.at(-1)!;
      first.emit('message', { data: notStarted() });
      first.emit('close', {});
      await vi.advanceTimersByTimeAsync(2_000);
      await Promise.resolve();
      expect(FakeWebSocket.instances.length).toBeGreaterThan(1);

      // Keep replying NOT_STARTED across cycles: eventually it exhausts the budget and HALTS.
      for (let i = 0; i < 10; i += 1) {
        const sock = FakeWebSocket.instances.at(-1)!;
        sock.emit('message', { data: notStarted() });
        sock.emit('close', {});
        await vi.advanceTimersByTimeAsync(10_000);
        await Promise.resolve();
      }

      const stableCount = FakeWebSocket.instances.length;

      // Well past the max backoff: no further reconnects — the flap is bounded, not infinite.
      await vi.advanceTimersByTimeAsync(60_000);
      await Promise.resolve();
      expect(FakeWebSocket.instances.length).toBe(stableCount);
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses exponential backoff for repeated watch and terminal WebSocket reconnect failures', async () => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    FakeWebSocket.failNextOpenCount = 2;

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token-backoff',
      workspaceId: 'ws-1',
      fetchImpl: createFetchMock() as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    try {
      const changes: string[] = [];
      const stopWatching = await adapter.watchFiles(['src'], (change) => changes.push(`${change.type}:${change.path}`));

      expect(FakeWebSocket.instances).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(999);
      expect(FakeWebSocket.instances).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      expect(FakeWebSocket.instances).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1_999);
      expect(FakeWebSocket.instances).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      expect(FakeWebSocket.instances).toHaveLength(3);

      FakeWebSocket.instances[2].emit('message', { data: JSON.stringify({ type: 'update', path: 'src/App.tsx' }) });
      expect(changes).toEqual(['update:src/App.tsx']);
      stopWatching();

      FakeWebSocket.instances = [];
      FakeWebSocket.failNextOpenCount = 0;

      const terminal = await adapter.openTerminal();
      expect(FakeWebSocket.instances).toHaveLength(1);
      FakeWebSocket.failNextOpenCount = 2;
      FakeWebSocket.instances[0].emit('close', {});

      await vi.advanceTimersByTimeAsync(999);
      expect(FakeWebSocket.instances).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      expect(FakeWebSocket.instances).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1_999);
      expect(FakeWebSocket.instances).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      expect(FakeWebSocket.instances).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(3_999);
      expect(FakeWebSocket.instances).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      expect(FakeWebSocket.instances).toHaveLength(4);

      terminal.write('echo recovered\n');
      expect(FakeWebSocket.instances[3].sent).toContain(JSON.stringify({ type: 'stdin', data: 'echo recovered\n' }));
      terminal.kill();
    } finally {
      FakeWebSocket.failNextOpenCount = 0;
      vi.useRealTimers();
    }
  });

  it('streams command output, delivers empty frames, and terminates on exit without a socket close', async () => {
    FakeWebSocket.instances = [];

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token-stream',
      workspaceId: 'ws-1',
      fetchImpl: createFetchMock() as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    const events: Array<{ type: string; data?: string }> = [];

    const drained = (async () => {
      for await (const event of adapter.streamCommand({ command: 'echo', args: ['hi'] })) {
        events.push(event as { type: string; data?: string });
      }
    })();

    /*
     * Let #openSocket resolve (open is emitted on a microtask) and the generator register
     * its message listener before we push frames.
     */
    for (let i = 0; i < 5 && FakeWebSocket.instances.length === 0; i += 1) {
      await Promise.resolve();
    }

    const socket = FakeWebSocket.instances.at(-1)!;

    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }

    // An empty-string (falsy) stdout frame must still be delivered, not dropped.
    socket.emit('message', { data: JSON.stringify({ type: 'stdout', data: '', timestamp: 'now' }) });
    socket.emit('message', { data: JSON.stringify({ type: 'stdout', data: 'hi', timestamp: 'now' }) });
    socket.emit('message', { data: 'not-json' }); // malformed frame must be ignored, not throw
    socket.emit('message', { data: JSON.stringify({ type: 'exit', exitCode: 0, timestamp: 'now' }) });

    /*
     * Resolves because the `exit` event closes the queue — even though the socket is never
     * closed by the server.
     */
    await drained;

    expect(events.map((event) => event.type)).toEqual(['stdout', 'stdout', 'exit']);
    expect(events[0].data).toBe('');
  });

  it('surfaces workspace start failures and quota exceeded responses', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/workspaces')) {
        return new Response('quota exceeded', { status: 402 });
      }

      return new Response(null, { status: 204 });
    });
    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token-789',
      fetchImpl: fetchMock as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    await expect(adapter.startWorkspace({ id: 'project_1' })).rejects.toMatchObject({
      code: 'REMOTE_RUNTIME_REQUEST_FAILED',
      status: 402,
    });
  });

  it('retries an idempotent read through a transient agent 502 (cold-start / restart window)', async () => {
    let readAttempts = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/files/read')) {
        readAttempts += 1;

        /*
         * The agent pod is momentarily unreachable for the first two attempts
         * (e.g. restarting after a liveness kill), then recovers.
         */
        if (readAttempts < 3) {
          return new Response('bad gateway', { status: 502 });
        }

        return Response.json({ content: 'recovered' });
      }

      return Response.json([]);
    });

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token-retry',
      workspaceId: 'ws-1',
      fetchImpl: fetchMock as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    await expect(adapter.readFile('src/App.tsx')).resolves.toMatchObject({ content: 'recovered' });
    expect(readAttempts).toBe(3);
  });

  it('forwards the agent encoding so binary reads are base64 and text reads are utf8', async () => {
    const pngBase64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]).toString('base64');

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/files/read') && url.includes('logo.png')) {
        return Response.json({ content: pngBase64, encoding: 'base64' });
      }

      if (url.includes('/files/read')) {
        return Response.json({ content: 'export default null;', encoding: 'utf8' });
      }

      return Response.json([]);
    });

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token-bin',
      workspaceId: 'ws-1',
      fetchImpl: fetchMock as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    await expect(adapter.readFile('assets/logo.png')).resolves.toEqual({ content: pngBase64, encoding: 'base64' });
    await expect(adapter.readFile('src/App.tsx')).resolves.toEqual({
      content: 'export default null;',
      encoding: 'utf8',
    });
  });

  it('does not retry a non-transient read failure (4xx surfaces immediately)', async () => {
    let readAttempts = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/files/read')) {
        readAttempts += 1;
        return new Response('not found', { status: 404 });
      }

      return Response.json([]);
    });

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token-retry',
      workspaceId: 'ws-1',
      fetchImpl: fetchMock as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    await expect(adapter.readFile('missing.tsx')).rejects.toMatchObject({ status: 404 });
    expect(readAttempts).toBe(1);
  });

  it('invalidates the runtime token and retries once on a 401, self-healing a rejected/rotated token', async () => {
    let attempts = 0;
    let currentToken = 'stale-token';

    const invalidateAuthToken = vi.fn(() => {
      currentToken = 'fresh-token';
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes('/files/read')) {
        attempts += 1;

        const auth = (init?.headers as Headers).get('authorization');

        // The first call still carries the stale (server-rejected) token → 401.
        if (auth === 'Bearer stale-token') {
          return new Response('unauthorized', { status: 401 });
        }

        return Response.json({ content: 'recovered' });
      }

      return Response.json([]);
    });

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: () => currentToken,
      invalidateAuthToken,
      workspaceId: 'ws-1',
      fetchImpl: fetchMock as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    await expect(adapter.readFile('src/App.tsx')).resolves.toMatchObject({ content: 'recovered' });
    expect(invalidateAuthToken).toHaveBeenCalledTimes(1);
    expect(attempts).toBe(2);
  });

  it('does not loop forever when the refreshed token is also rejected (single 401 retry)', async () => {
    let attempts = 0;

    const invalidateAuthToken = vi.fn();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/files/read')) {
        attempts += 1;
        return new Response('unauthorized', { status: 401 });
      }

      return Response.json([]);
    });

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token',
      invalidateAuthToken,
      workspaceId: 'ws-1',
      fetchImpl: fetchMock as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    await expect(adapter.readFile('src/App.tsx')).rejects.toMatchObject({ status: 401 });
    expect(invalidateAuthToken).toHaveBeenCalledTimes(1);

    // One original attempt + exactly one retry after the refresh — not an infinite loop.
    expect(attempts).toBe(2);
  });

  it('does not retry a 401 when no invalidate hook is wired (static token cannot refresh)', async () => {
    let attempts = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/files/read')) {
        attempts += 1;
        return new Response('unauthorized', { status: 401 });
      }

      return Response.json([]);
    });

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token',
      workspaceId: 'ws-1',
      fetchImpl: fetchMock as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    await expect(adapter.readFile('src/App.tsx')).rejects.toMatchObject({ status: 401 });
    expect(attempts).toBe(1);
  });

  it('self-heals a WebSocket auth-close (4401) by invalidating the token and reconnecting once', async () => {
    FakeWebSocket.instances = [];
    FakeWebSocket.failNextOpenCount = 0;
    FakeWebSocket.authCloseNextOpenCount = 1;

    let currentToken = 'stale-socket-token';

    const invalidateAuthToken = vi.fn(() => {
      currentToken = 'fresh-socket-token';
    });

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: () => currentToken,
      invalidateAuthToken,
      workspaceId: 'ws-1',
      fetchImpl: createFetchMock() as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    const terminal = await adapter.openTerminal();

    // First socket got an auth close, so a second one was opened after the refresh.
    expect(invalidateAuthToken).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances.length).toBe(2);
    expect(FakeWebSocket.instances.at(-1)!.url).toContain('token=fresh-socket-token');

    terminal.kill();
    FakeWebSocket.authCloseNextOpenCount = 0;
  });

  it('shouldRefreshAuthToken only refreshes once, on a 401, when a hook is available', () => {
    expect(shouldRefreshAuthToken(401, 0, true)).toBe(true);

    // Already retried once.
    expect(shouldRefreshAuthToken(401, 1, true)).toBe(false);

    // Non-auth status.
    expect(shouldRefreshAuthToken(502, 0, true)).toBe(false);
    expect(shouldRefreshAuthToken(403, 0, true)).toBe(false);

    // No refresh hook (static token).
    expect(shouldRefreshAuthToken(401, 0, false)).toBe(false);
  });

  it('isAuthSocketClose recognises 4401/1008 auth closes and ignores ordinary closes', () => {
    expect(isAuthSocketClose(4401)).toBe(true);
    expect(isAuthSocketClose(1008)).toBe(true);
    expect(isAuthSocketClose(1006)).toBe(false);
    expect(isAuthSocketClose(1000)).toBe(false);
    expect(isAuthSocketClose(undefined)).toBe(false);
  });
});

/*
 * BUG-AGENT-001 — amplification d'écritures.
 *
 * Mesuré en direct : 144 `PUT …/files/write` pour 5 fichiers sur UNE génération,
 * dont `tsconfig.json` 28 fois pour une SEULE taille de contenu. Une première
 * garde posée sur l'ActionRunner n'a rien changé (144 avant, 144 après) : les
 * écritures redondantes ne partagent pas le même runner. L'adaptateur est le
 * seul point de passage obligé.
 *
 * On compte donc les requêtes réellement émises, pas la forme du code.
 */
describe('BUG-AGENT-001 — writeFile ne repart sur le réseau que sur changement réel', () => {
  const writesOf = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls.filter(([url]) => String(url).includes('/files/write'));

  function makeAdapter() {
    const fetchMock = createFetchMock() as unknown as ReturnType<typeof vi.fn>;
    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token',
      workspaceId: 'ws-1',
      fetchImpl: fetchMock as unknown as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    return { adapter, fetchMock };
  }

  it('vingt écritures identiques ne produisent QU_UNE requête', async () => {
    const { adapter, fetchMock } = makeAdapter();

    for (let i = 0; i < 20; i++) {
      await adapter.writeFile('tsconfig.json', '{"compilerOptions":{}}');
    }

    expect(writesOf(fetchMock)).toHaveLength(1);
  });

  it('tout changement de contenu passe — sinon on perd le fichier', async () => {
    const { adapter, fetchMock } = makeAdapter();

    await adapter.writeFile('package.json', '{"name":"a"}');
    await adapter.writeFile('package.json', '{"name":"a"}');
    await adapter.writeFile('package.json', '{"name":"a","deps":{}}');

    expect(writesOf(fetchMock)).toHaveLength(2);
  });

  it('un retour au contenu précédent est bien réécrit (A → B → A)', async () => {
    const { adapter, fetchMock } = makeAdapter();

    await adapter.writeFile('src/App.tsx', 'AAA');
    await adapter.writeFile('src/App.tsx', 'BBB');
    await adapter.writeFile('src/App.tsx', 'AAA');

    const bodies = writesOf(fetchMock).map(([, init]) => JSON.parse(String((init as RequestInit).body)).content);
    expect(bodies).toEqual(['AAA', 'BBB', 'AAA']);
  });

  it('une commande shell invalide le mémo — elle a pu toucher le disque', async () => {
    const { adapter, fetchMock } = makeAdapter();

    await adapter.writeFile('src/App.tsx', 'AAA');
    await adapter.runCommand({ command: 'rm -f src/App.tsx' } as never).catch(() => undefined);
    await adapter.writeFile('src/App.tsx', 'AAA');

    expect(writesOf(fetchMock)).toHaveLength(2);
  });

  it('deux chemins différents ne se masquent pas', async () => {
    const { adapter, fetchMock } = makeAdapter();

    await adapter.writeFile('a.ts', 'X');
    await adapter.writeFile('b.ts', 'X');

    expect(writesOf(fetchMock)).toHaveLength(2);
  });
});

/*
 * BUG-AGENT-006 + BUG-AGENT-002 — un workspace pas encore prêt ne doit pas
 * déclencher une rafale.
 *
 * Mesuré en direct le 21/08 : une génération de 15 min a produit 468
 * `PUT …/files/write`, dont 468 réponses `425 Too Early` et AUCUN succès. Le
 * budget de tentatives (4 essais, 250/500/750 ms) expirait en ~1,5 s alors
 * qu'un workspace met des dizaines de secondes, et chaque action ré-émise
 * repartait pour sa propre rafale.
 *
 * On compte donc les requêtes RÉELLEMENT émises, avec des timers simulés pour
 * ne pas attendre le backoff en vrai.
 */
describe('BUG-AGENT-006/002 — 425 Too Early : backoff, Retry-After et attente partagée', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function adapterWith(handler: (url: string, init?: RequestInit) => Response) {
    const base = createFetchMock() as unknown as ReturnType<typeof vi.fn>;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes('/files/write')) {
        return handler(url, init);
      }

      return base(input, init);
    });

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token',
      workspaceId: 'ws-1',
      fetchImpl: fetchMock as unknown as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    const writes = () => fetchMock.mock.calls.filter(([u]) => String(u).includes('/files/write'));

    return { adapter, writes };
  }

  it('un 425 persistant finit par abandonner, sans marteler', async () => {
    vi.useFakeTimers();

    const { adapter, writes } = adapterWith(() => new Response('{"code":"WORKSPACE_NOT_READY"}', { status: 425 }));

    const pending = adapter.writeFile('src/App.tsx', 'x').catch(() => 'rejeté');
    await vi.runAllTimersAsync();

    expect(await pending).toBe('rejeté');

    /*
     * Le point du ticket : un nombre BORNÉ de tentatives. 468 en 15 min était
     * le symptôme ; ici on veut une poignée.
     */
    expect(writes().length).toBe(7);
    expect(writes().length).toBeGreaterThan(1);
  });

  it('aboutit dès que le workspace devient prêt', async () => {
    vi.useFakeTimers();

    let calls = 0;
    const { adapter, writes } = adapterWith(() => {
      calls += 1;
      return calls < 3 ? new Response('{}', { status: 425 }) : new Response(null, { status: 204 });
    });

    const pending = adapter.writeFile('src/App.tsx', 'x');
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBeUndefined();

    expect(writes()).toHaveLength(3);
  });

  it('chaque fichier reste borné à son budget — pas de martèlement', async () => {
    vi.useFakeTimers();

    const { adapter, writes } = adapterWith(() => new Response('{}', { status: 425 }));

    const all = Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => adapter.writeFile(`src/f${i}.ts`, `contenu ${i}`)),
    );
    await vi.runAllTimersAsync();
    await all;

    /*
     * 10 fichiers × 7 tentatives = 70, et ça s'ARRÊTE là. Le symptôme mesuré
     * était 468 écritures qui montaient encore après 15 min, parce que chaque
     * action échouait en ~1,5 s et repartait aussitôt. Ici chaque fichier occupe
     * ~35 s de backoff avant d'abandonner proprement.
     */
    expect(writes()).toHaveLength(70);
  });

  it('respecte Retry-After quand le serveur en fournit un', async () => {
    vi.useFakeTimers();

    const { adapter, writes } = adapterWith(
      () => new Response('{}', { status: 425, headers: { 'retry-after': '2' } }),
    );

    const pending = adapter.writeFile('src/App.tsx', 'x').catch(() => 'rejeté');

    // avant le délai annoncé, aucune nouvelle tentative
    await vi.advanceTimersByTimeAsync(500);

    const early = writes().length;
    await vi.runAllTimersAsync();
    await pending;

    expect(early).toBeLessThan(writes().length);
  });
});

/*
 * BUG-AGENT-006 — un `425 WORKSPACE_NOT_STARTED` doit PROVISIONNER, pas
 * seulement retenter.
 *
 * Mesuré en direct le 21/08 : 468 écritures en `425` sur 15 min et **zéro
 * `POST /workspaces`** sur toute la fenêtre. Personne ne créait le pod ; le
 * client retentait contre un workspace inexistant et le projet restait vide.
 */
describe('BUG-AGENT-006 — 425 WORKSPACE_NOT_STARTED déclenche le provisionnement', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('émet un POST /workspaces puis aboutit une fois le pod prêt', async () => {
    vi.useFakeTimers();

    let notStarted = 2;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes('/files/write')) {
        if (notStarted > 0) {
          notStarted -= 1;
          return new Response('{"code":"WORKSPACE_NOT_STARTED"}', { status: 425 });
        }

        return new Response(null, { status: 204 });
      }

      if (url.endsWith('/workspaces') && init?.method === 'POST') {
        return Response.json({
          id: 'ws-1',
          runtimeMode: 'remote-kubernetes',
          status: 'running',
          workdir: '/workspace',
          createdAt: '2026-04-28T00:00:00.000Z',
          updatedAt: '2026-04-28T00:00:00.000Z',
        });
      }

      if (url.includes('/status')) {
        return Response.json({ id: 'ws-1', status: 'running', workdir: '/workspace' });
      }

      return new Response(null, { status: 204 });
    });

    const adapter = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'token',
      workspaceId: 'ws-1',
      fetchImpl: fetchMock as unknown as typeof fetch,
      WebSocketImpl: FakeWebSocket,
    });

    const pending = adapter.writeFile('src/App.tsx', 'contenu');
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBeUndefined();

    const provisions = fetchMock.mock.calls.filter(
      ([u, i]) => String(u).endsWith('/workspaces') && (i as RequestInit | undefined)?.method === 'POST',
    );

    // le point du ticket : au moins UN provisionnement a été demandé
    expect(provisions.length).toBeGreaterThanOrEqual(1);
  });
})
