import { createServer, type Server } from 'node:http';
import { hashPassword } from '@vibecore/auth';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
// eslint-disable-next-line no-restricted-imports
import { buildApiApp } from '../app.js';
// eslint-disable-next-line no-restricted-imports
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  send() {
    return Promise.resolve();
  }
}

const originalManagerUrl = process.env.WORKSPACE_MANAGER_URL;
const originalAgentTemplate = process.env.WORKSPACE_AGENT_URL_TEMPLATE;

afterEach(() => {
  if (originalManagerUrl === undefined) {
    delete process.env.WORKSPACE_MANAGER_URL;
  } else {
    process.env.WORKSPACE_MANAGER_URL = originalManagerUrl;
  }

  if (originalAgentTemplate === undefined) {
    delete process.env.WORKSPACE_AGENT_URL_TEMPLATE;
  } else {
    process.env.WORKSPACE_AGENT_URL_TEMPLATE = originalAgentTemplate;
  }
});

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Test server failed to bind');
  }

  return address.port;
}

async function startRuntime() {
  const upstreamSockets: WebSocket[] = [];

  const agent = createServer((_request, response) => {
    response.writeHead(404).end();
  });

  const watcherServer = new WebSocketServer({ server: agent });
  watcherServer.on('connection', (socket, request) => {
    const url = new URL(request.url ?? '/', 'http://agent.test');

    if (url.pathname !== '/files/watch' || url.searchParams.get('token') !== 'agent-token') {
      socket.close(1008, 'invalid watch request');
      return;
    }

    upstreamSockets.push(socket);
  });

  const agentPort = await listen(agent);

  const manager = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://manager.test');
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify(url.pathname.endsWith('/agent-token') ? { token: 'agent-token' } : { status: 'RUNNING' }),
    );
  });

  const managerPort = await listen(manager);

  process.env.WORKSPACE_MANAGER_URL = `http://127.0.0.1:${managerPort}`;
  process.env.WORKSPACE_AGENT_URL_TEMPLATE = `http://127.0.0.1:${agentPort}`;

  return {
    upstreamSockets,
    async close() {
      for (const socket of upstreamSockets) {
        socket.terminate();
      }

      await new Promise<void>((resolve) => watcherServer.close(() => resolve()));
      await Promise.all(
        [agent, manager].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
      );
    },
  };
}

async function setup() {
  const runtime = await startRuntime();
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

  const owner = await store.createUser({
    email: 'watch-owner@example.com',
    name: 'Watch Owner',
    passwordHash: hashPassword('password123'),
  });
  const organization = await store.createOrganization({
    name: 'Watch Org',
    slug: 'watch-org',
    ownerUserId: owner.id,
  });
  await store.createSession({
    userId: owner.id,
    token: 'watch-token',
    expiresAt: new Date(Date.now() + 3_600_000),
  });

  const project = await store.createProject({ organizationId: organization.id, name: 'Watch', slug: 'watch' });

  const workspace = await store.createWorkspace({
    projectId: project.id,
    name: 'Watch workspace',
    runtimeMode: 'remote-kubernetes',
  });

  await app.listen({ host: '127.0.0.1', port: 0 });

  const address = app.server.address();

  if (!address || typeof address === 'string') {
    throw new Error('API did not bind to a TCP port');
  }

  return { app, store, runtime, project, workspace, apiPort: address.port };
}

async function countPath(store: TestApiStore, projectId: string, workspaceKey: string, path: string) {
  const latest = await store.getLatestFileVersion(projectId, workspaceKey, path);

  return latest ? store.countFileVersions(projectId, workspaceKey, latest.lineageId) : 0;
}

