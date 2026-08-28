import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { PrismaApiStore } from '../prisma-store.js';
import {
  OBJECT_STORAGE_LOCATION,
  projectBucketName,
  type ListObjectsResult,
  type ObjectStorage,
  type ObjectStorageInventory,
  type SignedUrlResult,
  type UploadUrlResult,
} from '../object-storage.js';
import { scheduleObjectStorageVersionGc } from '../object-storage-version-gc.js';

async function canReachVersionGcTables(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = createDatabaseClient();
  try {
    const rows = await prisma.$queryRaw<Array<{ tableName: string | null }>>`
      SELECT to_regclass('"ObjectStorageVersionGcSchedule"')::text AS "tableName"
    `;
    return rows[0]?.tableName !== null;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

const runDbTests = (await canReachVersionGcTables()) ? describe.sequential : describe.skip;

function token(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface StoredGeneration {
  key: string;
  generation: string;
  size: number;
  contentHash: string;
  current: boolean;
}

class VersionGcStorage implements ObjectStorage {
  readonly active = true;
  readonly generations = new Map<string, StoredGeneration[]>();
  readonly versioning = new Map<string, boolean>();
  providerReads = 0;
  providerDeletes = 0;
  transactionDepth = () => 0;
  failAfterDelete = false;
  failAfterPut = false;
  private generationSequence = 10_000;
  readonly transientReadFailures = new Set<string>();

  private assertOutsideTransaction(): void {
    if (this.transactionDepth() !== 0) throw new Error('PROVIDER_IO_INSIDE_DATABASE_TRANSACTION');
  }

  seed(projectId: string, generations: StoredGeneration[]): void {
    this.generations.set(
      projectId,
      generations.map((generation) => ({ ...generation })),
    );
    this.versioning.set(projectId, true);
  }

  identities(projectId: string): string[] {
    return (this.generations.get(projectId) ?? [])
      .map((generation) => `${generation.key}@${generation.generation}`)
      .sort();
  }

  async ensureBucket(projectId: string) {
    this.assertOutsideTransaction();
    const created = !this.generations.has(projectId);
    this.generations.set(projectId, this.generations.get(projectId) ?? []);
    this.versioning.set(projectId, true);
    return { bucket: projectBucketName(projectId), created, location: OBJECT_STORAGE_LOCATION };
  }

  async bucketExists(projectId: string): Promise<boolean> {
    this.assertOutsideTransaction();
    this.providerReads += 1;
    if (this.transientReadFailures.delete(projectId)) {
      throw Object.assign(new Error('transient provider read failure'), { code: 'ECONNRESET' });
    }
    return this.generations.has(projectId);
  }

  async bucketVersioningEnabled(projectId: string): Promise<boolean> {
    this.assertOutsideTransaction();
    this.providerReads += 1;
    return this.versioning.get(projectId) === true;
  }

  async setBucketVersioningEnabled(projectId: string, enabled: boolean, guard?: () => Promise<void>) {
    this.assertOutsideTransaction();
    await guard?.();
    if (!this.generations.has(projectId)) return { bucketExists: false, enabled: false };
    this.versioning.set(projectId, enabled);
    return { bucketExists: true, enabled };
  }

  private listed(projectId: string, currentOnly: boolean): ListObjectsResult {
    this.assertOutsideTransaction();
    this.providerReads += 1;
    return {
      objects: (this.generations.get(projectId) ?? [])
        .filter((generation) => !currentOnly || generation.current)
        .map((generation) => ({
          key: generation.key,
          size: generation.size,
          updated: null,
          contentType: null,
          etag: null,
          generation: generation.generation,
          contentHash: generation.contentHash,
        })),
      folders: [],
    };
  }

  async listObjects(projectId: string): Promise<ListObjectsResult> {
    return this.listed(projectId, true);
  }

  async listObjectVersions(projectId: string): Promise<ListObjectsResult> {
    return this.listed(projectId, false);
  }

  async createUploadUrl(
    _projectId: string,
    input: { key: string; contentType?: string; expiresAt?: string },
  ): Promise<UploadUrlResult> {
    if (!input.expiresAt) throw new Error('EXPIRY_REQUIRED');
    return {
      url: `https://upload.invalid/${input.key}`,
      expiresAt: input.expiresAt,
      method: 'PUT',
      headers: {},
    };
  }

  async createDownloadUrl(
    _projectId: string,
    input: { key: string; generation?: string; expiresAt?: string },
  ): Promise<SignedUrlResult> {
    if (!input.expiresAt) throw new Error('EXPIRY_REQUIRED');
    return { url: `https://download.invalid/${input.key}`, expiresAt: input.expiresAt };
  }

  async putObject(projectId: string, input: { key: string; body: Uint8Array; ifGenerationMatch?: string | 0 }) {
    this.assertOutsideTransaction();
    const generations = this.generations.get(projectId) ?? [];
    const current = generations.find((generation) => generation.key === input.key && generation.current);
    if (
      (input.ifGenerationMatch === 0 && current) ||
      (typeof input.ifGenerationMatch === 'string' && current?.generation !== input.ifGenerationMatch)
    ) {
      throw Object.assign(new Error('target generation changed'), { code: 'TARGET_PRECONDITION_CHANGED' });
    }
    if (current) current.current = false;
    const generation = `PUT-${this.generationSequence++}`;
    const contentHash = `sha256:${createHash('sha256').update(input.body).digest('hex')}`;
    generations.push({
      key: input.key,
      generation,
      size: input.body.byteLength,
      contentHash,
      current: true,
    });
    this.generations.set(projectId, generations);
    if (this.failAfterPut) {
      this.failAfterPut = false;
      throw Object.assign(new Error('provider connection reset after put'), { code: 'ECONNRESET' });
    }
    return { key: input.key, size: input.body.byteLength, generation, contentHash };
  }

  async moveObject(_projectId: string, input: { from: string; to: string }) {
    return { moved: input.from !== input.to, key: input.to };
  }

  async deleteObject(projectId: string, input: { key: string; generation?: string }) {
    this.assertOutsideTransaction();
    const generations = this.generations.get(projectId) ?? [];
    const index = generations.findIndex(
      (generation) => generation.key === input.key && generation.generation === input.generation,
    );
    if (index < 0) return { deleted: false, count: 0 };
    generations.splice(index, 1);
    this.providerDeletes += 1;
    if (this.failAfterDelete) {
      this.failAfterDelete = false;
      throw Object.assign(new Error('provider connection reset after delete'), { code: 'ECONNRESET' });
    }
    return { deleted: true, count: 1 };
  }

  async deletePrefix(): Promise<{ deleted: boolean; count: number }> {
    return { deleted: false, count: 0 };
  }

  async deleteBucket(projectId: string): Promise<{ deleted: boolean; bucket: string }> {
    const deleted = this.generations.delete(projectId);
    this.versioning.delete(projectId);
    return { deleted, bucket: projectBucketName(projectId) };
  }

  async inventoryProjectObjects(projectId: string): Promise<ObjectStorageInventory> {
    const listed = await this.listObjects(projectId);
    return {
      bucketExists: this.generations.has(projectId),
      objects: listed.objects.map((object) => ({
        key: object.key,
        size: object.size,
        generation: object.generation,
        contentHash: object.contentHash,
      })),
    };
  }

  async cloneProjectObjects(
    _sourceProjectId: string,
    _targetProjectId: string,
    inventory: ObjectStorageInventory,
  ): Promise<ObjectStorageInventory> {
    return inventory;
  }
}

function transactionAwareClient(prisma: DatabaseClient, depth: { value: number }): DatabaseClient {
  return new Proxy(prisma, {
    get(target, property, receiver) {
      if (property === '$transaction') {
        return async (...args: unknown[]) => {
          const first = args[0];
          if (typeof first !== 'function') {
            return Reflect.apply(
              Reflect.get(target, property, target) as (...values: unknown[]) => unknown,
              target,
              args,
            );
          }
          return Reflect.apply(Reflect.get(target, property, target) as (...values: unknown[]) => unknown, target, [
            async (tx: unknown) => {
              depth.value += 1;
              try {
                return await first(tx);
              } finally {
                depth.value -= 1;
              }
            },
            ...args.slice(1),
          ]);
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as DatabaseClient;
}

async function seed(prisma: DatabaseClient, label: string) {
  const suffix = token();
  const sourceOrg = await prisma.organization.create({
    data: { name: `${label} source ${suffix}`, slug: `${label}-source-${suffix}` },
  });
  const targetOrg = await prisma.organization.create({
    data: { name: `${label} target ${suffix}`, slug: `${label}-target-${suffix}` },
  });
  const source = await prisma.project.create({
    data: { organizationId: sourceOrg.id, name: `${label} source`, slug: `${label}-source-${suffix}` },
  });
  const target = await prisma.project.create({
    data: { organizationId: targetOrg.id, name: `${label} target`, slug: `${label}-target-${suffix}` },
  });
  return { sourceOrg, targetOrg, source, target };
}

async function scheduleNow(prisma: DatabaseClient, projectId: string, expectedOrganizationId: string) {
  await prisma.$transaction((tx) =>
    scheduleObjectStorageVersionGc(tx, {
      projectId,
      expectedOrganizationId,
      notBefore: new Date(0),
    }),
  );
}

async function cleanup(prisma: DatabaseClient, seeded: Awaited<ReturnType<typeof seed>>) {
  await prisma.remixStorageShare.deleteMany({
    where: { sourceProjectId: seeded.source.id },
  });
  await prisma.objectStorageVersionGcSchedule.deleteMany({ where: { projectId: seeded.source.id } });
  await prisma.$executeRaw`
    DELETE FROM "ObjectStorageCapabilityReservation" reservation
    WHERE EXISTS (
      SELECT 1 FROM "ObjectStorageOperationProjectScope" scope
      WHERE scope."operationId" = reservation."operationId"
        AND scope."projectIdSnapshot" = ${seeded.source.id}
    )
  `;
  await prisma.objectStorageOperation.deleteMany({
    where: { scopes: { some: { projectIdSnapshot: seeded.source.id } } },
  });
  await prisma.project.deleteMany({ where: { id: { in: [seeded.source.id, seeded.target.id] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [seeded.sourceOrg.id, seeded.targetOrg.id] } } });
}

runDbTests('object-storage version history GC', () => {
  it('retains ACTIVE share generations, then collects them after revoke and disables versioning', async () => {
    const raw = createDatabaseClient();
    const depth = { value: 0 };
    const prisma = transactionAwareClient(raw, depth);
    const store = new PrismaApiStore(prisma);
    const storage = new VersionGcStorage();
    storage.transactionDepth = () => depth.value;
    const seeded = await seed(raw, 'version-gc-retain');
    const hash = (value: string) => `sha256:${Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64)}`;
    storage.seed(seeded.source.id, [
      { key: 'asset.bin', generation: 'G1', size: 1, contentHash: hash('g1'), current: false },
      { key: 'asset.bin', generation: 'G2', size: 1, contentHash: hash('g2'), current: false },
      { key: 'asset.bin', generation: 'G3', size: 1, contentHash: hash('g3'), current: true },
    ]);
    try {
      await store.createRemixStorageShare({
        sourceProjectId: seeded.source.id,
        targetProjectId: seeded.target.id,
        sourceOrganizationId: seeded.sourceOrg.id,
        targetOrganizationId: seeded.targetOrg.id,
        consentVersion: 'test-v1',
        sourceInventory: {
          bucketExists: true,
          objects: [{ key: 'asset.bin', size: 1, generation: 'G1', contentHash: hash('g1') }],
        },
        prepareSourceRetention: async () => ({
          bucketExists: true,
          objects: [{ key: 'asset.bin', size: 1, generation: 'G1', contentHash: hash('g1') }],
        }),
      });
      const retained = await store.reconcileObjectStorageVersionGc({ storage, maxSchedules: 10 });
      expect(retained.deletedGenerations).toBe(1);
      expect(storage.identities(seeded.source.id)).toEqual(['asset.bin@G1', 'asset.bin@G3']);
      expect(storage.versioning.get(seeded.source.id)).toBe(true);

      await store.revokeRemixStorageShare({
        targetProjectId: seeded.target.id,
        targetOrganizationId: seeded.targetOrg.id,
      });
      const revoked = await store.reconcileObjectStorageVersionGc({ storage, maxSchedules: 10 });
      expect(revoked.deletedGenerations).toBe(1);
      expect(storage.identities(seeded.source.id)).toEqual(['asset.bin@G3']);
      expect(storage.versioning.get(seeded.source.id)).toBe(false);
      await expect(
        raw.objectStorageVersionGcSchedule.findUnique({ where: { projectId: seeded.source.id } }),
      ).resolves.toBeNull();
    } finally {
      await cleanup(raw, seeded);
      await raw.$disconnect();
    }
  });

  it('does zero provider I/O while a DB-clock capability upper bound is live', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const storage = new VersionGcStorage();
    const seeded = await seed(prisma, 'version-gc-capability');
    storage.seed(seeded.source.id, [
      { key: 'live.bin', generation: 'G1', size: 1, contentHash: `sha256:${'1'.repeat(64)}`, current: true },
    ]);
    try {
      await prisma.project.update({
        where: { id: seeded.source.id },
        data: { objectStorageCapabilityExpiresAt: new Date(Date.now() + 60_000) },
      });
      await prisma.objectStorageVersionGcSchedule.create({
        data: {
          projectId: seeded.source.id,
          expectedOrganizationId: seeded.sourceOrg.id,
          notBefore: new Date(0),
          nextAttemptAt: new Date(0),
        },
      });
      const report = await store.reconcileObjectStorageVersionGc({ storage, maxSchedules: 10 });
      expect(report.deferred).toBe(1);
      expect(storage.providerReads).toBe(0);
      expect(storage.providerDeletes).toBe(0);
      const schedule = await prisma.objectStorageVersionGcSchedule.findUniqueOrThrow({
        where: { projectId: seeded.source.id },
      });
      expect(schedule.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    } finally {
      await cleanup(prisma, seeded);
      await prisma.$disconnect();
    }
  });

  it('schedules signed PUT history collection at the reserved DB upper bound before signing', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const seeded = await seed(prisma, 'version-gc-signed-put');
    let reservedExpiresAt: string | undefined;
    try {
      const issued = await store.issueSignedObjectStorageCapability(
        {
          projectId: seeded.source.id,
          expectedOrganizationId: seeded.sourceOrg.id,
          method: 'PUT',
          objectKey: 'uploads/app.bin',
        },
        async ({ expiresAt }) => {
          reservedExpiresAt = expiresAt;
          const schedule = await prisma.objectStorageVersionGcSchedule.findUniqueOrThrow({
            where: { projectId: seeded.source.id },
          });
          expect(schedule.notBefore.toISOString()).toBe(expiresAt);
          expect(schedule.nextAttemptAt.toISOString()).toBe(expiresAt);
          return { expiresAt, url: 'https://upload.invalid/app.bin' };
        },
      );
      expect(issued.expiresAt).toBe(reservedExpiresAt);
      const project = await prisma.project.findUniqueOrThrow({ where: { id: seeded.source.id } });
      expect(project.objectStorageCapabilityExpiresAt?.toISOString()).toBe(reservedExpiresAt);
    } finally {
      await cleanup(prisma, seeded);
      await prisma.$disconnect();
    }
  });

  it('recovers verify-first after a delete applied before a transient provider failure', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const storage = new VersionGcStorage();
    const seeded = await seed(prisma, 'version-gc-recovery');
    storage.seed(seeded.source.id, [
      { key: 'asset.bin', generation: 'G1', size: 1, contentHash: `sha256:${'1'.repeat(64)}`, current: false },
      { key: 'asset.bin', generation: 'G2', size: 1, contentHash: `sha256:${'2'.repeat(64)}`, current: true },
    ]);
    storage.failAfterDelete = true;
    try {
      await scheduleNow(prisma, seeded.source.id, seeded.sourceOrg.id);
      const failed = await store.reconcileObjectStorageVersionGc({ storage, maxSchedules: 1 });
      expect(failed.deferred).toBe(1);
      expect(storage.identities(seeded.source.id)).toEqual(['asset.bin@G2']);

      await prisma.$executeRaw`
        UPDATE "ObjectStorageOperation"
        SET "leaseExpiresAt" = clock_timestamp() - interval '1 second'
        WHERE "kind" = 'PROJECT_VERSION_GC'::"ObjectStorageOperationKind"
          AND "status" = 'EFFECT_STARTED'::"ObjectStorageOperationStatus"
          AND EXISTS (
            SELECT 1 FROM "ObjectStorageOperationProjectScope" scope
            WHERE scope."operationId" = "ObjectStorageOperation"."id"
              AND scope."projectIdSnapshot" = ${seeded.source.id}
          )
      `;
      await prisma.objectStorageVersionGcSchedule.update({
        where: { projectId: seeded.source.id },
        data: { leaseExpiresAt: new Date(0) },
      });
      const recovered = await store.reconcileObjectStorageVersionGc({ storage, maxSchedules: 10 });
      expect(recovered.recovered).toBe(1);
      expect(storage.providerDeletes).toBe(1);
      expect(storage.versioning.get(seeded.source.id)).toBe(false);
    } finally {
      await cleanup(prisma, seeded);
      await prisma.$disconnect();
    }
  });

  it('schedules history collection when a PUT is finalized by verify-first recovery', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const storage = new VersionGcStorage();
    const seeded = await seed(prisma, 'version-gc-put-recovery');
    storage.seed(seeded.source.id, [
      { key: 'asset.bin', generation: 'G1', size: 1, contentHash: `sha256:${'1'.repeat(64)}`, current: true },
    ]);
    storage.failAfterPut = true;
    try {
      await expect(
        store.executeTenantObjectStorageIntent({
          scope: { projectId: seeded.source.id, expectedOrganizationId: seeded.sourceOrg.id },
          intent: {
            type: 'PUT_OBJECT',
            projectId: seeded.source.id,
            key: 'asset.bin',
            body: new TextEncoder().encode('replacement bytes'),
          },
          storage,
          idempotencyKey: 'version-gc-put-recovery',
        }),
      ).rejects.toMatchObject({ code: 'ECONNRESET' });
      await expect(
        prisma.objectStorageVersionGcSchedule.findUnique({ where: { projectId: seeded.source.id } }),
      ).resolves.toBeNull();
      await prisma.$executeRaw`
        UPDATE "ObjectStorageOperation"
        SET "leaseExpiresAt" = clock_timestamp() - interval '1 second'
        WHERE "idempotencyKey" = 'version-gc-put-recovery'
          AND "status" = 'EFFECT_STARTED'::"ObjectStorageOperationStatus"
      `;

      const recovered = await store.reconcileObjectStorageOperations({ storage, maxCandidates: 10 });
      expect(recovered.recovered).toBe(1);
      const schedule = await prisma.objectStorageVersionGcSchedule.findUniqueOrThrow({
        where: { projectId: seeded.source.id },
      });
      expect(schedule.status).toBe('PENDING');
      expect(schedule.notBefore.getTime()).toBeLessThanOrEqual(Date.now());
      expect(storage.identities(seeded.source.id)).toHaveLength(2);
    } finally {
      await cleanup(prisma, seeded);
      await prisma.$disconnect();
    }
  });

  it('advances through more than one normalized 500-generation batch', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const storage = new VersionGcStorage();
    const seeded = await seed(prisma, 'version-gc-batches');
    storage.seed(seeded.source.id, [
      ...Array.from({ length: 501 }, (_, index) => ({
        key: `asset-${index.toString().padStart(4, '0')}.bin`,
        generation: `G${index}`,
        size: 1,
        contentHash: `sha256:${index.toString(16).padStart(64, '0')}`,
        current: false,
      })),
      { key: 'current.bin', generation: 'CURRENT', size: 1, contentHash: `sha256:${'f'.repeat(64)}`, current: true },
    ]);
    try {
      await scheduleNow(prisma, seeded.source.id, seeded.sourceOrg.id);
      const first = await store.reconcileObjectStorageVersionGc({ storage, maxSchedules: 1 });
      expect(first.deletedGenerations).toBe(500);
      await prisma.objectStorageVersionGcSchedule.update({
        where: { projectId: seeded.source.id },
        data: { notBefore: new Date(0), nextAttemptAt: new Date(0) },
      });
      const second = await store.reconcileObjectStorageVersionGc({ storage, maxSchedules: 1 });
      expect(second.deletedGenerations).toBe(1);
      expect(storage.identities(seeded.source.id)).toEqual(['current.bin@CURRENT']);
      expect(storage.versioning.get(seeded.source.id)).toBe(false);
    } finally {
      await cleanup(prisma, seeded);
      await prisma.$disconnect();
    }
  });

  it('persists poison backoff and advances a one-row keyset batch to healthy work', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const storage = new VersionGcStorage();
    const first = await seed(prisma, 'version-gc-poison-a');
    const second = await seed(prisma, 'version-gc-poison-b');
    const [poison, healthy] = [first, second].sort((left, right) => left.source.id.localeCompare(right.source.id));
    const versionRows = (digit: string): StoredGeneration[] => [
      { key: 'asset.bin', generation: 'G1', size: 1, contentHash: `sha256:${digit.repeat(64)}`, current: false },
      { key: 'asset.bin', generation: 'G2', size: 1, contentHash: `sha256:${'f'.repeat(64)}`, current: true },
    ];
    storage.seed(poison.source.id, versionRows('1'));
    storage.seed(healthy.source.id, versionRows('2'));
    storage.transientReadFailures.add(poison.source.id);
    try {
      await scheduleNow(prisma, poison.source.id, poison.sourceOrg.id);
      await scheduleNow(prisma, healthy.source.id, healthy.sourceOrg.id);
      const report = await store.reconcileObjectStorageVersionGc({
        storage,
        batchSize: 1,
        maxSchedules: 2,
      });
      expect(report.scanned).toBe(2);
      expect(report.deferred).toBe(1);
      expect(report.committed).toBe(1);
      expect(storage.identities(poison.source.id)).toEqual(['asset.bin@G1', 'asset.bin@G2']);
      expect(storage.identities(healthy.source.id)).toEqual(['asset.bin@G2']);
      const poisonedSchedule = await prisma.objectStorageVersionGcSchedule.findUniqueOrThrow({
        where: { projectId: poison.source.id },
      });
      expect(poisonedSchedule.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    } finally {
      await cleanup(prisma, first);
      await cleanup(prisma, second);
      await prisma.$disconnect();
    }
  });
});
