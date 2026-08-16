import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import { TestApiStore } from './test-api-store.js';

/*
 * BUG-QUOTA-001 — `terminals.concurrent` was metered per CONNECTION: every
 * terminal socket ran ensureQuota + (+1) on connect and (-1) on close. Since
 * re-attach works (a pane reconnects with its stable `?sessionId` and lands back
 * on the same agent-side shell), a reload asked for a SECOND slot for a terminal
 * that already existed — on the free plan (limit 1) the org's only terminal 429'd
 * its own reconnect and the pane never came back (26 observed 429s on the single
 * session `terminal-user-0`). The meter is now keyed on the session.
 *
 * These tests drive REAL WebSockets through the API against a stub workspace
 * agent, and read the gauge back from the store — never from a mock of the quota
 * layer — so what they assert is the persisted usage ledger itself.
 */

/**
 * Minimal stand-in for the workspace agent + manager. The agent's /terminal
 * socket emits one JSON `CommandEvent` on connect, which is what a test uses as
 * proof the API actually proxied the socket through (i.e. the quota let it in).
 */
async function startRuntimeStubs() {
  const agent = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ ok: true }));
  });

  await new Promise<void>((resolve) => agent.listen(0, '127.0.0.1', resolve));

  const agentAddress = agent.address();

  if (!agentAddress || typeof agentAddress === 'string') {
    throw new Error('Agent stub failed to start');
  }

  const agentSockets = new WebSocketServer({ server: agent });
  agentSockets.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'stdout', data: 'shell ready\r\n', timestamp: 'now' }));
  });

  const manager = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://manager.local');
    response.setHeader('content-type', 'application/json');

    request.on('data', () => undefined);
    request.on('end', () => {
      if (url.pathname.endsWith('/agent-token')) {
        response.end(JSON.stringify({ token: 'runtime-token' }));
      } else {
        response.end(JSON.stringify({ status: 'RUNNING' }));
      }
    });
  });

  await new Promise<void>((resolve) => manager.listen(0, '127.0.0.1', resolve));

  const managerAddress = manager.address();

  if (!managerAddress || typeof managerAddress === 'string') {
    throw new Error('Manager stub failed to start');
  }

  const previousManager = process.env.WORKSPACE_MANAGER_URL;
  const previousAgent = process.env.WORKSPACE_AGENT_URL_TEMPLATE;
  process.env.WORKSPACE_MANAGER_URL = `http://127.0.0.1:${managerAddress.port}`;
  process.env.WORKSPACE_AGENT_URL_TEMPLATE = `http://127.0.0.1:${agentAddress.port}`;

  return {
    async close() {
      process.env.WORKSPACE_MANAGER_URL = previousManager;
      process.env.WORKSPACE_AGENT_URL_TEMPLATE = previousAgent;
      await new Promise<void>((resolve) => agentSockets.close(() => resolve()));
      await Promise.all(
        [agent, manager].map((server: Server) => new Promise<void>((resolve) => server.close(() => resolve()))),
      );
    },
  };
}

function buildTestApiApp(options: ApiAppOptions = {}) {
  return buildApiApp(options);
}

async function register(app: Awaited<ReturnType<typeof buildTestApiApp>>, email: string, organizationName: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'password123', name: 'Terminal Quota', organizationName },
  });

  expect(response.statusCode).toBe(201);

  return response.json() as {
    token: string;
    user: { id: string };
    organization: { id: string };
  };
}

async function createProject(app: Awaited<ReturnType<typeof buildTestApiApp>>, token: string, orgId: string) {
  const response = await app.inject({
    method: 'POST',
    url: `/orgs/${orgId}/projects`,
    headers: { authorization: `Bearer ${token}` },
    payload: { name: `Terminal Quota Project ${Math.random().toString(36).slice(2, 8)}` },
  });

  expect(response.statusCode).toBe(201);

  return response.json().project.id as string;
}

type SocketOutcome = { socket: WebSocket; admitted: boolean };

