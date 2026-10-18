import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createDatabaseClient } from '@vibecore/database';
import type { K8sObject, WorkspaceK8sClient } from '@vibecore/k8s-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Cross-service integration uses the production API and stores.
import { buildApiApp } from '../../api/src/app.js';
// eslint-disable-next-line no-restricted-imports -- Two independent production stores exercise PostgreSQL advisory locks.
import { PrismaApiStore } from '../../api/src/prisma-store.js';
import { buildWorkspaceManagerApp } from './app.js';
import { clientDeBaseJoignable } from './base-de-donnees-joignable.js';
import { WorkspaceManager } from './manager.js';
import { PrismaWorkspaceStore } from './prisma-store.js';

/*
 * Diagnostic regressions: real API, manager HTTP, PostgreSQL stores and advisory
 * locks; only Kubernetes and the agent are local test fixtures. No cluster,
 * customer row, payment, or production runtime is touched. The safety assertions
 * intentionally fail until admission is coordinated across replicas.
 */
function barrier() {
  let resolve!: () => void;

  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

class InstrumentedK8s implements WorkspaceK8sClient {
  readonly objects = new Map<string, K8sObject>();
  readonly deletions: string[] = [];
  onPodApplied?: () => void;
  podReadError?: Error;
  async apply(object: K8sObject) {
    this.objects.set(`${object.kind}:${object.metadata.name}`, object);

    if (object.kind === 'Pod') {
      this.onPodApplied?.();
    }

    return object;
  }
  async get(kind: string, _namespace: string, name: string) {
    return this.objects.get(`${kind}:${name}`);
  }
  async getPod(namespace: string, name: string) {
    if (this.podReadError) {
      throw this.podReadError;
    }

    const pod = await this.get('Pod', namespace, name);

    return pod ? ({ ...pod, status: { conditions: [{ type: 'Ready', status: 'True' }] } } as K8sObject) : undefined;
  }
  async delete(kind: string, _namespace: string, name: string) {
    this.deletions.push(`${kind}:${name}`);
    this.objects.delete(`${kind}:${name}`);
  }
  async *streamPodLogs() {
    yield 'isolated fixture';
  }
  async scale() {
    throw new Error('Unexpected scale in quota diagnostic');
  }
  async annotate() {
    throw new Error('Unexpected annotation in quota diagnostic');
  }
  async listByLabel() {
    return [];
  }
  get pods() {
    return [...this.objects.values()].filter((object) => object.kind === 'Pod');
  }
}

const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
  vi.unstubAllEnvs();
});

