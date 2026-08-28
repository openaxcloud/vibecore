import { createHash } from 'node:crypto';

import { createDatabaseClient, type DatabaseClient, Prisma } from '@vibecore/database';
import { describe, expect, it, vi } from 'vitest';

import { PrismaApiStore } from '../prisma-store.js';
import { projectPermanentDeletionRequestHash } from '../project-permanent-deletion.js';
import { createDefaultProjectManifest, projectManifestDigest } from '../project-manifest.js';
import type { ObjectStorageCommandExecution, TenantObjectStorageCommandIntent } from '../object-storage-command.js';
import {
  NoopObjectStorage,
  OBJECT_STORAGE_LOCATION,
  projectBucketName,
  type ListObjectsResult,
  type ObjectStorage,
  type ObjectStorageInventory,
  type SignedUrlResult,
  type UploadUrlResult,
} from '../object-storage.js';

import {
  assertObjectStorageOperationFence,
  beginObjectStorageOperationVerification,
  claimObjectStorageOperation,
  deferObjectStorageOperationRecovery,
  expirePreparedObjectStorageOperationFailedSafe,
  finalizeObjectStorageOperation,
  getPermanentDeletionReplay,
  markObjectStorageOperationEffectStarted,
  markObjectStorageOperationFailedSafe,
  markSignedCapabilityIssued,
  objectStorageArtifactInventoryDigest,
  objectStorageStaticArtifactSummary,
  listObjectStorageRecoveryCandidates,
  objectStorageRequestHash,
  quarantineObjectStorageOperationRecovery,
  reclaimObjectStorageOperationForVerification,
  recordPermanentDeletionStaticArtifactPlan,
  reserveSignedCapabilityAuthorization,
  type ClaimObjectStorageOperationInput,
  type ObjectStorageOperationLease,
  type ObjectStorageOperationRequestShape,
  type ObjectStorageCheckpointBarrierAuthority,
} from '../object-storage-operation.js';
import { persistEmptyProjectRegistryErasure } from './project-registry-erasure-test-helper.js';

async function canReachSagaTables(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = createDatabaseClient();
  try {
    const rows = await prisma.$queryRaw<Array<{ tableName: string | null }>>`
      SELECT to_regclass('"ObjectStorageOperation"')::text AS "tableName"
    `;
    return rows[0]?.tableName !== null;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

const runDbTests = (await canReachSagaTables()) ? describe.sequential : describe.skip;
const EMPTY_STATIC_ARTIFACT_SUMMARY = objectStorageStaticArtifactSummary([]);

function suffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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

function request(
  input: Omit<ObjectStorageOperationRequestShape, 'payload' | 'preconditions'> & {
    payload?: ObjectStorageOperationRequestShape['payload'];
    preconditions?: ObjectStorageOperationRequestShape['preconditions'];
  },
): ObjectStorageOperationRequestShape {
  return {
    ...input,
    payload: input.payload ?? { command: 'test-mutation' },
    preconditions: input.preconditions ?? {},
  };
}

function claimInput(
  shape: ObjectStorageOperationRequestShape,
  input: { idempotencyKey: string; ownerToken: string; leaseTtlSeconds?: number },
): ClaimObjectStorageOperationInput {
  return {
    ...shape,
    ...input,
    leaseTtlSeconds: input.leaseTtlSeconds ?? 60,
    requestHash: objectStorageRequestHash(shape),
  };
}

async function claim(prisma: DatabaseClient, input: ClaimObjectStorageOperationInput) {
  return prisma.$transaction((tx) => claimObjectStorageOperation(tx, input));
}

async function cleanupMutableSaga(prisma: DatabaseClient, projectId: string, organizationIds: string[]) {
  await prisma.$executeRaw`DELETE FROM "ProjectRuntimeEffect" WHERE "projectId" = ${projectId}`;
  await prisma.$executeRaw`
    DELETE FROM "ObjectStorageCapabilityReservation" reservation
    WHERE EXISTS (
      SELECT 1
      FROM "ObjectStorageOperationProjectScope" scope
      WHERE scope."operationId" = reservation."operationId"
        AND scope."projectIdSnapshot" = ${projectId}
    )
    AND NOT EXISTS (
      SELECT 1 FROM "ProjectPermanentDeletionReceipt" receipt
      WHERE receipt."operationId" = reservation."operationId"
    )
  `;
  await prisma.$executeRaw`
    DELETE FROM "ObjectStorageOperation" operation
    WHERE EXISTS (
      SELECT 1 FROM "ObjectStorageOperationProjectScope" scope
      WHERE scope."operationId" = operation."id" AND scope."projectIdSnapshot" = ${projectId}
    )
    AND NOT EXISTS (
      SELECT 1 FROM "ProjectPermanentDeletionReceipt" receipt
      WHERE receipt."operationId" = operation."id"
    )
  `;
  await prisma.project.deleteMany({ where: { id: projectId } }).catch(() => undefined);
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } }).catch(() => undefined);
}

class CrashAfterObjectStorageEffect implements ObjectStorage {
  readonly active = true;
  readonly objects = new Map<string, { body: Uint8Array; generation: string; contentHash: string }>();
  bucket = false;
  versioningEnabled = false;
  leaveBucketUnversioned = false;
  providerEffects = 0;
  providerReads = 0;
  private crashAfterEffect: (() => Promise<void>) | undefined;

  armCrash(effect: () => Promise<void>): void {
    this.crashAfterEffect = effect;
  }

  private async applied(): Promise<void> {
    this.providerEffects += 1;
    const crash = this.crashAfterEffect;
    this.crashAfterEffect = undefined;
    await crash?.();
  }

  async ensureBucket(projectId: string, guard?: () => Promise<void>) {
    await guard?.();
    const created = !this.bucket;
    this.bucket = true;
    this.versioningEnabled = !this.leaveBucketUnversioned;
    await this.applied();
    return { bucket: projectBucketName(projectId), created, location: OBJECT_STORAGE_LOCATION };
  }

  async bucketExists(): Promise<boolean> {
    this.providerReads += 1;
    return this.bucket;
  }

  async bucketVersioningEnabled(): Promise<boolean> {
    this.providerReads += 1;
    return this.bucket && this.versioningEnabled;
  }

  async listObjects(
    _projectId: string,
    opts: { prefix?: string; delimiter?: string } = {},
  ): Promise<ListObjectsResult> {
    this.providerReads += 1;
    const prefix = opts.prefix ?? '';
    return {
      objects: [...this.objects.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, object]) => ({
          key,
          size: object.body.byteLength,
          updated: null,
          contentType: null,
          etag: null,
          generation: object.generation,
          contentHash: object.contentHash,
        }))
        .sort((left, right) => left.key.localeCompare(right.key)),
      folders: [],
    };
  }

  async listObjectVersions(projectId: string, opts: { prefix?: string } = {}): Promise<ListObjectsResult> {
    return this.listObjects(projectId, opts);
  }

  async createUploadUrl(): Promise<UploadUrlResult> {
    throw new Error('not used');
  }

  async createDownloadUrl(): Promise<SignedUrlResult> {
    throw new Error('not used');
  }

  async putObject(): Promise<{ key: string; size: number; generation?: string; contentHash?: string }> {
    throw new Error('not used');
  }

  async moveObject(): Promise<{ moved: boolean; key: string; generation?: string }> {
    throw new Error('not used');
  }

  async deleteObject(_projectId: string, input: { key: string; generation?: string }) {
    const current = this.objects.get(input.key);
    if (current && input.generation && current.generation !== input.generation) {
      throw new Error('generation precondition failed');
    }
    const deleted = this.objects.delete(input.key);
    await this.applied();
    return { deleted, count: deleted ? 1 : 0 };
  }

  async deletePrefix(_projectId: string, input: { prefix: string }, guard?: () => Promise<void>) {
    await guard?.();
    let count = 0;
    for (const key of [...this.objects.keys()]) {
      if (!key.startsWith(input.prefix)) continue;
      this.objects.delete(key);
      count += 1;
    }
    await this.applied();
    return { deleted: count > 0, count };
  }

  async deleteBucket(projectId: string, guard?: () => Promise<void>) {
    await guard?.();
    const deleted = this.bucket;
    this.bucket = false;
    this.objects.clear();
    await this.applied();
    return { deleted, bucket: projectBucketName(projectId) };
  }

  async inventoryProjectObjects(): Promise<ObjectStorageInventory> {
    this.providerReads += 1;
    return {
      bucketExists: this.bucket,
      objects: [...this.objects.entries()].map(([key, object]) => ({
        key,
        size: object.body.byteLength,
        generation: object.generation,
        contentHash: object.contentHash,
      })),
    };
  }

  async cloneProjectObjects(): Promise<ObjectStorageInventory> {
    throw new Error('not used');
  }
}

class ClonePreconditionStorage extends NoopObjectStorage {
  override readonly active = true;
  readonly inventories = new Map<string, ObjectStorageInventory>();
  readonly reads = new Map<string, number>();
  cloneEffects = 0;
  raceOnSecondRead?: (projectId: string, storage: ClonePreconditionStorage) => void;

  override async inventoryProjectObjects(projectId: string): Promise<ObjectStorageInventory> {
    const read = (this.reads.get(projectId) ?? 0) + 1;
    this.reads.set(projectId, read);
    if (read === 2) this.raceOnSecondRead?.(projectId, this);
    return structuredClone(this.inventories.get(projectId) ?? { bucketExists: false, objects: [] });
  }

  override async cloneProjectObjects(
    _sourceProjectId: string,
    targetProjectId: string,
    inventory: ObjectStorageInventory,
  ): Promise<ObjectStorageInventory> {
    this.cloneEffects += 1;
    this.inventories.set(targetProjectId, structuredClone(inventory));
    return structuredClone(inventory);
  }
}