/**
 * Open a terminal socket and settle on what the QUOTA decided: `admitted` when a
 * frame comes back from the agent (the API proxied it through), `false` when the
 * socket closes/errors without one (ensureQuota threw → 429 → socket torn down).
 */
function openTerminal(
  address: string,
  workspaceId: string,
  token: string,
  query: { sessionId?: string; managed?: boolean } = {},
): Promise<SocketOutcome> {
  const params = new URLSearchParams({ token });

  if (query.sessionId !== undefined) {
    params.set('sessionId', query.sessionId);
  }

  if (query.managed) {
    params.set('managed', '1');
  }

  const socket = new WebSocket(
    `${address.replace(/^http/, 'ws')}/api/runtime/workspaces/${workspaceId}/terminal?${params.toString()}`,
  );

  return new Promise<SocketOutcome>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('terminal socket never settled')), 8000);

    const settle = (admitted: boolean) => {
      clearTimeout(timeout);
      resolve({ socket, admitted });
    };

    socket.addEventListener('message', () => settle(true));
    socket.addEventListener('close', () => settle(false));
    socket.addEventListener('error', () => settle(false));
  });
}

function closeAndWait(socket: WebSocket) {
  return new Promise<void>((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }

    socket.addEventListener('close', () => resolve());
    socket.close();
  });
}

/**
 * The release (-1) is fire-and-forget inside the socket's close handler, so give
 * the event loop a few turns to let it land before reading the gauge.
 */
