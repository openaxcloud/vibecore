import { createHash } from 'node:crypto';

import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { describe, expect, it, vi } from 'vitest';

import type { TenantObjectStorageCommandIntent } from '../object-storage-command.js';
import { objectStorageStaticArtifactSummary } from '../object-storage-operation.js';
import {
  GcsObjectStorage,
  OBJECT_STORAGE_LOCATION,
  ObjectStorageError,
  parseObjectStorageInventory,
  projectBucketName,
  type BucketLike,
  type FileLike,
  type ListObjectsResult,
  type ObjectStorage,
  type ObjectStorageInventory,
  type ObjectStorageInventoryEntry,
  type SignedUrlResult,
  type StorageLike,
  type UploadUrlResult,
} from '../object-storage.js';
import { PrismaApiStore } from '../prisma-store.js';
import { projectPermanentDeletionRequestHash } from '../project-permanent-deletion.js';
import { emptyManagedDatabaseErasureCallbacks } from './project-database-erasure-test-support.js';

function suffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function metadataEnablesVersioning(metadata: Record<string, unknown>): boolean {
  const versioning = metadata.versioning;
  return Boolean(
    versioning &&
      typeof versioning === 'object' &&
      !Array.isArray(versioning) &&
      Reflect.get(versioning, 'enabled') === true,
  );
}

class VersioningProbeBucket implements BucketLike {
  versioningEnabled = false;

  constructor(private existsValue: boolean) {}

  async exists(): Promise<[boolean]> {
    return [this.existsValue];
  }

  async create(options: Record<string, unknown>): Promise<void> {
    this.existsValue = true;
    this.versioningEnabled ||= metadataEnablesVersioning(options);
  }

  async setMetadata(metadata: Record<string, unknown>): Promise<void> {
    this.versioningEnabled ||= metadataEnablesVersioning(metadata);
  }

  async getMetadata(): Promise<[{ versioning?: { enabled?: boolean } }]> {
    return [{ versioning: { enabled: this.versioningEnabled } }];
  }

  async getFiles(): Promise<[FileLike[], unknown, { prefixes?: string[] } | undefined]> {
    return [[], undefined, undefined];
  }

  file(): FileLike {
    throw new Error('Versioning probe does not access objects');
  }

  async deleteFiles(): Promise<void> {}

  async delete(): Promise<void> {
    this.existsValue = false;
  }
}

class VersioningProbeStorage implements StorageLike {
  constructor(readonly value: BucketLike) {}

  bucket(): BucketLike {
    return this.value;
  }
}

class VersionedDeleteProbeBucket implements BucketLike {
  private existsValue = true;
  readonly deleteFilesOptions: Record<string, unknown>[] = [];
  private versionsPurged = false;

  async exists(): Promise<[boolean]> {
    return [this.existsValue];
  }

  async create(): Promise<void> {}

  async setMetadata(): Promise<void> {}

  async getMetadata(): Promise<[{ versioning?: { enabled?: boolean } }]> {
    return [{ versioning: { enabled: true } }];
  }

  async getFiles(): Promise<[FileLike[], unknown, { prefixes?: string[] } | undefined]> {
    return [[], undefined, undefined];
  }

  file(): FileLike {
    throw new Error('Versioned delete probe does not access individual objects');
  }

  async deleteFiles(options: Record<string, unknown>): Promise<void> {
    this.deleteFilesOptions.push(options);
    this.versionsPurged = options.versions === true;
  }

  async delete(): Promise<void> {
    if (!this.versionsPurged) throw new Error('VERSIONED_GENERATIONS_REMAIN');
    this.existsValue = false;
  }
}

