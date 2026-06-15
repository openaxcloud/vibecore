import { describe, expect, it, vi } from 'vitest';
import { RemoteKubernetesRuntimeAdapter, type WebSocketLike } from './index.js';

type FakeWebSocketListener = (event: unknown) => void;

class FakeWebSocket implements WebSocketLike {
  readyState = 1;
  sent: Array<string | ArrayBufferLike | Blob | ArrayBufferView> = [];
  listeners = new Map<string, FakeWebSocketListener[]>();
  static instances: FakeWebSocket[] = [];
  static failNextOpenCount = 0;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
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

  close() {
    this.emit('close', {});
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
      return Response.json({ content: 'hello' });
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

    return Response.json([]);
  });
}

describe('RemoteKubernetesRuntimeAdapter', () => {
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

    expect(await adapter.readFile('a.ts')).toBe('hello');
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

    await expect(adapter.readFile('src/App.tsx')).resolves.toBe('recovered');
    expect(readAttempts).toBe(3);
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
});