async function settleReleases() {
  for (let index = 0; index < 20; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const GAUGE = 'terminals.concurrent';

describe('terminal concurrency quota is metered per session, not per connection', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()!();
    }
  });

  async function harness(options: { plan?: 'free' | 'pro' } = {}) {
    const runtime = await startRuntimeStubs();
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    cleanups.push(async () => {
      await app.close();
      await runtime.close();
    });

    const auth = await register(
      app,
      `terminal-quota-${Math.random().toString(36).slice(2, 10)}@example.com`,
      'Terminal Quota Org',
    );

    if (options.plan === 'pro') {
      await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });
    }

    const projectId = await createProject(app, auth.token, auth.organization.id);
    const address = await app.listen({ port: 0, host: '127.0.0.1' });

    return {
      app,
      store,
      auth,
      projectId,
      address,
      gauge: () => store.sumUsage(auth.organization.id, GAUGE),
      open: (workspaceId: string, query?: { sessionId?: string; managed?: boolean }) =>
        openTerminal(address, workspaceId, auth.token, query),
      newProject: () => createProject(app, auth.token, auth.organization.id),
    };
  }

  // 1 — re-attach to a session that already holds a slot consumes nothing, and is
  // admitted even though the plan's single slot is already taken (proof that
  // ensureQuota was NOT applied: applying it on a used=1/limit=1 org would 429).
  it('admits a re-attach to an already-metered session without consuming a slot', async () => {
    const h = await harness();

    const first = await h.open(h.projectId, { sessionId: 'terminal-user-0' });
    expect(first.admitted).toBe(true);
    expect(await h.gauge()).toBe(1);

    const reattach = await h.open(h.projectId, { sessionId: 'terminal-user-0' });
    expect(reattach.admitted).toBe(true);
    expect(await h.gauge()).toBe(1);

    await closeAndWait(reattach.socket);
    await closeAndWait(first.socket);
  });

  // 2 — the re-attached socket posted no +1, so it must post no -1 either;
  // otherwise the gauge goes negative and hands out free slots for the window.
  it('never posts a release for a socket that did not take a slot', async () => {
    const h = await harness();

    const first = await h.open(h.projectId, { sessionId: 'terminal-user-0' });
    const reattach = await h.open(h.projectId, { sessionId: 'terminal-user-0' });
    expect(reattach.admitted).toBe(true);

    await closeAndWait(reattach.socket);
    await settleReleases();

    // Unchanged, and above all NOT negative — the owning socket is still open.
    expect(await h.gauge()).toBe(1);

    await closeAndWait(first.socket);
    await settleReleases();
    expect(await h.gauge()).toBe(0);
  });

  // 3 — failure path / integrity: a sessionId is not a bearer token. Replaying one
  // that holds no net-positive entry falls through to the normal metered path, so
  // an org at its limit is still refused.
  it('meters a replayed sessionId that holds no slot, and still refuses at the limit', async () => {
    const h = await harness();

    const first = await h.open(h.projectId, { sessionId: 'terminal-user-0' });
    expect(first.admitted).toBe(true);
    expect(await h.gauge()).toBe(1);

    // Never-seen id on a full org: metered, so refused.
    const replayed = await h.open(h.projectId, { sessionId: 'terminal-user-forged' });
    expect(replayed.admitted).toBe(false);
    expect(await h.gauge()).toBe(1);

    // Same id as the live session but on ANOTHER workspace — session ids are
    // per-pane and collide across workspaces, so this must be metered too.
    const otherProjectId = await h.newProject();
    const collided = await h.open(otherProjectId, { sessionId: 'terminal-user-0' });
    expect(collided.admitted).toBe(false);
    expect(await h.gauge()).toBe(1);

    // Once the slot is released, the very same id is metered again from scratch.
    await closeAndWait(first.socket);
    await settleReleases();
    expect(await h.gauge()).toBe(0);

    const reused = await h.open(h.projectId, { sessionId: 'terminal-user-0' });
    expect(reused.admitted).toBe(true);
    expect(await h.gauge()).toBe(1);

    await closeAndWait(reused.socket);
  });

  // 4 — concurrency: both sockets open at once on one sessionId. The lookup runs
  // inside the same withSerializedMutation as the +1, so exactly one can conclude
  // "new session".
  it('lets only one of two concurrent sockets on the same session take the slot', async () => {
    const h = await harness();

    const [a, b] = await Promise.all([
      h.open(h.projectId, { sessionId: 'terminal-user-0' }),
      h.open(h.projectId, { sessionId: 'terminal-user-0' }),
    ]);

    expect(a.admitted).toBe(true);
    expect(b.admitted).toBe(true);
    expect(await h.gauge()).toBe(1);

    await closeAndWait(a.socket);
    await closeAndWait(b.socket);
    await settleReleases();

    // Exactly one +1 and one -1 — the gauge lands on 0, never on -1.
    expect(await h.gauge()).toBe(0);
  });

  // 5 — positive control: two genuinely distinct panes are still two slots, and
  // the plan limit is still enforced.
  it('still charges two slots for two genuinely distinct terminals', async () => {
    const pro = await harness({ plan: 'pro' });

    const zero = await pro.open(pro.projectId, { sessionId: 'terminal-user-0' });
    const one = await pro.open(pro.projectId, { sessionId: 'terminal-user-1' });

    expect(zero.admitted).toBe(true);
    expect(one.admitted).toBe(true);
    expect(await pro.gauge()).toBe(2);

    await closeAndWait(zero.socket);
    await closeAndWait(one.socket);
    await settleReleases();
    expect(await pro.gauge()).toBe(0);

    // And on the free plan (limit 1) the second distinct pane is refused.
    const free = await harness();
    const only = await free.open(free.projectId, { sessionId: 'terminal-user-0' });
    const extra = await free.open(free.projectId, { sessionId: 'terminal-user-1' });

    expect(only.admitted).toBe(true);
    expect(extra.admitted).toBe(false);
    expect(await free.gauge()).toBe(1);

    await closeAndWait(only.socket);
  });

  // 6 — no sessionId: metering is unchanged (count, then refuse at the limit).
  // Absence must never be read as "already attached".
  it('keeps the per-connection behaviour when no sessionId is supplied', async () => {
    const h = await harness();

    const first = await h.open(h.projectId);
    expect(first.admitted).toBe(true);
    expect(await h.gauge()).toBe(1);

    const second = await h.open(h.projectId);
    expect(second.admitted).toBe(false);
    expect(await h.gauge()).toBe(1);

    await closeAndWait(first.socket);
    await settleReleases();
    expect(await h.gauge()).toBe(0);
  });
});
