import { createDatabaseClient } from '@vibecore/database';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  NoopProvisioner,
  type DatabaseProvisioner,
  type ProvisionInput,
  type ProvisionResult,
  type RestoreProgress,
} from '../database-provisioner.js';
import {
  ObjectStorageError,
  type ListObjectsResult,
  type ObjectStorage,
  type ObjectStorageInventory,
  type SignedUrlResult,
  type UploadUrlResult,
} from '../object-storage.js';
import { PrismaApiStore } from '../prisma-store.js';
import type { ProjectFile, ProjectStorage, StoredArchive } from '../project-storage.js';
import { executePhysicalRemix, remixFileSnapshotHash } from '../remix-physical-service.js';
import { remixIdeStateDigest } from '../remix-ide-state.js';

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

const runDbTests = (await canReachDatabase()) ? describe : describe.skip;

class MemoryProjectStorage implements ProjectStorage {
  readonly files = new Map<string, ProjectFile[]>();

  async writeFiles(projectId: string, files: ProjectFile[]) {
    const cloned = files.map((file) => ({ ...file }));
    this.files.set(projectId, cloned);
    return cloned;
  }

  async listFiles(projectId: string) {
    return this.files.get(projectId)?.map((file) => ({ ...file })) ?? [];
  }

  async deleteProjectFiles(projectId: string) {
    this.files.delete(projectId);
  }

  async createSnapshot(input: {
    projectId: string;
    files: ProjectFile[];
    storageKey?: string;
  }): Promise<StoredArchive> {
    const storageKey = input.storageKey ?? `snapshot:${input.projectId}`;
    this.files.set(
      storageKey,
      input.files.map((file) => ({ ...file })),
    );
    return { storageKey, byteLength: 1, createdAt: new Date().toISOString() };
  }

  async getSnapshotFiles(storageKey: string) {
    return this.listFiles(storageKey);
  }

  async restoreSnapshot(input: { projectId: string; files: ProjectFile[] }) {
    return this.writeFiles(input.projectId, input.files);
  }

  async exportZip(): Promise<StoredArchive & { base64: string }> {
    throw new Error('not used');
  }

  async importZip(): Promise<ProjectFile[]> {
    throw new Error('not used');
  }
}

class MemoryObjectStorage implements ObjectStorage {
  readonly active = true;
  readonly buckets = new Map<string, ObjectStorageInventory>();
  readonly deletedProjects: string[] = [];
  failCloneAfterCopy = false;
  failDeleteOnce = false;

  async ensureBucket(projectId: string) {
    const created = !this.buckets.has(projectId);
    this.buckets.set(projectId, this.buckets.get(projectId) ?? { bucketExists: true, objects: [] });
    return { bucket: `bucket-${projectId}`, created, location: 'test' };
  }

  async bucketExists(projectId: string) {
    return this.buckets.has(projectId);
  }

  async inventoryProjectObjects(projectId: string) {
    return structuredClone(this.buckets.get(projectId) ?? { bucketExists: false, objects: [] });
  }

  async cloneProjectObjects(
    sourceProjectId: string,
    targetProjectId: string,
    inventory: ObjectStorageInventory,
    guard?: () => Promise<void>,
  ) {
    await guard?.();
    this.buckets.set(targetProjectId, structuredClone(inventory));
    if (this.failCloneAfterCopy) {
      throw new ObjectStorageError('injected target clone failure', 'CLONE_INJECTED_FAILURE');
    }
    return structuredClone(inventory);
  }

  async deleteBucket(projectId: string, guard?: () => Promise<void>) {
    await guard?.();

    if (this.failDeleteOnce) {
      this.failDeleteOnce = false;
      throw new ObjectStorageError('injected target cleanup failure', 'CLEANUP_INJECTED_FAILURE');
    }

    const deleted = this.buckets.delete(projectId);
    this.deletedProjects.push(projectId);
    return { deleted, bucket: `bucket-${projectId}` };
  }

  async listObjects(): Promise<ListObjectsResult> {
    return { objects: [], folders: [] };
  }
  async createUploadUrl(): Promise<UploadUrlResult> {
    throw new Error('not used');
  }
  async createDownloadUrl(): Promise<SignedUrlResult> {
    throw new Error('not used');
  }
  async putObject(_projectId: string, input: { key: string; body: Uint8Array }) {
    return { key: input.key, size: input.body.byteLength };
  }
  async moveObject(_projectId: string, input: { to: string }) {
    return { moved: true, key: input.to };
  }
  async deleteObject() {
    return { deleted: true, count: 1 };
  }
  async deletePrefix() {
    return { deleted: true, count: 1 };
  }
}

