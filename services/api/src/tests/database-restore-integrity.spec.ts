/**
 * Real API/provisioner/HTTP transport, explicit loopback CNPG status fixtures.
 * The store is in memory. This does not exercise PostgreSQL, GCS, Kubernetes,
 * application cutover or a physical restore, and rejects external HTTP requests.
 */
import { createServer, type Server } from 'node:http';
import { encryptJson } from '@vibecore/security';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp } from '../app.js';
import { clusterName, resolveDefaultDatabaseProvisioner, type K8sManifest } from '../database-provisioner.js';
import { TestApiStore } from './test-api-store.js';

let app: Awaited<ReturnType<typeof buildApiApp>> | undefined;
let store: TestApiStore;
let server: Server;
let ready = false;
let externalRequests = 0;
let managerOrigin = '';
let manifests: K8sManifest[] = [];
let reads: string[] = [];
let pauseRequest: ((path: string) => Promise<void>) | undefined;
let connectionUri: string | undefined;
const realFetch = globalThis.fetch;
const auth = { authorization: 'Bearer restore-integrity-fixture' };
const internalAuth = { authorization: 'Bearer restore-integrity-internal-fixture' };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(async () => {
  ready = false;
  externalRequests = 0;
  manifests = [];
  reads = [];
  pauseRequest = undefined;
  connectionUri = undefined;
  server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    await pauseRequest?.(url.pathname);
    response.setHeader('content-type', 'application/json');
    if (request.method === 'POST' && url.pathname === '/databases/apply') {
      let raw = '';
      for await (const chunk of request) raw += String(chunk);
      const payload = JSON.parse(raw) as { manifest: K8sManifest };
      manifests.push(payload.manifest);
      response.end(JSON.stringify({ acceptedByFixture: true }));
      return;
    }
    reads.push(`${url.pathname}?${url.searchParams}`);
    if (request.method === 'GET' && url.pathname === '/databases/secret' && connectionUri) {
      response.end(JSON.stringify({ data: { uri: connectionUri } }));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/databases/resource') {
      response.end(
        JSON.stringify({
          status: ready
            ? { phase: 'Cluster in healthy state', readyInstances: 1 }
            : { phase: 'Setting up primary', readyInstances: 0 },
        }),
      );
      return;
    }
    response.statusCode = 404;
    response.end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing loopback server address');
  managerOrigin = `http://127.0.0.1:${address.port}`;
  vi.stubEnv('DB_ROLLBACK_ENABLED', 'true');
  vi.stubEnv('DB_BACKUP_BUCKET', 'restore-integrity-fixture-never-contacted');
  vi.stubEnv('DB_BACKUP_GSA', '');
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('REDIS_URL', '');
  vi.stubEnv('WORKSPACE_MANAGER_URL', managerOrigin);
  vi.stubEnv('WORKSPACE_MANAGER_SHARED_SECRET', 'restore-integrity-manager-fixture');
  vi.stubEnv('INTERNAL_API_SHARED_SECRET', 'restore-integrity-internal-fixture');
  vi.stubGlobal('fetch', (input: Parameters<typeof realFetch>[0], init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== managerOrigin) {
      externalRequests += 1;
      throw new Error('External request forbidden in restore integrity test');
    }
    return realFetch(input, init);
  });
  store = new TestApiStore();
  app = await buildApiApp({ store, emailProvider: { async send() {} } });
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  expect(server.listening).toBe(false);
  expect(externalRequests).toBe(0);
});