async function setup() {
  // Require an explicit isolated DB; never silently substitute a test double.
  if (!process.env.DATABASE_URL) {
    throw new Error('Run with an explicitly configured isolated PostgreSQL DATABASE_URL');
  }

  const dbA = createDatabaseClient();
  const dbB = createDatabaseClient();
  cleanups.push(
    () => dbA.$disconnect(),
    () => dbB.$disconnect(),
  );

  const storeA = new PrismaApiStore(dbA);
  const storeB = new PrismaApiStore(dbB);
  const runtimeStore = new PrismaWorkspaceStore(dbA);
  const k8s = new InstrumentedK8s();

  const manager = buildWorkspaceManagerApp(
    new WorkspaceManager(runtimeStore, k8s, { publish: async () => undefined }, 'local-quota-test-only'),
  );

  const observed = barrier();
  const releaseObservation = barrier();
  const startObserved = barrier();
  const releaseStart = barrier();
  const reserveObserved = barrier();
  const releaseReserve = barrier();

  let pausedReserve: string | undefined;
  let pausedStart: string | undefined;
  manager.addHook('preHandler', async (request) => {
    if (
      request.url === '/v2/workspaces/reserve' &&
      (request.body as { workspaceId?: string })?.workspaceId === pausedReserve
    ) {
      pausedReserve = undefined;
      reserveObserved.resolve();
      await releaseReserve.promise;
    }

    if (
      request.url === '/v2/workspaces/start' &&
      (request.body as { workspaceId?: string })?.workspaceId === pausedStart
    ) {
      pausedStart = undefined;
      startObserved.resolve();
      await releaseStart.promise;
    }
  });

  let pauseWorkspace: string | undefined;
  let pauseOnce = true;
  manager.addHook('onSend', async (request, _reply, payload) => {
    if (pauseOnce && pauseWorkspace && request.method === 'GET' && request.url === `/v2/workspaces/${pauseWorkspace}`) {
      pauseOnce = false;
      observed.resolve();
      await releaseObservation.promise;
    }

    return payload;
  });

  const url = await manager.listen({ port: 0, host: '127.0.0.1' });
  cleanups.push(async () => {
    releaseObservation.resolve();
    releaseStart.resolve();
    releaseReserve.resolve();
    await manager.close();
  });
  vi.stubEnv('WORKSPACE_MANAGER_URL', url);
  vi.stubEnv('WORKSPACE_AGENT_REACHABLE_TIMEOUT_MS', '0');
  vi.stubEnv('WORKSPACE_ADMISSION_V2_ENABLED', 'true');
  vi.stubEnv('WORKSPACE_ADMISSION_V2_QUOTA_ENABLED', 'true');

  const agent = createServer((_request, response) => response.writeHead(503).end('{}'));
  await new Promise<void>((resolve) => agent.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise<void>((resolve) => agent.close(() => resolve())));
  vi.stubEnv('WORKSPACE_AGENT_URL_TEMPLATE', `http://127.0.0.1:${(agent.address() as { port: number }).port}`);

  const apiA = await buildApiApp({
    store: storeA,

    // No cloud teardown or shared filesystem writes in this local fixture.
    databaseProvisioner: { teardown: async () => undefined } as never,
    supprimerFichiersDuProjet: async () => undefined,
    demonterApplicationPubliee: async () => undefined,
  });

  const apiB = await buildApiApp({ store: storeB });
  cleanups.push(
    () => apiA.close(),
    () => apiB.close(),
  );

  const suffix = randomUUID();

  const auth = await apiA.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `quota-race-${suffix}@local.test`,
      password: 'Password123!',
      name: 'Isolated quota race',
      organizationName: `QA ${suffix}`,
    },
  });
  expect(auth.statusCode, auth.body).toBe(201);

  const { token, organization, user } = auth.json();
  const headers = { authorization: `Bearer ${token}` };
  const projects = [];

  for (const name of ['A', 'B']) {
    const response = await apiA.inject({
      method: 'POST',
      url: `/orgs/${organization.id}/projects`,
      headers,
      payload: { name },
    });
    expect(response.statusCode, response.body).toBe(201);
    projects.push(response.json().project);
  }

  const workspaces = [];

  for (const project of projects) {
    workspaces.push(
      await storeA.createWorkspace({
        projectId: project.id,
        name: 'isolated quota diagnostic',
        runtimeMode: 'remote-kubernetes',
      }),
    );
  }

  const [a, b] = workspaces;
  await storeA.updateWorkspaceStatus({ workspaceId: a.id, status: 'STARTING' });
  await storeA.updateWorkspaceStatus({ workspaceId: b.id, status: 'STOPPED' });
  await runtimeStore.reserveAdmission({
    workspaceId: a.id,
    orgId: organization.id,
    projectId: a.projectId,
    plan: 'free',
  });
  await dbA.workspaceRuntime.update({
    where: { id: a.id },
    data: { updatedAt: new Date(Date.now() - 11 * 60_000), admissionReservedAt: new Date(Date.now() - 11 * 60_000) },
  });
  cleanups.push(async () => {
    await dbA.workspaceRuntime.deleteMany({ where: { id: { in: [a.id, b.id] } } });

    // Only the organization and user just created by this isolated test.
    await dbA.organization.delete({ where: { id: organization.id } });
    await dbA.user.delete({ where: { id: user.id } });
  });

  const start = (api: typeof apiA, workspace: typeof a) =>
    api.inject({
      method: 'POST',
      url: '/api/runtime/workspaces',
      headers,
      payload: { workspaceId: workspace.id, projectId: workspace.projectId },
    });

  return {
    a,
    b,
    dbA,
    storeA,
    apiA,
    apiB,
    k8s,
    start,
    headers,
    reserveObserved,
    releaseReserve,
    pauseReserve() {
      pausedReserve = b.id;
    },
    organizationId: organization.id,
    observed,
    releaseObservation,
    startObserved,
    releaseStart,
    pauseStart() {
      pausedStart = a.id;
    },
    pauseObservation() {
      pauseWorkspace = a.id;
    },
  };
}

