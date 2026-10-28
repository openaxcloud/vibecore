import { createServer, type Server, type ServerResponse } from 'node:http';
import { hashPassword } from '@vibecore/auth';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
// eslint-disable-next-line no-restricted-imports -- Node API tests cannot resolve the web-only ~/ alias.
import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

describe('runtime ports watcher lifecycle', () => {
  let app: Awaited<ReturnType<typeof buildApiApp>>;
  let manager: Server;
  let store: TestApiStore;
  let probeMode = false;
  let probeCalls = 0;
  let baseUrl: string;
  let workspaceId: string;

  const sockets: WebSocket[] = [];

  let deferManager = false;
  let managerCalls = 0;

  const pendingResponses: ServerResponse[] = [];

  const releaseManager = () => {
    deferManager = false;

    for (const response of pendingResponses.splice(0)) {
      response
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ ports: probeMode ? [{ port: 5173 }, { port: 5174 }] : [] }));
    }
  };
  beforeAll(async () => {
    manager = createServer((request, response) => {
      if (request.url?.endsWith('/agent-token')) {
        response.end(JSON.stringify({ token: 'fixture' }));
        return;
      }

      if (request.url?.startsWith('/preview/')) {
        probeCalls += 1;
        pendingResponses.push(response);

        return;
      }

      managerCalls += 1;

      if (deferManager) {
        pendingResponses.push(response);
        return;
      }

      response
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ ports: probeMode ? [{ port: 5173 }, { port: 5174 }] : [] }));
    });
    await new Promise<void>((resolve) => manager.listen(0, '127.0.0.1', resolve));

    const address = manager.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing fixture address');
    }

    vi.stubEnv('WORKSPACE_MANAGER_URL', `http://127.0.0.1:${address.port}`);
    vi.stubEnv('WORKSPACE_AGENT_URL_TEMPLATE', `http://127.0.0.1:${address.port}`);
    vi.stubEnv('DB_ROLLBACK_ENABLED', 'false');

    store = new TestApiStore();

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

    const socket = new WebSocket(
      `${baseUrl.replace('http:', 'ws:')}/api/runtime/workspaces/${workspaceId}/ports/watch`,
      {
        headers: { authorization: 'Bearer log-session-fixture' },
      },
    );
    sockets.push(socket);
    socket.on('message', (data) => received.push(JSON.parse(data.toString())));

    return { socket, received };
  };

  it('does not start polling after closing during authorization', async () => {
    const original = store.getWorkspace.bind(store);

    let releaseAuthorization!: () => void;

    const deferred = new Promise<void>((resolve) => {
      releaseAuthorization = resolve;
    });
    const spy = vi.spyOn(store, 'getWorkspace').mockImplementationOnce(async (id) => {
      await deferred;
      return original(id);
    });

    const calls = managerCalls;
    const connection = connect();

    try {
      await vi.waitFor(() => expect(spy).toHaveBeenCalled());

      const closed = new Promise<void>((resolve) => connection.socket.once('close', () => resolve()));
      connection.socket.close();
      await closed;
      releaseAuthorization();
      await new Promise((resolve) => setTimeout(resolve, 5300));
      expect(managerCalls).toBe(calls);
    } finally {
      releaseAuthorization();
      spy.mockRestore();
      connection.socket.terminate();
    }
  });

  it('does not probe the next port or poll again after closing during a readiness probe', async () => {
    probeMode = true;

    const connection = connect();

    try {
      await vi.waitFor(() => expect(pendingResponses).toHaveLength(1));

      const closed = new Promise<void>((resolve) => connection.socket.once('close', () => resolve()));
      connection.socket.close();
      await closed;

      const calls = managerCalls;
      const probes = probeCalls;
      releaseManager();
      await new Promise((resolve) => setTimeout(resolve, 5300));
      expect(managerCalls).toBe(calls);
      expect(probeCalls).toBe(probes);
      expect(connection.received).toEqual([]);
    } finally {
      probeMode = false;
      releaseManager();
      connection.socket.terminate();
    }
  });

  it('stops when closed during the first pending ports read', async () => {
    deferManager = true;

    const connection = connect();

    try {
      await vi.waitFor(() => expect(pendingResponses).toHaveLength(1));

      const closed = new Promise<void>((resolve) => connection.socket.once('close', () => resolve()));
      connection.socket.close();
      await closed;

      const calls = managerCalls;
      releaseManager();
      await new Promise((resolve) => setTimeout(resolve, 5300));
      expect(managerCalls).toBe(calls);
      expect(connection.received).toEqual([]);
    } finally {
      releaseManager();
      connection.socket.terminate();
    }
  });
  it('does not overlap polls slower than five seconds', async () => {
    const before = managerCalls;
    const connection = connect();

    try {
      await vi.waitFor(() => expect(managerCalls).toBeGreaterThan(before));
      await new Promise((resolve) => setTimeout(resolve, 100));
      deferManager = true;
      await vi.waitFor(() => expect(pendingResponses).toHaveLength(1), { timeout: 6500 });

      const calls = managerCalls;
      await new Promise((resolve) => setTimeout(resolve, 5300));
      expect(managerCalls).toBe(calls);
      expect(pendingResponses).toHaveLength(1);
    } finally {
      connection.socket.terminate();
      await new Promise((resolve) => setTimeout(resolve, 50));
      releaseManager();
    }
  });
});