describe('GCS bucket generation retention', () => {
  it.each([
    { label: 'new', exists: false, created: true },
    { label: 'existing', exists: true, created: false },
  ])('guarantees versioning for a $label source bucket', async ({ exists, created }) => {
    const bucket = new VersioningProbeBucket(exists);
    const storage = new GcsObjectStorage(new VersioningProbeStorage(bucket));
    const guard = vi.fn(async () => undefined);

    await expect(storage.ensureBucket('project-versioning', guard)).resolves.toEqual({
      bucket: projectBucketName('project-versioning'),
      created,
      location: OBJECT_STORAGE_LOCATION,
    });
    expect(guard).toHaveBeenCalled();
    expect(bucket.versioningEnabled).toBe(true);
  });

  it('purges every retained generation before deleting a revoked source bucket', async () => {
    const bucket = new VersionedDeleteProbeBucket();
    const storage = new GcsObjectStorage(new VersioningProbeStorage(bucket));

    await expect(storage.deleteBucket('project-versioned-delete')).resolves.toEqual({
      bucket: projectBucketName('project-versioned-delete'),
      deleted: true,
    });
    expect(bucket.deleteFilesOptions).toContainEqual({ force: true, versions: true });
  });
});

interface StoredGeneration {
  body: Uint8Array;
  contentHash: string;
  generation: string;
}

interface VersionedBucket {
  currentByKey: Map<string, string>;
  versionsByKey: Map<string, Map<string, StoredGeneration>>;
}

function objectHash(body: Uint8Array): string {
  return `sha256:${createHash('sha256').update(body).digest('hex')}`;
}

class VersionedMemoryObjectStorage implements ObjectStorage {
  readonly active = true;
  readonly providerEffects: string[] = [];
  readonly downloads: Array<{ projectId: string; key: string; generation?: string }> = [];
  providerReads = 0;
  private generationSequence = 20;
  private readonly buckets = new Map<string, VersionedBucket>();

  private bucket(projectId: string): VersionedBucket {
    let bucket = this.buckets.get(projectId);
    if (!bucket) {
      bucket = { currentByKey: new Map(), versionsByKey: new Map() };
      this.buckets.set(projectId, bucket);
    }
    return bucket;
  }

  private version(projectId: string, key: string, generation: string): StoredGeneration | undefined {
    return this.buckets.get(projectId)?.versionsByKey.get(key)?.get(generation);
  }

  private writeGeneration(
    projectId: string,
    key: string,
    body: Uint8Array,
    generation: string,
  ): ObjectStorageInventoryEntry {
    const bucket = this.bucket(projectId);
    let versions = bucket.versionsByKey.get(key);
    if (!versions) {
      versions = new Map();
      bucket.versionsByKey.set(key, versions);
    }
    const stored: StoredGeneration = {
      body: Uint8Array.from(body),
      contentHash: objectHash(body),
      generation,
    };
    versions.set(generation, stored);
    bucket.currentByKey.set(key, generation);
    return { key, size: stored.body.byteLength, generation, contentHash: stored.contentHash };
  }

  seed(projectId: string, key: string, body: string, generation = 'G1'): ObjectStorageInventoryEntry {
    return this.writeGeneration(projectId, key, new TextEncoder().encode(body), generation);
  }

  overwriteOutsideWorkflow(projectId: string, key: string, body: string, generation: string): void {
    this.writeGeneration(projectId, key, new TextEncoder().encode(body), generation);
  }

  currentGeneration(projectId: string, key: string): string | undefined {
    return this.buckets.get(projectId)?.currentByKey.get(key);
  }

  hasGeneration(projectId: string, key: string, generation: string): boolean {
    return Boolean(this.version(projectId, key, generation));
  }

  async ensureBucket(projectId: string, guard?: () => Promise<void>) {
    await guard?.();
    const created = !this.buckets.has(projectId);
    this.bucket(projectId);
    this.providerEffects.push(`ENSURE_BUCKET:${projectId}`);
    return { bucket: projectBucketName(projectId), created, location: OBJECT_STORAGE_LOCATION };
  }

  async bucketExists(projectId: string): Promise<boolean> {
    this.providerReads += 1;
    return this.buckets.has(projectId);
  }

