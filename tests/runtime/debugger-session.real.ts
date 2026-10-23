import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// Explicit local integration recipe; requires the dedicated synthetic PostgreSQL
// database. No auth/transport/store mocks. Run with the documented Vitest config.
import { mkdtemp, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createDatabaseClient } from '@vibecore/database';
import { KubectlWorkspaceK8sClient } from '../../packages/k8s-client/src/index';
import { buildWorkspaceAgentApp } from '../../services/workspace-agent/src/app';
import { buildWorkspaceManagerApp } from '../../services/workspace-manager/src/app';
import {
  JsonWorkspaceStore,
  StructuredLogEventBus,
  WorkspaceManager,
} from '../../services/workspace-manager/src/manager';
import { buildApiApp } from '../../services/api/src/app';
import { toResponse } from '../../app/lib/test/rr7-data';

let api: Awaited<ReturnType<typeof buildApiApp>>;
let agent: ReturnType<typeof buildWorkspaceAgentApp>;
let managerApp: ReturnType<typeof buildWorkspaceManagerApp>;
let db: ReturnType<typeof createDatabaseClient>;
let root: string;
let apiUrl: string;
let token: string;
let stranger: string;
let projectId: string;
let organizationId: string;
let workspaceId: string;
let runningId: string | undefined;
let agentSecret: string;
const baseEnvironment = { ...process.env };

async function http(path: string, body?: unknown, auth = token) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  return { response, data };
}
async function bff(body: Record<string, unknown>) {
  const { action } = await import('../../app/routes/api.projects.$projectId.ide-panel.$panel');
  let result;
  try {
    result = await action({
      request: new Request('http://local.test/api/projects/' + projectId + '/ide-panel/debugger', {
        method: 'POST',
        headers: { cookie: `vc_session=${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      params: { projectId, panel: 'debugger' },
    } as any);
  } catch (error) {
    result = error;
  }
  return toResponse(result);
}
async function panel() {
  const { loader } = await import('../../app/routes/api.projects.$projectId.ide-panel.$panel');
  const result = await loader({
    request: new Request(`http://local.test/api/projects/${projectId}/ide-panel/debugger?workspaceId=${workspaceId}`, {
      headers: { cookie: `vc_session=${token}` },
    }),
    params: { projectId, panel: 'debugger' },
  } as any);
  const response = toResponse(result);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.status).toBe('ok');
  return body.data.debuggerState;
}
async function stored() {
  const { response, data } = await http(`/projects/${projectId}/env-vars`);
  expect(response.status).toBe(200);
  return JSON.parse(data.envVars.find((row: any) => row.key === 'VIBECORE_DEBUGGER_STATE').value);
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('Dedicated synthetic PostgreSQL DATABASE_URL required');
  root = await mkdtemp(join(tmpdir(), 'debugger-real-'));
  const fixtureSecret = randomUUID();
  agentSecret = fixtureSecret;
  process.env.WORKSPACE_MANAGER_SHARED_SECRET = fixtureSecret;
  const manager = new WorkspaceManager(
    new JsonWorkspaceStore(join(root, 'manager.json')),
    new KubectlWorkspaceK8sClient('/nonexistent/no-cluster-access'),
    new StructuredLogEventBus(),
    fixtureSecret,
  );
  managerApp = buildWorkspaceManagerApp(manager);
  await managerApp.listen({ host: '127.0.0.1', port: 0 });
  process.env.WORKSPACE_MANAGER_URL = `http://127.0.0.1:${(managerApp.server.address() as any).port}`;
  api = await buildApiApp();
  await api.listen({ host: '127.0.0.1', port: 0 });
  apiUrl = `http://127.0.0.1:${(api.server.address() as any).port}`;
  process.env.SAAS_API_URL = apiUrl;
  const register = async () => {
    const result = await http(
      '/auth/register',
      {
        email: `debugger-${randomUUID()}@local.test`,
        password: `Fixture-${randomUUID()}!`,
        name: 'Synthetic debugger',
        organizationName: 'Synthetic debugger',
      },
      '',
    );
    expect(result.response.status).toBe(201);
    return result.data;
  };
  const owner = await register();
  token = owner.token;
  organizationId = owner.organization.id;
  stranger = (await register()).token;
  const creation = await http(`/orgs/${owner.organization.id}/projects`, { name: 'Synthetic debugger lifecycle' });
  expect(creation.response.ok).toBe(true);
  projectId = creation.data.project.id;
  db = createDatabaseClient();
  const workspace = await db.workspace.create({
    data: { projectId, name: 'Synthetic tracked runtime', runtimeMode: 'remote', status: 'RUNNING' },
  });
  workspaceId = workspace.id;
  agent = buildWorkspaceAgentApp({ workspaceRoot: root, workspaceId, tokenSecret: fixtureSecret });
  await agent.listen({ host: '127.0.0.1', port: 0 });
  process.env.WORKSPACE_AGENT_URL_TEMPLATE = `http://127.0.0.1:${(agent.server.address() as any).port}`;
}, 60_000);

