import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

import { createDefaultProjectManifest, projectManifestDigest } from '../project-manifest.js';
import { LocalProjectStorage } from '../project-storage.js';
import { PrismaApiStore } from '../prisma-store.js';
import type { ProjectReleaseBarrierLease } from '../store.js';
import { acquireTestProjectReleaseFence } from './project-release-barrier-fixture.js';

async function canReachDatabase() {
  if (!process.env.DATABASE_URL) return false;
  const prisma = createDatabaseClient();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

const runDbTests = (await canReachDatabase()) ? describe.sequential : describe.skip;

function suffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function bounded<T>(promise: Promise<T>, milliseconds = 10_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('PROJECT_PHYSICAL_INTERLEAVING_TIMEOUT')), milliseconds);
      timer.unref?.();
    }),
  ]);
}

async function seedProject(prisma: DatabaseClient, label: string) {
  const token = suffix();
  const source = await prisma.organization.create({
    data: { name: `${label} source ${token}`, slug: `${label}-source-${token}` },
  });
  const target = await prisma.organization.create({
    data: { name: `${label} target ${token}`, slug: `${label}-target-${token}` },
  });
  const project = await prisma.project.create({
    data: { organizationId: source.id, name: `${label} ${token}`, slug: `${label}-${token}` },
  });

  return { source, target, project };
}

async function cleanupProject(
  prisma: DatabaseClient,
  input: { projectIds: string[]; organizationIds: string[] },
): Promise<void> {
  await prisma.project.deleteMany({ where: { id: { in: input.projectIds } } }).catch(() => undefined);
  await prisma.organization.deleteMany({ where: { id: { in: input.organizationIds } } }).catch(() => undefined);
}

class LostAdvisoryBeforeFilesystemStore extends PrismaApiStore {
  constructor(
    prisma: DatabaseClient,
    private readonly filesystemWaitEntered: ReturnType<typeof deferred>,
    private readonly resumeFilesystemWait: Promise<void>,
  ) {
    super(prisma);
  }

  /** Model a dead session after the first DB validation: no advisory remains. */
  protected override withProjectPhysicalBarriers<T>(_projectIds: string[], effect: () => Promise<T>): Promise<T> {
    return effect();
  }

  protected override async withProjectFilesystemLock<T>(projectId: string, effect: () => Promise<T>): Promise<T> {
    this.filesystemWaitEntered.resolve();
    await this.resumeFilesystemWait;
    return super.withProjectFilesystemLock(projectId, effect);
  }
}

class CountingLocalProjectStorage extends LocalProjectStorage {
  readEffects = 0;

  override async listFilesWithinPhysicalAccess(projectId: string, workspaceId?: string) {
    this.readEffects += 1;
    return super.listFilesWithinPhysicalAccess(projectId, workspaceId);
  }
}

