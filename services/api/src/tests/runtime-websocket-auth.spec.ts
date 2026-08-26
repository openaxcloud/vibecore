import { hashToken } from '@vibecore/auth';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApiApp } from '../app.js';
import { runtimeWebSocketProtocols } from '../runtime-websocket-ticket.js';
import { TestApiStore } from './test-api-store.js';

async function registerAndCreateProject(app: Awaited<ReturnType<typeof buildApiApp>>, email: string) {
  const registration = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'password123', name: 'Runtime WS User', organizationName: 'Runtime WS Org' },
  });
  expect(registration.statusCode).toBe(201);

  const auth = registration.json() as { token: string; user: { id: string }; organization: { id: string } };

  const projectResponse = await app.inject({
    method: 'POST',
    url: `/orgs/${auth.organization.id}/projects`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: 'Runtime WS Project' },
  });
  expect(projectResponse.statusCode).toBe(201);

  return { ...auth, projectId: (projectResponse.json() as { project: { id: string } }).project.id };
}

async function mintTicket(
  app: Awaited<ReturnType<typeof buildApiApp>>,
  token: string,
  workspaceId: string,
  endpoint: 'logs' | 'terminal' = 'logs',
) {
  const response = await app.inject({
    method: 'POST',
    url: `/api/runtime/workspaces/${workspaceId}/socket-ticket`,
    headers: { authorization: `Bearer ${token}` },
    payload: { endpoint },
  });
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers.pragma).toBe('no-cache');

  return response.json() as { ticket: string; protocol: string; expiresInSeconds: number };
}

function rejectedUpgrade(url: string, protocols?: string[]): Promise<number> {
  const socket = protocols ? new WebSocket(url, protocols) : new WebSocket(url);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket upgrade did not settle')), 4_000);
    socket.once('unexpected-response', (_request, response) => {
      clearTimeout(timer);
      socket.close();
      resolve(response.statusCode ?? 0);
    });
    socket.once('open', () => {
      clearTimeout(timer);
      socket.close();
      reject(new Error('WebSocket unexpectedly opened'));
    });
    socket.once('error', () => {
      /* `unexpected-response` carries the asserted HTTP status. */
    });
  });
}