class PostApplyFailingForkProvisioner implements DatabaseProvisioner {
  readonly active = true;
  readonly createdTargets: string[] = [];
  readonly deletedTargets: string[] = [];

  async provisionInstance(input: ProvisionInput): Promise<ProvisionResult> {
    return { clusterName: `db-${input.projectId}`, applied: true };
  }
  async getConnectionUri() {
    return undefined;
  }
  async takeSnapshot() {
    return { applied: true };
  }
  async startRestore(input: { projectId: string }) {
    return { applied: true, clusterName: `restore-${input.projectId}` };
  }
  async restoreProgress(input: { projectId: string }): Promise<RestoreProgress> {
    return { ready: false, clusterName: `restore-${input.projectId}` };
  }
  async forkInstance(input: { targetProjectId: string }): Promise<ProvisionResult> {
    this.createdTargets.push(input.targetProjectId);
    throw Object.assign(new Error('injected failure after target CNPG apply'), {
      code: 'REMIX_DATABASE_POST_APPLY_FAILURE',
    });
  }
  async forkProgress() {
    return { ready: false };
  }
  async teardownFork(input: { targetProjectId: string }) {
    this.deletedTargets.push(input.targetProjectId);
  }
  async teardown() {}
}

const sourceFiles: ProjectFile[] = [
  { path: 'src/index.ts', content: 'export const ready = true;\n', updatedAt: '2026-08-26T00:00:00.000Z' },
  { path: '.env', content: 'SHORT_TOKEN=abc\n', updatedAt: '2026-08-26T00:00:00.000Z' },
];

