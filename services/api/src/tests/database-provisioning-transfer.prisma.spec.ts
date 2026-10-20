/**
 * Real PostgreSQL metadata transactions, using only newly owned tenants.
 * No provider, cluster, archive, or real connection credential is exercised.
 */
import { randomUUID } from 'node:crypto';
import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaDatabaseRestoreRepository } from '../database-restore-repository.js';
import { PrismaApiStore } from '../prisma-store.js';

const dedicatedUrl = process.env.RESTORE_TEST_DATABASE_URL;
const run = dedicatedUrl ? describe : describe.skip;
const organizations: string[] = [];
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
    prisma = createDatabaseClient({ poolMax: 2 });
    observer = createDatabaseClient({ poolMax: 2 });
    store = new PrismaApiStore(prisma);
  });

  afterEach(async () => {
    const ids = organizations.splice(0);

    if (ids.length) {
      await prisma.project.deleteMany({ where: { organizationId: { in: ids } } });
      await prisma.organization.deleteMany({ where: { id: { in: ids } } });
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