describe('File History native watch proxy', () => {
  it('relays native events and records only bounded UTF-8 file contents with content dedupe', async () => {
    const fixture = await setup();
    const frames: Array<Record<string, unknown>> = [];

    const downstream = new WebSocket(
      `ws://127.0.0.1:${fixture.apiPort}/api/runtime/workspaces/${fixture.workspace.id}/files/watch`,
      { headers: { authorization: 'Bearer watch-token' } },
    );
    downstream.addEventListener('message', (event) => frames.push(JSON.parse(String(event.data))));

    try {
      await new Promise<void>((resolve, reject) => {
        downstream.addEventListener('open', () => resolve(), { once: true });
        downstream.addEventListener('error', () => reject(new Error('API watch WebSocket failed to open')), {
          once: true,
        });
      });
      await expect.poll(() => fixture.runtime.upstreamSockets.length, { timeout: 5_000 }).toBe(1);

      const upstream = fixture.runtime.upstreamSockets[0]!;
      upstream.send(
        JSON.stringify({
          eventId: 'summary-1',
          sessionId: 'watch-session-1',
          path: '.',
          type: 'update',
          sequence: 0,
          timestamp: new Date().toISOString(),
          journal: { truncated: false, droppedEvents: 0, connectionTruncated: false },
          snapshot: { files: 0, bytes: 0, truncated: false },
        }),
      );
      await expect
        .poll(() => fixture.store.getFileHistoryWatchState(fixture.project.id, fixture.workspace.id))
        .toMatchObject({ complete: true, sessionId: 'watch-session-1' });

      upstream.send(
        JSON.stringify({
          eventId: 'event-1',
          sessionId: 'watch-session-1',
          path: 'src/external.ts',
          type: 'create',
          content: 'export const external = 1;\n',
          binary: false,
          initial: true,
          timestamp: new Date().toISOString(),
        }),
      );

      await expect
        .poll(() => frames.find((frame) => frame.eventId === 'event-1'), { timeout: 5_000 })
        .toMatchObject({
          path: 'src/external.ts',
          type: 'create',
          content: 'export const external = 1;\n',
          initial: true,
        });
      await expect
        .poll(() => countPath(fixture.store, fixture.project.id, fixture.workspace.id, 'src/external.ts'))
        .toBe(1);

      /*
       * A second browser watcher/event id observing the same bytes must not add
       * another version; the serialized content-hash check is the final guard.
       */
      upstream.send(
        JSON.stringify({
          eventId: 'event-2',
          sessionId: 'watch-session-1',
          path: 'src/external.ts',
          type: 'update',
          content: 'export const external = 1;\n',
          binary: false,
        }),
      );
      await expect.poll(() => frames.some((frame) => frame.eventId === 'event-2'), { timeout: 5_000 }).toBe(true);
      await expect
        .poll(() => countPath(fixture.store, fixture.project.id, fixture.workspace.id, 'src/external.ts'))
        .toBe(1);

      upstream.send(
        JSON.stringify({
          eventId: 'event-3',
          sessionId: 'watch-session-1',
          path: 'src/external.ts',
          type: 'update',
          content: 'export const external = 2;\n',
          binary: false,
        }),
      );
      await expect.poll(() => frames.some((frame) => frame.eventId === 'event-3'), { timeout: 5_000 }).toBe(true);
      await expect
        .poll(() => countPath(fixture.store, fixture.project.id, fixture.workspace.id, 'src/external.ts'))
        .toBe(2);

      upstream.send(
        JSON.stringify({
          eventId: 'event-delete',
          sessionId: 'watch-session-1',
          path: 'src/external.ts',
          type: 'delete',
        }),
      );
      await expect
        .poll(() => countPath(fixture.store, fixture.project.id, fixture.workspace.id, 'src/external.ts'))
        .toBe(3);
      await expect
        .poll(() => fixture.store.getLatestFileVersion(fixture.project.id, fixture.workspace.id, 'src/external.ts'))
        .toMatchObject({ operation: 'delete', tombstone: true });

      upstream.send(
        JSON.stringify({
          eventId: 'event-binary',
          sessionId: 'watch-session-1',
          path: 'assets/logo.bin',
          type: 'create',
          content: Buffer.from([0, 1, 2]).toString('base64'),
          binary: true,
        }),
      );
      upstream.send(
        JSON.stringify({
          eventId: 'event-internal',
          sessionId: 'watch-session-1',
          path: 'node_modules/pkg/index.js',
          type: 'update',
          content: 'ignored',
          binary: false,
        }),
      );
      upstream.send(
        JSON.stringify({
          eventId: 'event-barrier',
          sessionId: 'watch-session-1',
          path: 'src/barrier.ts',
          type: 'create',
          content: 'barrier',
          binary: false,
        }),
      );
      await expect.poll(() => frames.some((frame) => frame.eventId === 'event-barrier'), { timeout: 5_000 }).toBe(true);
      await expect
        .poll(() => countPath(fixture.store, fixture.project.id, fixture.workspace.id, 'src/barrier.ts'))
        .toBe(1);
      expect(await countPath(fixture.store, fixture.project.id, fixture.workspace.id, 'assets/logo.bin')).toBe(0);
      expect(
        await countPath(fixture.store, fixture.project.id, fixture.workspace.id, 'node_modules/pkg/index.js'),
      ).toBe(0);

      upstream.send(
        JSON.stringify({
          eventId: 'summary-2',
          sessionId: 'watch-session-2',
          path: '.',
          type: 'update',
          sequence: 12,
          timestamp: '2026-07-15T10:00:00.000Z',
          journal: {
            truncated: true,
            droppedEvents: 4,
            oldestSequence: 9,
            latestSequence: 12,
            connectionTruncated: true,
          },
          snapshot: { files: 2, bytes: 42, truncated: true },
        }),
      );
      await expect
        .poll(() => fixture.store.getFileHistoryWatchState(fixture.project.id, fixture.workspace.id))
        .toMatchObject({
          complete: false,
          sessionId: 'watch-session-2',
          droppedEvents: 4,
          snapshotTruncated: true,
          connectionTruncated: true,
          reasons: ['connection_truncated', 'journal_truncated', 'snapshot_truncated', 'watcher_restart'],
        });
    } finally {
      downstream.close();
      await fixture.app.close();
      await fixture.runtime.close();
    }
  }, 20_000);

  it('rejects an unauthenticated downstream WebSocket before opening an agent stream', async () => {
    const fixture = await setup();

    const downstream = new WebSocket(
      `ws://127.0.0.1:${fixture.apiPort}/api/runtime/workspaces/${fixture.workspace.id}/files/watch`,
    );

    try {
      const statusCode = await new Promise<number>((resolve, reject) => {
        downstream.once('unexpected-response', (_request, response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        });
        downstream.once('open', () => reject(new Error('Unauthenticated watch unexpectedly opened')));

        /*
         * ws emits an error after an HTTP upgrade rejection; unexpected-response
         * is the assertion signal, so consume the follow-up error.
         */
        downstream.once('error', () => undefined);
      });

      expect(statusCode).toBe(401);
      expect(fixture.runtime.upstreamSockets).toHaveLength(0);
    } finally {
      downstream.terminate();
      await fixture.app.close();
      await fixture.runtime.close();
    }
  }, 10_000);
});
