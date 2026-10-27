import { createServer, type Server, type ServerResponse } from 'node:http';
import { hashPassword } from '@vibecore/auth';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
// eslint-disable-next-line no-restricted-imports -- Node API tests cannot resolve the web-only ~/ alias.
import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

describe('runtime logs HTTP snapshot and real WebSocket replay', () => {
  let app: Awaited<ReturnType<typeof buildApiApp>>;
  let manager: Server;
  let baseUrl: string;
  let workspaceId: string;

  const originalTime = '2026-10-27T14:00:00.123456789Z';

  let lines = [`${originalTime} preview.proxy.unreachable fetch failed`, 'legacy unknown time'];

  const sockets: WebSocket[] = [];

  let deferManager = false;
  let managerCalls = 0;

  const pendingResponses: ServerResponse[] = [];

  const releaseManager = () => {
    deferManager = false;

    for (const response of pendingResponses.splice(0)) {
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ logs: lines }));
    }
  };
  beforeAll(async () => {
    manager = createServer((_request, response) => {
      managerCalls += 1;

      if (deferManager) {
        pendingResponses.push(response);
        return;
      }

      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ logs: lines }));
    });
    await new Promise<void>((resolve) => manager.listen(0, '127.0.0.1', resolve));

    const address = manager.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing fixture address');
    }

    vi.stubEnv('WORKSPACE_MANAGER_URL', `http://127.0.0.1:${address.port}`);
    vi.stubEnv('DB_ROLLBACK_ENABLED', 'false');

    const store = new TestApiStore();

    const user = await store.createUser({
      email: 'logs@example.test',
      name: 'Fixture',
      passwordHash: hashPassword('fixture-password'),
    });

    const org = await store.createOrganization({ name: 'Fixture', slug: 'log-fixture', ownerUserId: user.id });
    await store.createSession({
      userId: user.id,
      token: 'log-session-fixture',
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    await store.upsertSubscription({ organizationId: org.id, planKey: 'team', status: 'ACTIVE' });

    const project = await store.createProject({ organizationId: org.id, name: 'Fixture', slug: 'logs' });
    workspaceId = (
      await store.createWorkspace({ projectId: project.id, name: 'Fixture', runtimeMode: 'remote-kubernetes' })
    ).id;
    app = await buildApiApp({ store });
    baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  });
  afterAll(async () => {
    releaseManager();

    for (const socket of sockets) {
      socket.terminate();
    }
    await app?.close();
    await new Promise<void>((resolve) => manager.close(() => resolve()));
    vi.unstubAllEnvs();
  });

  const connect = () => {
    const received: any[] = [];

    const socket = new WebSocket(`${baseUrl.replace('http:', 'ws:')}/api/runtime/workspaces/${workspaceId}/logs`, {
      headers: { authorization: 'Bearer log-session-fixture' },
    });
    sockets.push(socket);
    socket.on('message', (data) => received.push(JSON.parse(data.toString())));

    return { socket, received };
  };
  it('keeps source time and identity through snapshot, reconnect and a constant-size sliding window', async () => {
    const snapshot = await app.inject({
      method: 'GET',
      url: `/api/runtime/workspaces/${workspaceId}/logs/snapshot`,
      headers: { authorization: 'Bearer log-session-fixture' },
    });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.json().logs[0]).toMatchObject({
      timestamp: originalTime,
      message: 'preview.proxy.unreachable fetch failed',
      timestampSource: 'source',
    });
    expect(snapshot.json().logs[1]).toMatchObject({
      timestamp: '',
      timestampSource: 'unknown',
      message: 'legacy unknown time',
    });

    const first = connect();
    await vi.waitFor(() => expect(first.received).toHaveLength(2));
    first.socket.close();

    const second = connect();
    await vi.waitFor(() => expect(second.received).toHaveLength(2));
    expect(second.received[0].eventId).toBe(first.received[0].eventId);
    expect(second.received[0].eventId).toBe(snapshot.json().logs[0].eventId);
    expect(second.received[0].timestamp).toBe(originalTime);
    expect(second.received[1].timestamp).toBe('');
    lines = [`${originalTime} preview.proxy.unreachable fetch failed`, '2026-10-27T15:03:00.000000001Z new event'];
    await vi.waitFor(() => expect(second.received).toHaveLength(3), { timeout: 5000 });
    expect(second.received[2].data).toBe('new event');

    const closed = new Promise<void>((resolve) => second.socket.once('close', () => resolve()));
    second.socket.close();
    await closed;
  });
  it('stops when the socket closes during the first deferred manager read', async () => {
    deferManager = true;

    const connection = connect();

    try {
      await vi.waitFor(() => expect(pendingResponses).toHaveLength(1));

      const closed = new Promise<void>((resolve) => connection.socket.once('close', () => resolve()));
      connection.socket.close();
      await closed;

      const calls = managerCalls;
      releaseManager();
      await new Promise((resolve) => setTimeout(resolve, 3200));
      expect(managerCalls).toBe(calls);
      expect(connection.received).toEqual([]);
    } finally {
      releaseManager();
      connection.socket.terminate();
    }
  });

  it('does not overlap polls slower than three seconds or deliver their late result after close', async () => {
    const connection = connect();

    try {
      await vi.waitFor(() => expect(connection.received).toHaveLength(lines.length));
      deferManager = true;
      await vi.waitFor(() => expect(pendingResponses).toHaveLength(1), { timeout: 5000 });

      const calls = managerCalls;
      await new Promise((resolve) => setTimeout(resolve, 3200));
      expect(managerCalls).toBe(calls);
      expect(pendingResponses).toHaveLength(1);

      const count = connection.received.length;
      const closed = new Promise<void>((resolve) => connection.socket.once('close', () => resolve()));
      connection.socket.close();
      await closed;
      lines = ['2026-10-27T15:04:00Z late result'];
      releaseManager();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(connection.received).toHaveLength(count);
    } finally {
      releaseManager();
      connection.socket.terminate();
    }
  });
});