  async listObjects(
    projectId: string,
    options: { prefix?: string; delimiter?: string } = {},
  ): Promise<ListObjectsResult> {
    this.providerReads += 1;
    const prefix = options.prefix ?? '';
    const bucket = this.buckets.get(projectId);
    if (!bucket) return { objects: [], folders: [] };

    return {
      objects: [...bucket.currentByKey.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, generation]) => {
          const stored = this.version(projectId, key, generation);
          if (!stored) throw new Error('Current generation is missing');
          return {
            key,
            size: stored.body.byteLength,
            updated: null,
            contentType: null,
            etag: null,
            generation,
            contentHash: stored.contentHash,
          };
        })
        .sort((left, right) => left.key.localeCompare(right.key)),
      folders: [],
    };
  }

  async listObjectVersions(projectId: string, options: { prefix?: string } = {}): Promise<ListObjectsResult> {
    this.providerReads += 1;
    const prefix = options.prefix ?? '';
    const bucket = this.buckets.get(projectId);
    if (!bucket) return { objects: [], folders: [] };
    return {
      objects: [...bucket.versionsByKey.entries()]
        .flatMap(([key, versions]) =>
          key.startsWith(prefix)
            ? [...versions.values()].map((stored) => ({
                key,
                size: stored.body.byteLength,
                updated: null,
                contentType: null,
                etag: null,
                generation: stored.generation,
                contentHash: stored.contentHash,
              }))
            : [],
        )
        .sort((left, right) => left.key.localeCompare(right.key) || left.generation.localeCompare(right.generation)),
      folders: [],
    };
  }

  async createUploadUrl(): Promise<UploadUrlResult> {
    throw new Error('Upload capabilities are not used by this retention spec');
  }

  async createDownloadUrl(
    projectId: string,
    input: { key: string; generation?: string; expiresAt?: string },
  ): Promise<SignedUrlResult> {
    const generation = input.generation ?? this.currentGeneration(projectId, input.key);
    if (!generation || !this.version(projectId, input.key, generation)) {
      throw new ObjectStorageError('Pinned generation is unavailable', 'OBJECT_NOT_FOUND');
    }
    this.downloads.push({ projectId, key: input.key, ...(input.generation ? { generation: input.generation } : {}) });
    return {
      url: `https://download.invalid/${projectId}/${encodeURIComponent(input.key)}?generation=${generation}`,
      expiresAt: input.expiresAt ?? new Date(Date.now() + 60_000).toISOString(),
    };
  }

  async putObject(
    projectId: string,
    input: {
      key: string;
      body: Uint8Array;
      contentType?: string;
      ifGenerationMatch?: string | 0;
    },
  ) {
    const current = this.currentGeneration(projectId, input.key);
    if (
      (input.ifGenerationMatch === 0 && current !== undefined) ||
      (typeof input.ifGenerationMatch === 'string' && current !== input.ifGenerationMatch)
    ) {
      throw new ObjectStorageError('Generation precondition changed', 'TARGET_PRECONDITION_CHANGED');
    }
    const generation = `G${this.generationSequence++}`;
    const stored = this.writeGeneration(projectId, input.key, input.body, generation);
    this.providerEffects.push(`PUT_OBJECT:${projectId}:${input.key}`);
    return { key: input.key, size: stored.size, generation, contentHash: stored.contentHash ?? undefined };
  }

  async moveObject(
    projectId: string,
    input: { from: string; to: string; sourceGeneration?: string },
    guard?: () => Promise<void>,
  ) {
    await guard?.();
    const sourceGeneration = input.sourceGeneration ?? this.currentGeneration(projectId, input.from);
    const source = sourceGeneration ? this.version(projectId, input.from, sourceGeneration) : undefined;
    if (!sourceGeneration || !source || this.currentGeneration(projectId, input.from) !== sourceGeneration) {
      throw new ObjectStorageError('Source generation changed', 'SOURCE_PRECONDITION_CHANGED');
    }
    if (this.currentGeneration(projectId, input.to)) {
      throw new ObjectStorageError('Move target already exists', 'TARGET_PRECONDITION_CHANGED');
    }
    const generation = `G${this.generationSequence++}`;
    this.writeGeneration(projectId, input.to, source.body, generation);
    this.buckets.get(projectId)?.currentByKey.delete(input.from);
    this.buckets.get(projectId)?.versionsByKey.get(input.from)?.delete(sourceGeneration);
    this.providerEffects.push(`MOVE_OBJECT:${projectId}:${input.from}:${input.to}`);
    await guard?.();
    return { moved: true, key: input.to, generation };
  }

  async deleteObject(projectId: string, input: { key: string; generation?: string }) {
    const generation = input.generation ?? this.currentGeneration(projectId, input.key);
    const existed = Boolean(generation && this.version(projectId, input.key, generation));
    if (generation) {
      this.buckets.get(projectId)?.versionsByKey.get(input.key)?.delete(generation);
      if (this.currentGeneration(projectId, input.key) === generation) {
        this.buckets.get(projectId)?.currentByKey.delete(input.key);
      }
    }
    this.providerEffects.push(`DELETE_OBJECT:${projectId}:${input.key}`);
    return { deleted: existed, count: existed ? 1 : 0 };
  }

  async deletePrefix(projectId: string, input: { prefix: string }, guard?: () => Promise<void>) {
    await guard?.();
    const bucket = this.buckets.get(projectId);
    const keys = bucket ? [...bucket.currentByKey.keys()].filter((key) => key.startsWith(input.prefix)) : [];
    const versionKeys = bucket ? [...bucket.versionsByKey.keys()].filter((key) => key.startsWith(input.prefix)) : [];
    for (const key of versionKeys) {
      bucket?.currentByKey.delete(key);
      bucket?.versionsByKey.delete(key);
    }
    this.providerEffects.push(`DELETE_PREFIX:${projectId}:${input.prefix}`);
    await guard?.();
    return { deleted: true, count: keys.length };
  }

  async deleteBucket(projectId: string, guard?: () => Promise<void>) {
    await guard?.();
    const deleted = this.buckets.delete(projectId);
    this.providerEffects.push(`DELETE_BUCKET:${projectId}`);
    await guard?.();
    return { deleted, bucket: projectBucketName(projectId) };
  }

  async inventoryProjectObjects(projectId: string): Promise<ObjectStorageInventory> {
    if (!(await this.bucketExists(projectId))) return { bucketExists: false, objects: [] };
    const listed = await this.listObjects(projectId);
    return {
      bucketExists: true,
      objects: listed.objects.map(({ key, size, generation, contentHash }) => ({
        key,
        size,
        generation,
        contentHash,
      })),
    };
  }

  async cloneProjectObjects(
    sourceProjectId: string,
    targetProjectId: string,
    inventory: ObjectStorageInventory,
    guard?: () => Promise<void>,
  ): Promise<ObjectStorageInventory> {
    await guard?.();
    for (const object of inventory.objects) {
      if (!object.generation) throw new ObjectStorageError('Source generation missing', 'SOURCE_UNPINNABLE');
      const source = this.version(sourceProjectId, object.key, object.generation);
      if (!source) throw new ObjectStorageError('Source generation changed', 'SOURCE_CHANGED');
      this.writeGeneration(targetProjectId, object.key, source.body, `G${this.generationSequence++}`);
    }
    this.providerEffects.push(`CLONE_PROJECT:${sourceProjectId}:${targetProjectId}`);
    await guard?.();
    return this.inventoryProjectObjects(targetProjectId);
  }
}