describe('runtime WebSocket one-time authentication', () => {
  const previousManagerUrl = process.env.WORKSPACE_MANAGER_URL;

  afterEach(() => {
    if (previousManagerUrl === undefined) {
      delete process.env.WORKSPACE_MANAGER_URL;
    } else {
      process.env.WORKSPACE_MANAGER_URL = previousManagerUrl;
    }
  });

  it('authenticates through a header ticket, never a URL bearer, and rejects replay', async () => {
    process.env.WORKSPACE_MANAGER_URL = 'http://127.0.0.1:1';

    const store = new TestApiStore();
    const logLines: string[] = [];
    const app = await buildApiApp({ store, loggerStream: { write: (line) => logLines.push(line) } });
    const auth = await registerAndCreateProject(app, 'runtime-ws-ticket@example.com');
    const minted = await mintTicket(app, auth.token, auth.projectId);
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const socketUrl = `${address.replace(/^http/, 'ws')}/api/runtime/workspaces/${auth.projectId}/logs`;

    expect(socketUrl).not.toContain(auth.token);
    expect(socketUrl).not.toContain(minted.ticket);
    expect(socketUrl).not.toContain('token=');

    /* Missing/reordered stable protocol is rejected without consuming the ticket. */
    await expect(rejectedUpgrade(socketUrl, [`vibecore.runtime.ticket.${minted.ticket}`])).resolves.toBe(401);
    await expect(
      rejectedUpgrade(socketUrl, [`vibecore.runtime.ticket.${minted.ticket}`, 'vibecore.runtime.v1']),
    ).resolves.toBe(401);

    const socket = new WebSocket(socketUrl, runtimeWebSocketProtocols(minted.ticket));

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('ticketed WebSocket failed to open')), 4_000);
        socket.once('open', () => {
          clearTimeout(timer);
          resolve();
        });
        socket.once('error', reject);
      });
      expect(socket.protocol).toBe('vibecore.runtime.v1');
      socket.close();

      await expect(rejectedUpgrade(socketUrl, runtimeWebSocketProtocols(minted.ticket))).resolves.toBe(401);
      expect(logLines.join('\n')).not.toContain(minted.ticket);
      expect(logLines.join('\n')).not.toContain(auth.token);
    } finally {
      socket.close();
      await app.close();
    }
  });

  it('rejects an expired ticket and a legacy bearer in ?token=', async () => {
    process.env.WORKSPACE_MANAGER_URL = 'http://127.0.0.1:1';

    const store = new TestApiStore();
    const app = await buildApiApp({ store });
    const auth = await registerAndCreateProject(app, 'runtime-ws-expiry@example.com');
    const minted = await mintTicket(app, auth.token, auth.projectId);
    const stored = store.runtimeWebSocketTickets.get(hashToken(minted.ticket));
    expect(stored).toBeDefined();
    stored!.expiresAt = new Date(Date.now() - 1).toISOString();

    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const socketUrl = `${address.replace(/^http/, 'ws')}/api/runtime/workspaces/${auth.projectId}/logs`;

    try {
      await expect(rejectedUpgrade(socketUrl, runtimeWebSocketProtocols(minted.ticket))).resolves.toBe(401);
      await expect(rejectedUpgrade(`${socketUrl}?token=${encodeURIComponent(auth.token)}`)).resolves.toBe(401);
    } finally {
      await app.close();
    }
  });

  it('binds tickets to the authorized workspace and endpoint', async () => {
    process.env.WORKSPACE_MANAGER_URL = 'http://127.0.0.1:1';

    const store = new TestApiStore();
    const app = await buildApiApp({ store });
    const auth = await registerAndCreateProject(app, 'runtime-ws-binding@example.com');
    const minted = await mintTicket(app, auth.token, auth.projectId, 'logs');
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const wrongEndpoint = `${address.replace(/^http/, 'ws')}/api/runtime/workspaces/${auth.projectId}/terminal`;

    try {
      await expect(rejectedUpgrade(wrongEndpoint, runtimeWebSocketProtocols(minted.ticket))).resolves.toBe(401);
    } finally {
      await app.close();
    }
  });

  it('rejects cross-tenant minting and cannot spend a ticket on another tenant workspace', async () => {
    process.env.WORKSPACE_MANAGER_URL = 'http://127.0.0.1:1';

    const store = new TestApiStore();
    const app = await buildApiApp({ store });
    const owner = await registerAndCreateProject(app, 'runtime-ws-owner@example.com');
    const outsider = await registerAndCreateProject(app, 'runtime-ws-outsider@example.com');

    const deniedMint = await app.inject({
      method: 'POST',
      url: `/api/runtime/workspaces/${outsider.projectId}/socket-ticket`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { endpoint: 'logs' },
    });

    /* Deliberate 404 avoids confirming that another tenant's project exists. */
    expect(deniedMint.statusCode).toBe(404);

    const minted = await mintTicket(app, owner.token, owner.projectId);
    const stored = store.runtimeWebSocketTickets.get(hashToken(minted.ticket));
    expect(stored).toMatchObject({
      userId: owner.user.id,
      projectId: owner.projectId,
      workspaceId: owner.projectId,
    });

    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const outsiderUrl = `${address.replace(/^http/, 'ws')}/api/runtime/workspaces/${outsider.projectId}/logs`;
    const ownerUrl = `${address.replace(/^http/, 'ws')}/api/runtime/workspaces/${owner.projectId}/logs`;

    try {
      await expect(rejectedUpgrade(outsiderUrl, runtimeWebSocketProtocols(minted.ticket))).resolves.toBe(401);
      expect(stored?.consumedAt).toBeUndefined();

      const socket = new WebSocket(ownerUrl, runtimeWebSocketProtocols(minted.ticket));
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('owner ticket did not open')), 4_000);
        socket.once('open', () => {
          clearTimeout(timer);
          socket.close();
          resolve();
        });
        socket.once('error', reject);
      });
      expect(stored?.consumedAt).toBeDefined();
    } finally {
      await app.close();
    }
  });
});