function serviceDeps(
  store: PrismaApiStore,
  projectStorage: MemoryProjectStorage,
  objectStorage: MemoryObjectStorage,
  databaseProvisioner: DatabaseProvisioner = new NoopProvisioner(),
) {
  return {
    store,
    projectStorage,
    objectStorage,
    databaseProvisioner,
    ensureProjectQuota: async () => undefined,
    createSourceSnapshot: async ({
      remixJobId,
      sourceProjectId,
      files,
    }: {
      remixJobId: string;
      sourceProjectId: string;
      files: ProjectFile[];
    }) => {
      const snapshotId = `snapshot:${sourceProjectId}:${remixJobId}`;
      const snapshotHash = remixFileSnapshotHash(files);
      const archive = await projectStorage.createSnapshot({
        projectId: sourceProjectId,
        files,
        storageKey: snapshotId,
      });
      const snapshot = await store.createSnapshot({
        id: snapshotId,
        projectId: sourceProjectId,
        manifest: { snapshotHash, testCapture: true },
        storageKey: archive.storageKey,
        byteLength: archive.byteLength,
      });
      return { snapshotId: snapshot.id, snapshotHash };
    },
    loadSourceSnapshot: (snapshotId: string) => projectStorage.listFiles(snapshotId),
    buildTargetIdeState: (files: ProjectFile[]) => ({ files }),
    recordCompleted: async () => undefined,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

runDbTests('physical remix — real PostgreSQL multi-client CAS and compensation', () => {
  it('two replicas with one tenant key create exactly one target; replay returns that completed target', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    let organizationId: string | undefined;

    try {
      const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const organization = await prismaA.organization.create({
        data: { name: `Remix CAS ${suffix}`, slug: `remix-cas-${suffix}` },
      });
      organizationId = organization.id;
      const source = await prismaA.project.create({
        data: { organizationId: organization.id, name: 'Source', slug: `source-${suffix}` },
      });
      await prismaA.projectEnvVar.create({
        data: { projectId: source.id, key: 'SHORT_TOKEN', value: 'abc' },
      });
      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);
      const projectStorage = new MemoryProjectStorage();
      const objectStorage = new MemoryObjectStorage();
      projectStorage.files.set(source.id, sourceFiles);
      const input = {
        sourceProject: { id: source.id, organizationId: organization.id },
        targetOrganizationId: organization.id,
        idempotencyKey: `same-remix-${suffix}`,
        requestHash: 'a'.repeat(64),
        storagePolicy: 'DETACH' as const,
        name: 'One target',
        sourceFiles,
      };

      const [a, b] = await Promise.all([
        executePhysicalRemix(serviceDeps(storeA, projectStorage, objectStorage), input),
        executePhysicalRemix(serviceDeps(storeB, projectStorage, objectStorage), input),
      ]);
      const completed = [a, b].filter((result) => result.kind === 'completed');
      const fresh = completed.filter((result) => result.kind === 'completed' && result.fresh);
      expect(fresh).toHaveLength(1);
      expect(
        [a, b].filter((result) => result.kind === 'busy' || (result.kind === 'completed' && !result.fresh)),
      ).toHaveLength(1);
      expect(await prismaA.remixJob.count({ where: { organizationId: organization.id } })).toBe(1);
      expect(await prismaA.project.count({ where: { organizationId: organization.id } })).toBe(2);

      const replay = await executePhysicalRemix(serviceDeps(storeB, projectStorage, objectStorage), input);
      expect(replay).toMatchObject({ kind: 'completed', fresh: false });
      expect(replay.kind === 'completed' ? replay.project.id : undefined).toBe(
        completed[0].kind === 'completed' ? completed[0].project.id : undefined,
      );
      const cloned = replay.kind === 'completed' ? await projectStorage.listFiles(replay.project.id) : [];
      expect(cloned.find((file) => file.path === '.env')?.content).toContain('SHORT_TOKEN= # detached on remix');
      expect(JSON.stringify(cloned)).not.toContain('abc');
    } finally {
      if (organizationId) await prismaA.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('fails closed when a snapshot adapter persists the raw secret-bearing source instead of the scrubbed pin', async () => {
    const prisma = createDatabaseClient();
    let organizationId: string | undefined;

    try {
      const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const organization = await prisma.organization.create({
        data: { name: `Unsafe snapshot ${suffix}`, slug: `unsafe-snapshot-${suffix}` },
      });
      organizationId = organization.id;
      const source = await prisma.project.create({
        data: { organizationId: organization.id, name: 'Source', slug: `unsafe-source-${suffix}` },
      });
      await prisma.projectEnvVar.create({
        data: { projectId: source.id, key: 'SHORT_TOKEN', value: 'abc' },
      });
      const store = new PrismaApiStore(prisma);
      const projectStorage = new MemoryProjectStorage();
      projectStorage.files.set(source.id, sourceFiles);
      const objectStorage = new MemoryObjectStorage();
      const deps = serviceDeps(store, projectStorage, objectStorage);

      // Mutation discriminator: emulate an adapter that ignores the scrubbed
      // `files` argument and archives the raw source. Digest verification alone
      // would accept this; the post-write safety verification must reject it.
      deps.createSourceSnapshot = async ({ remixJobId, sourceProjectId }) => {
        const snapshotId = `snapshot:${sourceProjectId}:${remixJobId}`;
        projectStorage.files.set(
          snapshotId,
          sourceFiles.map((file) => ({ ...file })),
        );
        return { snapshotId, snapshotHash: remixFileSnapshotHash(sourceFiles) };
      };

      const result = await executePhysicalRemix(deps, {
        sourceProject: { id: source.id, organizationId: organization.id },
        targetOrganizationId: organization.id,
        idempotencyKey: `unsafe-snapshot-${suffix}`,
        requestHash: '9'.repeat(64),
        storagePolicy: 'DETACH',
        name: 'Must not exist',
        sourceFiles,
      });

      expect(result).toMatchObject({ kind: 'failed', code: 'REMIX_SNAPSHOT_UNSAFE' });
      expect(await prisma.project.count({ where: { organizationId: organization.id } })).toBe(1);
      expect(await prisma.remixJob.findFirst({ where: { organizationId: organization.id } })).toMatchObject({
        state: 'FAILED',
        targetProjectId: null,
        errorCode: 'REMIX_SNAPSHOT_UNSAFE',
      });
    } finally {
      if (organizationId) await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      await prisma.$disconnect();
    }
  });

  it('serializes concurrent finalize calls so exactly one replica exposes the target', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    let organizationId: string | undefined;

    try {
      const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const organization = await prismaA.organization.create({
        data: { name: `Finalize CAS ${suffix}`, slug: `finalize-cas-${suffix}` },
      });
      organizationId = organization.id;
      const source = await prismaA.project.create({
        data: { organizationId: organization.id, name: 'Source', slug: `finalize-source-${suffix}` },
      });
      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);
      const created = await storeA.createRemixJob({
        sourceProjectId: source.id,
        organizationId: organization.id,
        storagePolicy: 'DETACH',
        idempotencyKey: `finalize-key-${suffix}`,
        requestHash: 'd'.repeat(64),
      });
      const claimed = await storeA.claimRemixJob({
        id: created.job.id,
        organizationId: organization.id,
        operationToken: 'shared-owner-token',
        leaseDurationMs: 60_000,
      });
      expect(claimed).toBeDefined();
      const sourceSnapshot = await storeA.createSnapshot({
        projectId: source.id,
        manifest: { snapshotHash: remixFileSnapshotHash([]), testCapture: true },
        storageKey: `snapshot:finalize:${suffix}`,
        byteLength: 0,
      });
      await prismaA.remixJob.update({
        where: { id: created.job.id },
        data: { sourceSnapshotId: sourceSnapshot.id },
      });
      const target = await storeA.createClaimedRemixProject({
        remixJobId: created.job.id,
        organizationId: organization.id,
        operationToken: 'shared-owner-token',
        name: 'Hidden until finalize',
        slug: `hidden-${suffix}`,
      });
      const targetIdeState = { files: { entries: [], updatedAt: new Date().toISOString() } };
      const targetIdeStateDigest = remixIdeStateDigest(targetIdeState)!;
      await prismaA.remixJob.update({
        where: { id: created.job.id },
        data: {
          state: 'INDEXING',
          targetIdeState,
          targetIdeStateDigest,
          version: { increment: 1 },
        },
      });
      const indexing = await storeA.getRemixJob(created.job.id, organization.id);
      expect(indexing).toBeDefined();

      const [finalizedA, finalizedB] = await Promise.all([
        storeA.finalizeClaimedRemix({
          remixJobId: created.job.id,
          organizationId: organization.id,
          operationToken: 'shared-owner-token',
          expectedVersion: indexing!.version,
          requestHash: 'd'.repeat(64),
          targetProjectId: target.id,
        }),
        storeB.finalizeClaimedRemix({
          remixJobId: created.job.id,
          organizationId: organization.id,
          operationToken: 'shared-owner-token',
          expectedVersion: indexing!.version,
          requestHash: 'd'.repeat(64),
          targetProjectId: target.id,
        }),
      ]);

      expect([finalizedA, finalizedB].filter(Boolean)).toHaveLength(2);
      expect(await prismaA.remixJob.findUnique({ where: { id: created.job.id } })).toMatchObject({
        state: 'COMPLETED',
        targetProjectId: target.id,
        operationToken: null,
      });
      expect(await prismaA.project.findUnique({ where: { id: target.id } })).toMatchObject({ deletedAt: null });
      expect(await prismaA.projectIdeState.findUnique({ where: { projectId: target.id } })).toMatchObject({
        state: targetIdeState,
        version: 1,
      });
    } finally {
      if (organizationId) await prismaA.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('uses the PostgreSQL clock for renew/finalize fencing even when the process clock is far ahead', async () => {
    const prisma = createDatabaseClient();
    let organizationId: string | undefined;

    try {
      const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const organization = await prisma.organization.create({
        data: { name: `Clock ${suffix}`, slug: `clock-${suffix}` },
      });
      organizationId = organization.id;
      const source = await prisma.project.create({
        data: { organizationId: organization.id, name: 'Source', slug: `clock-source-${suffix}` },
      });
      const store = new PrismaApiStore(prisma);
      const created = await store.createRemixJob({
        sourceProjectId: source.id,
        organizationId: organization.id,
        storagePolicy: 'DETACH',
        idempotencyKey: `clock-key-${suffix}`,
        requestHash: 'b'.repeat(64),
      });
      const claimed = await store.claimRemixJob({
        id: created.job.id,
        organizationId: organization.id,
        operationToken: 'owner',
        leaseDurationMs: 60_000,
      });
      expect(claimed).toBeDefined();

      // Mutation discriminator: a `new Date()` process-clock comparison sees
      // this lease as expired; the PostgreSQL-clock implementation still renews.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2100-01-01T00:00:00.000Z'));
      const renewed = await store.renewRemixJobLease({
        id: claimed!.id,
        organizationId: organization.id,
        operationToken: 'owner',
        expectedVersion: claimed!.version,
        leaseDurationMs: 60_000,
      });
      expect(renewed).toBeDefined();
      expect(new Date(renewed!.operationExpiresAt!).getUTCFullYear()).toBeLessThan(2100);
    } finally {
      vi.useRealTimers();
      if (organizationId) await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      await prisma.$disconnect();
    }
  });

  it('injected post-copy failure removes only target bucket/files/project and leaves source recoverable', async () => {
    const prisma = createDatabaseClient();
    let organizationId: string | undefined;

    try {
      const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const organization = await prisma.organization.create({
        data: { name: `Compensation ${suffix}`, slug: `compensation-${suffix}` },
      });
      organizationId = organization.id;
      const source = await prisma.project.create({
        data: { organizationId: organization.id, name: 'Source intact', slug: `intact-${suffix}` },
      });
      const store = new PrismaApiStore(prisma);
      const projectStorage = new MemoryProjectStorage();
      projectStorage.files.set(source.id, sourceFiles);
      const objectStorage = new MemoryObjectStorage();
      objectStorage.buckets.set(source.id, {
        bucketExists: true,
        objects: [{ key: 'data.json', size: 12, generation: '7', contentHash: 'md5:source' }],
      });
      objectStorage.failCloneAfterCopy = true;

      const result = await executePhysicalRemix(serviceDeps(store, projectStorage, objectStorage), {
        sourceProject: { id: source.id, organizationId: organization.id },
        targetOrganizationId: organization.id,
        idempotencyKey: `compensate-${suffix}`,
        requestHash: 'c'.repeat(64),
        storagePolicy: 'CLONE',
        name: 'Must disappear',
        sourceFiles,
      });

      expect(result).toMatchObject({ kind: 'failed', code: 'REMIX_STORAGE_CLONE_INJECTED_FAILURE' });
      const job = await prisma.remixJob.findFirst({ where: { organizationId: organization.id } });
      expect(job).toMatchObject({ state: 'FAILED', targetProjectId: null, cleanupTerminalState: null });
      expect(await prisma.project.findUnique({ where: { id: source.id } })).not.toBeNull();
      expect(await prisma.project.count({ where: { organizationId: organization.id } })).toBe(1);
      expect(objectStorage.buckets.has(source.id)).toBe(true);
      expect(objectStorage.deletedProjects).toHaveLength(1);
      expect(objectStorage.deletedProjects).not.toContain(source.id);
      expect(projectStorage.files.has(source.id)).toBe(true);
      expect(projectStorage.files.has(objectStorage.deletedProjects[0])).toBe(false);
    } finally {
      if (organizationId) await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      await prisma.$disconnect();
    }
  });

  it('persists the target DB claim before CNPG apply and compensates only that partial target', async () => {
    const prisma = createDatabaseClient();
    let organizationId: string | undefined;

    try {
      const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const organization = await prisma.organization.create({
        data: { name: `DB compensation ${suffix}`, slug: `db-compensation-${suffix}` },
      });
      organizationId = organization.id;
      const source = await prisma.project.create({
        data: { organizationId: organization.id, name: 'Source DB intact', slug: `db-intact-${suffix}` },
      });
      const sourceDatabase = await prisma.databaseInstance.create({
        data: {
          projectId: source.id,
          organizationId: organization.id,
          environment: 'development',
          status: 'ACTIVE',
          pitrEnabled: true,
          retentionDays: 14,
        },
      });
      const store = new PrismaApiStore(prisma);
      const projectStorage = new MemoryProjectStorage();
      projectStorage.files.set(source.id, sourceFiles);
      const objectStorage = new MemoryObjectStorage();
      const provisioner = new PostApplyFailingForkProvisioner();
      let capturedProvisioningDeadline: string | undefined;
      const acquireClaimedRemixDatabase = store.acquireClaimedRemixDatabase.bind(store);
      vi.spyOn(store, 'acquireClaimedRemixDatabase').mockImplementation(async (input) => {
        capturedProvisioningDeadline = input.provisioningDeadlineAt;
        return acquireClaimedRemixDatabase(input);
      });

      // Mutation discriminator: a process-clock pin would ask CNPG for a PITR
      // point in 2100. The durable pin must instead come from PostgreSQL.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2100-01-01T00:00:00.000Z'));
      const result = await executePhysicalRemix(serviceDeps(store, projectStorage, objectStorage, provisioner), {
        sourceProject: { id: source.id, organizationId: organization.id },
        targetOrganizationId: organization.id,
        idempotencyKey: `db-compensate-${suffix}`,
        requestHash: 'e'.repeat(64),
        storagePolicy: 'DETACH',
        name: 'Partial DB target',
        sourceFiles,
      });

      expect(result).toMatchObject({ kind: 'failed', code: 'REMIX_DATABASE_POST_APPLY_FAILURE' });
      expect(provisioner.createdTargets).toHaveLength(1);
      expect(provisioner.deletedTargets).toEqual(provisioner.createdTargets);
      expect(provisioner.deletedTargets).not.toContain(source.id);
      expect(await prisma.project.findUnique({ where: { id: source.id } })).not.toBeNull();
      expect(await prisma.databaseInstance.findUnique({ where: { id: sourceDatabase.id } })).toMatchObject({
        projectId: source.id,
        status: 'ACTIVE',
      });
      expect(await prisma.project.count({ where: { organizationId: organization.id } })).toBe(1);
      expect(await prisma.databaseInstance.count({ where: { organizationId: organization.id } })).toBe(1);
      const job = await prisma.remixJob.findFirst({ where: { organizationId: organization.id } });
      expect(job).toMatchObject({
        state: 'FAILED',
        targetProjectId: null,
        targetDatabaseInstanceId: null,
      });
      expect(new Date((job!.sourceDatabasePin as { targetTime: string }).targetTime).getUTCFullYear()).toBeLessThan(
        2100,
      );
      expect(new Date(capturedProvisioningDeadline!).getUTCFullYear()).toBeLessThan(2100);
    } finally {
      vi.useRealTimers();
      if (organizationId) await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      await prisma.$disconnect();
    }
  });

  it('releases a failed cleanup claim so another replica resumes target-only compensation immediately', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    let organizationId: string | undefined;

    try {
      const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const organization = await prismaA.organization.create({
        data: { name: `Cleanup resume ${suffix}`, slug: `cleanup-resume-${suffix}` },
      });
      organizationId = organization.id;
      const source = await prismaA.project.create({
        data: { organizationId: organization.id, name: 'Cleanup source', slug: `cleanup-source-${suffix}` },
      });
      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);
      const projectStorage = new MemoryProjectStorage();
      projectStorage.files.set(source.id, sourceFiles);
      const objectStorage = new MemoryObjectStorage();
      objectStorage.buckets.set(source.id, {
        bucketExists: true,
        objects: [{ key: 'source.json', size: 8, generation: '3', contentHash: 'md5:source' }],
      });
      objectStorage.failCloneAfterCopy = true;
      objectStorage.failDeleteOnce = true;
      const input = {
        sourceProject: { id: source.id, organizationId: organization.id },
        targetOrganizationId: organization.id,
        idempotencyKey: `cleanup-resume-${suffix}`,
        requestHash: 'f'.repeat(64),
        storagePolicy: 'CLONE' as const,
        name: 'Recoverable partial target',
        sourceFiles,
      };

      const first = await executePhysicalRemix(serviceDeps(storeA, projectStorage, objectStorage), input);
      expect(first).toMatchObject({ kind: 'pending', job: { state: 'CLEANUP_PENDING', operationToken: undefined } });
      expect(await prismaA.project.count({ where: { organizationId: organization.id } })).toBe(2);

      const resumed = await executePhysicalRemix(serviceDeps(storeB, projectStorage, objectStorage), input);
      expect(resumed).toMatchObject({ kind: 'failed', code: 'REMIX_STORAGE_CLONE_INJECTED_FAILURE' });
      expect(await prismaA.project.count({ where: { organizationId: organization.id } })).toBe(1);
      expect(await prismaA.remixJob.findFirst({ where: { organizationId: organization.id } })).toMatchObject({
        state: 'FAILED',
        targetProjectId: null,
        operationToken: null,
      });
      expect(objectStorage.buckets.has(source.id)).toBe(true);
      expect(objectStorage.deletedProjects).not.toContain(source.id);
    } finally {
      if (organizationId) await prismaA.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });
});
