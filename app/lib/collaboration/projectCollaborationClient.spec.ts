import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectCollaborationClient, type CollaborationWebSocketLike } from './projectCollaborationClient';

class FakeWebSocket implements CollaborationWebSocketLike {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  listeners = new Map<string, Array<(event: any) => void>>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.emit('close', {});
  }

  addEventListener(type: 'open' | 'message' | 'error' | 'close', listener: (event: any) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string, event: any) {
    if (type === 'open') {
      this.readyState = 1;
    }

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function fetchTicket() {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ websocketUrl: 'ws://api.local/projects/project-1/collaboration/ws?ticket=ticket' }),
  })) as unknown as typeof fetch;
}

describe('ProjectCollaborationClient', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.useRealTimers();
  });

  it('connects with a short-lived ticket and applies realtime collaboration events', async () => {
    const fetchImpl = fetchTicket();

    const client = new ProjectCollaborationClient({
      projectId: 'project-1',
      fetchImpl,
      WebSocketImpl: FakeWebSocket,
      sessionId: 'session-1',
    });

    const snapshots: string[] = [];
    client.subscribe((snapshot) =>
      snapshots.push(`${snapshot.status}:${snapshot.presence.length}:${snapshot.comments.length}`),
    );

    client.connect();
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    expect(fetchImpl).toHaveBeenCalledWith('/api/projects/project-1/collaboration-ws?sessionId=session-1', {
      headers: { accept: 'application/json' },
    });
    FakeWebSocket.instances[0].emit('open', {});
    FakeWebSocket.instances[0].emit('message', {
      data: JSON.stringify({
        type: 'collaboration.ready',
        projectId: 'project-1',
        presence: [{ sessionId: 'session-1', userId: 'user-1' }],
        comments: [],
      }),
    });
    FakeWebSocket.instances[0].emit('message', {
      data: JSON.stringify({
        type: 'comment.create',
        comment: { id: 'comment-1', body: 'Review this', userId: 'user-2' },
      }),
    });

    expect(client.snapshot.status).toBe('connected');
    expect(client.snapshot.presence).toHaveLength(1);
    expect(client.snapshot.comments[0].body).toBe('Review this');
    expect(snapshots).toContain('connected:1:1');
  });

  it('reconnects after a collaboration socket disconnect and resends latest presence', async () => {
    vi.useFakeTimers();

    const client = new ProjectCollaborationClient({
      projectId: 'project-1',
      fetchImpl: fetchTicket(),
      WebSocketImpl: FakeWebSocket,
      sessionId: 'session-1',
      minReconnectDelayMs: 10,
      maxReconnectDelayMs: 10,
    });

    client.connect();
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.instances[0].emit('open', {});
    client.updatePresence({ filePath: 'src/App.tsx', cursor: { line: 4, column: 2 } });
    expect(JSON.parse(FakeWebSocket.instances[0].sent.at(-1)!).payload.filePath).toBe('src/App.tsx');

    FakeWebSocket.instances[0].emit('close', {});
    await vi.advanceTimersByTimeAsync(10);
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    FakeWebSocket.instances[1].emit('open', {});

    expect(JSON.parse(FakeWebSocket.instances[1].sent.at(-1)!).payload).toMatchObject({
      filePath: 'src/App.tsx',
      cursor: { line: 4, column: 2 },
    });
    expect(client.snapshot.status).toBe('connected');
  });
});
