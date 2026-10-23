// Explicit local integration recipe; requires the dedicated synthetic PostgreSQL
// database. No auth/transport/store mocks. Run with the documented Vitest config.
import { mkdtemp, rm } from 'node:fs/promises';
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
let workspaceId: string;
let runningId: string | undefined;
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