const probe = await clientDeBaseJoignable();
const integrationDescribe = probe ? describe : describe.skip;
await probe?.$disconnect();

integrationDescribe('quota admission across API replicas — isolated PostgreSQL diagnostic', () => {
  it('retains the only slot when an old STARTING row still has a pod', async () => {
    const context = await setup();
    const { a, b, k8s, start, apiB } = context;
    await k8s.apply({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: `workspace-${a.id}`, namespace: 'workspaces' },
    });

    const response = await start(apiB, b);
    expect(k8s.deletions.filter((entry) => entry.startsWith('PersistentVolumeClaim:'))).toEqual([]);
    expect({ status: response.statusCode, pods: k8s.pods.length }, response.body).toEqual({ status: 429, pods: 1 });
  }, 30_000);

  it('does not release a slot from an old observation while another replica reopens it', async () => {
    const context = await setup();
    const { a, b, k8s, start, apiA, apiB, observed, releaseObservation } = context;
    context.pauseObservation();

    const startingB = Promise.resolve(start(apiB, b));
    await observed.promise;

    const attempted = barrier();
    const podApplied = barrier();
    k8s.onPodApplied = podApplied.resolve;

    const originalLock = context.storeA.withSerializedMutation.bind(context.storeA);
    vi.spyOn(context.storeA, 'withSerializedMutation').mockImplementation((key, fn) => {
      attempted.resolve();
      return originalLock(key, fn);
    });

    const startingA = Promise.resolve(start(apiA, a));

    /*
     * Before the fix A reaches Kubernetes without taking the lock. Afterwards
     * it attempts the real PostgreSQL lock and waits behind B's observation.
     */
    await Promise.race([attempted.promise, podApplied.promise]);
    releaseObservation.resolve();

    const [responseA, responseB] = await Promise.all([startingA, startingB]);
    expect(k8s.deletions.filter((entry) => entry.startsWith('PersistentVolumeClaim:'))).toEqual([]);
    expect({ statuses: [responseA.statusCode, responseB.statusCode].sort(), pods: k8s.pods.length }).toEqual({
      statuses: [200, 429],
      pods: 1,
    });
  }, 30_000);

  it('rejects an already-sent start after another replica releases its exact generation', async () => {
    const context = await setup();
    context.pauseStart();

    const startingA = Promise.resolve(context.start(context.apiA, context.a));
    await context.startObserved.promise;

    const responseB = await context.start(context.apiB, context.b);
    context.releaseStart.resolve();

    const responseA = await startingA;
    expect(responseB.statusCode, responseB.body).toBe(200);
    expect(responseA.statusCode, responseA.body).toBeGreaterThanOrEqual(400);
    expect(context.k8s.pods.map((pod) => pod.metadata.name)).toEqual([`workspace-${context.b.id}`]);
    expect(context.k8s.deletions).toEqual([]);
  }, 30_000);

  it('retains quota on an uncertain Kubernetes read and after six hours of API inactivity', async () => {
    const context = await setup();
    await context.dbA.workspace.update({
      where: { id: context.a.id },
      data: { updatedAt: new Date(Date.now() - 7 * 60 * 60_000) },
    });
    context.k8s.podReadError = new Error('isolated Kubernetes read unavailable');

    const response = await context.start(context.apiB, context.b);
    expect(response.statusCode, response.body).toBe(429);
    expect(context.k8s.pods).toEqual([]);
    expect(context.k8s.deletions).toEqual([]);
  }, 30_000);
  it('does not start from an expired advisory transaction or reuse its late reservation above quota', async () => {
    const context = await setup();
    const dbC = createDatabaseClient();
    cleanups.push(() => dbC.$disconnect());

    const storeC = new PrismaApiStore(dbC);

    // This fresh store creates its real lock pool with a short transaction budget.
    vi.stubEnv('DATABASE_TX_TIMEOUT_MS', '500');

    const apiC = await buildApiApp({ store: storeC });
    cleanups.push(async () => {
      context.releaseReserve.resolve();
      await apiC.close();
    });
    context.pauseReserve();

    const lateB = Promise.resolve(context.start(apiC, context.b));
    await context.reserveObserved.promise;
    vi.stubEnv('DATABASE_TX_TIMEOUT_MS', '30000');

    const key = `workspaces:${context.organizationId}`;

    /*
     * Observe PostgreSQL actually releasing the timed-out advisory lock. No fake
     * clock or stubbed lock implementation can make this assertion pass.
     */
    await expect
      .poll(
        async () =>
          context.dbA.$transaction(async (tx) => {
            const [row] = await tx.$queryRaw<
              Array<{ available: boolean }>
            >`SELECT pg_try_advisory_xact_lock(hashtext(${key})) AS available`;
            return row.available;
          }),
        { timeout: 5000 },
      )
      .toBe(true);

    /*
     * A stale UI row can fall out of the legacy six-hour count while this
     * unconfirmed HTTP callback is still pending. Its ledger must survive that.
     */
    await context.dbA.workspace.update({
      where: { id: context.b.id },
      data: { updatedAt: new Date(Date.now() - 7 * 60 * 60_000) },
    });

    const startedA = await context.start(context.apiA, context.a);
    expect(startedA.statusCode, startedA.body).toBe(200);
    context.releaseReserve.resolve();

    const expired = await lateB;
    expect(expired.statusCode, expired.body).toBeGreaterThanOrEqual(400);
    expect(context.k8s.pods.map((pod) => pod.metadata.name)).toEqual([`workspace-${context.a.id}`]);

    const retryB = await context.start(context.apiB, context.b);
    expect(retryB.statusCode, retryB.body).toBe(429);
    expect(context.k8s.pods).toHaveLength(1);
    expect(context.k8s.deletions.filter((entry) => entry.startsWith('PersistentVolumeClaim:'))).toEqual([]);
  }, 30_000);

  it.each(['false', 'true'])(
    'rejects a mismatched workspace before any reservation (v2=%s)',
    async (enabled) => {
      const context = await setup();
      vi.stubEnv('WORKSPACE_ADMISSION_V2_ENABLED', enabled);

      const response = await context.apiA.inject({
        method: 'POST',
        url: '/api/runtime/workspaces',
        headers: context.headers,
        payload: { workspaceId: context.b.id, projectId: context.a.projectId },
      });
      expect(response.statusCode, response.body).toBe(403);
      expect(response.json().code).toBe('WORKSPACE_PROJECT_MISMATCH');
      expect(context.k8s.pods).toEqual([]);
      expect(await context.dbA.workspaceRuntime.findUnique({ where: { id: context.b.id } })).toBeNull();
    },
    30_000,
  );
  it('permanent project deletion invalidates an already-sent start before removing its handles', async () => {
    const context = await setup();
    context.pauseStart();

    const delayedStart = Promise.resolve(context.start(context.apiA, context.a));
    await context.startObserved.promise;

    try {
      const deleted = await context.apiA.inject({
        method: 'DELETE',
        url: `/projects/${context.a.projectId}/permanent`,
        headers: context.headers,
        payload: { confirmName: 'A' },
      });
      expect(deleted.statusCode, deleted.body).toBe(200);
      expect(await context.dbA.project.findUnique({ where: { id: context.a.projectId } })).toBeNull();
      expect((await context.dbA.workspaceRuntime.findUnique({ where: { id: context.a.id } }))?.admissionState).toBe(
        'RELEASED',
      );
    } finally {
      context.releaseStart.resolve();
    }

    const late = await delayedStart;
    expect(late.statusCode, late.body).toBeGreaterThanOrEqual(400);
    expect(context.k8s.pods).toEqual([]);
  }, 30_000);
});
