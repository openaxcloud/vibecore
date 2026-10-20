/**
 * Real PostgreSQL metadata transactions, using only newly owned tenants.
 * No provider, cluster, archive, or real connection credential is exercised.
 */
import { randomUUID } from 'node:crypto';
import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { encryptJson } from '@vibecore/security';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApiApp } from '../app.js';
import * as databaseProvisioner from '../database-provisioner.js';
import { DatabaseRestoreCoordinator } from '../database-restore-executor.js';
import { PrismaDatabaseRestoreRepository } from '../database-restore-repository.js';
import { PrismaApiStore } from '../prisma-store.js';

const dedicatedUrl = process.env.RESTORE_TEST_DATABASE_URL;
const run = dedicatedUrl ? describe : describe.skip;
const organizations: string[] = [];
const users: string[] = [];
const realFetch = globalThis.fetch;
let prisma: DatabaseClient;
let observer: DatabaseClient;
let store: PrismaApiStore;

function barrier() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

run('database provisioning and project transfer — dedicated PostgreSQL', () => {
  beforeAll(() => {
    const url = new URL(dedicatedUrl!);

    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port === '55439') {
      throw new Error('Transfer tests require a dedicated loopback control database');
    }

    vi.stubEnv('DATABASE_URL', dedicatedUrl);
    vi.stubEnv('DB_ROLLBACK_ENABLED', 'true');
    vi.stubEnv('DB_BACKUP_BUCKET', '');
    vi.stubEnv('REDIS_URL', '');
    vi.stubEnv('WORKSPACE_MANAGER_URL', '');
    prisma = createDatabaseClient({ poolMax: 2 });
    observer = createDatabaseClient({ poolMax: 2 });
    store = new PrismaApiStore(prisma);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    const ids = organizations.splice(0);

    if (ids.length) {
      await prisma.project.deleteMany({ where: { organizationId: { in: ids } } });
      await prisma.organization.deleteMany({ where: { id: { in: ids } } });
    }
    const userIds = users.splice(0);
    if (userIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await observer?.$disconnect();
    vi.unstubAllEnvs();
  });

  async function fixture(withInstances = true) {
    const suffix = randomUUID();
    const source = await prisma.organization.create({
      data: { name: `Transfer source ${suffix}`, slug: `db-transfer-source-${suffix}` },
    });
    organizations.push(source.id);
    const target = await prisma.organization.create({
      data: { name: `Transfer target ${suffix}`, slug: `db-transfer-target-${suffix}` },
    });
    organizations.push(target.id);
    const project = await store.createProject({
      organizationId: source.id,
      name: `Transfer fixture ${suffix}`,
      slug: `fixture-${suffix}`,
    });
    const instances = withInstances
      ? await Promise.all(
          (['development', 'production'] as const).map((environment) =>
            store.createDatabaseInstance({
              projectId: project.id,
              organizationId: source.id,
              environment,
              retentionDays: 7,
            }),
          ),
        )
      : [];
    const transfer = {
      projectId: project.id,
      expectedSourceOrganizationId: source.id,
      targetOrganizationId: target.id,
    };

    return { source, target, project, instances, transfer };
  }

  type HttpState = 'ACTIVE' | 'recent' | 'stale' | 'absent';

  async function httpFixture(
    environment: 'development' | 'production',
    state: HttpState,
    withHistoricalEvidence = false,
  ) {
    const context = await fixture(state !== 'absent');
    const selected = context.instances.find((entry) => entry.environment === environment);
    if (selected) {
      await prisma.databaseInstance.update({
        where: { id: selected.id },
        data: {
          status: state === 'ACTIVE' ? 'ACTIVE' : 'PROVISIONING',
          createdAt: new Date(Date.now() - (state === 'stale' ? 31 * 60_000 : 1000)),
          updatedAt: new Date(Date.now() - (state === 'stale' ? 31 * 60_000 : 1000)),
        },
      });
      await store.createDatabaseSnapshot({
        databaseInstanceId: selected.id,
        kind: 'manual',
        label: 'Synthetic destination-owned snapshot',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    }
    const key = environment === 'production' ? 'PROD_DATABASE_URL' : 'DATABASE_URL';
    const secret = await store.upsertProjectSecret({
      projectId: context.project.id,
      key,
      valueEncrypted: encryptJson({ value: 'postgresql://fixture@127.0.0.1:1/never-connected' }),
    });
    const sessions: string[] = [];
    for (const organizationId of [context.source.id, context.target.id]) {
      const user = await store.createUser({
        email: `provision-transfer-${randomUUID()}@example.invalid`,
        passwordHash: 'disabled-synthetic-fixture',
      });
      users.push(user.id);
      await store.addMember({ organizationId, userId: user.id, roleKey: 'owner' });
      await store.upsertSubscription({ organizationId, planKey: 'team', status: 'ACTIVE' });
      const token = `provision-transfer-${randomUUID()}`;
      await store.createSession({ userId: user.id, token, expiresAt: new Date(Date.now() + 60_000) });
      expect((await store.listOrganizations(user.id)).map((row) => row.id)).toEqual([organizationId]);
      sessions.push(token);
    }
    // Explicit provider spies. All authorization, HTTP, metadata reads and
    // transfer transactions are real; no Kubernetes or physical provider claim.
    const provision = vi.fn(async () => ({ applied: true, clusterName: 'synthetic-provider-receipt' }));
    const connection = vi.fn(async (): Promise<string | undefined> => undefined);
    const forbidden = vi.fn(async (): Promise<never> => {
      throw new Error('Unexpected physical provider operation in transfer fixture');
    });
    vi.spyOn(databaseProvisioner, 'resolveDefaultDatabaseProvisioner').mockReturnValue({
      active: true,
      restoreAvailable: false,
      provisionInstance: provision,
      getConnectionUri: connection,
      takeSnapshot: forbidden,
      backupStatus: forbidden,
      startRestore: forbidden,
      restoreProgress: forbidden,
      teardown: forbidden,
    });
    const coordinator = withHistoricalEvidence
      ? new DatabaseRestoreCoordinator({
          repository: new PrismaDatabaseRestoreRepository(prisma),
          ports: {
            available: async () => false,
            validateArchive: forbidden,
            prepareTarget: forbidden,
            quiesceApplication: forbidden,
            reconnectAndReadback: forbidden,
            releaseApplication: forbidden,
            fenceAttempt: forbidden,
          },
          encryptConnection: () => {
            throw new Error('No connection mutation in historical evidence fixture');
          },
          decryptConnection: () => {
            throw new Error('No connection mutation in historical evidence fixture');
          },
        })
      : undefined;
    if (withHistoricalEvidence && selected) {
      // A historical row has no execution journal; the real evidence lookup
      // returns undefined and the route projects its explicitly unverified row.
      await store.createDatabaseRestore({
        databaseInstanceId: selected.id,
        targetTimestamp: new Date(Date.now() - 60_000).toISOString(),
      });
    }
    const app = await buildApiApp({
      store,
      emailProvider: { send: forbidden },
      databaseRestoreCoordinator: coordinator,
    });
    const origin = await app.listen({ host: '127.0.0.1', port: 0 });
    vi.stubGlobal('fetch', (input: Parameters<typeof realFetch>[0], init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.origin !== origin) throw new Error('External HTTP forbidden in transfer fixture');
      return realFetch(input, init);
    });
    const request = async (
      endpoint: 'database' | 'databases' | 'provision',
      token: string,
      locale: 'en' | 'fr' = 'en',
    ) => {
      const response = await fetch(
        `${origin}/projects/${context.project.id}/${endpoint === 'provision' ? 'database/provision' : endpoint}${
          endpoint === 'database' ? `?environment=${environment}` : ''
        }`,
        {
          method: endpoint === 'provision' ? 'POST' : 'GET',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            'accept-language': locale,
          },
          body: endpoint === 'provision' ? JSON.stringify({ environment }) : undefined,
          redirect: 'error',
        },
      );
      return {
        status: response.status,
        language: response.headers.get('content-language'),
        body: (await response.json()) as Record<string, unknown>,
      };
    };
    const reads = {
      snapshots: vi.spyOn(store, 'listDatabaseSnapshots'),
      restores: vi.spyOn(store, 'listDatabaseRestores'),
      secrets: vi.spyOn(store, 'listProjectSecrets'),
      secret: vi.spyOn(store, 'getProjectSecret'),
    };
    return {
      ...context,
      selected,
      key,
      secret,
      app,
      request,
      sessions,
      provision,
      connection,
      forbidden,
      reads,
      coordinator,
    };
  }

  const freshReadCases = [
    ...(['development', 'production'] as const).flatMap((environment) => [
      ...(['ACTIVE', 'recent'] as const).map((state) => ({ endpoint: 'database' as const, environment, state })),
      ...(['ACTIVE', 'recent', 'stale', 'absent'] as const).map((state) => ({
        endpoint: 'provision' as const,
        environment,
        state,
      })),
    ]),
    ...(['ACTIVE', 'recent'] as const).map((state) => ({
      endpoint: 'databases' as const,
      environment: 'development' as const,
      state,
    })),
  ];

  it.each(freshReadCases)(
    'HTTP $endpoint/$environment/$state refuses source authorization after a transfer before the real instance read',
    async ({ endpoint, environment, state }) => {
      const f = await httpFixture(environment, state);
      const transferStore = new PrismaApiStore(observer);
      const realRead = store.getDatabaseInstanceByProject.bind(store);
      let transferred = false;
      vi.spyOn(store, 'getDatabaseInstanceByProject').mockImplementationOnce(async (projectId, scope) => {
        expect(projectId).toBe(f.project.id);
        expect(scope ?? 'development').toBe(environment);
        await transferStore.transferProject(f.transfer);
        expect(await observer.project.findUnique({ where: { id: projectId } })).toMatchObject({
          organizationId: f.target.id,
        });
        transferred = true;
        return realRead(projectId, scope);
      });
      try {
        const response = await f.request(endpoint, f.sessions[0]);
        expect(transferred).toBe(true);
        expect({
          refused: [404, 409].includes(response.status),
          provisionCalls: f.provision.mock.calls.length,
          connectionCalls: f.connection.mock.calls.length,
          snapshots: f.reads.snapshots.mock.calls.length,
          restores: f.reads.restores.mock.calls.length,
          secrets: f.reads.secrets.mock.calls.length,
          secret: f.reads.secret.mock.calls.length,
        }).toEqual({
          refused: true,
          provisionCalls: 0,
          connectionCalls: 0,
          snapshots: 0,
          restores: 0,
          secrets: 0,
          secret: 0,
        });
        expect(response.body).not.toHaveProperty('instance');
        expect(response.body).not.toHaveProperty('snapshots');
        expect(response.body).not.toHaveProperty('connections');
        expect(
          await observer.projectSecret.findUnique({
            where: { projectId_key: { projectId: f.project.id, key: f.key } },
          }),
        ).toMatchObject({ valueEncrypted: f.secret.valueEncrypted });
        expect(await observer.databaseInstance.count({ where: { projectId: f.project.id } })).toBe(
          state === 'absent' ? 0 : 2,
        );
        const authorized = await f.request(endpoint, f.sessions[1]);
        expect(authorized.status).toBe(endpoint === 'provision' && ['stale', 'absent'].includes(state) ? 202 : 200);
        if (endpoint !== 'databases') {
          expect(authorized.body.instance).toMatchObject({ organizationId: f.target.id, environment });
        } else {
          expect(authorized.body.connections).toEqual(
            expect.arrayContaining([expect.objectContaining({ key: f.key })]),
          );
        }
        expect(f.forbidden).not.toHaveBeenCalled();
      } finally {
        await f.app.close();
      }
    },
  );

  it.each(['development', 'production'] as const)(
    'HTTP database/%s refuses the fresh destination fallback after a source provider response returns late',
    async (environment) => {
      const f = await httpFixture(environment, 'recent');
      const transferStore = new PrismaApiStore(observer);
      let transferred = false;
      f.connection.mockImplementationOnce(async () => {
        // The source URI request was already issued while A still owned the
        // project. Its late response must not expose the fallback instance B.
        await transferStore.transferProject(f.transfer);
        transferred = true;
        return 'postgresql://fixture@127.0.0.1:1/late-source-not-connected';
      });
      try {
        const response = await f.request('database', f.sessions[0]);
        expect(transferred).toBe(true);
        expect({
          refused: [404, 409].includes(response.status),
          connectionCalls: f.connection.mock.calls.length,
          snapshots: f.reads.snapshots.mock.calls.length,
          restores: f.reads.restores.mock.calls.length,
          secrets: f.reads.secrets.mock.calls.length,
          secret: f.reads.secret.mock.calls.length,
        }).toEqual({ refused: true, connectionCalls: 1, snapshots: 0, restores: 0, secrets: 0, secret: 1 });
        expect(response.body).not.toHaveProperty('instance');
        expect(
          await observer.projectSecret.findUnique({
            where: { projectId_key: { projectId: f.project.id, key: f.key } },
          }),
        ).toMatchObject({ valueEncrypted: f.secret.valueEncrypted });
        const authorized = await f.request('database', f.sessions[1]);
        expect(authorized.status).toBe(200);
        expect(authorized.body.instance).toMatchObject({
          organizationId: f.target.id,
          environment,
          status: 'PROVISIONING',
        });
        expect(authorized.body.snapshots).toHaveLength(1);
        expect(f.provision).not.toHaveBeenCalled();
        expect(f.forbidden).not.toHaveBeenCalled();
      } finally {
        await f.app.close();
      }
    },
  );

  it.each(
    (['development', 'production'] as const).flatMap((environment) =>
      (['snapshots', 'evidence'] as const).map((phase) => ({ environment, phase })),
    ),
  )(
    'HTTP final-scope/$environment/$phase refuses a transfer during the final metadata projection',
    async ({ environment, phase }) => {
      const f = await httpFixture(environment, 'ACTIVE', phase === 'evidence');
      const transferStore = new PrismaApiStore(observer);
      let transferred = false;
      const transfer = async () => {
        await transferStore.transferProject(f.transfer);
        expect(await observer.project.findUnique({ where: { id: f.project.id } })).toMatchObject({
          organizationId: f.target.id,
        });
        transferred = true;
      };
      if (phase === 'snapshots') {
        f.reads.snapshots.mockImplementationOnce(async (instanceId) => {
          expect(instanceId).toBe(f.selected!.id);
          await transfer();
          await transferStore.createDatabaseSnapshot({
            databaseInstanceId: instanceId,
            kind: 'manual',
            label: 'Synthetic snapshot written only after destination ownership',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          });
          // Return a real database read, including a newly persisted B record.
          return transferStore.listDatabaseSnapshots(instanceId);
        });
      } else {
        const realEvidence = f.coordinator!.evidence.bind(f.coordinator);
        vi.spyOn(f.coordinator!, 'evidence').mockImplementationOnce(async (restoreId) => {
          await transfer();
          return realEvidence(restoreId);
        });
      }
      try {
        const response = await f.request('database', f.sessions[0]);
        expect(transferred).toBe(true);
        expect(response.status).toBe(409);
        expect(response.body.code).toBe('RESTORE_INSTANCE_CHANGED');
        expect(response.body).not.toHaveProperty('instance');
        expect(response.body).not.toHaveProperty('snapshots');
        expect(response.body).not.toHaveProperty('restores');
        expect(f.provision).not.toHaveBeenCalled();
        expect(f.connection).not.toHaveBeenCalled();
        expect(f.forbidden).not.toHaveBeenCalled();
        const authorized = await f.request('database', f.sessions[1]);
        expect(authorized.status).toBe(200);
        expect(authorized.body.instance).toMatchObject({ organizationId: f.target.id, environment });
        expect(authorized.body.snapshots).toHaveLength(phase === 'snapshots' ? 2 : 1);
        if (phase === 'evidence') {
          expect(authorized.body.restores).toEqual([expect.objectContaining({ applicationCutoverVerified: false })]);
        }
      } finally {
        await f.app.close();
      }
    },
  );

  it.each([
    [
      'en',
      'The project or its database changed during this request. Reload the project to verify your access before trying again.',
    ],
    [
      'fr',
      'Le projet ou sa base a changé pendant cette demande. Rechargez le projet pour vérifier vos accès avant de réessayer.',
    ],
  ] as const)(
    'HTTP scope-message/%s returns an actionable localized refusal rather than a raw error code',
    async (locale, expectedMessage) => {
      const f = await httpFixture('development', 'ACTIVE');
      const transferStore = new PrismaApiStore(observer);
      const realRead = store.getDatabaseInstanceByProject.bind(store);
      vi.spyOn(store, 'getDatabaseInstanceByProject').mockImplementationOnce(async (projectId, scope) => {
        await transferStore.transferProject(f.transfer);
        return realRead(projectId, scope);
      });
      try {
        const response = await f.request('database', f.sessions[0], locale);
        expect(response.status).toBe(409);
        expect(response.language).toBe(locale);
        expect(response.body).toEqual({ code: 'RESTORE_INSTANCE_CHANGED', error: expectedMessage });
        expect(f.provision).not.toHaveBeenCalled();
        expect(f.connection).not.toHaveBeenCalled();
        expect(f.reads.snapshots).not.toHaveBeenCalled();
        const authorized = await f.request('database', f.sessions[1], locale);
        expect(authorized.status).toBe(200);
        expect(authorized.body.instance).toMatchObject({ organizationId: f.target.id });
      } finally {
        await f.app.close();
      }
    },
  );

  it.each(['development', 'production'] as const)(
    'refuses stale initial %s creation under A after transfer, then accepts an authorized fresh B request',
    async (environment) => {
      const context = await fixture(false);
      const captured = {
        projectId: context.project.id,
        organizationId: context.source.id,
        environment,
        retentionDays: 7,
      };
      await store.transferProject(context.transfer);

      await expect(store.createDatabaseInstance(captured)).rejects.toMatchObject({
        code: 'DATABASE_PROVISION_STATE_CHANGED',
        statusCode: 409,
      });
      expect(await observer.databaseInstance.count({ where: { projectId: context.project.id } })).toBe(0);
      expect((await observer.project.findUnique({ where: { id: context.project.id } }))?.organizationId).toBe(
        context.target.id,
      );

      const fresh = await store.createDatabaseInstance({ ...captured, organizationId: context.target.id });
      expect(fresh).toMatchObject({
        projectId: context.project.id,
        organizationId: context.target.id,
        environment,
        status: 'PROVISIONING',
      });
      expect(await observer.databaseInstance.count({ where: { projectId: context.project.id } })).toBe(1);
    },
  );

  it.each(['deleted', 'deletion-pending'] as const)(
    'refuses initial creation once the project is %s',
    async (state) => {
      const context = await fixture(false);
      await prisma.project.update({
        where: { id: context.project.id },
        data: state === 'deleted' ? { deletedAt: new Date() } : { runtimeDeletionPending: true },
      });

      await expect(
        store.createDatabaseInstance({
          projectId: context.project.id,
          organizationId: context.source.id,
          environment: 'development',
          retentionDays: 7,
        }),
      ).rejects.toMatchObject({ code: 'DATABASE_PROVISION_STATE_CHANGED', statusCode: 409 });
      expect(await observer.databaseInstance.count({ where: { projectId: context.project.id } })).toBe(0);
    },
  );

  it.each(['development', 'production'] as const)(
    'reconciles fresh %s ownership after transfer but rejects the old source response',
    async (environment) => {
      const context = await fixture();
      const oldInstance = context.instances.find((entry) => entry.environment === environment)!;
      const key = environment === 'production' ? 'PROD_DATABASE_URL' : 'DATABASE_URL';
      const secret = await store.upsertProjectSecret({
        projectId: context.project.id,
        key,
        valueEncrypted: 'fixture-cipher-before-transfer',
      });
      await store.transferProject(context.transfer);

      // This is the continuation captured before ownership changed, not a new
      // authorized provisioning request under the destination organization.
      expect(
        await store.reconcileDatabaseProvisioning({
          expected: oldInstance,
          binding: { expectedSecret: secret, valueEncrypted: 'fixture-cipher-stale-source' },
        }),
      ).toBeUndefined();
      const unchangedSecret = await store.getProjectSecret(context.project.id, key);
      expect(unchangedSecret?.valueEncrypted).toBe(secret.valueEncrypted);

      const freshInstance = await new PrismaApiStore(observer).getDatabaseInstanceByProject(
        context.project.id,
        environment,
      );
      expect(freshInstance?.organizationId, 'fresh instance organizationId must follow the transferred project').toBe(
        context.target.id,
      );
      expect(freshInstance).toMatchObject({
        id: oldInstance.id,
        projectId: context.project.id,
        organizationId: context.target.id,
        environment,
        status: 'PROVISIONING',
        bindingVersion: 0,
      });
      expect(freshInstance?.activeTargetRef).toBeUndefined();
      expect(
        await store.reconcileDatabaseProvisioning({
          expected: freshInstance!,
          binding: { expectedSecret: unchangedSecret, valueEncrypted: 'fixture-cipher-fresh-destination' },
        }),
      ).toMatchObject({ id: oldInstance.id, organizationId: context.target.id, status: 'ACTIVE' });
      expect((await store.getProjectSecret(context.project.id, key))?.valueEncrypted).toBe(
        'fixture-cipher-fresh-destination',
      );
      const otherEnvironment = context.instances.find((entry) => entry.id !== oldInstance.id)!;
      expect(await observer.databaseInstance.findUnique({ where: { id: otherEnvironment.id } })).toMatchObject({
        organizationId: context.target.id,
        environment: otherEnvironment.environment,
        status: 'PROVISIONING',
      });
    },
  );

  it('commits both environment owners atomically with the project owner', async () => {
    const context = await fixture();
    const entered = barrier();
    const release = barrier();
    const gated = prisma.$extends({
      query: {
        project: {
          async update({ args, query }) {
            const row = await query(args);

            if (args.where.id === context.project.id) {
              entered.resolve();
              await release.promise;
            }

            return row;
          },
        },
      },
    });
    const outcome = new PrismaApiStore(gated as unknown as DatabaseClient).transferProject(context.transfer).then(
      (value) => ({ value, error: undefined }),
      (error: unknown) => ({ value: undefined, error }),
    );

    try {
      await Promise.race([
        entered.promise,
        outcome.then(() => {
          throw new Error('Transfer settled before the real project write barrier');
        }),
      ]);
      expect((await observer.project.findUnique({ where: { id: context.project.id } }))?.organizationId).toBe(
        context.source.id,
      );
      const beforeCommit = await observer.databaseInstance.findMany({ where: { projectId: context.project.id } });
      expect(beforeCommit).toHaveLength(2);
      expect(beforeCommit.every((entry) => entry.organizationId === context.source.id)).toBe(true);
    } finally {
      release.resolve();
      await outcome;
    }

    const settled = await outcome;
    expect(settled.error).toBeUndefined();
    expect(settled.value?.organizationId).toBe(context.target.id);
    const afterCommit = await observer.databaseInstance.findMany({ where: { projectId: context.project.id } });
    expect(afterCommit).toHaveLength(2);
    expect(afterCommit.every((entry) => entry.organizationId === context.target.id)).toBe(true);
  });

  it('rolls back both instance owners when the real project write is followed by an error', async () => {
    const context = await fixture();
    let projectWriteRan = false;
    const failing = prisma.$extends({
      query: {
        project: {
          async update({ args, query }) {
            const row = await query(args);

            if (args.where.id === context.project.id) {
              projectWriteRan = true;
              throw new Error('Fixture failure after real project update');
            }

            return row;
          },
        },
      },
    });

    await expect(
      new PrismaApiStore(failing as unknown as DatabaseClient).transferProject(context.transfer),
    ).rejects.toThrow('Fixture failure after real project update');
    expect(projectWriteRan).toBe(true);
    expect((await observer.project.findUnique({ where: { id: context.project.id } }))?.organizationId).toBe(
      context.source.id,
    );
    const instances = await observer.databaseInstance.findMany({ where: { projectId: context.project.id } });
    expect(instances).toHaveLength(2);
    expect(instances.every((entry) => entry.organizationId === context.source.id)).toBe(true);
  });

  it('still refuses transfer while a restore admission holds the instance', async () => {
    const context = await fixture();
    const instance = await store.updateDatabaseInstance(context.instances[0].id, { status: 'ACTIVE' });
    await store.upsertProjectSecret({
      projectId: context.project.id,
      key: 'DATABASE_URL',
      valueEncrypted: 'fixture-cipher-original',
    });
    const operation = await new PrismaDatabaseRestoreRepository(prisma).admit({
      expectedOrganizationId: context.source.id,
      instance: instance!,
      targetTimestamp: new Date(Date.now() - 60_000).toISOString(),
    });

    await expect(store.transferProject(context.transfer)).rejects.toMatchObject({ code: 'RESTORE_PROJECT_LOCKED' });
    expect((await observer.project.findUnique({ where: { id: context.project.id } }))?.organizationId).toBe(
      context.source.id,
    );
    const journal = await observer.databaseRestoreExecution.findUnique({ where: { restoreId: operation.restore.id } });
    expect(journal?.activeLock).toBe(instance!.id);
    expect(
      (await observer.databaseInstance.findMany({ where: { projectId: context.project.id } })).every(
        (entry) => entry.organizationId === context.source.id,
      ),
    ).toBe(true);
  });

  it('still refuses transfer of a restored target without lifecycle support', async () => {
    const context = await fixture();
    await prisma.databaseInstance.update({
      where: { id: context.instances[1].id },
      data: { status: 'ACTIVE', activeTargetRef: `fixture-target-${randomUUID()}`, bindingVersion: 1 },
    });

    await expect(store.transferProject(context.transfer)).rejects.toMatchObject({
      code: 'RESTORE_TARGET_LIFECYCLE_UNAVAILABLE',
      statusCode: 503,
    });
    expect((await observer.project.findUnique({ where: { id: context.project.id } }))?.organizationId).toBe(
      context.source.id,
    );
    expect(
      (await observer.databaseInstance.findMany({ where: { projectId: context.project.id } })).every(
        (entry) => entry.organizationId === context.source.id,
      ),
    ).toBe(true);
  });
});