afterAll(async () => {
  if (runningId && api) await http(`/api/runtime/workspaces/${workspaceId}/processes/${runningId}/kill`, {});
  await api?.close();
  await agent?.close();
  await managerApp?.close();
  await db?.$disconnect();
  if (root) await rm(root, { recursive: true, force: true });
  for (const key of [
    'WORKSPACE_MANAGER_SHARED_SECRET',
    'WORKSPACE_MANAGER_URL',
    'WORKSPACE_AGENT_URL_TEMPLATE',
    'SAAS_API_URL',
  ]) {
    if (baseEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = baseEnvironment[key];
  }
});

test('real BFF → authenticated API/PostgreSQL → agent survives 30s, rejects foreign owner, stops and persists', async () => {
  const configId = randomUUID();
  expect(
    (
      await bff({
        intent: 'save-config',
        configId,
        type: 'shell',
        command: `${process.execPath} -e 'setInterval(() => {}, 1000)'`,
        name: 'Synthetic long-running',
      })
    ).status,
  ).toBe(200);
  expect((await bff({ intent: 'start-session', configId, workspaceId })).status).toBe(200);
  const session = (await stored()).sessions[0];
  runningId = session.processId;
  expect(session.status).toBe('running');
  expect(session.workspaceId).toBe(workspaceId);
  expect(Date.parse(session.expiresAt) - Date.parse(session.startedAt)).toBeGreaterThan(1_790_000);
  const denied = await http(`/api/runtime/workspaces/${workspaceId}/processes/${runningId}/kill`, {}, stranger);
  expect([403, 404]).toContain(denied.response.status);
  // Real elapsed time is essential to this regression; no retry or assertion timeout extension.
  await delay(31_000);
  const live = await http(`/api/runtime/workspaces/${workspaceId}/processes/${runningId}`);
  expect(live.response.status).toBe(200);
  expect(live.data.status).toBe('running');
  expect((await bff({ intent: 'stop-session', sessionId: session.id })).status).toBe(200);
  expect((await stored()).sessions[0].status).toBe('stopped');
  expect((await bff({ intent: 'stop-session', sessionId: session.id })).status).toBe(200);
  expect((await stored()).sessions[0].status).toBe('stopped');
  const final = await http(`/api/runtime/workspaces/${workspaceId}/processes/${runningId}`);
  expect(final.data.status).toBe('stopped');
  runningId = undefined;
}, 45_000);

for (const [exitCode, status] of [
  [0, 'exited'],
  [7, 'failed'],
] as const) {
  test(`real immediate exit ${exitCode} is reconciled and persisted as ${status}`, async () => {
    const configId = randomUUID();
    expect(
      (
        await bff({
          intent: 'save-config',
          configId,
          type: 'shell',
          command: `exit ${exitCode}`,
          name: 'Synthetic immediate exit',
        })
      ).status,
    ).toBe(200);
    expect((await bff({ intent: 'start-session', configId, workspaceId })).status).toBe(200);
    const session = (await stored()).sessions[0];
    runningId = session.processId;
    await expect
      .poll(async () => (await http(`/api/runtime/workspaces/${workspaceId}/processes/${runningId}`)).data.status)
      .toBe(status);
    expect((await bff({ intent: 'stop-session', sessionId: session.id })).status).toBe(200);
    expect((await stored()).sessions[0].status).toBe(status);
    runningId = undefined;
  });
}

async function failFixtureWrite(nth: number) {
  // Fault injection is confined to this synthetic project's state in the dedicated
  // local database. Existing rows/projects are never affected. Cleanup is mandatory.
  const name = `debugger_fault_${randomUUID().replaceAll('-', '')}`;
  if (!/^[a-z0-9]+$/.test(projectId)) throw new Error('Unexpected synthetic project ID');
  await db.$executeRawUnsafe(`CREATE SEQUENCE "${name}"`);
  await db.$executeRawUnsafe(
    `CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF nextval('"${name}"') = ${nth} THEN RAISE EXCEPTION 'Synthetic debugger persistence failure'; END IF; RETURN NEW; END $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER "${name}" BEFORE UPDATE ON "ProjectEnvVar" FOR EACH ROW WHEN (NEW."projectId" = '${projectId}' AND NEW.key = 'VIBECORE_DEBUGGER_STATE') EXECUTE FUNCTION "${name}"()`,
  );
  return async () => {
    await db.$executeRawUnsafe(`DROP TRIGGER "${name}" ON "ProjectEnvVar"`);
    await db.$executeRawUnsafe(`DROP FUNCTION "${name}"()`);
    await db.$executeRawUnsafe(`DROP SEQUENCE "${name}"`);
  };
}

test('real PostgreSQL persistence failure after launch is compensated and remains reconcilable', async () => {
  const configId = randomUUID();
  expect(
    (
      await bff({
        intent: 'save-config',
        configId,
        type: 'shell',
        command: `${process.execPath} -e 'setInterval(() => {}, 1000)'`,
        name: 'Synthetic compensation',
      })
    ).status,
  ).toBe(200);
  const removeFault = await failFixtureWrite(2);
  try {
    const started = await bff({ intent: 'start-session', configId, workspaceId });
    expect(started.status).toBe(502);
    expect((await started.json()).code).toBe('DEBUG_PERSIST_FAILED_COMPENSATED');
    const session = (await stored()).sessions[0];
    runningId = session.processId;
    expect(session.status).toBe('starting');
    expect((await panel()).sessions[0]).toMatchObject({ status: 'stopped', persistencePending: true });
    const terminal = await http(`/api/runtime/workspaces/${workspaceId}/processes/${runningId}`);
    expect(terminal.data.status).toBe('stopped');
    expect((await bff({ intent: 'reconcile-session', sessionId: session.id })).status).toBe(200);
    expect((await stored()).sessions[0].status).toBe('stopped');
    runningId = undefined;
  } finally {
    await removeFault();
  }
});

test('real PostgreSQL persistence failure after Stop is explicit and recoverable without relaunch', async () => {
  const configId = randomUUID();
  expect(
    (
      await bff({
        intent: 'save-config',
        configId,
        type: 'shell',
        command: `${process.execPath} -e 'setInterval(() => {}, 1000)'`,
        name: 'Synthetic stop persistence',
      })
    ).status,
  ).toBe(200);
  expect((await bff({ intent: 'start-session', configId, workspaceId })).status).toBe(200);
  const session = (await stored()).sessions[0];
  runningId = session.processId;
  const removeFault = await failFixtureWrite(1);
  try {
    const stopped = await bff({ intent: 'stop-session', sessionId: session.id });
    expect(stopped.status).toBe(502);
    expect((await stopped.json()).code).toBe('DEBUG_PERSIST_RECONCILIATION_REQUIRED');
    expect((await stored()).sessions[0].status).toBe('running');
    expect((await panel()).sessions[0]).toMatchObject({ status: 'stopped', persistencePending: true });
    expect((await http(`/api/runtime/workspaces/${workspaceId}/processes/${runningId}`)).data.status).toBe('stopped');
    expect((await bff({ intent: 'reconcile-session', sessionId: session.id })).status).toBe(200);
    expect((await stored()).sessions[0].status).toBe('stopped');
    runningId = undefined;
  } finally {
    await removeFault();
  }
});

for (const staleAdvertisement of [false, true]) {
  test(`legacy agent cannot execute a tracked session (stale capability=${staleAdvertisement})`, async () => {
    const legacyPath = fileURLToPath(
      new URL('../../services/workspace-agent/src/.debugger-legacy-fixture.ts', import.meta.url),
    );
    const previousUrl = process.env.WORKSPACE_AGENT_URL_TEMPLATE;
    let legacy: ReturnType<typeof buildWorkspaceAgentApp> | undefined;
    let legacyCommandPosts = 0;
    let versionedPosts = 0;
    try {
      // Exact deployed pre-contract agent source; helpers remain unchanged.
      await writeFile(
        legacyPath,
        execFileSync('git', ['show', 'c988c2af60d058971afe72f057c6fa82a178fb21:services/workspace-agent/src/app.ts']),
      );
      const oldModule = await import(/* @vite-ignore */ legacyPath);
      legacy = oldModule.buildWorkspaceAgentApp({ workspaceRoot: root, workspaceId, tokenSecret: agentSecret });
      legacy!.addHook('onRequest', async (request) => {
        if (request.method === 'POST' && request.url === '/commands/run') legacyCommandPosts++;
        if (request.method === 'POST' && request.url === '/sessions/v1/start') versionedPosts++;
      });
      // Controlled stale advertisement models an agent switch between GET and POST.
      // The legacy command router itself is the real historical implementation.
      if (staleAdvertisement) legacy!.get('/sessions/capabilities', async () => ({ trackedSessions: 1 }));
      await legacy!.listen({ host: '127.0.0.1', port: 0 });
      process.env.WORKSPACE_AGENT_URL_TEMPLATE = `http://127.0.0.1:${(legacy!.server.address() as any).port}`;
      const configId = randomUUID();
      expect(
        (
          await bff({
            intent: 'save-config',
            configId,
            type: 'shell',
            command: 'printf unexpected > legacy-marker',
            name: 'Synthetic legacy admission',
          })
        ).status,
      ).toBe(200);
      const response = await bff({ intent: 'start-session', configId, workspaceId });
      expect(response.status).toBeGreaterThanOrEqual(400);
      if (!staleAdvertisement) {
        expect(response.status).toBe(503);
        expect((await response.json()).code).toBe('DEBUG_AGENT_INCOMPATIBLE');
        expect((await stored()).sessions[0].status).toBe('failed');
      }
      expect(legacyCommandPosts).toBe(0);
      expect(versionedPosts).toBe(staleAdvertisement ? 1 : 0);
      await expect(access(join(root, 'legacy-marker'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      if (previousUrl === undefined) delete process.env.WORKSPACE_AGENT_URL_TEMPLATE;
      else process.env.WORKSPACE_AGENT_URL_TEMPLATE = previousUrl;
      await legacy?.close();
      await rm(legacyPath, { force: true });
    }
  });
}

test('legacy API executes the old command contract but refuses a new BFF session before dispatch', async () => {
  const legacyPath = fileURLToPath(new URL('../../services/api/src/.debugger-legacy-fixture.ts', import.meta.url));
  const previousUrl = process.env.SAAS_API_URL;
  let legacy: Awaited<ReturnType<typeof buildApiApp>> | undefined;
  let commandPosts = 0;
  let sessionPosts = 0;
  const marker = join(root, 'legacy-api-marker');
  try {
    await writeFile(
      legacyPath,
      execFileSync('git', ['show', 'c988c2af60d058971afe72f057c6fa82a178fb21:services/api/src/app.ts'], {
        maxBuffer: 8 * 1024 * 1024,
      }),
    );
    const oldModule = await import(/* @vite-ignore */ legacyPath);
    legacy = await oldModule.buildApiApp();
    legacy!.addHook('onRequest', async (request) => {
      if (request.method === 'POST' && request.url.endsWith('/commands')) commandPosts++;
      if (request.method === 'POST' && request.url.endsWith('/sessions/v1/start')) sessionPosts++;
    });
    await legacy!.listen({ host: '127.0.0.1', port: 0 });
    const legacyUrl = `http://127.0.0.1:${(legacy!.server.address() as any).port}`;
    // Counter-example: the old API strips background/operationId and actually
    // executes the former BFF payload synchronously. Only a local fixture file.
    const oldResponse = await fetch(`${legacyUrl}/api/runtime/workspaces/${workspaceId}/commands`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        command: 'sh',
        args: ['-lc', 'printf unexpected > legacy-api-marker'],
        background: true,
        operationId: randomUUID(),
      }),
    });
    expect(oldResponse.status).toBe(200);
    expect((await oldResponse.json()).exitCode).toBe(0);
    await access(marker);
    await rm(marker);
    expect(commandPosts).toBe(1);
    commandPosts = 0;

    const configId = randomUUID();
    expect(
      (
        await bff({
          intent: 'save-config',
          configId,
          type: 'shell',
          command: 'printf unexpected > legacy-api-marker',
          name: 'Synthetic legacy API admission',
        })
      ).status,
    ).toBe(200);
    const beforeAdmission = await stored();
    process.env.SAAS_API_URL = legacyUrl;
    const response = await bff({ intent: 'start-session', configId, workspaceId });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(sessionPosts).toBe(0);
    expect(commandPosts).toBe(0);
    expect(await stored()).toEqual(beforeAdmission);
    await expect(access(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    if (previousUrl === undefined) delete process.env.SAAS_API_URL;
    else process.env.SAAS_API_URL = previousUrl;
    await legacy?.close();
    await rm(legacyPath, { force: true });
    await rm(marker, { force: true });
  }
}, 60_000);

test('concurrent panel saves never acknowledge a lost configuration', async () => {
  const { createServer } = await import('node:http');
  const previousUrl = process.env.SAAS_API_URL;
  let reads = 0;
  let release!: () => void;
  const bothRead = new Promise<void>((resolve) => {
    release = resolve;
  });
  // Delay only delivery of the two real PostgreSQL snapshots. No response,
  // auth or persistence is mocked; both actions read the same committed state.
  const proxy = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const forwarded = await fetch(`${apiUrl}${req.url}`, {
      method: req.method,
      headers: Object.fromEntries(
        Object.entries(req.headers).filter(([key]) => !['host', 'connection', 'content-length'].includes(key)),
      ) as Record<string, string>,
      ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
    });
    const data = await forwarded.arrayBuffer();
    if (req.method === 'GET' && req.url === `/projects/${projectId}/env-vars` && reads < 2) {
      reads++;
      if (reads === 2) release();
      await bothRead;
    }
    res.writeHead(forwarded.status, { 'content-type': forwarded.headers.get('content-type') ?? 'application/json' });
    res.end(Buffer.from(data));
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  process.env.SAAS_API_URL = `http://127.0.0.1:${(proxy.address() as any).port}`;
  const ids = [randomUUID(), randomUUID()];
  try {
    const responses = await Promise.all(
      ids.map((configId, index) =>
        bff({
          intent: 'save-config',
          configId,
          name: `Concurrent ${index}`,
          type: 'shell',
          command: 'exit 0',
        }),
      ),
    );
    expect(reads).toBe(2);
    const persisted = (await stored()).launchConfigs;
    for (let i = 0; i < ids.length; i++) {
      if (responses[i].ok) expect(persisted.some((config: any) => config.id === ids[i])).toBe(true);
      else expect(responses[i].status).toBe(409);
    }
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const lost = responses.findIndex((response) => !response.ok);
    expect((await responses[lost].json()).code).toBe('DEBUG_STATE_CONFLICT');
    expect(
      (
        await bff({
          intent: 'save-config',
          configId: ids[lost],
          name: `Concurrent ${lost}`,
          type: 'shell',
          command: 'exit 0',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await bff({
          intent: 'save-config',
          configId: ids[lost],
          name: `Concurrent ${lost}`,
          type: 'shell',
          command: 'exit 0',
        })
      ).status,
    ).toBe(200);
    const afterRetry = (await stored()).launchConfigs;
    for (const id of ids) expect(afterRetry.filter((config: any) => config.id === id)).toHaveLength(1);
  } finally {
    release();
    if (previousUrl === undefined) delete process.env.SAAS_API_URL;
    else process.env.SAAS_API_URL = previousUrl;
    await new Promise<void>((resolve, reject) => proxy.close((error) => (error ? reject(error) : resolve())));
  }
});

async function compareState(targetProject: string, value: string, expectedValue: string | null, auth = token) {
  const response = await fetch(`${apiUrl}/projects/${targetProject}/debugger-state/v1`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' },
    body: JSON.stringify({ key: 'VIBECORE_DEBUGGER_STATE', value, expectedValue }),
  });
  return { response, data: await response.json() };
}

test('state CAS serializes creation, duplicate delivery and conflicts on real PostgreSQL', async () => {
  const created = await http(`/orgs/${organizationId}/projects`, { name: 'Synthetic state CAS identity' });
  expect(created.response.status).toBe(201);
  const id = created.data.project.id;
  const initial = JSON.stringify({ sessions: [{ id: 'initial' }] });
  const repeated = await Promise.all([compareState(id, initial, null), compareState(id, initial, null)]);
  expect(repeated.map((item) => item.response.status)).toEqual([200, 200]);
  expect(await db.projectEnvVar.count({ where: { projectId: id, key: 'VIBECORE_DEBUGGER_STATE' } })).toBe(1);
  const next = ['one', 'two'].map((name) => JSON.stringify({ sessions: [{ id: 'initial' }, { id: name }] }));
  const concurrent = await Promise.all(next.map((value) => compareState(id, value, initial)));
  expect(concurrent.map((item) => item.response.status).sort()).toEqual([200, 409]);
  const winner = concurrent.findIndex((item) => item.response.ok);
  const loser = 1 - winner;
  expect(concurrent[loser].data.code).toBe('DEBUG_STATE_CONFLICT');
  // A retry of the committed value is idempotent even with its old precondition.
  expect((await compareState(id, next[winner], initial)).response.status).toBe(200);
  expect((await compareState(id, next[loser], initial)).response.status).toBe(409);
  const row = await db.projectEnvVar.findFirstOrThrow({ where: { projectId: id, key: 'VIBECORE_DEBUGGER_STATE' } });
  expect(row.value).toBe(next[winner]);
  expect(JSON.parse(row.value).sessions).toHaveLength(2);
});

test('state CAS isolates projects, enforces existing RBAC and refuses unconditional legacy writes', async () => {
  const ids: string[] = [];
  for (const name of ['A', 'B']) {
    const created = await http(`/orgs/${organizationId}/projects`, { name: `Synthetic CAS scope ${name}` });
    expect(created.response.status).toBe(201);
    ids.push(created.data.project.id);
  }
  const baseline = JSON.stringify({ sessions: [{ id: 'A-only' }] });
  expect((await compareState(ids[0], baseline, null)).response.status).toBe(200);
  expect((await compareState(ids[1], 'foreign stale write', baseline)).response.status).toBe(409);
  expect(await db.projectEnvVar.count({ where: { projectId: ids[1], key: 'VIBECORE_DEBUGGER_STATE' } })).toBe(0);
  const ownB = JSON.stringify({ sessions: [{ id: 'B-only' }] });
  expect((await compareState(ids[1], ownB, null)).response.status).toBe(200);
  expect([403, 404]).toContain((await compareState(ids[0], 'foreign owner', baseline, stranger)).response.status);
  const unconditional = await fetch(`${apiUrl}/projects/${ids[0]}/env-vars`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ key: 'VIBECORE_DEBUGGER_STATE', value: 'legacy overwrite' }),
  });
  expect(unconditional.status).toBe(409);
  expect((await unconditional.json()).code).toBe('DEBUG_STATE_PRECONDITION_REQUIRED');
  expect(
    (await db.projectEnvVar.findFirstOrThrow({ where: { projectId: ids[0], key: 'VIBECORE_DEBUGGER_STATE' } })).value,
  ).toBe(baseline);
  expect(
    (await db.projectEnvVar.findFirstOrThrow({ where: { projectId: ids[1], key: 'VIBECORE_DEBUGGER_STATE' } })).value,
  ).toBe(ownB);
  // Ordinary environment variables keep the existing API contract.
  const ordinary = await fetch(`${apiUrl}/projects/${ids[0]}/env-vars`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ key: 'SYNTHETIC_CAS_NOTE', value: 'unchanged contract' }),
  });
  expect(ordinary.status).toBe(200);
});