runDbTests('object-storage operation saga — real PostgreSQL', () => {
  it('deduplicates concurrent same-key claims and rejects a request-hash conflict', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const seeded = await seedProject(prismaA, 'object-saga-dedup');
    const shape = request({
      kind: 'TENANT_MUTATION',
      scopes: [{ projectId: seeded.project.id, expectedOrganizationId: seeded.source.id, expectedDeletedAt: null }],
    });
    const idempotencyKey = `dedup-${suffix()}`;

    try {
      const [left, right] = await Promise.all([
        claim(prismaA, claimInput(shape, { idempotencyKey, ownerToken: `owner-a-${suffix()}` })),
        claim(prismaB, claimInput(shape, { idempotencyKey, ownerToken: `owner-b-${suffix()}` })),
      ]);
      expect([left.kind, right.kind].sort()).toEqual(['ACQUIRED', 'BUSY']);
      expect(
        await prismaA.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS "count" FROM "ObjectStorageOperation"
        WHERE "idempotencyKey" = ${idempotencyKey}
      `,
      ).toEqual([{ count: 1n }]);
      await expect(
        prismaA.$queryRaw<Array<{ lastErrorCode: string | null }>>`
          UPDATE "ObjectStorageOperation"
          SET "lastErrorCode" = 'TEST_NON_RECEIPTED_UPDATE'
          WHERE "idempotencyKey" = ${idempotencyKey}
          RETURNING "lastErrorCode"
        `,
      ).resolves.toEqual([{ lastErrorCode: 'TEST_NON_RECEIPTED_UPDATE' }]);

      const conflictingShape = request({
        ...shape,
        payload: { command: 'different-mutation' },
      });
      await expect(
        claim(prismaB, claimInput(conflictingShape, { idempotencyKey, ownerToken: `owner-conflict-${suffix()}` })),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT', statusCode: 409 });

      const changedDeletedAt = new Date();
      await prismaA.project.update({ where: { id: seeded.project.id }, data: { deletedAt: changedDeletedAt } });
      const conflictingDeletionObservation = request({
        ...shape,
        scopes: [
          {
            projectId: seeded.project.id,
            expectedOrganizationId: seeded.source.id,
            expectedDeletedAt: changedDeletedAt.toISOString(),
          },
        ],
      });
      await expect(
        claim(
          prismaB,
          claimInput(conflictingDeletionObservation, {
            idempotencyKey,
            ownerToken: `owner-deletion-conflict-${suffix()}`,
          }),
        ),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT', statusCode: 409 });
      await prismaA.project.update({ where: { id: seeded.project.id }, data: { deletedAt: null } });
    } finally {
      await cleanupMutableSaga(prismaA, seeded.project.id, [seeded.source.id, seeded.target.id]);
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('uses the PostgreSQL clock for takeover and rejects the stale fencing token', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const seeded = await seedProject(prismaA, 'object-saga-lease');
    const shape = request({
      kind: 'TENANT_MUTATION',
      scopes: [{ projectId: seeded.project.id, expectedOrganizationId: seeded.source.id, expectedDeletedAt: null }],
    });
    const base = claimInput(shape, {
      idempotencyKey: `lease-${suffix()}`,
      ownerToken: `lease-old-${suffix()}`,
    });

    try {
      const first = await claim(prismaA, base);
      expect(first.kind).toBe('ACQUIRED');
      if (first.kind !== 'ACQUIRED') throw new Error('EXPECTED_ACQUIRED');
      await prismaA.$executeRaw`
        UPDATE "ObjectStorageOperation"
        SET "leaseExpiresAt" = clock_timestamp() - INTERVAL '1 second'
        WHERE "id" = ${first.operation.id}
      `;
      const second = await claim(prismaB, { ...base, ownerToken: `lease-new-${suffix()}` });
      expect(second.kind).toBe('ACQUIRED');
      if (second.kind !== 'ACQUIRED') throw new Error('EXPECTED_RECLAIM');
      expect(second.lease.fencingToken).toBeGreaterThan(first.lease.fencingToken);
      await expect(
        prismaA.$transaction((tx) => assertObjectStorageOperationFence(tx, first.lease)),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_FENCE_LOST', statusCode: 409 });
      await expect(
        prismaB.$transaction((tx) => assertObjectStorageOperationFence(tx, second.lease)),
      ).resolves.toMatchObject({ id: first.operation.id, status: 'PREPARED' });
    } finally {
      await cleanupMutableSaga(prismaA, seeded.project.id, [seeded.source.id, seeded.target.id]);
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('keyset-scans only due recovery work and safely restores an expired pre-effect permanent-delete fence', async () => {
    const prisma = createDatabaseClient();
    const seeded = await seedProject(prisma, 'object-saga-reaper');
    const shape = request({
      kind: 'PROJECT_PERMANENT_DELETE',
      scopes: [{ projectId: seeded.project.id, expectedOrganizationId: seeded.source.id, expectedDeletedAt: null }],
      payload: { command: 'permanently-delete-project' },
    });
    const token = suffix();
    try {
      const acquired = await claim(
        prisma,
        claimInput(shape, { idempotencyKey: `reaper-${token}`, ownerToken: `reaper-owner-${token}` }),
      );
      if (acquired.kind !== 'ACQUIRED') throw new Error('EXPECTED_ACQUIRED');
      await prisma.$executeRaw`
        UPDATE "ObjectStorageOperation"
        SET "leaseExpiresAt" = TIMESTAMP '2000-01-01 00:00:00'
        WHERE "id" = ${acquired.operation.id}
      `;

      await prisma.$executeRawUnsafe(
        `INSERT INTO "ObjectStorageOperation" (
           "id", "kind", "status", "scopeHash", "idempotencyScopeHash", "idempotencyKey", "requestHash",
           "payload", "preconditions", "ownerToken", "fencingToken", "leaseExpiresAt",
           "attempts", "preparedAt", "createdAt", "updatedAt"
         )
         SELECT
           'future_${token}_' || series::text,
           'TENANT_MUTATION'::"ObjectStorageOperationKind",
           'PREPARED'::"ObjectStorageOperationStatus",
           repeat('d', 64), repeat('f', 64), 'future-key-${token}-' || series::text, repeat('e', 64),
           '{"command":"future"}'::jsonb, '{}'::jsonb,
           'future-owner-${token}-' || series::text, 1,
           clock_timestamp() + INTERVAL '1 day', 1,
           clock_timestamp(), clock_timestamp(), clock_timestamp()
         FROM generate_series(1, 120) series`,
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ObjectStorageOperationProjectScope" (
           "operationId", "ordinal", "projectIdSnapshot", "projectId", "expectedOrganizationId", "createdAt"
         )
         SELECT "id", 0, '${seeded.project.id}', '${seeded.project.id}', '${seeded.source.id}', clock_timestamp()
         FROM "ObjectStorageOperation" WHERE "id" LIKE 'future_${token}_%'`,
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ObjectStorageOperation" (
           "id", "kind", "status", "scopeHash", "idempotencyScopeHash", "idempotencyKey", "requestHash",
           "payload", "preconditions", "ownerToken", "fencingToken", "leaseExpiresAt",
           "attempts", "lastErrorCode", "manualRecoveryAt", "preparedAt", "createdAt", "updatedAt"
         ) VALUES (
           'manual_${token}', 'TENANT_MUTATION'::"ObjectStorageOperationKind",
           'MANUAL_RECOVERY'::"ObjectStorageOperationStatus", repeat('d', 64), repeat('f', 64), 'manual-key-${token}',
           repeat('e', 64), '{"command":"manual"}'::jsonb, '{}'::jsonb,
           NULL, 1, NULL, 1, 'MANUAL_REVIEW', clock_timestamp(),
           clock_timestamp(), clock_timestamp(), clock_timestamp()
         )`,
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ObjectStorageOperationProjectScope" (
           "operationId", "ordinal", "projectIdSnapshot", "projectId", "expectedOrganizationId", "createdAt"
         ) VALUES ('manual_${token}', 0, '${seeded.project.id}', '${seeded.project.id}', '${seeded.source.id}', clock_timestamp())`,
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ObjectStorageOperation" (
           "id", "kind", "status", "scopeHash", "idempotencyScopeHash", "idempotencyKey", "requestHash",
           "payload", "preconditions", "ownerToken", "fencingToken", "leaseExpiresAt",
           "attempts", "preparedAt", "effectStartedAt", "createdAt", "updatedAt"
         ) VALUES
         (
           'transient_${token}', 'TENANT_MUTATION'::"ObjectStorageOperationKind",
           'PREPARED'::"ObjectStorageOperationStatus", repeat('1', 64), repeat('2', 64),
           'transient-key-${token}', repeat('3', 64), '{"command":"transient"}'::jsonb, '{}'::jsonb,
           'transient-owner-${token}', 7, TIMESTAMP '1990-01-01 00:00:00', 7,
           clock_timestamp(), NULL, clock_timestamp(), clock_timestamp()
         ),
         (
           'poison_${token}', 'TENANT_MUTATION'::"ObjectStorageOperationKind",
           'EFFECT_STARTED'::"ObjectStorageOperationStatus", repeat('4', 64), repeat('5', 64),
           'poison-key-${token}', repeat('6', 64), '{"command":"poison"}'::jsonb, '{}'::jsonb,
           'poison-owner-${token}', 9, TIMESTAMP '1991-01-01 00:00:00', 9,
           clock_timestamp() - INTERVAL '1 minute', clock_timestamp(), clock_timestamp(), clock_timestamp()
         )`,
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ObjectStorageOperationProjectScope" (
           "operationId", "ordinal", "projectIdSnapshot", "projectId", "expectedOrganizationId", "createdAt"
         ) VALUES
           ('transient_${token}', 0, '${seeded.project.id}', '${seeded.project.id}', '${seeded.source.id}', clock_timestamp()),
           ('poison_${token}', 0, '${seeded.project.id}', '${seeded.project.id}', '${seeded.source.id}', clock_timestamp())`,
      );

      await prisma.$executeRawUnsafe(
        `INSERT INTO "ObjectStorageOperation" (
           "id", "kind", "status", "scopeHash", "idempotencyScopeHash", "idempotencyKey", "requestHash",
           "payload", "preconditions", "ownerToken", "fencingToken", "leaseExpiresAt",
           "attempts", "preparedAt", "effectStartedAt", "createdAt", "updatedAt"
         )
         SELECT
           'permanent-ambiguous-${token}-' || series::text,
           'PROJECT_PERMANENT_DELETE'::"ObjectStorageOperationKind",
           'EFFECT_STARTED'::"ObjectStorageOperationStatus",
           repeat('7', 64), repeat('8', 64), 'permanent-ambiguous-key-${token}-' || series::text,
           repeat('9', 64), '{"command":"permanently-delete-project"}'::jsonb, '{}'::jsonb,
           'permanent-ambiguous-owner-${token}-' || series::text, 1,
           TIMESTAMP '1980-01-01 00:00:00', 1,
           clock_timestamp() - INTERVAL '1 minute', clock_timestamp() - INTERVAL '1 minute',
           clock_timestamp(), clock_timestamp()
         FROM generate_series(1, 501) series`,
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ObjectStorageOperationProjectScope" (
           "operationId", "ordinal", "projectIdSnapshot", "projectId", "expectedOrganizationId", "createdAt"
         )
         SELECT "id", 0, '${seeded.project.id}', '${seeded.project.id}', '${seeded.source.id}', clock_timestamp()
         FROM "ObjectStorageOperation" WHERE "id" LIKE 'permanent-ambiguous-${token}-%'`,
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ObjectStorageOperation" (
           "id", "kind", "status", "scopeHash", "idempotencyScopeHash", "idempotencyKey", "requestHash",
           "payload", "preconditions", "ownerToken", "fencingToken", "leaseExpiresAt",
           "attempts", "preparedAt", "createdAt", "updatedAt"
         ) VALUES (
           'healthy-after-permanent-${token}', 'TENANT_MUTATION'::"ObjectStorageOperationKind",
           'PREPARED'::"ObjectStorageOperationStatus", repeat('a', 64), repeat('b', 64),
           'healthy-after-permanent-key-${token}', repeat('c', 64), '{"command":"healthy"}'::jsonb, '{}'::jsonb,
           'healthy-after-permanent-owner-${token}', 1, TIMESTAMP '1999-01-01 00:00:00', 1,
           clock_timestamp(), clock_timestamp(), clock_timestamp()
         )`,
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ObjectStorageOperationProjectScope" (
           "operationId", "ordinal", "projectIdSnapshot", "projectId", "expectedOrganizationId", "createdAt"
         ) VALUES (
           'healthy-after-permanent-${token}', 0, '${seeded.project.id}', '${seeded.project.id}',
           '${seeded.source.id}', clock_timestamp()
         )`,
      );

      const antiStarvationCandidates = await prisma.$transaction((tx) =>
        listObjectStorageRecoveryCandidates(tx, { limit: 500 }),
      );
      expect(
        antiStarvationCandidates.some((candidate) => candidate.operationId === `healthy-after-permanent-${token}`),
      ).toBe(true);
      expect(
        antiStarvationCandidates.some((candidate) => candidate.operationId.startsWith(`permanent-ambiguous-${token}-`)),
      ).toBe(false);

      const poisonedHead = await prisma.$transaction((tx) => listObjectStorageRecoveryCandidates(tx, { limit: 2 }));
      expect(poisonedHead.map((candidate) => candidate.operationId)).toEqual([`transient_${token}`, `poison_${token}`]);
      const transient = poisonedHead[0]!;
      await prisma.$transaction((tx) =>
        deferObjectStorageOperationRecovery(tx, {
          operationId: transient.operationId,
          requestHash: transient.requestHash,
          scopeHash: transient.scopeHash,
          fencingToken: transient.fencingToken,
          retryAfterSeconds: 0,
          errorCode: 'RECOVERY_TRANSIENT',
          error: new Error('TRANSIENT_RECOVERY_FAILURE'),
        }),
      );
      const poison = poisonedHead[1]!;
      await prisma.$transaction((tx) =>
        quarantineObjectStorageOperationRecovery(tx, {
          operationId: poison.operationId,
          requestHash: poison.requestHash,
          scopeHash: poison.scopeHash,
          fencingToken: poison.fencingToken,
          errorCode: 'RECOVERY_PAYLOAD_CORRUPT',
          error: new Error('DETERMINISTIC_RECOVERY_FAILURE'),
        }),
      );

      const candidates = await prisma.$transaction((tx) => listObjectStorageRecoveryCandidates(tx, { limit: 500 }));
      expect(candidates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ operationId: acquired.operation.id, action: 'FAIL_SAFE', status: 'PREPARED' }),
        ]),
      );
      expect(candidates.some((candidate) => candidate.operationId.startsWith(`future_${token}_`))).toBe(false);
      expect(candidates.some((candidate) => candidate.operationId === `manual_${token}`)).toBe(false);
      expect(candidates.some((candidate) => candidate.operationId === `transient_${token}`)).toBe(false);
      expect(candidates.some((candidate) => candidate.operationId === `poison_${token}`)).toBe(false);
      await expect(
        prisma.$queryRaw<Array<{ status: string; leaseDeferred: boolean }>>`
          SELECT "status"::text AS "status", "leaseExpiresAt" > clock_timestamp() AS "leaseDeferred"
          FROM "ObjectStorageOperation" WHERE "id" = ${`transient_${token}`}
        `,
      ).resolves.toEqual([{ status: 'PREPARED', leaseDeferred: true }]);
      await expect(
        prisma.$queryRaw<Array<{ status: string }>>`
          SELECT "status"::text AS "status" FROM "ObjectStorageOperation" WHERE "id" = ${`poison_${token}`}
        `,
      ).resolves.toEqual([{ status: 'MANUAL_RECOVERY' }]);

      const failed = await prisma.$transaction((tx) =>
        expirePreparedObjectStorageOperationFailedSafe(tx, {
          operationId: acquired.operation.id,
          requestHash: acquired.operation.requestHash,
          scopeHash: acquired.operation.scopeHash,
          fencingToken: acquired.operation.fencingToken,
        }),
      );
      expect(failed.status).toBe('FAILED_SAFE');
      await expect(
        prisma.$queryRaw<Array<{ deletedAt: Date | null; permanentDeletionStartedAt: Date | null }>>`
          SELECT "deletedAt", "permanentDeletionStartedAt" FROM "Project"
          WHERE "id" = ${seeded.project.id}
        `,
      ).resolves.toEqual([{ deletedAt: null, permanentDeletionStartedAt: null }]);
      await expect(
        prisma.$transaction((tx) =>
          expirePreparedObjectStorageOperationFailedSafe(tx, {
            operationId: acquired.operation.id,
            requestHash: acquired.operation.requestHash,
            scopeHash: acquired.operation.scopeHash,
            fencingToken: acquired.operation.fencingToken,
          }),
        ),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_FENCE_LOST', statusCode: 409 });
    } finally {
      await cleanupMutableSaga(prisma, seeded.project.id, [seeded.source.id, seeded.target.id]);
      await prisma.$disconnect();
    }
  });

  it('never unfreezes an expired prepared permanent delete while a runtime request is in flight', async () => {
    const prisma = createDatabaseClient();
    const seeded = await seedProject(prisma, 'object-saga-expired-runtime');
    const shape = request({
      kind: 'PROJECT_PERMANENT_DELETE',
      scopes: [{ projectId: seeded.project.id, expectedOrganizationId: seeded.source.id, expectedDeletedAt: null }],
      payload: { command: 'permanently-delete-project' },
    });
    try {
      const acquired = await claim(
        prisma,
        claimInput(shape, {
          idempotencyKey: `expired-runtime-${suffix()}`,
          ownerToken: `expired-runtime-owner-${suffix()}`,
        }),
      );
      if (acquired.kind !== 'ACQUIRED') throw new Error('EXPECTED_ACQUIRED');
      await prisma.$executeRaw`
        INSERT INTO "ProjectRuntimeEffect" (
          "id", "projectId", "organizationId", "ownershipEpoch", "action", "resourceId",
          "intentHash", "targetDigest", "fencingToken", "ownerToken", "state",
          "leaseExpiresAt", "preparedAt", "dispatchedAt", "createdAt", "updatedAt"
        ) VALUES (
          ${`expired-runtime-effect-${suffix()}`}, ${seeded.project.id}, ${seeded.source.id}, 0,
          'START_WORKSPACE', 'expired-runtime-workspace', ${'e'.repeat(64)}, ${'f'.repeat(64)},
          1, ${`expired-effect-owner-${suffix()}`}, 'IN_FLIGHT'::"ProjectRuntimeEffectState",
          clock_timestamp() - INTERVAL '1 second', clock_timestamp(), clock_timestamp(),
          clock_timestamp(), clock_timestamp()
        )
      `;
      await prisma.$executeRaw`
        UPDATE "ObjectStorageOperation"
        SET "leaseExpiresAt" = clock_timestamp() - INTERVAL '1 second'
        WHERE "id" = ${acquired.operation.id}
      `;

      const expired = await prisma.$transaction((tx) =>
        expirePreparedObjectStorageOperationFailedSafe(tx, {
          operationId: acquired.operation.id,
          requestHash: acquired.operation.requestHash,
          scopeHash: acquired.operation.scopeHash,
          fencingToken: acquired.operation.fencingToken,
        }),
      );
      expect(expired).toMatchObject({ status: 'MANUAL_RECOVERY', lastErrorCode: 'PROJECT_RUNTIME_EFFECT_IN_FLIGHT' });
      await expect(
        prisma.project.findUniqueOrThrow({
          where: { id: seeded.project.id },
          select: { deletedAt: true, permanentDeletionStartedAt: true },
        }),
      ).resolves.toEqual({ deletedAt: expect.any(Date), permanentDeletionStartedAt: expect.any(Date) });
    } finally {
      await cleanupMutableSaga(prisma, seeded.project.id, [seeded.source.id, seeded.target.id]);
      await prisma.$disconnect();
    }
  });

  it('fails closed on tenant/deletion/transfer drift and does not freeze a survivor for historical purge inventory', async () => {
    const prisma = createDatabaseClient();
    const seeded = await seedProject(prisma, 'object-saga-scope');
    const baseScope = {
      projectId: seeded.project.id,
      expectedOrganizationId: seeded.source.id,
      expectedDeletedAt: null,
    };

    try {
      const wrongTenant = request({
        kind: 'TENANT_MUTATION',
        scopes: [{ ...baseScope, expectedOrganizationId: seeded.target.id }],
      });
      await expect(
        claim(
          prisma,
          claimInput(wrongTenant, { idempotencyKey: `tenant-${suffix()}`, ownerToken: `owner-${suffix()}` }),
        ),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_TENANT_MISMATCH', statusCode: 409 });

      await prisma.project.update({ where: { id: seeded.project.id }, data: { deletedAt: new Date() } });
      const staleDeletion = request({ kind: 'TENANT_MUTATION', scopes: [baseScope] });
      await expect(
        claim(
          prisma,
          claimInput(staleDeletion, { idempotencyKey: `deleted-${suffix()}`, ownerToken: `owner-${suffix()}` }),
        ),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_DELETION_STATE_MISMATCH', statusCode: 409 });
      await prisma.project.update({ where: { id: seeded.project.id }, data: { deletedAt: null } });

      await prisma.$executeRaw`
        UPDATE "Project"
        SET "objectStorageCapabilityExpiresAt" = clock_timestamp() + INTERVAL '10 minutes'
        WHERE "id" = ${seeded.project.id}
      `;
      const transfer = request({ kind: 'PROJECT_TRANSFER', scopes: [baseScope] });
      await expect(
        claim(
          prisma,
          claimInput(transfer, { idempotencyKey: `transfer-${suffix()}`, ownerToken: `owner-${suffix()}` }),
        ),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_CAPABILITY_ACTIVE', statusCode: 409 });
      await prisma.$executeRaw`
        UPDATE "Project" SET "objectStorageCapabilityExpiresAt" = NULL
        WHERE "id" = ${seeded.project.id}
      `;

      const purgePlanId = `purge_${suffix()}`;
      await prisma.$executeRaw`
        INSERT INTO "PurgePlan" (
          "id", "userId", "ownerToken", "status", "version", "leaseExpiresAt",
          "requestedAt", "purgeDueAt", "topologyFingerprint", "inventory",
          "startedAt", "completedAt", "createdAt", "updatedAt"
        ) VALUES (
          ${purgePlanId}, ${`historical-user-${suffix()}`}, ${`historical-owner-${suffix()}`},
          'COMPLETED', 1, clock_timestamp() - INTERVAL '1 minute',
          clock_timestamp() - INTERVAL '2 days', clock_timestamp() - INTERVAL '1 day',
          ${'a'.repeat(64)}, ${JSON.stringify({ bucketProjectIds: [seeded.project.id] })}::jsonb,
          clock_timestamp() - INTERVAL '2 days', clock_timestamp() - INTERVAL '1 day',
          clock_timestamp() - INTERVAL '2 days', clock_timestamp() - INTERVAL '1 day'
        )
      `;
      const afterHistoricalPurge = request({ kind: 'TENANT_MUTATION', scopes: [baseScope] });
      await expect(
        claim(
          prisma,
          claimInput(afterHistoricalPurge, {
            idempotencyKey: `historical-purge-${suffix()}`,
            ownerToken: `owner-${suffix()}`,
          }),
        ),
      ).resolves.toMatchObject({ kind: 'ACQUIRED' });
      await prisma.$executeRaw`DELETE FROM "PurgePlan" WHERE "id" = ${purgePlanId}`;
    } finally {
      await cleanupMutableSaga(prisma, seeded.project.id, [seeded.source.id, seeded.target.id]);
      await prisma.$disconnect();
    }
  });

  it('requires verify-first after an ambiguous effect and freezes a tenant-drifted recovery for manual handling', async () => {
    const prisma = createDatabaseClient();
    const seeded = await seedProject(prisma, 'object-saga-manual');
    const shape = request({
      kind: 'TENANT_MUTATION',
      scopes: [{ projectId: seeded.project.id, expectedOrganizationId: seeded.source.id, expectedDeletedAt: null }],
    });
    try {
      const acquired = await claim(
        prisma,
        claimInput(shape, { idempotencyKey: `manual-${suffix()}`, ownerToken: `manual-owner-${suffix()}` }),
      );
      if (acquired.kind !== 'ACQUIRED') throw new Error('EXPECTED_ACQUIRED');
      await prisma.$transaction((tx) =>
        markObjectStorageOperationEffectStarted(tx, acquired.lease, { phase: 'provider-effect-entered' }),
      );
      await prisma.$executeRaw`
        UPDATE "ObjectStorageOperation"
        SET "leaseExpiresAt" = clock_timestamp() - INTERVAL '1 second'
        WHERE "id" = ${acquired.operation.id}
      `;
      await prisma.project.update({
        where: { id: seeded.project.id },
        data: { organizationId: seeded.target.id },
      });
      const recovery = await prisma.$transaction((tx) =>
        reclaimObjectStorageOperationForVerification(tx, {
          operationId: acquired.operation.id,
          requestHash: acquired.operation.requestHash,
          scopeHash: acquired.operation.scopeHash,
          ownerToken: `recovery-owner-${suffix()}`,
          leaseTtlSeconds: 60,
        }),
      );
      expect(recovery).toMatchObject({ kind: 'MANUAL_RECOVERY', operation: { status: 'MANUAL_RECOVERY' } });
      await expect(
        claim(prisma, {
          ...claimInput(shape, { idempotencyKey: acquired.operation.idempotencyKey, ownerToken: `retry-${suffix()}` }),
        }),
      ).resolves.toMatchObject({ kind: 'MANUAL_RECOVERY' });
    } finally {
      await cleanupMutableSaga(prisma, seeded.project.id, [seeded.source.id, seeded.target.id]);
      await prisma.$disconnect();
    }
  });

  it('reconstructs exact ensure and delete receipts after provider success and a lost finalization response', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const storeA = new PrismaApiStore(prismaA);
    const storeB = new PrismaApiStore(prismaB);
    const seeded = await seedProject(prismaA, 'object-saga-exact-receipts');
    const storage = new CrashAfterObjectStorageEffect();
    const scope = { projectId: seeded.project.id, expectedOrganizationId: seeded.source.id };

    const crashAndReplay = async (
      label: string,
      intent: TenantObjectStorageCommandIntent,
      expected: ObjectStorageCommandExecution,
    ) => {
      const idempotencyKey = `exact-receipt-${label}-${suffix()}`;
      const effectsBefore = storage.providerEffects;
      storage.armCrash(async () => {
        await prismaB.$executeRaw`
          UPDATE "ObjectStorageOperation"
          SET "leaseExpiresAt" = clock_timestamp() - INTERVAL '1 second'
          WHERE "idempotencyKey" = ${idempotencyKey}
        `;
      });

      await expect(
        storeA.executeTenantObjectStorageIntent({ scope, intent, storage, idempotencyKey }),
      ).rejects.toBeDefined();
      expect(storage.providerEffects).toBe(effectsBefore + 1);
      await expect(
        prismaA.$queryRaw<Array<{ status: string }>>`
          SELECT "status"::text AS "status"
          FROM "ObjectStorageOperation"
          WHERE "idempotencyKey" = ${idempotencyKey}
        `,
      ).resolves.toEqual([{ status: 'EFFECT_STARTED' }]);

      const report = await storeB.reconcileObjectStorageOperations({ storage, batchSize: 10, maxCandidates: 50 });
      expect(report.recovered).toBeGreaterThanOrEqual(1);
      await expect(
        prismaA.$queryRaw<Array<{ status: string }>>`
          SELECT "status"::text AS "status"
          FROM "ObjectStorageOperation"
          WHERE "idempotencyKey" = ${idempotencyKey}
        `,
      ).resolves.toEqual([{ status: 'COMMITTED' }]);

      const readsBeforeReplay = storage.providerReads;
      const effectsBeforeReplay = storage.providerEffects;
      await expect(
        storeA.executeTenantObjectStorageIntent({ scope, intent, storage, idempotencyKey }),
      ).resolves.toEqual(expected);
      expect(storage.providerReads).toBe(readsBeforeReplay);
      expect(storage.providerEffects).toBe(effectsBeforeReplay);
    };

    try {
      await crashAndReplay(
        'ensure',
        { type: 'ENSURE_BUCKET', projectId: seeded.project.id },
        {
          type: 'ENSURE_BUCKET',
          result: {
            bucket: projectBucketName(seeded.project.id),
            created: true,
            location: OBJECT_STORAGE_LOCATION,
          },
        },
      );
      await crashAndReplay(
        'delete-bucket',
        { type: 'DELETE_BUCKET', projectId: seeded.project.id },
        {
          type: 'DELETE_BUCKET',
          result: { bucket: projectBucketName(seeded.project.id), deleted: true },
        },
      );

      storage.bucket = true;
      storage.objects.set('one.txt', {
        body: new TextEncoder().encode('one'),
        generation: 'generation-one',
        contentHash: 'sha256:one',
      });
      await crashAndReplay(
        'delete-object',
        { type: 'DELETE_OBJECT', projectId: seeded.project.id, key: 'one.txt' },
        { type: 'DELETE_OBJECT', result: { deleted: true, count: 1 } },
      );

      storage.objects.set('archive/one.txt', {
        body: new TextEncoder().encode('one'),
        generation: 'generation-prefix-one',
        contentHash: 'sha256:prefix-one',
      });
      storage.objects.set('archive/two.txt', {
        body: new TextEncoder().encode('two'),
        generation: 'generation-prefix-two',
        contentHash: 'sha256:prefix-two',
      });
      await crashAndReplay(
        'delete-prefix',
        { type: 'DELETE_PREFIX', projectId: seeded.project.id, prefix: 'archive/' },
        { type: 'DELETE_PREFIX', result: { deleted: true, count: 2 } },
      );
    } finally {
      await cleanupMutableSaga(prismaA, seeded.project.id, [seeded.source.id, seeded.target.id]);
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('never certifies a crashed ENSURE_BUCKET while the live bucket is still unversioned', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const storeA = new PrismaApiStore(prismaA);
    const storeB = new PrismaApiStore(prismaB);
    const seeded = await seedProject(prismaA, 'object-saga-unversioned-ensure');
    const storage = new CrashAfterObjectStorageEffect();
    const idempotencyKey = `unversioned-ensure-${suffix()}`;

    try {
      storage.leaveBucketUnversioned = true;
      storage.armCrash(async () => {
        await prismaB.$executeRaw`
          UPDATE "ObjectStorageOperation"
          SET "leaseExpiresAt" = clock_timestamp() - INTERVAL '1 second'
          WHERE "idempotencyKey" = ${idempotencyKey}
        `;
      });

      await expect(
        storeA.executeTenantObjectStorageIntent({
          scope: { projectId: seeded.project.id, expectedOrganizationId: seeded.source.id },
          intent: { type: 'ENSURE_BUCKET', projectId: seeded.project.id },
          storage,
          idempotencyKey,
        }),
      ).rejects.toBeDefined();
      expect(storage.bucket).toBe(true);
      expect(storage.versioningEnabled).toBe(false);
      expect(storage.providerEffects).toBe(1);

      const report = await storeB.reconcileObjectStorageOperations({ storage, batchSize: 10, maxCandidates: 50 });
      expect(report.quarantined).toBeGreaterThanOrEqual(1);
      await expect(
        prismaA.$queryRaw<Array<{ status: string; lastErrorCode: string | null }>>`
          SELECT "status"::text AS "status", "lastErrorCode"
          FROM "ObjectStorageOperation"
          WHERE "idempotencyKey" = ${idempotencyKey}
        `,
      ).resolves.toEqual([
        {
          status: 'MANUAL_RECOVERY',
          lastErrorCode: 'OBJECT_STORAGE_BUCKET_VERSIONING_VERIFICATION_FAILED',
        },
      ]);
      expect(storage.providerEffects).toBe(1);
    } finally {
      await cleanupMutableSaga(prismaA, seeded.project.id, [seeded.source.id, seeded.target.id]);
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it.each([
    { race: 'source' as const, expectedCode: 'SOURCE_PRECONDITION_CHANGED' },
    { race: 'target-orphan' as const, expectedCode: 'TARGET_PRECONDITION_CHANGED' },
    { race: 'target-empty-bucket' as const, expectedCode: 'TARGET_PRECONDITION_CHANGED' },
  ])(
    'fails a CLONE_PROJECT safely before provider effect when the $race inventory changes',
    async ({ race, expectedCode }) => {
      const prisma = createDatabaseClient();
      const store = new PrismaApiStore(prisma);
      const seeded = await seedProject(prisma, `object-saga-clone-${race}`);
      const targetProject = await prisma.project.create({
        data: {
          organizationId: seeded.source.id,
          name: `clone ${race} target ${suffix()}`,
          slug: `clone-${race}-target-${suffix()}`,
        },
      });
      const storage = new ClonePreconditionStorage();
      const sourceInventory: ObjectStorageInventory =
        race === 'target-empty-bucket'
          ? { bucketExists: false, objects: [] }
          : {
              bucketExists: true,
              objects: [{ key: 'source.bin', size: 5, generation: 'G1', contentHash: 'sha256:source-g1' }],
            };
      storage.inventories.set(seeded.project.id, structuredClone(sourceInventory));
      storage.raceOnSecondRead = (projectId, current) => {
        if (race === 'source' && projectId === seeded.project.id) {
          current.inventories.set(seeded.project.id, {
            bucketExists: true,
            objects: [{ key: 'source.bin', size: 5, generation: 'G2', contentHash: 'sha256:source-g2' }],
          });
        }
        if ((race === 'target-orphan' || race === 'target-empty-bucket') && projectId === targetProject.id) {
          current.inventories.set(targetProject.id, {
            bucketExists: true,
            objects:
              race === 'target-orphan'
                ? [{ key: 'orphan.bin', size: 6, generation: 'T1', contentHash: 'sha256:orphan' }]
                : [],
          });
        }
      };
      const idempotencyKey = `clone-precondition-${race}-${suffix()}`;

      try {
        await expect(
          store.executeTenantObjectStorageCommand({
            scopes: [
              { projectId: seeded.project.id, expectedOrganizationId: seeded.source.id },
              { projectId: targetProject.id, expectedOrganizationId: seeded.source.id },
            ],
            command: {
              type: 'CLONE_PROJECT',
              sourceProjectId: seeded.project.id,
              targetProjectId: targetProject.id,
              inventory: sourceInventory,
            },
            storage,
            idempotencyKey,
          }),
        ).rejects.toMatchObject({ code: expectedCode });
        expect(storage.cloneEffects).toBe(0);
        await expect(
          prisma.$queryRaw<Array<{ status: string }>>`
          SELECT "status"::text AS "status"
          FROM "ObjectStorageOperation"
          WHERE "idempotencyKey" = ${idempotencyKey}
        `,
        ).resolves.toEqual([{ status: 'FAILED_SAFE' }]);
      } finally {
        await cleanupMutableSaga(prisma, seeded.project.id, []);
        await cleanupMutableSaga(prisma, targetProject.id, [seeded.source.id, seeded.target.id]);
        await prisma.$disconnect();
      }
    },
  );

  it('replays a committed CLONE_PROJECT before re-reading the now-populated target', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const seeded = await seedProject(prisma, 'object-saga-clone-replay');
    const targetProject = await prisma.project.create({
      data: {
        organizationId: seeded.source.id,
        name: `clone replay target ${suffix()}`,
        slug: `clone-replay-target-${suffix()}`,
      },
    });
    const storage = new ClonePreconditionStorage();
    const sourceInventory: ObjectStorageInventory = {
      bucketExists: true,
      objects: [{ key: 'source.bin', size: 5, generation: 'G1', contentHash: 'sha256:source-g1' }],
    };
    storage.inventories.set(seeded.project.id, structuredClone(sourceInventory));
    const input = {
      scopes: [
        { projectId: seeded.project.id, expectedOrganizationId: seeded.source.id },
        { projectId: targetProject.id, expectedOrganizationId: seeded.source.id },
      ],
      command: {
        type: 'CLONE_PROJECT' as const,
        sourceProjectId: seeded.project.id,
        targetProjectId: targetProject.id,
        inventory: sourceInventory,
      },
      storage,
      idempotencyKey: `clone-replay-${suffix()}`,
    };

    try {
      const first = await store.executeTenantObjectStorageCommand(input);
      expect(storage.cloneEffects).toBe(1);
      const readsAfterCommit = [...storage.reads.entries()];

      await expect(store.executeTenantObjectStorageCommand(input)).resolves.toEqual(first);
      expect(storage.cloneEffects).toBe(1);
      expect([...storage.reads.entries()]).toEqual(readsAfterCommit);
    } finally {
      await cleanupMutableSaga(prisma, seeded.project.id, []);
      await cleanupMutableSaga(prisma, targetProject.id, [seeded.source.id, seeded.target.id]);
      await prisma.$disconnect();
    }
  });

  it('keeps writers fenced by durable state after the effect transaction releases its advisory locks', async () => {
    const prisma = createDatabaseClient();
    const writerClient = createDatabaseClient();
    const writer = new PrismaApiStore(writerClient);
    const seeded = await seedProject(prisma, 'object-saga-writer-fence');
    const originalName = seeded.project.name;
    const shape = request({
      kind: 'TENANT_MUTATION',
      scopes: [{ projectId: seeded.project.id, expectedOrganizationId: seeded.source.id, expectedDeletedAt: null }],
    });

    try {
      const acquired = await claim(
        prisma,
        claimInput(shape, { idempotencyKey: `writer-fence-${suffix()}`, ownerToken: `writer-owner-${suffix()}` }),
      );
      if (acquired.kind !== 'ACQUIRED') throw new Error('EXPECTED_ACQUIRED');
      await prisma.$transaction((tx) =>
        markObjectStorageOperationEffectStarted(tx, acquired.lease, { phase: 'provider-effect-entered' }),
      );

      // The preceding transaction has released every advisory xact lock. The
      // durable EFFECT_STARTED row must still fence an unrelated writer.
      await expect(
        writer.updateProject({
          projectId: seeded.project.id,
          expectedOrganizationId: seeded.source.id,
          name: 'must-not-persist',
        }),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_ACTIVE', statusCode: 409 });
      await expect(
        prisma.project.findUniqueOrThrow({ where: { id: seeded.project.id }, select: { name: true } }),
      ).resolves.toEqual({ name: originalName });

      await prisma.$transaction((tx) => beginObjectStorageOperationVerification(tx, acquired.lease));
      await prisma.$transaction((tx) =>
        finalizeObjectStorageOperation(tx, acquired.lease, {
          verification: {
            outcome: 'VERIFIED',
            verifier: 'object-saga-db-spec',
            evidence: { providerState: 'applied' },
          },
          result: { applied: true },
        }),
      );
    } finally {
      await cleanupMutableSaga(prisma, seeded.project.id, [seeded.source.id, seeded.target.id]);
      await Promise.allSettled([prisma.$disconnect(), writerClient.$disconnect()]);
    }
  });

  it('reserves every signed capability monotonically, permits innocent object names, and persists no URL or signature', async () => {
    const prisma = createDatabaseClient();
    const seeded = await seedProject(prisma, 'object-saga-capability');
    const objectKeyHash = 'b'.repeat(64);
    const firstExpiry = new Date(Date.now() + 10 * 60_000).toISOString();
    const shape = request({
      kind: 'SIGNED_DOWNLOAD_CAPABILITY',
      scopes: [{ projectId: seeded.project.id, expectedOrganizationId: seeded.source.id, expectedDeletedAt: null }],
      payload: { command: 'create-download-capability', objectKeyHash, method: 'GET' },
    });
    try {
      const acquired = await claim(
        prisma,
        claimInput(shape, { idempotencyKey: `capability-${suffix()}`, ownerToken: `cap-owner-${suffix()}` }),
      );
      if (acquired.kind !== 'ACQUIRED') throw new Error('EXPECTED_ACQUIRED');
      const firstToken = `sign-auth-one-${suffix()}`;
      const first = await prisma.$transaction((tx) =>
        reserveSignedCapabilityAuthorization(tx, {
          operationId: acquired.operation.id,
          requestHash: acquired.operation.requestHash,
          scopeHash: acquired.operation.scopeHash,
          authorizationToken: firstToken,
          reservedCapabilityExpiresAt: firstExpiry,
          lease: acquired.lease,
        }),
      );
      await expect(
        prisma.$transaction((tx) =>
          markSignedCapabilityIssued(tx, {
            reservationId: first.reservationId,
            operationId: first.operationId,
            fencingToken: first.fencingToken,
            authorizationToken: `wrong-sign-auth-${suffix()}`,
            method: first.method,
            objectKeyHash: first.objectKeyHash,
            providerExpiresAt: firstExpiry,
            evidence: { providerRequestId: 'request-wrong-token' },
          }),
        ),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_AUTHORIZATION_INVALID', statusCode: 404 });
      await expect(
        prisma.$transaction((tx) =>
          markSignedCapabilityIssued(tx, {
            reservationId: first.reservationId,
            operationId: first.operationId,
            fencingToken: first.fencingToken + 1n,
            authorizationToken: firstToken,
            method: first.method,
            objectKeyHash: first.objectKeyHash,
            providerExpiresAt: firstExpiry,
            evidence: { providerRequestId: 'request-wrong-fence' },
          }),
        ),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_AUTHORIZATION_INVALID', statusCode: 404 });
      await prisma.$transaction((tx) =>
        markSignedCapabilityIssued(tx, {
          reservationId: first.reservationId,
          operationId: first.operationId,
          fencingToken: first.fencingToken,
          authorizationToken: firstToken,
          method: first.method,
          objectKeyHash: first.objectKeyHash,
          providerExpiresAt: firstExpiry,
          evidence: { providerRequestId: 'request-one', objectName: 'docs/secret-santa.txt' },
        }),
      );
      await expect(
        prisma.$transaction((tx) =>
          markSignedCapabilityIssued(tx, {
            reservationId: first.reservationId,
            operationId: first.operationId,
            fencingToken: first.fencingToken,
            authorizationToken: firstToken,
            method: first.method,
            objectKeyHash: first.objectKeyHash,
            providerExpiresAt: firstExpiry,
            evidence: { providerRequestId: 'request-two', objectName: 'docs/secret-santa.txt' },
          }),
        ),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_CAPABILITY_ISSUE_CONFLICT', statusCode: 409 });
      await expect(
        prisma.$transaction((tx) =>
          markSignedCapabilityIssued(tx, {
            reservationId: first.reservationId,
            operationId: first.operationId,
            fencingToken: first.fencingToken,
            authorizationToken: firstToken,
            method: 'PUT',
            objectKeyHash: first.objectKeyHash,
            providerExpiresAt: firstExpiry,
            evidence: { providerRequestId: 'request-one', objectName: 'docs/secret-santa.txt' },
          }),
        ),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_CAPABILITY_ISSUE_CONFLICT', statusCode: 409 });
      await expect(
        prisma.$transaction((tx) =>
          markSignedCapabilityIssued(tx, {
            reservationId: first.reservationId,
            operationId: first.operationId,
            fencingToken: first.fencingToken,
            authorizationToken: firstToken,
            method: first.method,
            objectKeyHash: 'c'.repeat(64),
            providerExpiresAt: firstExpiry,
            evidence: { providerRequestId: 'request-one', objectName: 'docs/secret-santa.txt' },
          }),
        ),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_CAPABILITY_ISSUE_CONFLICT', statusCode: 409 });
      const expiredIssued = await prisma.$queryRaw<Array<{ providerExpiresAt: string }>>`
        UPDATE "ObjectStorageCapabilityReservation"
        SET "reservedExpiresAt" = TIMESTAMPTZ '2000-01-01T00:00:01.000Z',
            "evidence" = jsonb_set(
              "evidence",
              '{providerExpiresAt}',
              to_jsonb('2000-01-01T00:00:00.000Z'::text)
            )
        WHERE "id" = ${first.reservationId}
        RETURNING "evidence"->>'providerExpiresAt' AS "providerExpiresAt"
      `;
      await expect(
        prisma.$transaction((tx) =>
          markSignedCapabilityIssued(tx, {
            reservationId: first.reservationId,
            operationId: first.operationId,
            fencingToken: first.fencingToken,
            authorizationToken: firstToken,
            method: first.method,
            objectKeyHash: first.objectKeyHash,
            providerExpiresAt: expiredIssued[0]!.providerExpiresAt,
            evidence: { providerRequestId: 'request-one', objectName: 'docs/secret-santa.txt' },
          }),
        ),
      ).resolves.toMatchObject({ replayed: true });

      // Use a known second token to prove issue receipts without persisting it.
      const secondToken = `sign-auth-two-${suffix()}`;
      const secondExpiry = new Date(Date.now() + 20 * 60_000).toISOString();
      const second = await prisma.$transaction((tx) =>
        reserveSignedCapabilityAuthorization(tx, {
          operationId: acquired.operation.id,
          requestHash: acquired.operation.requestHash,
          scopeHash: acquired.operation.scopeHash,
          authorizationToken: secondToken,
          reservedCapabilityExpiresAt: secondExpiry,
        }),
      );
      expect(second.fencingToken).toBeGreaterThan(first.fencingToken);
      expect(new Date(second.reservedCapabilityExpiresAt).getTime()).toBeGreaterThanOrEqual(
        new Date(first.reservedCapabilityExpiresAt).getTime(),
      );
      await expect(
        prisma.$transaction((tx) =>
          markSignedCapabilityIssued(tx, {
            reservationId: second.reservationId,
            operationId: second.operationId,
            fencingToken: second.fencingToken,
            authorizationToken: secondToken,
            method: second.method,
            objectKeyHash: second.objectKeyHash,
            providerExpiresAt: secondExpiry,
            evidence: { providerRequestId: 'request-two', objectName: 'docs/secret-santa.txt' },
          }),
        ),
      ).resolves.toMatchObject({ replayed: false });

      const rows = await prisma.$queryRaw<
        Array<{ projectBound: Date; operationBound: Date; reservations: bigint; persisted: string }>
      >(Prisma.sql`
        SELECT
          project."objectStorageCapabilityExpiresAt" AS "projectBound",
          operation."reservedCapabilityExpiresAt" AS "operationBound",
          (SELECT count(*)::bigint FROM "ObjectStorageCapabilityReservation" reservation
            WHERE reservation."operationId" = operation."id") AS "reservations",
          concat(operation."payload"::text, operation."evidence"::text, operation."result"::text,
            (SELECT string_agg(COALESCE(reservation."evidence"::text, ''), '')
             FROM "ObjectStorageCapabilityReservation" reservation
             WHERE reservation."operationId" = operation."id")) AS "persisted"
        FROM "ObjectStorageOperation" operation
        JOIN "ObjectStorageOperationProjectScope" scope ON scope."operationId" = operation."id"
        JOIN "Project" project ON project."id" = scope."projectId"
        WHERE operation."id" = ${acquired.operation.id}
      `);
      expect(rows[0]?.reservations).toBe(2n);
      expect(rows[0]?.projectBound.getTime()).toBeGreaterThanOrEqual(new Date(secondExpiry).getTime());
      expect(rows[0]?.operationBound.getTime()).toBeGreaterThanOrEqual(new Date(secondExpiry).getTime());
      expect(rows[0]?.persisted).not.toMatch(/https?:\/\/|X-Goog-|signature|Bearer\s|sign-auth-/i);

      const thirdToken = `sign-auth-three-${suffix()}`;
      const thirdExpiry = new Date(Date.now() + 30 * 60_000).toISOString();
      const third = await prisma.$transaction((tx) =>
        reserveSignedCapabilityAuthorization(tx, {
          operationId: acquired.operation.id,
          requestHash: acquired.operation.requestHash,
          scopeHash: acquired.operation.scopeHash,
          authorizationToken: thirdToken,
          reservedCapabilityExpiresAt: thirdExpiry,
        }),
      );
      const boundBeforeRejectedIssue = await prisma.$queryRaw<Array<{ objectStorageCapabilityExpiresAt: Date | null }>>`
        SELECT "objectStorageCapabilityExpiresAt" FROM "Project" WHERE "id" = ${seeded.project.id}
      `;
      await expect(
        prisma.$transaction((tx) =>
          markSignedCapabilityIssued(tx, {
            reservationId: third.reservationId,
            operationId: third.operationId,
            fencingToken: third.fencingToken,
            authorizationToken: thirdToken,
            method: third.method,
            objectKeyHash: third.objectKeyHash,
            providerExpiresAt: new Date(new Date(thirdExpiry).getTime() + 1_000).toISOString(),
            evidence: { providerRequestId: 'request-out-of-bounds' },
          }),
        ),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_PROVIDER_EXPIRY_OUT_OF_BOUNDS', statusCode: 409 });
      await expect(
        prisma.$queryRaw<Array<{ status: string }>>`
          SELECT "status"::text AS "status" FROM "ObjectStorageCapabilityReservation"
          WHERE "id" = ${third.reservationId}
        `,
      ).resolves.toEqual([{ status: 'RESERVED' }]);
      await expect(
        prisma.$queryRaw<Array<{ objectStorageCapabilityExpiresAt: Date | null }>>`
          SELECT "objectStorageCapabilityExpiresAt" FROM "Project" WHERE "id" = ${seeded.project.id}
        `,
      ).resolves.toEqual(boundBeforeRejectedIssue);

      expect(() =>
        objectStorageRequestHash(
          request({
            ...shape,
            payload: {
              command: 'create-download-capability',
              objectKeyHash,
              method: 'GET',
              detail: 'https://storage.invalid/o?X-Goog-Signature=top-secret',
            },
          }),
        ),
      ).toThrowError(expect.objectContaining({ code: 'OBJECT_STORAGE_OPERATION_SENSITIVE_JSON' }));
      expect(() =>
        objectStorageRequestHash(
          request({
            ...shape,
            payload: {
              command: 'create-download-capability',
              objectKeyHash,
              method: 'GET',
              detail: 'Bearer abcdefghijklmnop',
            },
          }),
        ),
      ).toThrowError(expect.objectContaining({ code: 'OBJECT_STORAGE_OPERATION_SENSITIVE_JSON' }));
      expect(() =>
        objectStorageRequestHash(
          request({
            ...shape,
            payload: {
              command: 'create-download-capability',
              objectKeyHash,
              method: 'GET',
              detail: '-----BEGIN PRIVATE KEY-----',
            },
          }),
        ),
      ).toThrowError(expect.objectContaining({ code: 'OBJECT_STORAGE_OPERATION_SENSITIVE_JSON' }));
      expect(() =>
        objectStorageRequestHash(
          request({
            ...shape,
            payload: {
              command: 'create-download-capability',
              objectKeyHash,
              method: 'GET',
              detail: 'credential=do-not-store-this',
            },
          }),
        ),
      ).toThrowError(expect.objectContaining({ code: 'OBJECT_STORAGE_OPERATION_SENSITIVE_JSON' }));
      expect(() =>
        objectStorageRequestHash(
          request({
            ...shape,
            payload: {
              command: 'create-download-capability',
              objectKeyHash,
              method: 'GET',
              objectName: 'docs/secret-santa.txt',
              publicReference: 'https://docs.example.test/storage-guide',
            },
          }),
        ),
      ).not.toThrow();
    } finally {
      await cleanupMutableSaga(prisma, seeded.project.id, [seeded.source.id, seeded.target.id]);
      await prisma.$disconnect();
    }
  });

  it('allows only the exact owning release barrier and quarantines a crash after that authority expires', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const seeded = await seedProject(prisma, 'object-saga-release-authority');
    const manifest = createDefaultProjectManifest(seeded.project.id);
    const digest = projectManifestDigest(manifest);
    const ownerToken = `release-owner-${suffix()}`;
    let lease: Awaited<ReturnType<typeof store.acquireProjectReleaseBarrier>>;

    try {
      await store.createProjectManifestRevision({
        projectId: seeded.project.id,
        expectedOrganizationId: seeded.source.id,
        schemaVersion: manifest.schemaVersion,
        manifestVersion: manifest.manifestVersion,
        digest,
        manifest,
      });
      lease = await store.acquireProjectReleaseBarrier({
        projectId: seeded.project.id,
        expectedOrganizationId: seeded.source.id,
        expectedManifestDigest: digest,
        operationId: `server-deploy:${suffix()}`,
        ownerToken,
        ttlSeconds: 60,
      });
      if (!lease) throw new Error('EXPECTED_RELEASE_BARRIER');

      const base = request({
        kind: 'TENANT_MUTATION',
        scopes: [{ projectId: seeded.project.id, expectedOrganizationId: seeded.source.id, expectedDeletedAt: null }],
        payload: { command: 'DELETE_OBJECT', projectId: seeded.project.id, key: 'release-owned.tar.gz' },
        preconditions: { capabilityDrainRequired: true },
      });
      await expect(
        claim(
          prisma,
          claimInput(base, { idempotencyKey: `release-none-${suffix()}`, ownerToken: `owner-${suffix()}` }),
        ),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_CHECKPOINT_BARRIER_ACTIVE', statusCode: 423 });

      const authority: ObjectStorageCheckpointBarrierAuthority = {
        kind: 'RELEASE_BARRIER',
        projectId: seeded.project.id,
        checkpointId: lease.checkpointId,
        barrierId: lease.barrierId,
        ownerTokenHash: createHash('sha256').update(lease.ownerToken).digest('hex'),
        fence: lease.fence,
        expectedOrganizationId: seeded.source.id,
        expectedManifestDigest: digest,
      };
      const wrong = request({
        ...base,
        preconditions: { ...base.preconditions, releaseBarrierAuthority: { ...authority, fence: authority.fence + 1 } },
      });
      await expect(
        claim(
          prisma,
          claimInput(wrong, { idempotencyKey: `release-wrong-${suffix()}`, ownerToken: `owner-${suffix()}` }),
        ),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_CHECKPOINT_AUTHORITY_LOST', statusCode: 409 });

      const owned = request({
        ...base,
        preconditions: { ...base.preconditions, releaseBarrierAuthority: authority },
      });
      const acquired = await claim(
        prisma,
        claimInput(owned, { idempotencyKey: `release-owned-${suffix()}`, ownerToken: `owner-${suffix()}` }),
      );
      if (acquired.kind !== 'ACQUIRED') throw new Error('EXPECTED_ACQUIRED');
      await prisma.$transaction((tx) =>
        markObjectStorageOperationEffectStarted(tx, acquired.lease, { providerEffectStarted: true }),
      );

      await prisma.$executeRaw`
        UPDATE "ProjectCheckpoint"
        SET "barrierExpiresAt" = clock_timestamp() - INTERVAL '1 second'
        WHERE "id" = ${lease.checkpointId}
      `;
      await prisma.$executeRaw`
        UPDATE "ObjectStorageOperation"
        SET "leaseExpiresAt" = clock_timestamp() - INTERVAL '1 second'
        WHERE "id" = ${acquired.operation.id}
      `;

      await store.reconcileObjectStorageOperations({ storage: { active: true } as ObjectStorage, batchSize: 10 });
      await expect(
        prisma.$queryRaw<Array<{ status: string; lastErrorCode: string | null }>>`
          SELECT "status"::text AS "status", "lastErrorCode"
          FROM "ObjectStorageOperation"
          WHERE "id" = ${acquired.operation.id}
        `,
      ).resolves.toEqual([
        {
          status: 'MANUAL_RECOVERY',
          lastErrorCode: 'OBJECT_STORAGE_OPERATION_CHECKPOINT_AUTHORITY_LOST',
        },
      ]);
    } finally {
      await cleanupMutableSaga(prisma, seeded.project.id, [seeded.source.id, seeded.target.id]);
      await prisma.$disconnect();
    }
  });

  it('redacts signed URLs from durable failures', async () => {
    const prisma = createDatabaseClient();
    const seeded = await seedProject(prisma, 'object-saga-redaction');
    const shape = request({
      kind: 'TENANT_MUTATION',
      scopes: [{ projectId: seeded.project.id, expectedOrganizationId: seeded.source.id, expectedDeletedAt: null }],
    });
    try {
      const acquired = await claim(
        prisma,
        claimInput(shape, { idempotencyKey: `redact-${suffix()}`, ownerToken: `redact-owner-${suffix()}` }),
      );
      if (acquired.kind !== 'ACQUIRED') throw new Error('EXPECTED_ACQUIRED');
      await prisma.$transaction((tx) =>
        markObjectStorageOperationFailedSafe(tx, acquired.lease, {
          errorCode: 'PROVIDER_REQUEST_FAILED',
          error: new Error(
            'GET https://storage.example/private?X-Goog-Credential=cred&X-Goog-Signature=sig Authorization=Bearer-token',
          ),
        }),
      );
      const rows = await prisma.$queryRaw<Array<{ message: string }>>`
        SELECT "lastErrorMessage" AS "message" FROM "ObjectStorageOperation"
        WHERE "id" = ${acquired.operation.id}
      `;
      expect(rows[0]?.message).toContain('[URL_REDACTED]');
      expect(rows[0]?.message).not.toMatch(/storage\.example|X-Goog-|Credential|Signature|Bearer-token|cred|sig/i);
    } finally {
      await cleanupMutableSaga(prisma, seeded.project.id, [seeded.source.id, seeded.target.id]);
      await prisma.$disconnect();
    }
  });

  it('fails a permanent-delete preflight safely, restores the Project fence, and retries the same key', async () => {
    const prisma = createDatabaseClient();
    const seeded = await seedProject(prisma, 'object-saga-delete-preflight');
    const actor = await prisma.user.create({ data: { email: `delete-preflight-${suffix()}@example.test` } });
    const store = new PrismaApiStore(prisma);
    const idempotencyKey = `delete-preflight-${suffix()}`;
    const runtimeEffectId = `runtime-prepared-${suffix()}`;
    const requestHash = projectPermanentDeletionRequestHash({
      projectId: seeded.project.id,
      organizationId: seeded.source.id,
      actorUserId: actor.id,
      expectedProjectName: seeded.project.name,
    });
    let registryReceipt: Awaited<ReturnType<typeof persistEmptyProjectRegistryErasure>> | undefined;
    const erasePhysical = vi.fn(async (_assertLease: () => Promise<void>, lease: ObjectStorageOperationLease) => {
      registryReceipt = await persistEmptyProjectRegistryErasure(store, lease, seeded.project.id);
    });
    const verifyPhysicalAbsence = vi.fn(
      async (_assertLease: () => Promise<void>, lease: ObjectStorageOperationLease) => {
        registryReceipt ??= await persistEmptyProjectRegistryErasure(store, lease, seeded.project.id);
        return {
          outcome: 'VERIFIED_ABSENT' as const,
          verifier: 'project-delete-preflight-test-v1',
          evidence: {
            schemaVersion: 'project-permanent-erasure-v2',
            filesystem: {
              projectTreeAbsent: true,
              workspaceTreesAbsent: true,
              objectCacheAbsent: true,
              staticSnapshotsAbsent: true,
              staticAliasesAbsent: true,
              staticArtifactSummary: EMPTY_STATIC_ARTIFACT_SUMMARY,
            },
            gcs: { bucketAbsent: true, objectCount: 0 },
            cloudBuild: { producerCount: 0, terminalProofCount: 0, lateSuccessCount: 0 },
            artifactRegistry: registryReceipt!,
            workspaceManager: {
              schemaVersion: 'workspace-project-erasure-v2',
              projectId: seeded.project.id,
              organizationId: seeded.source.id,
              databaseInventoryRetained: true,
              runtimeEffectsDrained: true,
              kubernetes: {
                deploymentsAbsent: true,
                replicaSetsAbsent: true,
                podsAbsent: true,
                servicesAbsent: true,
                endpointsAbsent: true,
                endpointSlicesAbsent: true,
                ingressesAbsent: true,
                ownedRuntimeSecretsAbsent: true,
                persistentVolumeClaimsAbsent: true,
              },
            },
          },
        };
      },
    );
    let rejectPreflight = true;
    const preflightPhysicalErasure = vi.fn(async () => {
      if (rejectPreflight) {
        throw Object.assign(new Error('static authority unavailable'), {
          code: 'PROJECT_STATIC_ERASURE_AUTHORITY_UNAVAILABLE',
        });
      }
      return EMPTY_STATIC_ARTIFACT_SUMMARY;
    });
    const deletion = {
      projectId: seeded.project.id,
      expectedOrganizationId: seeded.source.id,
      expectedProjectName: seeded.project.name,
      idempotencyKey,
      requestHash,
      actorUserId: actor.id,
      preflightPhysicalErasure,
      erasePhysical,
      verifyPhysicalAbsence,
    };

    try {
      await prisma.$executeRaw`
        INSERT INTO "ProjectRuntimeEffect" (
          "id", "projectId", "organizationId", "ownershipEpoch", "action", "resourceId",
          "intentHash", "targetDigest", "fencingToken", "ownerToken", "state",
          "leaseExpiresAt", "preparedAt", "createdAt", "updatedAt"
        ) VALUES (
          ${runtimeEffectId}, ${seeded.project.id}, ${seeded.source.id}, 0,
          'START_WORKSPACE', 'workspace-prepared', ${'c'.repeat(64)}, ${'d'.repeat(64)},
          1, ${`runtime-owner-${suffix()}`}, 'PREPARED'::"ProjectRuntimeEffectState",
          clock_timestamp() + INTERVAL '10 minutes', clock_timestamp(), clock_timestamp(), clock_timestamp()
        )
      `;
      await expect(store.hardDeleteProject(deletion)).rejects.toMatchObject({
        code: 'PROJECT_STATIC_ERASURE_AUTHORITY_UNAVAILABLE',
      });
      expect(erasePhysical).not.toHaveBeenCalled();
      expect(verifyPhysicalAbsence).not.toHaveBeenCalled();
      await expect(
        prisma.project.findUniqueOrThrow({
          where: { id: seeded.project.id },
          select: { deletedAt: true, permanentDeletionStartedAt: true },
        }),
      ).resolves.toEqual({ deletedAt: null, permanentDeletionStartedAt: null });
      await expect(
        prisma.$queryRaw<Array<{ status: string }>>`
          SELECT "status"::text AS "status"
          FROM "ObjectStorageOperation"
          WHERE "idempotencyKey" = ${idempotencyKey}
        `,
      ).resolves.toEqual([{ status: 'FAILED_SAFE' }]);
      await expect(
        prisma.$queryRaw<Array<{ state: string }>>`
          SELECT "state"::text AS "state" FROM "ProjectRuntimeEffect" WHERE "id" = ${runtimeEffectId}
        `,
      ).resolves.toEqual([{ state: 'ABORTED' }]);

      rejectPreflight = false;
      await expect(store.hardDeleteProject(deletion)).resolves.toMatchObject({
        project: { id: seeded.project.id, state: 'PERMANENTLY_DELETED' },
      });
      expect(preflightPhysicalErasure).toHaveBeenCalledTimes(2);
      expect(erasePhysical).toHaveBeenCalledOnce();
      expect(verifyPhysicalAbsence).toHaveBeenCalledOnce();
      await expect(prisma.project.findUnique({ where: { id: seeded.project.id } })).resolves.toBeNull();
    } finally {
      await cleanupMutableSaga(prisma, seeded.project.id, [seeded.source.id, seeded.target.id]);
      await prisma.user.deleteMany({ where: { id: actor.id } }).catch(() => undefined);
      await prisma.$disconnect();
    }
  });

  it('keeps the Project frozen and quarantines deletion while a runtime effect is externally ambiguous', async () => {
    const prisma = createDatabaseClient();
    const seeded = await seedProject(prisma, 'object-saga-runtime-ambiguous');
    const actor = await prisma.user.create({ data: { email: `runtime-ambiguous-${suffix()}@example.test` } });
    const store = new PrismaApiStore(prisma);
    const idempotencyKey = `runtime-ambiguous-${suffix()}`;
    const runtimeEffectId = `runtime-effect-${suffix()}`;
    const requestHash = projectPermanentDeletionRequestHash({
      projectId: seeded.project.id,
      organizationId: seeded.source.id,
      actorUserId: actor.id,
      expectedProjectName: seeded.project.name,
    });
    const preflightPhysicalErasure = vi.fn(async () => EMPTY_STATIC_ARTIFACT_SUMMARY);
    const erasePhysical = vi.fn(async () => undefined);
    const verifyPhysicalAbsence = vi.fn();

    try {
      await prisma.$executeRaw`
        INSERT INTO "ProjectRuntimeEffect" (
          "id", "projectId", "organizationId", "ownershipEpoch", "action", "resourceId",
          "intentHash", "targetDigest", "fencingToken", "ownerToken", "state",
          "leaseExpiresAt", "preparedAt", "dispatchedAt", "createdAt", "updatedAt"
        ) VALUES (
          ${runtimeEffectId}, ${seeded.project.id}, ${seeded.source.id}, 0,
          'START_WORKSPACE', 'workspace-ambiguous', ${'a'.repeat(64)}, ${'b'.repeat(64)},
          1, ${`runtime-owner-${suffix()}`}, 'IN_FLIGHT'::"ProjectRuntimeEffectState",
          clock_timestamp() - INTERVAL '1 second', clock_timestamp(), clock_timestamp(),
          clock_timestamp(), clock_timestamp()
        )
      `;

      await expect(
        store.hardDeleteProject({
          projectId: seeded.project.id,
          expectedOrganizationId: seeded.source.id,
          expectedProjectName: seeded.project.name,
          idempotencyKey,
          requestHash,
          actorUserId: actor.id,
          preflightPhysicalErasure,
          erasePhysical,
          verifyPhysicalAbsence,
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_RUNTIME_EFFECT_IN_FLIGHT' });

      expect(preflightPhysicalErasure).not.toHaveBeenCalled();
      expect(erasePhysical).not.toHaveBeenCalled();
      expect(verifyPhysicalAbsence).not.toHaveBeenCalled();
      await expect(
        prisma.project.findUniqueOrThrow({
          where: { id: seeded.project.id },
          select: { deletedAt: true, permanentDeletionStartedAt: true },
        }),
      ).resolves.toEqual({ deletedAt: expect.any(Date), permanentDeletionStartedAt: expect.any(Date) });
      await expect(
        prisma.$queryRaw<Array<{ status: string; lastErrorCode: string | null }>>`
          SELECT "status"::text AS "status", "lastErrorCode"
          FROM "ObjectStorageOperation"
          WHERE "idempotencyKey" = ${idempotencyKey}
        `,
      ).resolves.toEqual([{ status: 'MANUAL_RECOVERY', lastErrorCode: 'PROJECT_RUNTIME_EFFECT_IN_FLIGHT' }]);
      await expect(
        prisma.$queryRaw<Array<{ state: string }>>`
          SELECT "state"::text AS "state" FROM "ProjectRuntimeEffect" WHERE "id" = ${runtimeEffectId}
        `,
      ).resolves.toEqual([{ state: 'IN_FLIGHT' }]);
    } finally {
      await cleanupMutableSaga(prisma, seeded.project.id, [seeded.source.id, seeded.target.id]);
      await prisma.user.deleteMany({ where: { id: actor.id } }).catch(() => undefined);
      await store.disconnect();
    }
  });

  it('reclaims a post-effect permanent deletion with the original soft-delete observation', async () => {
    const prisma = createDatabaseClient();
    const seeded = await seedProject(prisma, 'object-saga-delete-retry');
    const actor = await prisma.user.create({ data: { email: `delete-retry-${suffix()}@example.test` } });
    const store = new PrismaApiStore(prisma);
    const idempotencyKey = `delete-retry-${suffix()}`;
    const requestHash = projectPermanentDeletionRequestHash({
      projectId: seeded.project.id,
      organizationId: seeded.source.id,
      actorUserId: actor.id,
      expectedProjectName: seeded.project.name,
    });
    let registryReceipt: Awaited<ReturnType<typeof persistEmptyProjectRegistryErasure>> | undefined;
    const erasePhysical = vi.fn(async (_assertLease: () => Promise<void>, lease: ObjectStorageOperationLease) => {
      registryReceipt = await persistEmptyProjectRegistryErasure(store, lease, seeded.project.id);
    });
    let verificationAttempts = 0;
    const verifyPhysicalAbsence = vi.fn(
      async (_assertLease: () => Promise<void>, lease: ObjectStorageOperationLease) => {
        verificationAttempts += 1;
        if (verificationAttempts === 1) throw new Error('SIMULATED_CRASH_AFTER_PROVIDER_EFFECT');
        registryReceipt ??= await persistEmptyProjectRegistryErasure(store, lease, seeded.project.id);
        return {
          outcome: 'VERIFIED_ABSENT' as const,
          verifier: 'project-delete-retry-test-v1',
          evidence: {
            schemaVersion: 'project-permanent-erasure-v2',
            filesystem: {
              projectTreeAbsent: true,
              workspaceTreesAbsent: true,
              objectCacheAbsent: true,
              staticSnapshotsAbsent: true,
              staticAliasesAbsent: true,
              staticArtifactSummary: EMPTY_STATIC_ARTIFACT_SUMMARY,
            },
            gcs: { bucketAbsent: true, objectCount: 0 },
            cloudBuild: { producerCount: 0, terminalProofCount: 0, lateSuccessCount: 0 },
            artifactRegistry: registryReceipt!,
            workspaceManager: {
              schemaVersion: 'workspace-project-erasure-v2',
              projectId: seeded.project.id,
              organizationId: seeded.source.id,
              databaseInventoryRetained: true,
              runtimeEffectsDrained: true,
              kubernetes: {
                deploymentsAbsent: true,
                replicaSetsAbsent: true,
                podsAbsent: true,
                servicesAbsent: true,
                endpointsAbsent: true,
                endpointSlicesAbsent: true,
                ingressesAbsent: true,
                ownedRuntimeSecretsAbsent: true,
                persistentVolumeClaimsAbsent: true,
              },
            },
          },
        };
      },
    );
    const deletion = {
      projectId: seeded.project.id,
      expectedOrganizationId: seeded.source.id,
      expectedProjectName: seeded.project.name,
      idempotencyKey,
      requestHash,
      actorUserId: actor.id,
      preflightPhysicalErasure: async () => EMPTY_STATIC_ARTIFACT_SUMMARY,
      erasePhysical,
      verifyPhysicalAbsence,
    };

    try {
      await expect(store.hardDeleteProject(deletion)).rejects.toThrow('SIMULATED_CRASH_AFTER_PROVIDER_EFFECT');
      expect(erasePhysical).toHaveBeenCalledOnce();
      await expect(
        prisma.$queryRaw<Array<{ deletedAt: Date | null; permanentDeletionStartedAt: Date | null }>>`
          SELECT "deletedAt", "permanentDeletionStartedAt" FROM "Project" WHERE "id" = ${seeded.project.id}
        `,
      ).resolves.toEqual([{ deletedAt: expect.any(Date), permanentDeletionStartedAt: expect.any(Date) }]);
      await prisma.$executeRaw`
        UPDATE "ObjectStorageOperation"
        SET "leaseExpiresAt" = clock_timestamp() - INTERVAL '1 second'
        WHERE "idempotencyKey" = ${idempotencyKey}
      `;

      await expect(store.hardDeleteProject(deletion)).resolves.toMatchObject({
        replayed: false,
        project: { id: seeded.project.id, organizationId: seeded.source.id, state: 'PERMANENTLY_DELETED' },
      });
      expect(erasePhysical).toHaveBeenCalledOnce();
      expect(verifyPhysicalAbsence).toHaveBeenCalledTimes(2);
      await expect(prisma.project.findUnique({ where: { id: seeded.project.id } })).resolves.toBeNull();
      await expect(
        prisma.auditLog.count({ where: { resourceId: seeded.project.id, action: 'project.hard_delete' } }),
      ).resolves.toBe(1);
    } finally {
      await prisma.user.deleteMany({ where: { id: actor.id } }).catch(() => undefined);
      await prisma.organization
        .deleteMany({ where: { id: { in: [seeded.source.id, seeded.target.id] } } })
        .catch(() => undefined);
      await store.disconnect();
    }
  });

  it('deletes retained WorkspaceRuntime recovery inventory only in the final Project transaction', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const seeded = await seedProject(prisma, 'object-saga-delete-runtime-fence');
    const shape = request({
      kind: 'PROJECT_PERMANENT_DELETE',
      scopes: [{ projectId: seeded.project.id, expectedOrganizationId: seeded.source.id, expectedDeletedAt: null }],
      payload: { command: 'permanently-delete-project' },
    });
    const input = claimInput(shape, {
      idempotencyKey: `delete-runtime-fence-${suffix()}`,
      ownerToken: `delete-runtime-owner-${suffix()}`,
    });
    let lease: ObjectStorageOperationLease | undefined;
    let registryReceipt: Awaited<ReturnType<typeof persistEmptyProjectRegistryErasure>> | undefined;
    const runtimeEffectId = `runtime-draining-${suffix()}`;
    const verification = () => ({
      outcome: 'VERIFIED_ABSENT' as const,
      verifier: 'workspace-runtime-fence-test-v1',
      evidence: {
        schemaVersion: 'project-permanent-erasure-v2',
        filesystem: {
          projectTreeAbsent: true,
          workspaceTreesAbsent: true,
          objectCacheAbsent: true,
          staticSnapshotsAbsent: true,
          staticAliasesAbsent: true,
          staticArtifactSummary: EMPTY_STATIC_ARTIFACT_SUMMARY,
        },
        gcs: { bucketAbsent: true, objectCount: 0 },
        cloudBuild: { producerCount: 0, terminalProofCount: 0, lateSuccessCount: 0 },
        artifactRegistry: registryReceipt!,
        workspaceManager: {
          schemaVersion: 'workspace-project-erasure-v2',
          projectId: seeded.project.id,
          organizationId: seeded.source.id,
          databaseInventoryRetained: true,
          runtimeEffectsDrained: true,
          kubernetes: {
            deploymentsAbsent: true,
            replicaSetsAbsent: true,
            podsAbsent: true,
            servicesAbsent: true,
            endpointsAbsent: true,
            endpointSlicesAbsent: true,
            ingressesAbsent: true,
            ownedRuntimeSecretsAbsent: true,
            persistentVolumeClaimsAbsent: true,
          },
        },
      },
    });

    try {
      lease = await prisma.$transaction(async (tx) => {
        const acquired = await claimObjectStorageOperation(tx, input);
        if (acquired.kind !== 'ACQUIRED') throw new Error('EXPECTED_ACQUIRED');
        await recordPermanentDeletionStaticArtifactPlan(tx, acquired.lease, EMPTY_STATIC_ARTIFACT_SUMMARY);
        await markObjectStorageOperationEffectStarted(tx, acquired.lease, { phase: 'workspace-erasure' });
        await beginObjectStorageOperationVerification(tx, acquired.lease, { phase: 'workspace-verify' });
        return acquired.lease;
      });
      registryReceipt = await persistEmptyProjectRegistryErasure(store, lease, seeded.project.id);
      await prisma.workspaceRuntime.create({
        data: {
          id: `runtime-${suffix()}`,
          orgId: seeded.source.id,
          projectId: seeded.project.id,
          plan: 'pro',
          status: 'STOPPED',
          pvcName: `pvc-${suffix()}`,
          podName: `pod-${suffix()}`,
          serviceName: `service-${suffix()}`,
          agentTokenSecretName: `secret-${suffix()}`,
        },
      });
      await prisma.$executeRaw`
        INSERT INTO "ProjectRuntimeEffect" (
          "id", "projectId", "organizationId", "ownershipEpoch", "action", "resourceId",
          "intentHash", "targetDigest", "state", "drainingAt", "createdAt", "updatedAt"
        ) VALUES (
          ${runtimeEffectId}, ${seeded.project.id}, ${seeded.source.id}, 0,
          'START_WORKSPACE', 'workspace-draining', ${'1'.repeat(64)}, ${'2'.repeat(64)},
          'DRAINING'::"ProjectRuntimeEffectState", clock_timestamp(), clock_timestamp(), clock_timestamp()
        )
      `;

      await expect(
        prisma.$transaction((tx) => finalizeObjectStorageOperation(tx, lease!, { verification: verification() })),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_PROJECT_RUNTIME_EFFECT_ACTIVE' });
      await expect(prisma.project.findUnique({ where: { id: seeded.project.id } })).resolves.toMatchObject({
        id: seeded.project.id,
      });
      await expect(prisma.workspaceRuntime.count({ where: { projectId: seeded.project.id } })).resolves.toBe(1);
      await expect(
        prisma.$queryRaw<Array<{ status: string; state: string }>>`
          SELECT operation."status"::text AS "status", effect."state"::text AS "state"
          FROM "ObjectStorageOperation" operation
          JOIN "ProjectRuntimeEffect" effect ON effect."id" = ${runtimeEffectId}
          WHERE operation."id" = ${lease!.operationId}
        `,
      ).resolves.toEqual([{ status: 'VERIFYING', state: 'DRAINING' }]);
      await prisma.$executeRaw`
        UPDATE "ProjectRuntimeEffect"
        SET "state" = 'DRAINED'::"ProjectRuntimeEffectState",
            "drainedAt" = clock_timestamp(),
            "updatedAt" = clock_timestamp()
        WHERE "id" = ${runtimeEffectId}
      `;

      await expect(
        prisma.$transaction((tx) => finalizeObjectStorageOperation(tx, lease!, { verification: verification() })),
      ).resolves.toMatchObject({ status: 'COMMITTED' });
      await expect(prisma.project.findUnique({ where: { id: seeded.project.id } })).resolves.toBeNull();
      await expect(prisma.workspaceRuntime.count({ where: { projectId: seeded.project.id } })).resolves.toBe(0);
    } finally {
      await prisma.workspaceRuntime.deleteMany({ where: { projectId: seeded.project.id } }).catch(() => undefined);
      await cleanupMutableSaga(prisma, seeded.project.id, [seeded.source.id, seeded.target.id]);
      await store.disconnect();
    }
  });

  it('finalizes and replays permanent deletion after Project cascade and enforces append-only history', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const seeded = await seedProject(prisma, 'object-saga-delete');
    const shape = request({
      kind: 'PROJECT_PERMANENT_DELETE',
      scopes: [{ projectId: seeded.project.id, expectedOrganizationId: seeded.source.id, expectedDeletedAt: null }],
      payload: { command: 'permanently-delete-project' },
    });
    const input = claimInput(shape, {
      idempotencyKey: `delete-${suffix()}`,
      ownerToken: `delete-owner-${suffix()}`,
    });
    const staticArtifacts = Array.from({ length: 2_100 }, (_, index) => ({
      digest: createHash('sha256').update(`permanent-static-artifact-${index}`).digest('hex'),
      outcome: index % 3 === 0 ? ('RETAINED_BY_OTHER_MANIFEST' as const) : ('DELETED_UNREFERENCED' as const),
      otherReferenceCount: index % 3 === 0 ? 2 : 0,
    }));
    const staticArtifactSummary = objectStorageStaticArtifactSummary(staticArtifacts);
    expect(staticArtifactSummary.digest).toBe(objectStorageArtifactInventoryDigest([...staticArtifacts].reverse()));
    expect(() => objectStorageArtifactInventoryDigest([staticArtifacts[0]!, staticArtifacts[0]!])).toThrowError(
      expect.objectContaining({ code: 'OBJECT_STORAGE_OPERATION_ARTIFACT_INVENTORY_INVALID' }),
    );

    const lease = await prisma.$transaction(
      async (tx) => {
        const acquired = await claimObjectStorageOperation(tx, input);
        if (acquired.kind !== 'ACQUIRED') throw new Error('EXPECTED_ACQUIRED');
        const frozen = await tx.$queryRaw<Array<{ deletedAt: Date | null; permanentDeletionStartedAt: Date | null }>>`
          SELECT "deletedAt", "permanentDeletionStartedAt" FROM "Project"
          WHERE "id" = ${seeded.project.id}
        `;
        expect(frozen[0]?.deletedAt).toBeInstanceOf(Date);
        expect(frozen[0]?.permanentDeletionStartedAt).toBeInstanceOf(Date);

        await recordPermanentDeletionStaticArtifactPlan(tx, acquired.lease, staticArtifactSummary);
        await markObjectStorageOperationEffectStarted(tx, acquired.lease, { phase: 'provider-erasure-started' });
        await beginObjectStorageOperationVerification(tx, acquired.lease, { phase: 'provider-erasure-complete' });
        return acquired.lease;
      },
      { timeout: 30_000 },
    );
    const registryReceipt = await persistEmptyProjectRegistryErasure(store, lease, seeded.project.id);
    const verification = {
      outcome: 'VERIFIED_ABSENT' as const,
      verifier: 'gcs-inventory-v1',
      evidence: {
        schemaVersion: 'project-permanent-erasure-v2',
        filesystem: {
          projectTreeAbsent: true,
          workspaceTreesAbsent: true,
          objectCacheAbsent: true,
          staticSnapshotsAbsent: true,
          staticAliasesAbsent: true,
          staticArtifactSummary,
        },
        gcs: { bucketAbsent: true, objectCount: 0 },
        cloudBuild: { producerCount: 0, terminalProofCount: 0, lateSuccessCount: 0 },
        artifactRegistry: registryReceipt,
        workspaceManager: {
          schemaVersion: 'workspace-project-erasure-v2',
          projectId: seeded.project.id,
          organizationId: seeded.source.id,
          databaseInventoryRetained: true,
          runtimeEffectsDrained: true,
          kubernetes: {
            deploymentsAbsent: true,
            replicaSetsAbsent: true,
            podsAbsent: true,
            servicesAbsent: true,
            endpointsAbsent: true,
            endpointSlicesAbsent: true,
            ingressesAbsent: true,
            ownedRuntimeSecretsAbsent: true,
            persistentVolumeClaimsAbsent: true,
          },
        },
      },
    };
    const finalized = await prisma.$transaction(
      async (tx) => {
        await expect(
          finalizeObjectStorageOperation(tx, lease, {
            verification: {
              ...verification,
              evidence: {
                ...verification.evidence,
                filesystem: {
                  ...verification.evidence.filesystem,
                  staticArtifactSummary: { ...staticArtifactSummary, digest: 'f'.repeat(64) },
                },
              },
            },
          }),
        ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_PERMANENT_ERASURE_PROOF_INCOMPLETE' });
        await expect(tx.project.findUnique({ where: { id: seeded.project.id } })).resolves.toMatchObject({
          id: seeded.project.id,
        });
        return finalizeObjectStorageOperation(tx, lease, {
          verification,
        });
      },
      { timeout: 30_000 },
    );
    expect(finalized).toMatchObject({
      status: 'COMMITTED',
      result: { project: { id: seeded.project.id, state: 'PERMANENTLY_DELETED' } },
    });

    const replayClient = createDatabaseClient();
    try {
      await expect(replayClient.project.findUnique({ where: { id: seeded.project.id } })).resolves.toBeNull();
      const replay = await replayClient.$transaction((tx) =>
        getPermanentDeletionReplay(tx, {
          projectId: seeded.project.id,
          expectedOrganizationId: seeded.source.id,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
        }),
      );
      expect(replay).toMatchObject({
        state: 'COMMITTED',
        projectId: seeded.project.id,
        organizationId: seeded.source.id,
        result: finalized.result,
        proof: { verifiedAt: expect.any(String) },
      });
      expect(replay?.proof.evidence).toMatchObject({
        filesystem: { staticArtifactSummary },
        databaseCascade: { projectReleaseReferencesAbsent: true, liveScopeDetached: true },
      });
      expect(Buffer.byteLength(JSON.stringify(replay?.proof), 'utf8')).toBeLessThan(4_096);
      await expect(
        replayClient.$transaction((tx) =>
          getPermanentDeletionReplay(tx, {
            projectId: seeded.project.id,
            expectedOrganizationId: seeded.source.id,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
          }),
        ),
      ).resolves.toEqual(replay);
      await expect(
        replayClient.$transaction((tx) =>
          getPermanentDeletionReplay(tx, {
            projectId: seeded.project.id,
            expectedOrganizationId: seeded.target.id,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
          }),
        ),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_RECEIPT_NOT_FOUND', statusCode: 404 });
      await expect(
        replayClient.$transaction((tx) =>
          getPermanentDeletionReplay(tx, {
            projectId: seeded.project.id,
            expectedOrganizationId: seeded.source.id,
            idempotencyKey: `wrong-${suffix()}`,
            requestHash: input.requestHash,
          }),
        ),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT', statusCode: 409 });

      await expect(
        replayClient.$transaction((tx) =>
          getPermanentDeletionReplay(tx, {
            projectId: seeded.project.id,
            expectedOrganizationId: seeded.source.id,
            idempotencyKey: input.idempotencyKey,
            requestHash: 'f'.repeat(64),
          }),
        ),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT', statusCode: 409 });

      await expect(
        replayClient.$executeRaw`
          UPDATE "ProjectPermanentDeletionReceipt" SET "completedAt" = clock_timestamp()
          WHERE "projectId" = ${seeded.project.id}
        `,
      ).rejects.toThrow(/append-only/);
      await expect(
        replayClient.$executeRaw`
          DELETE FROM "ProjectPermanentDeletionReceipt" WHERE "projectId" = ${seeded.project.id}
        `,
      ).rejects.toThrow(/append-only/);
      await expect(
        replayClient.$executeRaw`
          DELETE FROM "ObjectStorageOperationProjectScope" WHERE "operationId" = ${finalized.id}
        `,
      ).rejects.toThrow(/immutable/);
      await expect(
        replayClient.$executeRaw`
          UPDATE "ObjectStorageOperation" SET "lastErrorCode" = 'CORRUPT'
          WHERE "id" = ${finalized.id}
        `,
      ).rejects.toThrow(/immutable/);
    } finally {
      await replayClient.organization
        .deleteMany({ where: { id: { in: [seeded.source.id, seeded.target.id] } } })
        .catch(() => undefined);
      await Promise.allSettled([store.disconnect(), replayClient.$disconnect()]);
    }
  });
});