async function canReachShareRetentionTables(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = createDatabaseClient();
  try {
    const rows = await prisma.$queryRaw<Array<{ operations: string | null; shares: string | null }>>`
      SELECT to_regclass('"ObjectStorageOperation"')::text AS operations,
             to_regclass('"RemixStorageShare"')::text AS shares
    `;
    return rows[0]?.operations !== null && rows[0]?.shares !== null;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

const runDbTests = (await canReachShareRetentionTables()) ? describe.sequential : describe.skip;

interface ShareFixture {
  actorId: string;
  sourceOrganizationId: string;
  targetOrganizationId: string;
  sourceProject: { id: string; name: string };
  targetProjectId: string;
  auxiliaryTargetProjectId: string;
}

async function seedShareFixture(prisma: DatabaseClient, label: string): Promise<ShareFixture> {
  const token = suffix();
  const actor = await prisma.user.create({ data: { email: `${label}-${token}@example.test` } });
  const sourceOrganization = await prisma.organization.create({
    data: { name: `${label} source ${token}`, slug: `${label}-source-${token}` },
  });
  const targetOrganization = await prisma.organization.create({
    data: { name: `${label} target ${token}`, slug: `${label}-target-${token}` },
  });
  const sourceProject = await prisma.project.create({
    data: {
      organizationId: sourceOrganization.id,
      name: `${label} source project ${token}`,
      slug: `${label}-source-project-${token}`,
    },
  });
  const [targetProject, auxiliaryTargetProject] = await Promise.all([
    prisma.project.create({
      data: {
        organizationId: targetOrganization.id,
        name: `${label} target project ${token}`,
        slug: `${label}-target-project-${token}`,
      },
    }),
    prisma.project.create({
      data: {
        organizationId: targetOrganization.id,
        name: `${label} auxiliary target ${token}`,
        slug: `${label}-aux-target-${token}`,
      },
    }),
  ]);
  return {
    actorId: actor.id,
    sourceOrganizationId: sourceOrganization.id,
    targetOrganizationId: targetOrganization.id,
    sourceProject: { id: sourceProject.id, name: sourceProject.name },
    targetProjectId: targetProject.id,
    auxiliaryTargetProjectId: auxiliaryTargetProject.id,
  };
}

async function cleanupShareFixture(prisma: DatabaseClient, fixture: ShareFixture): Promise<void> {
  const projectIds = [fixture.sourceProject.id, fixture.targetProjectId, fixture.auxiliaryTargetProjectId];
  await prisma.remixStorageShare.deleteMany({
    where: {
      OR: [{ sourceProjectId: { in: projectIds } }, { targetProjectId: { in: projectIds } }],
    },
  });
  await prisma.$executeRaw`
    DELETE FROM "ObjectStorageCapabilityReservation" reservation
    WHERE EXISTS (
      SELECT 1 FROM "ObjectStorageOperationProjectScope" scope
      WHERE scope."operationId" = reservation."operationId"
        AND scope."projectIdSnapshot" IN (${fixture.sourceProject.id}, ${fixture.targetProjectId}, ${fixture.auxiliaryTargetProjectId})
    )
  `;
  await prisma.$executeRaw`
    DELETE FROM "ObjectStorageOperation" operation
    WHERE EXISTS (
      SELECT 1 FROM "ObjectStorageOperationProjectScope" scope
      WHERE scope."operationId" = operation."id"
        AND scope."projectIdSnapshot" IN (${fixture.sourceProject.id}, ${fixture.targetProjectId}, ${fixture.auxiliaryTargetProjectId})
    )
    AND NOT EXISTS (
      SELECT 1 FROM "ProjectPermanentDeletionReceipt" receipt
      WHERE receipt."operationId" = operation."id"
    )
  `;
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  await prisma.organization.deleteMany({
    where: { id: { in: [fixture.sourceOrganizationId, fixture.targetOrganizationId] } },
  });
  await prisma.user.deleteMany({ where: { id: fixture.actorId } });
}

function shareInput(
  fixture: ShareFixture,
  sourceInventory: ObjectStorageInventory,
  prepareSourceRetention: () => Promise<ObjectStorageInventory> = async () => structuredClone(sourceInventory),
) {
  return {
    sourceProjectId: fixture.sourceProject.id,
    targetProjectId: fixture.targetProjectId,
    sourceOrganizationId: fixture.sourceOrganizationId,
    targetOrganizationId: fixture.targetOrganizationId,
    consentVersion: 'object-storage-share-consent-v1',
    consentedByUserId: fixture.actorId,
    sourceInventory,
    prepareSourceRetention,
  };
}

function pinnedGeneration(sourceInventory: unknown, key: string): string {
  const inventory = parseObjectStorageInventory(sourceInventory);
  const generation = inventory?.objects.find((object) => object.key === key)?.generation;
  if (!generation) throw new Error(`Pinned generation missing for ${key}`);
  return generation;
}

runDbTests('SHARE_WITH_CONSENT source generation retention', () => {
  it('serializes concurrent first-create attempts into one retention effect and one durable share', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const storeA = new PrismaApiStore(prismaA);
    const storeB = new PrismaApiStore(prismaB);
    const fixture = await seedShareFixture(prismaA, 'share-retention-cas');
    const sourceInventory: ObjectStorageInventory = {
      bucketExists: true,
      objects: [{ key: 'data/pinned.bin', size: 8, generation: 'G1', contentHash: 'sha256:g1' }],
    };
    const prepareA = vi.fn(async () => structuredClone(sourceInventory));
    const prepareB = vi.fn(async () => structuredClone(sourceInventory));

    try {
      const [createdA, createdB] = await Promise.all([
        storeA.createRemixStorageShare(shareInput(fixture, sourceInventory, prepareA)),
        storeB.createRemixStorageShare(shareInput(fixture, sourceInventory, prepareB)),
      ]);

      expect(createdA.id).toBe(createdB.id);
      expect(prepareA.mock.calls.length + prepareB.mock.calls.length).toBe(1);
      await expect(
        prismaA.remixStorageShare.count({ where: { targetProjectId: fixture.targetProjectId } }),
      ).resolves.toBe(1);
    } finally {
      await cleanupShareFixture(prismaA, fixture);
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('pins G1, refuses source destruction, and releases mutations only after explicit revoke', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const fixture = await seedShareFixture(prisma, 'share-retention');
    const storage = new VersionedMemoryObjectStorage();
    const sourceId = fixture.sourceProject.id;
    const sourceInventory: ObjectStorageInventory = {
      bucketExists: true,
      objects: [
        storage.seed(sourceId, 'docs/overwrite.txt', 'G1 overwrite bytes'),
        storage.seed(sourceId, 'docs/delete.txt', 'G1 delete bytes'),
        storage.seed(sourceId, 'docs/move.txt', 'G1 move bytes'),
        storage.seed(sourceId, 'docs/prefix/one.txt', 'G1 prefix bytes'),
      ],
    };
    const scope = { projectId: sourceId, expectedOrganizationId: fixture.sourceOrganizationId };
    const mutations: Array<{
      label: string;
      intent: TenantObjectStorageCommandIntent;
    }> = [
      {
        label: 'put',
        intent: {
          type: 'PUT_OBJECT',
          projectId: sourceId,
          key: 'docs/overwrite.txt',
          body: new TextEncoder().encode('G3 workflow overwrite'),
        },
      },
      {
        label: 'delete-object',
        intent: { type: 'DELETE_OBJECT', projectId: sourceId, key: 'docs/delete.txt' },
      },
      {
        label: 'move',
        intent: { type: 'MOVE_OBJECT', projectId: sourceId, from: 'docs/move.txt', to: 'moved/move.txt' },
      },
      {
        label: 'delete-prefix',
        intent: { type: 'DELETE_PREFIX', projectId: sourceId, prefix: 'docs/prefix/' },
      },
      {
        label: 'delete-bucket',
        intent: { type: 'DELETE_BUCKET', projectId: sourceId },
      },
    ];

    try {
      const prepareSourceRetention = vi.fn(async () => {
        await storage.ensureBucket(sourceId);
        return storage.inventoryProjectObjects(sourceId);
      });
      const retainedShareInput = shareInput(fixture, sourceInventory, prepareSourceRetention);
      const created = await store.createRemixStorageShare(retainedShareInput);
      const replayed = await store.createRemixStorageShare(retainedShareInput);
      expect(replayed.id).toBe(created.id);
      expect(prepareSourceRetention).toHaveBeenCalledTimes(1);
      await expect(
        store.createRemixStorageShare(
          shareInput(fixture, {
            ...sourceInventory,
            objects: sourceInventory.objects.map((object) =>
              object.key === 'docs/overwrite.txt' ? { ...object, generation: 'DRIFTED-GENERATION' } : object,
            ),
          }),
        ),
      ).rejects.toMatchObject({ code: 'REMIX_STORAGE_SHARE_CONFLICT', statusCode: 409 });

      storage.overwriteOutsideWorkflow(sourceId, 'docs/overwrite.txt', 'G2 external overwrite', 'G2');
      storage.seed(sourceId, 'later/not-consented.txt', 'new legal object', 'G1-later');
      expect(storage.currentGeneration(sourceId, 'docs/overwrite.txt')).toBe('G2');
      expect(storage.hasGeneration(sourceId, 'docs/overwrite.txt', 'G1')).toBe(true);

      const effectsBeforeDriftReplay = storage.providerEffects.length;
      const readsBeforeDriftReplay = storage.providerReads;
      await expect(store.createRemixStorageShare(retainedShareInput)).resolves.toMatchObject({ id: created.id });
      expect(prepareSourceRetention).toHaveBeenCalledTimes(1);
      expect(storage.providerEffects).toHaveLength(effectsBeforeDriftReplay);
      expect(storage.providerReads).toBe(readsBeforeDriftReplay);

      const activeShare = await store.getRemixStorageShareByTarget(fixture.targetProjectId);
      expect(activeShare).toMatchObject({
        id: created.id,
        sourceProjectId: sourceId,
        targetProjectId: fixture.targetProjectId,
        state: 'ACTIVE',
      });
      const targetGeneration = pinnedGeneration(activeShare?.sourceInventory, 'docs/overwrite.txt');
      await storage.createDownloadUrl(sourceId, { key: 'docs/overwrite.txt', generation: targetGeneration });
      expect(storage.downloads).toEqual([{ projectId: sourceId, key: 'docs/overwrite.txt', generation: 'G1' }]);
      expect(storage.currentGeneration(sourceId, 'docs/overwrite.txt')).toBe('G2');

      await expect(
        store.executeTenantObjectStorageIntent({
          scope,
          intent: {
            type: 'PUT_OBJECT',
            projectId: sourceId,
            key: 'scratch/not-shared.txt',
            body: new TextEncoder().encode('not in the consented inventory'),
          },
          storage,
          idempotencyKey: 'share-retention-unshared-put',
        }),
      ).resolves.toMatchObject({ type: 'PUT_OBJECT' });
      await expect(
        store.executeTenantObjectStorageIntent({
          scope,
          intent: { type: 'DELETE_OBJECT', projectId: sourceId, key: 'scratch/not-shared.txt' },
          storage,
          idempotencyKey: 'share-retention-unshared-delete',
        }),
      ).resolves.toMatchObject({ type: 'DELETE_OBJECT' });

      for (const mutation of mutations) {
        const effectsBefore = storage.providerEffects.length;
        await expect(
          store.executeTenantObjectStorageIntent({
            scope,
            intent: mutation.intent,
            storage,
            idempotencyKey: `share-retention-${mutation.label}`,
          }),
        ).rejects.toMatchObject({ code: 'SHARED_SOURCE_RETENTION_ACTIVE', statusCode: 409 });
        expect(storage.providerEffects).toHaveLength(effectsBefore);
      }

      const effectsBeforeWrongTenant = storage.providerEffects.length;
      const readsBeforeWrongTenant = storage.providerReads;
      await expect(
        store.executeTenantObjectStorageIntent({
          scope: { projectId: sourceId, expectedOrganizationId: fixture.targetOrganizationId },
          intent: { type: 'DELETE_OBJECT', projectId: sourceId, key: 'docs/delete.txt' },
          storage,
          idempotencyKey: 'share-retention-wrong-tenant',
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION', statusCode: 409 });
      expect(storage.providerEffects).toHaveLength(effectsBeforeWrongTenant);
      expect(storage.providerReads).toBe(readsBeforeWrongTenant);

      const preflightPhysicalErasure = vi.fn(async () => ({
        summary: objectStorageStaticArtifactSummary([]),
        artifacts: [],
      }));
      const erasePhysical = vi.fn(async () => undefined);
      const verifyPhysicalAbsence = vi.fn(async () => {
        throw new Error('Physical verification must not run while a source share is active');
      });
      const permanentDeleteRequest = {
        projectId: sourceId,
        expectedOrganizationId: fixture.sourceOrganizationId,
        expectedProjectName: fixture.sourceProject.name,
        actorUserId: fixture.actorId,
      };
      await expect(
        store.hardDeleteProject({
          ...permanentDeleteRequest,
          idempotencyKey: 'share-retention-hard-delete',
          requestHash: projectPermanentDeletionRequestHash({
            projectId: permanentDeleteRequest.projectId,
            organizationId: permanentDeleteRequest.expectedOrganizationId,
            actorUserId: permanentDeleteRequest.actorUserId,
            expectedProjectName: permanentDeleteRequest.expectedProjectName,
          }),
          ...emptyManagedDatabaseErasureCallbacks(),
          preflightPhysicalErasure,
          erasePhysical,
          verifyPhysicalAbsence,
        }),
      ).rejects.toMatchObject({ code: 'SHARED_SOURCE_RETENTION_ACTIVE', statusCode: 409 });
      expect(preflightPhysicalErasure).not.toHaveBeenCalled();
      expect(erasePhysical).not.toHaveBeenCalled();
      expect(verifyPhysicalAbsence).not.toHaveBeenCalled();
      await expect(prisma.project.findUnique({ where: { id: sourceId } })).resolves.toMatchObject({ id: sourceId });

      await expect(
        store.revokeRemixStorageShare({
          targetProjectId: fixture.targetProjectId,
          targetOrganizationId: fixture.targetOrganizationId,
        }),
      ).resolves.toMatchObject({ state: 'REVOKED' });
      await expect(store.getRemixStorageShareByTarget(fixture.targetProjectId)).resolves.toBeUndefined();
      storage.overwriteOutsideWorkflow(sourceId, 'docs/prefix/one.txt', 'G2 prefix bytes', 'G2-prefix');

      for (const mutation of mutations) {
        await expect(
          store.executeTenantObjectStorageIntent({
            scope,
            intent: mutation.intent,
            storage,
            idempotencyKey: `share-retention-${mutation.label}`,
          }),
        ).resolves.toMatchObject({ type: mutation.intent.type });
        if (mutation.intent.type === 'DELETE_PREFIX') {
          await expect(storage.listObjectVersions(sourceId, { prefix: mutation.intent.prefix })).resolves.toEqual({
            objects: [],
            folders: [],
          });
        }
      }
      expect(storage.hasGeneration(sourceId, 'docs/overwrite.txt', 'G1')).toBe(false);
      await expect(storage.bucketExists(sourceId)).resolves.toBe(false);

      const effectsBeforeReplay = storage.providerEffects.length;
      await expect(
        store.executeTenantObjectStorageIntent({
          scope,
          intent: { type: 'DELETE_BUCKET', projectId: sourceId },
          storage,
          idempotencyKey: 'share-retention-delete-bucket',
        }),
      ).resolves.toMatchObject({ type: 'DELETE_BUCKET', result: { deleted: true } });
      expect(storage.providerEffects).toHaveLength(effectsBeforeReplay);
    } finally {
      await cleanupShareFixture(prisma, fixture);
      await prisma.$disconnect();
    }
  });

  it('rejects tmp/ inventories and stale tenant scopes without creating a share', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const fixture = await seedShareFixture(prisma, 'share-retention-invalid');
    const storage = new VersionedMemoryObjectStorage();
    const tmpInventory: ObjectStorageInventory = {
      bucketExists: true,
      objects: [storage.seed(fixture.sourceProject.id, 'tmp/ephemeral.bin', 'temporary bytes')],
    };

    try {
      await expect(store.createRemixStorageShare(shareInput(fixture, tmpInventory))).rejects.toMatchObject({
        code: 'REMIX_STORAGE_SNAPSHOT_UNPINNABLE',
        statusCode: 409,
      });
      await expect(store.getRemixStorageShareByTarget(fixture.targetProjectId)).resolves.toBeUndefined();

      const validInventory: ObjectStorageInventory = {
        bucketExists: true,
        objects: [storage.seed(fixture.sourceProject.id, 'data/pinned.bin', 'pinned bytes')],
      };
      const wrongTenantProviderPreparation = vi.fn(async () => structuredClone(validInventory));
      await expect(
        store.createRemixStorageShare({
          ...shareInput(fixture, validInventory, wrongTenantProviderPreparation),
          targetProjectId: fixture.auxiliaryTargetProjectId,
          sourceOrganizationId: fixture.targetOrganizationId,
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION', statusCode: 409 });
      expect(wrongTenantProviderPreparation).not.toHaveBeenCalled();
      await expect(store.getRemixStorageShareByTarget(fixture.auxiliaryTargetProjectId)).resolves.toBeUndefined();
    } finally {
      await cleanupShareFixture(prisma, fixture);
      await prisma.$disconnect();
    }
  });
});
