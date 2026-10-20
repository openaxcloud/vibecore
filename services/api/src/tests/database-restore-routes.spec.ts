/**
 * Real Fastify handlers/auth via local injection, explicit in-memory persistence
 * and unclaimed-job fixtures. No PostgreSQL, network or physical restore claim.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp } from '../app.js';
import {
  DatabaseRestoreError,
  type DatabaseRestorePorts,
  type DatabaseRestoreRepository,
  type RestoreExecution,
} from '../database-restore-contract.js';
import { DatabaseRestoreCoordinator } from '../database-restore-executor.js';
import { TestApiStore } from './test-api-store.js';

let app: Awaited<ReturnType<typeof buildApiApp>> | undefined;

const headers = { authorization: 'Bearer restore-routes-synthetic-session' };

beforeEach(() => {
  vi.stubEnv('DB_ROLLBACK_ENABLED', 'true');
  vi.stubEnv('DB_BACKUP_BUCKET', '');
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('REDIS_URL', '');
  vi.stubEnv('WORKSPACE_MANAGER_URL', '');
  vi.stubEnv('INTERNAL_API_SHARED_SECRET', 'restore-routes-internal-fixture');
  vi.stubGlobal('fetch', () => {
    throw new Error('No network permitted by restore route fixture');
  });
});
afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function setup(environment: 'development' | 'production', available = true) {
  const store = new TestApiStore();
  const user = await store.createUser({ email: 'restore-routes@example.invalid', passwordHash: 'disabled-fixture' });
  const org = await store.createOrganization({ name: 'Fixture', slug: 'restore-routes', ownerUserId: user.id });
  const project = await store.createProject({ organizationId: org.id, name: 'Fixture', slug: 'restore-routes' });
  await store.createSession({
    userId: user.id,
    token: 'restore-routes-synthetic-session',
    expiresAt: new Date(Date.now() + 60_000),
  });
  await store.upsertSubscription({ organizationId: org.id, planKey: 'team', status: 'ACTIVE' });

  const instance = await store.createDatabaseInstance({
    projectId: project.id,
    organizationId: org.id,
    environment,
    retentionDays: 28,
  });
  await store.updateDatabaseInstance(instance.id, { status: 'ACTIVE' });

  const records = new Map<string, RestoreExecution>();

  const unused = async (): Promise<never> => {
    throw new Error('Unexpected driver call in unclaimed-job fixture');
  };
  const repository: DatabaseRestoreRepository = {
    admit: vi.fn(async (input) => {
      const restore = await store.createDatabaseRestore({
        databaseInstanceId: input.instance.id,
        snapshotId: input.snapshot?.id,
        targetTimestamp: input.targetTimestamp,
        requestedByUserId: input.requestedByUserId,
      });
      const record: RestoreExecution = {
        restore,
        instance: input.instance,
        phase: 'PENDING',
        active: true,
        pendingFenceTokens: [],
        expectedBindingVersion: 0,
        targetId: `fixture-${restore.id}`,
      };
      records.set(restore.id, record);

      return record;
    }),
    get: async (id) => records.get(id),
    pending: async () => [],
    claim: vi.fn(async () => undefined),
    checkpoint: unused,
    cutover: unused,
    complete: unused,
    fail: unused,
    resume: unused,
    acknowledgeFence: unused,
  };
  const ports: DatabaseRestorePorts = {
    available: async () => available,
    validateArchive: unused,
    prepareTarget: unused,
    quiesceApplication: unused,
    reconnectAndReadback: unused,
    releaseApplication: unused,
    fenceAttempt: unused,
  };
  const coordinator = new DatabaseRestoreCoordinator({
    repository,
    ports,
    encryptConnection: () => {
      throw new Error('No connection in route fixture');
    },
    decryptConnection: () => {
      throw new Error('No connection in route fixture');
    },
  });
  app = await buildApiApp({
    store,
    databaseRestoreCoordinator: coordinator,
    emailProvider: {
      async send() {
        throw new Error('No email in route fixture');
      },
    },
  });

  return { store, project, instance, repository };
}

describe('managed restore routes use the coordinated journal', () => {
  for (const endpoint of ['restore', 'restores']) {
    it(`${endpoint}: reports admission contention without starting a restore and accepts a subsequent retry`, async () => {
      const f = await setup('development');
      vi.mocked(f.repository.admit).mockRejectedValueOnce(new DatabaseRestoreError('RESTORE_ADMISSION_BUSY'));

      const request = {
        method: 'POST' as const,
        url: `/projects/${f.project.id}/database/${endpoint}`,
        headers,
        payload: { targetTimestamp: new Date(Date.now() - 60_000).toISOString() },
      };

      const busy = await app!.inject(request);
      expect(busy.statusCode).toBe(409);
      expect(busy.json().code).toBe('RESTORE_ADMISSION_BUSY');
      expect(f.repository.claim).not.toHaveBeenCalled();
      expect(await f.store.listDatabaseRestores(f.instance.id)).toEqual([]);

      const retry = await app!.inject(request);
      expect(retry.statusCode).toBe(202);
      expect(retry.json().restore.status).toBe('PENDING');
      expect(f.repository.claim).toHaveBeenCalledTimes(1);
      expect(await f.store.listDatabaseRestores(f.instance.id)).toHaveLength(1);
    });
  }

  for (const environment of ['development', 'production'] as const) {
    for (const endpoint of ['restore', 'restores']) {
      it(`${endpoint}/${environment}: admits the authorized scope and returns pending, never a fake completed result`, async () => {
        const f = await setup(environment);
        const targetTimestamp = new Date(Date.now() - 60_000).toISOString();

        const response = await app!.inject({
          method: 'POST',
          url: `/projects/${f.project.id}/database/${endpoint}`,
          headers,
          payload: { environment, targetTimestamp },
        });
        expect(response.statusCode).toBe(202);
        expect(response.json().restore).toMatchObject({
          status: 'PENDING',
          phase: 'PENDING',
          applicationCutoverVerified: false,
        });
        expect(f.repository.admit).toHaveBeenCalledWith(
          expect.objectContaining({
            instance: expect.objectContaining({ id: f.instance.id, projectId: f.project.id, environment }),
            targetTimestamp,
          }),
        );
        expect(f.repository.claim).toHaveBeenCalledTimes(1);

        const read = await app!.inject({
          method: 'GET',
          url: `/projects/${f.project.id}/database?environment=${environment}`,
          headers,
        });
        expect(read.statusCode).toBe(200);
        expect(read.json().restores[0]).toMatchObject({ status: 'PENDING', applicationCutoverVerified: false });
      });
    }
  }

  it('refuses unavailable capability before admission and keeps recovery coverage unknown', async () => {
    const f = await setup('development', false);

    const response = await app!.inject({
      method: 'POST',
      url: `/projects/${f.project.id}/database/restores`,
      headers,
      payload: { targetTimestamp: new Date(Date.now() - 60_000).toISOString() },
    });
    expect(response.statusCode).toBe(503);
    expect(f.repository.admit).not.toHaveBeenCalled();
    expect(await f.store.listDatabaseRestores(f.instance.id)).toEqual([]);

    const points = await app!.inject({
      method: 'GET',
      url: `/projects/${f.project.id}/database/recovery-points`,
      headers,
    });
    expect(points.statusCode).toBe(200);
    expect(points.json()).toMatchObject({ window: null, restoreCapability: { available: false } });
  });

  it('checks the selected snapshot even when a timestamp is also supplied', async () => {
    const f = await setup('development');

    const response = await app!.inject({
      method: 'POST',
      url: `/projects/${f.project.id}/database/restores`,
      headers,
      payload: { snapshotId: 'foreign-snapshot', targetTimestamp: new Date(Date.now() - 60_000).toISOString() },
    });
    expect(response.statusCode).toBe(404);
    expect(f.repository.admit).not.toHaveBeenCalled();
  });

  it('does not manufacture continuous recovery coverage from an available per-request driver', async () => {
    const f = await setup('production');

    const points = await app!.inject({
      method: 'GET',
      url: `/projects/${f.project.id}/database/recovery-points?environment=production`,
      headers,
    });
    expect(points.statusCode).toBe(200);
    expect(points.json()).toMatchObject({ window: null, restoreCapability: { available: true } });
  });

  it('refuses manual and automatic legacy backups after cutover, without creating a recovery point', async () => {
    const f = await setup('development');
    f.store.databaseInstances.set(f.instance.id, {
      ...f.store.databaseInstances.get(f.instance.id)!,
      activeTargetRef: 'fixture-restored-target',
      bindingVersion: 1,
    });

    const manual = await app!.inject({
      method: 'POST',
      url: `/projects/${f.project.id}/database/snapshots`,
      headers,
      payload: { environment: 'development' },
    });
    expect(manual.statusCode).toBe(503);
    expect(manual.json().code).toBe('RESTORE_BACKUP_TARGET_UNAVAILABLE');

    const automatic = await app!.inject({
      method: 'POST',
      url: '/internal/database-maintenance',
      headers: { authorization: 'Bearer restore-routes-internal-fixture' },
    });
    expect(automatic.statusCode).toBe(200);
    expect(automatic.json().snapshotted).toBe(0);
    expect(await f.store.listDatabaseSnapshots(f.instance.id)).toEqual([]);
  });
});