runDbTests('project physical barrier — session advisory lease', () => {
  it('holds transfer behind an effect longer than the holder acquisition timeout', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const holderStore = new PrismaApiStore(prismaA, undefined, undefined, { acquireTimeoutMs: 50 });
    const transferStore = new PrismaApiStore(prismaB);
    const effectEntered = deferred();
    const releaseEffect = deferred();
    const seeded = await seedProject(prismaA, 'physical-long-effect');
    const scope = { projectId: seeded.project.id, expectedOrganizationId: seeded.source.id };

    try {
      const holder = holderStore.withProjectPhysicalMutation(scope, async () => {
        effectEntered.resolve();
        await releaseEffect.promise;
      });
      await effectEntered.promise;

      let transferSettled = false;
      const transfer = transferStore
        .transferProject({
          ...scope,
          expectedOwnershipEpoch: 0,
          targetOrganizationId: seeded.target.id,
          idempotencyKey: 'physical-long-effect-transfer-0001',
          assertExternalStorageDetached: async () => undefined,
          validateTargetAdmission: async () => undefined,
        })
        .finally(() => {
          transferSettled = true;
        });

      await delay(150);
      expect(transferSettled).toBe(false);

      releaseEffect.resolve();
      await bounded(Promise.all([holder, transfer]));
      await expect(prismaA.project.findUniqueOrThrow({ where: { id: seeded.project.id } })).resolves.toMatchObject({
        organizationId: seeded.target.id,
      });
    } finally {
      releaseEffect.resolve();
      await cleanupProject(prismaA, {
        projectIds: [seeded.project.id],
        organizationIds: [seeded.source.id, seeded.target.id],
      });
      await Promise.allSettled([holderStore.disconnect(), transferStore.disconnect()]);
    }
  });

  it('times out only lock acquisition and executes no waiter effect', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const holderStore = new PrismaApiStore(prismaA);
    const waiterStore = new PrismaApiStore(prismaB, undefined, undefined, { acquireTimeoutMs: 50 });
    const effectEntered = deferred();
    const releaseEffect = deferred();
    const seeded = await seedProject(prismaA, 'physical-timeout');
    const scope = { projectId: seeded.project.id, expectedOrganizationId: seeded.source.id };
    let waiterEffects = 0;

    try {
      const holder = holderStore.withProjectPhysicalMutation(scope, async () => {
        effectEntered.resolve();
        await releaseEffect.promise;
      });
      await effectEntered.promise;

      await expect(
        waiterStore.withProjectPhysicalMutation(scope, async () => {
          waiterEffects += 1;
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_LOCK_TIMEOUT', statusCode: 503 });
      expect(waiterEffects).toBe(0);

      releaseEffect.resolve();
      await holder;
    } finally {
      releaseEffect.resolve();
      await cleanupProject(prismaA, {
        projectIds: [seeded.project.id],
        organizationIds: [seeded.source.id, seeded.target.id],
      });
      await Promise.allSettled([holderStore.disconnect(), waiterStore.disconnect()]);
    }
  });

  it('releases every session lock when an effect throws', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const failingStore = new PrismaApiStore(prismaA);
    const successorStore = new PrismaApiStore(prismaB, undefined, undefined, { acquireTimeoutMs: 500 });
    const seeded = await seedProject(prismaA, 'physical-throw');
    const scope = { projectId: seeded.project.id, expectedOrganizationId: seeded.source.id };
    let successorEffects = 0;

    try {
      await expect(
        failingStore.withProjectPhysicalMutation(scope, async () => {
          throw new Error('EXPECTED_PHYSICAL_EFFECT_FAILURE');
        }),
      ).rejects.toThrow('EXPECTED_PHYSICAL_EFFECT_FAILURE');

      await expect(
        successorStore.withProjectPhysicalMutation(scope, async () => {
          successorEffects += 1;
        }),
      ).resolves.toBeUndefined();
      expect(successorEffects).toBe(1);
    } finally {
      await cleanupProject(prismaA, {
        projectIds: [seeded.project.id],
        organizationIds: [seeded.source.id, seeded.target.id],
      });
      await Promise.allSettled([failingStore.disconnect(), successorStore.disconnect()]);
    }
  });

  it('deduplicates and sorts opposite multi-project orders without deadlock', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const storeA = new PrismaApiStore(prismaA);
    const storeB = new PrismaApiStore(prismaB);
    const first = await seedProject(prismaA, 'physical-order-a');
    const second = await seedProject(prismaA, 'physical-order-b');
    const firstScope = { projectId: first.project.id, expectedOrganizationId: first.source.id };
    const secondScope = { projectId: second.project.id, expectedOrganizationId: second.source.id };
    const effects: string[] = [];

    try {
      await bounded(
        Promise.all([
          storeA.withProjectPhysicalAccesses([firstScope, secondScope, firstScope], async () => {
            effects.push('a');
            await delay(25);
          }),
          storeB.withProjectPhysicalAccesses([secondScope, firstScope], async () => {
            effects.push('b');
            await delay(25);
          }),
        ]),
      );
      expect(effects.sort()).toEqual(['a', 'b']);
    } finally {
      await cleanupProject(prismaA, {
        projectIds: [first.project.id, second.project.id],
        organizationIds: [first.source.id, first.target.id, second.source.id, second.target.id],
      });
      await Promise.allSettled([storeA.disconnect(), storeB.disconnect()]);
    }
  });

  it('linearizes exact local file reads with transfer and never opens B bytes under stale A authority', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const readStore = new PrismaApiStore(prismaA);
    const transferStore = new PrismaApiStore(prismaB);
    const root = await mkdtemp(join(tmpdir(), 'vibecore-transfer-read-'));
    const previousStorageRoot = process.env.PROJECT_STORAGE_DIR;
    const readEntered = deferred();
    const releaseRead = deferred();
    let pauseRead = true;
    const first = await seedProject(prismaA, 'physical-read-first');
    const second = await seedProject(prismaA, 'physical-transfer-first');
    const mutationCoordinator = <T>(
      scope: { projectId: string; expectedOrganizationId: string; workspaceId?: string },
      effect: () => Promise<T>,
    ) => readStore.withProjectPhysicalMutation(scope, effect);
    const storage = new CountingLocalProjectStorage(mutationCoordinator, mutationCoordinator, (scope, effect) =>
      readStore.withProjectPhysicalAccess(scope, async () => {
        if (pauseRead) {
          pauseRead = false;
          readEntered.resolve();
          await releaseRead.promise;
        }
        return effect();
      }),
    );

    process.env.PROJECT_STORAGE_DIR = root;

    try {
      const firstSourceScope = {
        expectedOrganizationId: first.source.id,
      };
      await storage.writeFiles(first.project.id, [{ path: 'tenant.txt', content: 'source-a' }], firstSourceScope);
      const reading = storage.listFiles(first.project.id, firstSourceScope);
      await bounded(readEntered.promise);

      let transferSettled = false;
      const transferring = transferStore
        .transferProject({
          projectId: first.project.id,
          expectedOrganizationId: first.source.id,
          expectedOwnershipEpoch: 0,
          targetOrganizationId: first.target.id,
          idempotencyKey: 'physical-read-first-transfer-0001',
          assertExternalStorageDetached: async () => undefined,
          validateTargetAdmission: async () => undefined,
        })
        .finally(() => {
          transferSettled = true;
        });

      await delay(100);
      expect(transferSettled).toBe(false);
      releaseRead.resolve();
      await expect(reading).resolves.toEqual([expect.objectContaining({ path: 'tenant.txt', content: 'source-a' })]);
      await expect(transferring).resolves.toMatchObject({ organizationId: first.target.id });

      const secondSourceScope = { expectedOrganizationId: second.source.id };
      await storage.writeFiles(second.project.id, [{ path: 'tenant.txt', content: 'source-a' }], secondSourceScope);
      await transferStore.transferProject({
        projectId: second.project.id,
        expectedOrganizationId: second.source.id,
        expectedOwnershipEpoch: 0,
        targetOrganizationId: second.target.id,
        idempotencyKey: 'physical-transfer-first-0001',
        assertExternalStorageDetached: async () => undefined,
        validateTargetAdmission: async () => undefined,
      });
      await storage.writeFiles(second.project.id, [{ path: 'tenant.txt', content: 'target-b-secret' }], {
        expectedOrganizationId: second.target.id,
      });

      storage.readEffects = 0;
      await expect(storage.listFiles(second.project.id, secondSourceScope)).rejects.toMatchObject({
        code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION',
        statusCode: 409,
      });
      expect(storage.readEffects).toBe(0);
      await expect(storage.listFiles(second.project.id, { expectedOrganizationId: second.target.id })).resolves.toEqual(
        [expect.objectContaining({ path: 'tenant.txt', content: 'target-b-secret' })],
      );
    } finally {
      releaseRead.resolve();
      if (previousStorageRoot === undefined) delete process.env.PROJECT_STORAGE_DIR;
      else process.env.PROJECT_STORAGE_DIR = previousStorageRoot;
      await rm(root, { recursive: true, force: true });
      await cleanupProject(prismaA, {
        projectIds: [first.project.id, second.project.id],
        organizationIds: [first.source.id, first.target.id, second.source.id, second.target.id],
      });
      await Promise.allSettled([readStore.disconnect(), transferStore.disconnect()]);
    }
  });

  it('persists the workspace STARTING latch on the winning side of each transfer ordering', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const workspaceStore = new PrismaApiStore(prismaA);
    const transferStore = new PrismaApiStore(prismaB);
    const transferFirst = await seedProject(prismaA, 'workspace-transfer-first');
    const latchFirst = await seedProject(prismaA, 'workspace-latch-first');
    const transferFirstWorkspaceId = `workspace-${suffix()}`;
    const latchFirstWorkspaceId = `workspace-${suffix()}`;

    try {
      await transferStore.transferProject({
        projectId: transferFirst.project.id,
        expectedOrganizationId: transferFirst.source.id,
        expectedOwnershipEpoch: 0,
        targetOrganizationId: transferFirst.target.id,
        idempotencyKey: 'workspace-transfer-first-0001',
        assertExternalStorageDetached: async () => undefined,
        validateTargetAdmission: async () => undefined,
      });
      await expect(
        workspaceStore.latchProjectWorkspaceStart({
          workspaceId: transferFirstWorkspaceId,
          projectId: transferFirst.project.id,
          expectedOrganizationId: transferFirst.source.id,
          runtimeMode: 'remote-kubernetes',
        }),
      ).rejects.toMatchObject({
        code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION',
        statusCode: 409,
      });
      await expect(prismaA.workspace.count({ where: { id: transferFirstWorkspaceId } })).resolves.toBe(0);
      await expect(
        prismaA.project.findUniqueOrThrow({ where: { id: transferFirst.project.id } }),
      ).resolves.toMatchObject({ organizationId: transferFirst.target.id });

      await workspaceStore.latchProjectWorkspaceStart({
        workspaceId: latchFirstWorkspaceId,
        projectId: latchFirst.project.id,
        expectedOrganizationId: latchFirst.source.id,
        runtimeMode: 'remote-kubernetes',
      });
      await expect(
        transferStore.transferProject({
          projectId: latchFirst.project.id,
          expectedOrganizationId: latchFirst.source.id,
          expectedOwnershipEpoch: 0,
          targetOrganizationId: latchFirst.target.id,
          idempotencyKey: 'workspace-latch-first-0001',
          assertExternalStorageDetached: async () => undefined,
          validateTargetAdmission: async () => undefined,
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_TRANSFER_MANAGED_RESOURCES_ACTIVE', statusCode: 409 });
      await expect(
        prismaA.workspace.findUniqueOrThrow({ where: { id: latchFirstWorkspaceId } }),
      ).resolves.toMatchObject({ status: 'STARTING', projectId: latchFirst.project.id });
      await expect(prismaA.project.findUniqueOrThrow({ where: { id: latchFirst.project.id } })).resolves.toMatchObject({
        organizationId: latchFirst.source.id,
      });
    } finally {
      await cleanupProject(prismaA, {
        projectIds: [transferFirst.project.id, latchFirst.project.id],
        organizationIds: [transferFirst.source.id, transferFirst.target.id, latchFirst.source.id, latchFirst.target.id],
      });
      await Promise.allSettled([workspaceStore.disconnect(), transferStore.disconnect()]);
    }
  });

  it('revalidates under NFS after a lost advisory and runs zero stale effects after transfer', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const filesystemWaitEntered = deferred();
    const resumeFilesystemWait = deferred();
    const staleStore = new LostAdvisoryBeforeFilesystemStore(
      prismaA,
      filesystemWaitEntered,
      resumeFilesystemWait.promise,
    );
    const transferStore = new PrismaApiStore(prismaB);
    const seeded = await seedProject(prismaA, 'physical-lost-session');
    const scope = { projectId: seeded.project.id, expectedOrganizationId: seeded.source.id };
    let staleEffects = 0;

    try {
      const staleWriter = staleStore.withProjectPhysicalMutation(scope, async () => {
        staleEffects += 1;
      });
      await filesystemWaitEntered.promise;

      await transferStore.transferProject({
        ...scope,
        expectedOwnershipEpoch: 0,
        targetOrganizationId: seeded.target.id,
        idempotencyKey: 'physical-lost-session-transfer-0001',
        assertExternalStorageDetached: async () => undefined,
        validateTargetAdmission: async () => undefined,
      });
      resumeFilesystemWait.resolve();

      await expect(staleWriter).rejects.toMatchObject({
        code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION',
        statusCode: 409,
      });
      expect(staleEffects).toBe(0);
      await expect(prismaA.project.findUniqueOrThrow({ where: { id: seeded.project.id } })).resolves.toMatchObject({
        organizationId: seeded.target.id,
      });
    } finally {
      resumeFilesystemWait.resolve();
      await cleanupProject(prismaA, {
        projectIds: [seeded.project.id],
        organizationIds: [seeded.source.id, seeded.target.id],
      });
      await Promise.allSettled([staleStore.disconnect(), transferStore.disconnect()]);
    }
  });

  it('keeps release acquisition behind a lost-advisory writer that already owns the NFS lock', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const filesystemWaitEntered = deferred();
    const resumeFilesystemWait = deferred();
    const effectEntered = deferred();
    const releaseEffect = deferred();
    const writerStore = new LostAdvisoryBeforeFilesystemStore(
      prismaA,
      filesystemWaitEntered,
      resumeFilesystemWait.promise,
    );
    const releaseStore = new PrismaApiStore(prismaB);
    const seeded = await seedProject(prismaA, 'release-lost-advisory');
    const scope = { projectId: seeded.project.id, expectedOrganizationId: seeded.source.id };
    const manifest = createDefaultProjectManifest(seeded.project.id);
    const revision = await releaseStore.createProjectManifestRevision({
      ...scope,
      schemaVersion: manifest.schemaVersion,
      manifestVersion: manifest.manifestVersion,
      digest: projectManifestDigest(manifest),
      manifest,
    });
    let lease: ProjectReleaseBarrierLease | undefined;
    let writer: Promise<void> | undefined;
    let acquiring: Promise<ProjectReleaseBarrierLease | undefined> | undefined;

    try {
      writer = writerStore.withProjectPhysicalMutation(scope, async () => {
        effectEntered.resolve();
        await releaseEffect.promise;
      });

      await bounded(filesystemWaitEntered.promise);
      resumeFilesystemWait.resolve();
      await bounded(effectEntered.promise);

      let releaseSettled = false;
      acquiring = releaseStore
        .acquireProjectReleaseBarrier({
          ...scope,
          expectedManifestDigest: revision.digest,
          operationId: `release-lost-advisory-${suffix()}`,
          ownerToken: `release-owner-${suffix()}`,
          ttlSeconds: 60,
        })
        .finally(() => {
          releaseSettled = true;
        })
        .then((acquired) => {
          lease = acquired;
          return acquired;
        });

      await delay(100);
      expect(releaseSettled).toBe(false);

      releaseEffect.resolve();
      await bounded(writer);
      await bounded(acquiring);
      expect(lease).toBeDefined();
    } finally {
      resumeFilesystemWait.resolve();
      releaseEffect.resolve();
      await Promise.allSettled([writer, acquiring]);
      if (lease) {
        await releaseStore
          .releaseProjectReleaseBarrier({
            checkpointId: lease.checkpointId,
            projectId: seeded.project.id,
            ownerToken: lease.ownerToken,
            fence: lease.fence,
          })
          .catch(() => false);
      }
      await cleanupProject(prismaA, {
        projectIds: [seeded.project.id],
        organizationIds: [seeded.source.id, seeded.target.id],
      });
      await Promise.allSettled([writerStore.disconnect(), releaseStore.disconnect()]);
    }
  });

  it('keeps database URL env and secret mutations behind a live release barrier', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const seeded = await seedProject(prisma, 'release-config-fence');
    const scope = { projectId: seeded.project.id, expectedOrganizationId: seeded.source.id };
    const provisioningInput = {
      ...scope,
      organizationId: seeded.source.id,
      retentionDays: 7,
      environment: 'development',
      provisioningDeadlineAt: new Date(Date.now() + 600_000).toISOString(),
      physicalAuthority: {
        tier: 'isolated' as const,
        clusterName: `db-${seeded.project.id}`.toLowerCase().slice(0, 53),
        backupBucket: 'vibecore-test-db-backups',
        backupPrefix: `db/${seeded.project.id}/development/`,
        retentionDays: 7,
      },
    };
    let release: (() => Promise<boolean>) | undefined;

    try {
      await store.upsertProjectEnvVar({ ...scope, key: 'DATABASE_URL', value: 'postgres://before' });
      await store.upsertProjectSecret({ ...scope, key: 'PROD_DATABASE_URL', valueEncrypted: 'cipher-before' });
      const provisioning = await store.acquireDatabaseProvisioning(provisioningInput);
      const barrier = await acquireTestProjectReleaseFence(store, {
        projectId: seeded.project.id,
        organizationId: seeded.source.id,
      });
      release = barrier.release;

      const blocked = { code: 'CHECKPOINT_BARRIER_ACTIVE', statusCode: 423 };
      await expect(
        store.upsertProjectEnvVar({ ...scope, key: 'DATABASE_URL', value: 'postgres://stale' }),
      ).rejects.toMatchObject(blocked);
      await expect(store.deleteProjectEnvVar({ ...scope, key: 'DATABASE_URL' })).rejects.toMatchObject(blocked);
      await expect(
        store.upsertProjectSecret({ ...scope, key: 'PROD_DATABASE_URL', valueEncrypted: 'cipher-stale' }),
      ).rejects.toMatchObject(blocked);
      await expect(store.deleteProjectSecret({ ...scope, key: 'PROD_DATABASE_URL' })).rejects.toMatchObject(blocked);
      await expect(store.acquireDatabaseProvisioning(provisioningInput)).rejects.toMatchObject(blocked);
      await expect(
        store.acquireDatabaseProvisioning({
          ...provisioningInput,
          releaseFence: { ...barrier.releaseFence, ownerToken: 'forged-publish-owner' },
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_RELEASE_BARRIER_LOST', statusCode: 409 });
      await expect(
        store.acquireDatabaseProvisioning({ ...provisioningInput, releaseFence: barrier.releaseFence }),
      ).resolves.toMatchObject({ acquired: false, created: false, instance: { status: 'PROVISIONING' } });
      await expect(
        store.completeDatabaseProvisioning(provisioning.instance.id, {
          ...scope,
          expectedGeneration: provisioning.instance.provisioningGeneration,
          key: 'DATABASE_URL',
          valueEncrypted: 'cipher-provisioned',
        }),
      ).rejects.toMatchObject(blocked);

      await expect(store.listProjectEnvVars(seeded.project.id)).resolves.toEqual([
        expect.objectContaining({ key: 'DATABASE_URL', value: 'postgres://before' }),
      ]);
      await expect(store.getProjectSecret(seeded.project.id, 'PROD_DATABASE_URL')).resolves.toMatchObject({
        valueEncrypted: 'cipher-before',
      });
      await expect(store.getProjectSecret(seeded.project.id, 'DATABASE_URL')).resolves.toBeUndefined();
      await expect(
        prisma.databaseInstance.findUniqueOrThrow({ where: { id: provisioning.instance.id } }),
      ).resolves.toMatchObject({ status: 'PROVISIONING' });

      await expect(barrier.release()).resolves.toBe(true);
      release = undefined;
      await expect(
        store.upsertProjectEnvVar({ ...scope, key: 'DATABASE_URL', value: 'postgres://after' }),
      ).resolves.toMatchObject({ value: 'postgres://after' });
      await expect(store.deleteProjectEnvVar({ ...scope, key: 'DATABASE_URL' })).resolves.toBeDefined();
      await expect(
        store.upsertProjectSecret({ ...scope, key: 'PROD_DATABASE_URL', valueEncrypted: 'cipher-after' }),
      ).resolves.toMatchObject({ valueEncrypted: 'cipher-after' });
      await expect(store.deleteProjectSecret({ ...scope, key: 'PROD_DATABASE_URL' })).resolves.toBeDefined();
      await expect(
        store.completeDatabaseProvisioning(provisioning.instance.id, {
          ...scope,
          expectedGeneration: provisioning.instance.provisioningGeneration,
          key: 'DATABASE_URL',
          valueEncrypted: 'cipher-provisioned',
        }),
      ).resolves.toMatchObject({ status: 'ACTIVE' });
      await expect(store.getProjectSecret(seeded.project.id, 'DATABASE_URL')).resolves.toMatchObject({
        valueEncrypted: 'cipher-provisioned',
      });
    } finally {
      await release?.().catch(() => false);
      await cleanupProject(prisma, {
        projectIds: [seeded.project.id],
        organizationIds: [seeded.source.id, seeded.target.id],
      });
      await store.disconnect();
    }
  });

  it('accepts only the exact release fence for a physical storage guard', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const seeded = await seedProject(prisma, 'physical-release-fence');
    const scope = { projectId: seeded.project.id, expectedOrganizationId: seeded.source.id };
    let release: (() => Promise<boolean>) | undefined;
    let physicalEffects = 0;

    try {
      const barrier = await acquireTestProjectReleaseFence(store, {
        projectId: seeded.project.id,
        organizationId: seeded.source.id,
      });
      release = barrier.release;

      await expect(store.assertProjectStorageMutable(scope)).rejects.toMatchObject({
        code: 'CHECKPOINT_BARRIER_ACTIVE',
        statusCode: 423,
      });

      await expect(
        store.withProjectPhysicalMutation(
          {
            ...scope,
            releaseFence: { ...barrier.releaseFence, ownerToken: 'forged-physical-release-owner' },
          },
          async () => {
            physicalEffects += 1;
          },
        ),
      ).rejects.toMatchObject({ code: 'PROJECT_RELEASE_BARRIER_LOST', statusCode: 409 });
      expect(physicalEffects).toBe(0);

      await expect(
        store.withProjectPhysicalMutation({ ...scope, releaseFence: barrier.releaseFence }, async () => {
          await store.assertProjectStorageMutable({ ...scope, releaseFence: barrier.releaseFence });
          physicalEffects += 1;
        }),
      ).resolves.toBeUndefined();
      expect(physicalEffects).toBe(1);
    } finally {
      await release?.().catch(() => false);
      await cleanupProject(prisma, {
        projectIds: [seeded.project.id],
        organizationIds: [seeded.source.id, seeded.target.id],
      });
      await store.disconnect();
    }
  });
});