async function seed(environment: 'development' | 'production') {
  const user = await store.createUser({
    email: 'restore-integrity@example.invalid',
    name: 'Fixture',
    passwordHash: 'unused',
  });
  const org = await store.createOrganization({ name: 'Fixture', slug: 'restore-integrity', ownerUserId: user.id });
  await store.createSession({
    userId: user.id,
    token: 'restore-integrity-fixture',
    expiresAt: new Date(Date.now() + 3600_000),
  });
  const project = await store.createProject({ organizationId: org.id, name: 'Fixture', slug: 'restore-integrity' });
  await store.upsertSubscription({ organizationId: org.id, planKey: 'team', status: 'ACTIVE' });
  const instanceId = `fixture-${environment}`;
  store.databaseInstances.set(instanceId, {
    id: instanceId,
    projectId: project.id,
    organizationId: org.id,
    environment,
    status: 'ACTIVE',
    engine: 'postgres',
    sizeBytes: 0,
    retentionDays: 28,
    pitrEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return { project, instanceId };
}

describe('database restore integrity', () => {
  for (const endpoint of ['databases', 'database', 'database/provision'] as const) {
    it(`${endpoint}: rejects the old provisioning response after a restored binding became current`, async () => {
      const { project, instanceId } = await seed('development');
      const current = store.databaseInstances.get(instanceId)!;
      const oldTimestamp = new Date(Date.now() - 3600_000).toISOString();
      store.databaseInstances.set(instanceId, {
        ...current,
        status: 'PROVISIONING',
        createdAt: oldTimestamp,
        updatedAt: oldTimestamp,
      });
      const gate = deferred();
      const entered = deferred();
      connectionUri = 'postgresql://fixture:unused@old-database.invalid/app';
      const gatePath = endpoint === 'database/provision' ? '/databases/apply' : '/databases/secret';
      pauseRequest = async (path) => {
        if (path === gatePath) {
          entered.resolve();
          await gate.promise;
        }
      };
      const pending = Promise.resolve(
        app!.inject({
          method: endpoint === 'database/provision' ? 'POST' : 'GET',
          url: `/projects/${project.id}/${endpoint}`,
          headers: auth,
          ...(endpoint === 'database/provision' ? { payload: {} } : {}),
        }),
      );
      try {
        await entered.promise;
        // Explicit persistence fixture, not a physical restore: the PostgreSQL
        // repository suite separately exercises the actual cutover transaction.
        const restoredCipher = encryptJson({ value: 'postgresql://fixture:unused@restored-database.invalid/app' });
        await store.upsertProjectSecret({
          projectId: project.id,
          key: 'DATABASE_URL',
          valueEncrypted: restoredCipher,
        });
        store.databaseInstances.set(instanceId, {
          ...current,
          status: 'ACTIVE',
          activeTargetRef: 'restored-fixture-target',
          bindingVersion: 1,
          updatedAt: new Date().toISOString(),
        });
        gate.resolve();
        const response = await pending;
        expect(response.statusCode).toBe(endpoint === 'database/provision' ? 409 : 200);
        expect(await store.getDatabaseInstanceByProject(project.id)).toMatchObject({
          status: 'ACTIVE',
          activeTargetRef: 'restored-fixture-target',
          bindingVersion: 1,
        });
        expect((await store.getProjectSecret(project.id, 'DATABASE_URL'))?.valueEncrypted).toBe(restoredCipher);
      } finally {
        gate.resolve();
        await pending;
      }
    });
  }

  it('labels historical completed rows as unverified without rewriting them', async () => {
    const { project, instanceId } = await seed('development');
    const restore = await store.createDatabaseRestore({ databaseInstanceId: instanceId });
    const completedAt = new Date().toISOString();
    await store.updateDatabaseRestore(restore.id, { status: 'COMPLETED', completedAt });
    const response = await app!.inject({ method: 'GET', url: `/projects/${project.id}/database`, headers: auth });
    expect(response.json().restores[0]).toMatchObject({ status: 'COMPLETED', applicationCutoverVerified: false });
    expect((await store.listDatabaseRestores(instanceId))[0]).toMatchObject({ status: 'COMPLETED', completedAt });
    expect(manifests).toEqual([]);
    expect(reads).toEqual([]);
  });

  it('exposes unavailable application restore separately from the paid entitlement', async () => {
    const { project } = await seed('development');
    const response = await app!.inject({ method: 'GET', url: `/projects/${project.id}/database`, headers: auth });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      entitlement: { allowed: true },
      restoreCapability: { available: false, reason: 'RESTORE_APPLICATION_CUTOVER_UNAVAILABLE' },
    });
    expect(manifests).toEqual([]);
    expect(reads).toEqual([]);
  });

  for (const environment of ['development', 'production'] as const) {
    it(`${environment}: requests a manual backup from the selected instance`, async () => {
      const { project, instanceId } = await seed(environment);
      const response = await app!.inject({
        method: 'POST',
        url: `/projects/${project.id}/database/snapshots`,
        headers: auth,
        payload: { environment },
      });
      expect(response.statusCode).toBe(202);
      expect(response.json().snapshot.databaseInstanceId).toBe(instanceId);
      expect(manifests).toHaveLength(1);
      expect(manifests[0]).toMatchObject({
        kind: 'Backup',
        spec: { cluster: { name: clusterName(project.id, environment) } },
      });
      const snapshotId = response.json().snapshot.id as string;
      await resolveDefaultDatabaseProvisioner().backupStatus({ projectId: project.id, snapshotId, environment });
      expect(new URL(`http://localhost${reads[0]}`).searchParams.get('name')).toBe(manifests[0].metadata.name);
    });

    it(`${environment}: transports the selected backup source to CNPG`, async () => {
      const provisioner = resolveDefaultDatabaseProvisioner();
      // Variable remains structurally compatible with the old interface for the red run.
      const input = {
        projectId: 'fixture-project',
        restoreId: 'fixture-restore',
        environment,
        targetTimeIso: '2026-10-18T00:00:00.000Z',
        retentionDays: 28,
      };
      await provisioner.startRestore(input);
      expect(manifests).toHaveLength(1);
      expect(manifests[0].spec).toMatchObject({
        bootstrap: { recovery: { source: `${clusterName(input.projectId, environment)}-backup` } },
        externalClusters: [{ barmanObjectStore: { serverName: clusterName(input.projectId, environment) } }],
      });
    });

    for (const endpoint of ['restore', 'restores']) {
      it(`${endpoint}/${environment}: refuses before creating a request or resource without application cutover`, async () => {
        const { project, instanceId } = await seed(environment);
        const response = await app!.inject({
          method: 'POST',
          url: `/projects/${project.id}/database/${endpoint}`,
          headers: auth,
          payload: { environment, targetTimestamp: new Date(Date.now() - 60_000).toISOString() },
        });
        expect(response.statusCode).toBe(503);
        expect(response.json().code).toBe('RESTORE_APPLICATION_CUTOVER_UNAVAILABLE');
        expect(await store.listDatabaseRestores(instanceId)).toEqual([]);
        expect(manifests).toEqual([]);
        expect(reads).toEqual([]);
      });
    }
  }

  for (const clusterReady of [false, true]) {
    it(`ready=${clusterReady}: never completes without application cutover or changes connection secrets`, async () => {
      const { project, instanceId } = await seed('production');
      await store.upsertProjectSecret({
        projectId: project.id,
        key: 'PROD_DATABASE_URL',
        valueEncrypted: 'opaque-fixture',
      });
      const before = await store.listProjectSecrets(project.id);
      const secretWrites = vi.spyOn(store, 'upsertProjectSecret');
      const restore = await store.createDatabaseRestore({ databaseInstanceId: instanceId });
      await store.updateDatabaseRestore(restore.id, { status: 'RUNNING', startedAt: new Date().toISOString() });
      ready = clusterReady;
      const response = await app!.inject({
        method: 'POST',
        url: '/internal/database-maintenance',
        headers: internalAuth,
      });
      expect(response.statusCode).toBe(200);
      const [record] = await store.listDatabaseRestores(instanceId);
      expect(record.status).toBe(clusterReady ? 'FAILED' : 'RUNNING');
      expect(record.completedAt).toBeUndefined();
      if (clusterReady) expect(record.error).toBe('RESTORE_APPLICATION_CUTOVER_UNAVAILABLE');
      expect(secretWrites).not.toHaveBeenCalled();
      expect(await store.listProjectSecrets(project.id)).toEqual(before);
      expect(reads.some((path) => path.startsWith('/databases/secret'))).toBe(false);
      expect(manifests[0].spec).toMatchObject({ cluster: { name: clusterName(project.id, 'production') } });
    });
  }

  it('does not report a transition when persisting the failure failed', async () => {
    const { instanceId } = await seed('development');
    const restore = await store.createDatabaseRestore({ databaseInstanceId: instanceId });
    await store.updateDatabaseRestore(restore.id, { status: 'RUNNING' });
    vi.spyOn(store, 'updateDatabaseRestore').mockResolvedValue(undefined);
    ready = true;
    const response = await app!.inject({
      method: 'POST',
      url: '/internal/database-maintenance',
      headers: internalAuth,
    });
    expect(response.json().restoresAdvanced).toBe(0);
    expect((await store.listDatabaseRestores(instanceId))[0].status).toBe('RUNNING');
  });
});
