import { describe, expect, it, vi } from 'vitest';
import { RemoteKubernetesRuntimeAdapter, type WebSocketLike } from './index';

class FakeWebSocket implements WebSocketLike {
  readyState = 1;
  sent: Array<string | ArrayBufferLike | Blob | ArrayBufferView> = [];
  listeners = new Map<string, Function[]>();
  static instances: FakeWebSocket[] = [];

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => this.emit('open', {}));
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    this.sent.push(data);
  }

  close() {
    this.emit('close', {});
  }

  addEventListener(type: 'open' | 'message' | 'error' | 'close', listener: (event: any) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(type: 'open' | 'message' | 'error' | 'close', listener: (event: any) => void) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener));
  }

  emit(type: string, event: any) {
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
      return url.endsWith('/patch') ? Response.json([{ path: 'a.ts', type: 'update' }]) : new Response(null, { status: 204 });
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
    await expect(adapter.applyPatch({ operations: [{ type: 'write', path: 'a.ts', content: 'updated' }] })).resolves.toEqual([
      { path: 'a.ts', type: 'update' },
    ]);

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
    FakeWebSocket.instances[2].emit('message', { data: JSON.stringify({ type: 'stdout', data: 'server ready', timestamp: 'now' }) });
    stopLogs();
    expect(logs).toEqual(['server ready']);
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
});
