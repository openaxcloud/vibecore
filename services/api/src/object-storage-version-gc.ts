import { createHash } from 'node:crypto';

import { Prisma } from '@vibecore/database';

import {
  canonicalizeObjectStoragePinnedGenerations,
  objectStoragePinnedGenerationDigest,
  type ObjectStorageJsonObject,
  type ObjectStoragePinnedGeneration,
} from './object-storage-operation.js';
import {
  ObjectStorageError,
  parseObjectStorageInventory,
  type ListObjectsResult,
  type ObjectStorage,
} from './object-storage.js';

export const OBJECT_STORAGE_VERSION_GC_MAX_CANDIDATES = 500;

type Tx = Prisma.TransactionClient;

export interface ObjectStorageGenerationReference {
  key: string;
  generation: string;
}

export interface ObjectStorageVersionGcPlan {
  candidates: ObjectStoragePinnedGeneration[];
  candidateDigest: string;
  activeReferences: ObjectStorageGenerationReference[];
  activeReferenceDigest: string;
  currentGenerations: ObjectStorageGenerationReference[];
  currentGenerationDigest: string;
  remainingCandidateCount: number;
  disableVersioningWhenComplete: boolean;
}

export interface ObjectStorageVersionGcScheduleCandidate {
  projectId: string;
  expectedOrganizationId: string;
  status: 'PENDING' | 'CLAIMED';
  fencingToken: bigint;
  lastOperationId: string | null;
  dueAt: string;
}

export interface ObjectStorageVersionGcScheduleLease {
  projectId: string;
  expectedOrganizationId: string;
  ownerToken: string;
  fencingToken: bigint;
  operationId: string;
}

function versionGcError(code: string, message: string): ObjectStorageError {
  return new ObjectStorageError(message, code);
}

function bigint(value: bigint | number | string): bigint {
  try {
    return BigInt(value);
  } catch {
    throw versionGcError('OBJECT_STORAGE_VERSION_GC_FENCE_INVALID', 'Version GC fence is invalid');
  }
}

export async function scheduleObjectStorageVersionGc(
  tx: Tx,
  input: { projectId: string; expectedOrganizationId: string; notBefore: Date },
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ projectId: string }>>(Prisma.sql`
    INSERT INTO "ObjectStorageVersionGcSchedule" (
      "projectId", "expectedOrganizationId", "status", "notBefore", "nextAttemptAt",
      "ownerToken", "fencingToken", "leaseExpiresAt", "attempts", "requestedAt", "createdAt", "updatedAt"
    )
    SELECT
      project."id", project."organizationId", 'PENDING'::"ObjectStorageVersionGcStatus",
      ${input.notBefore}, ${input.notBefore}, NULL, 1, NULL, 0,
      clock_timestamp(), clock_timestamp(), clock_timestamp()
    FROM "Project" project
    WHERE project."id" = ${input.projectId}
      AND project."organizationId" = ${input.expectedOrganizationId}
      AND project."deletedAt" IS NULL
      AND project."permanentDeletionStartedAt" IS NULL
    ON CONFLICT ("projectId") DO UPDATE
    SET "notBefore" = GREATEST("ObjectStorageVersionGcSchedule"."notBefore", EXCLUDED."notBefore"),
        "nextAttemptAt" = GREATEST(
          GREATEST("ObjectStorageVersionGcSchedule"."notBefore", EXCLUDED."notBefore"),
          LEAST("ObjectStorageVersionGcSchedule"."nextAttemptAt", EXCLUDED."nextAttemptAt")
        ),
        "requestedAt" = clock_timestamp(),
        "lastErrorCode" = NULL,
        "lastErrorMessage" = NULL,
        "updatedAt" = clock_timestamp()
    WHERE "ObjectStorageVersionGcSchedule"."expectedOrganizationId" = EXCLUDED."expectedOrganizationId"
      AND "ObjectStorageVersionGcSchedule"."status" = 'PENDING'
    RETURNING "projectId"
  `);
  if (!rows[0]) {
    throw versionGcError(
      'OBJECT_STORAGE_VERSION_GC_SCHEDULE_CONFLICT',
      'Version GC could not be scheduled under the current tenant fence',
    );
  }
}

export async function listObjectStorageVersionGcSchedules(
  tx: Tx,
  input: { limit: number; after?: { dueAt: string; projectId: string } },
): Promise<ObjectStorageVersionGcScheduleCandidate[]> {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 500) {
    throw versionGcError('OBJECT_STORAGE_VERSION_GC_LIMIT_INVALID', 'Version GC limit must be 1 to 500');
  }
  const after = input.after ? { dueAt: new Date(input.after.dueAt), projectId: input.after.projectId } : undefined;
  if (after && Number.isNaN(after.dueAt.getTime())) {
    throw versionGcError('OBJECT_STORAGE_VERSION_GC_CURSOR_INVALID', 'Version GC cursor is invalid');
  }
  const rows = await tx.$queryRaw<
    Array<{
      projectId: string;
      expectedOrganizationId: string;
      status: 'PENDING' | 'CLAIMED';
      fencingToken: bigint | number | string;
      lastOperationId: string | null;
      dueAt: Date;
    }>
  >(Prisma.sql`
    SELECT
      "projectId", "expectedOrganizationId", "status", "fencingToken", "lastOperationId",
      CASE
        WHEN "status" = 'PENDING' THEN GREATEST("notBefore", "nextAttemptAt")
        ELSE "leaseExpiresAt"
      END AS "dueAt"
    FROM "ObjectStorageVersionGcSchedule"
    WHERE (
      ("status" = 'PENDING'
        AND "notBefore" <= clock_timestamp()
        AND "nextAttemptAt" <= clock_timestamp())
      OR ("status" = 'CLAIMED' AND "leaseExpiresAt" <= clock_timestamp())
    )
    ${
      after
        ? Prisma.sql`AND (
            CASE
              WHEN "status" = 'PENDING' THEN GREATEST("notBefore", "nextAttemptAt")
              ELSE "leaseExpiresAt"
            END,
            "projectId"
          ) > (${after.dueAt}, ${after.projectId})`
        : Prisma.empty
    }
    ORDER BY "dueAt" ASC, "projectId" ASC
    LIMIT ${input.limit}
  `);
  return rows.map((row) => ({
    ...row,
    fencingToken: bigint(row.fencingToken),
    dueAt: row.dueAt.toISOString(),
  }));
}

export async function claimObjectStorageVersionGcSchedule(
  tx: Tx,
  input: {
    candidate: ObjectStorageVersionGcScheduleCandidate;
    ownerToken: string;
    operationId: string;
    operationLeaseExpiresAt: string;
  },
): Promise<ObjectStorageVersionGcScheduleLease> {
  const rows = await tx.$queryRaw<
    Array<{ projectId: string; expectedOrganizationId: string; fencingToken: bigint | number | string }>
  >(Prisma.sql`
    UPDATE "ObjectStorageVersionGcSchedule"
    SET "status" = 'CLAIMED'::"ObjectStorageVersionGcStatus",
        "ownerToken" = ${input.ownerToken},
        "fencingToken" = "fencingToken" + 1,
        "leaseExpiresAt" = ${new Date(input.operationLeaseExpiresAt)},
        "attempts" = "attempts" + 1,
        "lastOperationId" = ${input.operationId},
        "lastErrorCode" = NULL,
        "lastErrorMessage" = NULL,
        "updatedAt" = clock_timestamp()
    WHERE "projectId" = ${input.candidate.projectId}
      AND "expectedOrganizationId" = ${input.candidate.expectedOrganizationId}
      AND "status" = 'PENDING'
      AND "fencingToken" = ${input.candidate.fencingToken}
      AND "notBefore" <= clock_timestamp()
      AND "nextAttemptAt" <= clock_timestamp()
    RETURNING "projectId", "expectedOrganizationId", "fencingToken"
  `);
  const row = rows[0];
  if (!row) {
    throw versionGcError('OBJECT_STORAGE_VERSION_GC_SCHEDULE_FENCE_LOST', 'Version GC schedule fence changed');
  }
  return {
    projectId: row.projectId,
    expectedOrganizationId: row.expectedOrganizationId,
    ownerToken: input.ownerToken,
    fencingToken: bigint(row.fencingToken),
    operationId: input.operationId,
  };
}

export async function reclaimObjectStorageVersionGcSchedule(
  tx: Tx,
  input: {
    candidate: ObjectStorageVersionGcScheduleCandidate;
    ownerToken: string;
    operationId: string;
    operationLeaseExpiresAt: string;
  },
): Promise<ObjectStorageVersionGcScheduleLease> {
  if (input.candidate.status !== 'CLAIMED' || input.candidate.lastOperationId !== input.operationId) {
    throw versionGcError('OBJECT_STORAGE_VERSION_GC_SCHEDULE_INVALID', 'Version GC recovery candidate is invalid');
  }
  const rows = await tx.$queryRaw<
    Array<{ projectId: string; expectedOrganizationId: string; fencingToken: bigint | number | string }>
  >(Prisma.sql`
    UPDATE "ObjectStorageVersionGcSchedule"
    SET "ownerToken" = ${input.ownerToken},
        "fencingToken" = "fencingToken" + 1,
        "leaseExpiresAt" = ${new Date(input.operationLeaseExpiresAt)},
        "attempts" = "attempts" + 1,
        "lastErrorCode" = NULL,
        "lastErrorMessage" = NULL,
        "updatedAt" = clock_timestamp()
    WHERE "projectId" = ${input.candidate.projectId}
      AND "expectedOrganizationId" = ${input.candidate.expectedOrganizationId}
      AND "status" = 'CLAIMED'
      AND "fencingToken" = ${input.candidate.fencingToken}
      AND "lastOperationId" = ${input.operationId}
      AND "leaseExpiresAt" <= clock_timestamp()
    RETURNING "projectId", "expectedOrganizationId", "fencingToken"
  `);
  const row = rows[0];
  if (!row) {
    throw versionGcError('OBJECT_STORAGE_VERSION_GC_SCHEDULE_FENCE_LOST', 'Version GC schedule fence changed');
  }
  return {
    projectId: row.projectId,
    expectedOrganizationId: row.expectedOrganizationId,
    ownerToken: input.ownerToken,
    fencingToken: bigint(row.fencingToken),
    operationId: input.operationId,
  };
}

export async function heartbeatObjectStorageVersionGcSchedule(
  tx: Tx,
  lease: ObjectStorageVersionGcScheduleLease,
  leaseExpiresAt: string,
): Promise<void> {
  const updated = await tx.$executeRaw`
    UPDATE "ObjectStorageVersionGcSchedule"
    SET "leaseExpiresAt" = ${new Date(leaseExpiresAt)},
        "updatedAt" = clock_timestamp()
    WHERE "projectId" = ${lease.projectId}
      AND "expectedOrganizationId" = ${lease.expectedOrganizationId}
      AND "status" = 'CLAIMED'
      AND "ownerToken" = ${lease.ownerToken}
      AND "fencingToken" = ${lease.fencingToken}
      AND "lastOperationId" = ${lease.operationId}
  `;
  if (updated !== 1) {
    throw versionGcError('OBJECT_STORAGE_VERSION_GC_SCHEDULE_FENCE_LOST', 'Version GC schedule fence changed');
  }
}

export async function releaseObjectStorageVersionGcSchedule(
  tx: Tx,
  lease: ObjectStorageVersionGcScheduleLease,
  input: { deleteSchedule: boolean; nextAttemptAt?: Date; errorCode?: string; errorMessage?: string },
): Promise<void> {
  if (input.deleteSchedule) {
    const deleted = await tx.$executeRaw`
      DELETE FROM "ObjectStorageVersionGcSchedule"
      WHERE "projectId" = ${lease.projectId}
        AND "expectedOrganizationId" = ${lease.expectedOrganizationId}
        AND "status" = 'CLAIMED'
        AND "ownerToken" = ${lease.ownerToken}
        AND "fencingToken" = ${lease.fencingToken}
        AND "lastOperationId" = ${lease.operationId}
    `;
    if (deleted !== 1) {
      throw versionGcError('OBJECT_STORAGE_VERSION_GC_SCHEDULE_FENCE_LOST', 'Version GC schedule fence changed');
    }
    return;
  }
  if (!input.nextAttemptAt) {
    throw versionGcError('OBJECT_STORAGE_VERSION_GC_NEXT_ATTEMPT_REQUIRED', 'Next collection time is required');
  }
  const updated = await tx.$executeRaw`
    UPDATE "ObjectStorageVersionGcSchedule"
    SET "status" = 'PENDING'::"ObjectStorageVersionGcStatus",
        "nextAttemptAt" = ${input.nextAttemptAt},
        "ownerToken" = NULL,
        "leaseExpiresAt" = NULL,
        "lastErrorCode" = ${input.errorCode ?? null},
        "lastErrorMessage" = ${input.errorMessage?.slice(0, 1000) ?? null},
        "updatedAt" = clock_timestamp()
    WHERE "projectId" = ${lease.projectId}
      AND "expectedOrganizationId" = ${lease.expectedOrganizationId}
      AND "status" = 'CLAIMED'
      AND "ownerToken" = ${lease.ownerToken}
      AND "fencingToken" = ${lease.fencingToken}
      AND "lastOperationId" = ${lease.operationId}
  `;
  if (updated !== 1) {
    throw versionGcError('OBJECT_STORAGE_VERSION_GC_SCHEDULE_FENCE_LOST', 'Version GC schedule fence changed');
  }
}

export async function resetExpiredObjectStorageVersionGcSchedule(
  tx: Tx,
  candidate: ObjectStorageVersionGcScheduleCandidate,
  input: { nextAttemptAt: Date; errorCode?: string; errorMessage?: string },
): Promise<void> {
  if (candidate.status !== 'CLAIMED' || !candidate.lastOperationId) {
    throw versionGcError('OBJECT_STORAGE_VERSION_GC_SCHEDULE_INVALID', 'Version GC recovery candidate is invalid');
  }
  const updated = await tx.$executeRaw`
    UPDATE "ObjectStorageVersionGcSchedule"
    SET "status" = 'PENDING'::"ObjectStorageVersionGcStatus",
        "nextAttemptAt" = ${input.nextAttemptAt},
        "ownerToken" = NULL,
        "leaseExpiresAt" = NULL,
        "lastErrorCode" = ${input.errorCode ?? null},
        "lastErrorMessage" = ${input.errorMessage?.slice(0, 1000) ?? null},
        "updatedAt" = clock_timestamp()
    WHERE "projectId" = ${candidate.projectId}
      AND "expectedOrganizationId" = ${candidate.expectedOrganizationId}
      AND "status" = 'CLAIMED'
      AND "fencingToken" = ${candidate.fencingToken}
      AND "lastOperationId" = ${candidate.lastOperationId}
      AND "leaseExpiresAt" <= clock_timestamp()
  `;
  if (updated !== 1) {
    throw versionGcError('OBJECT_STORAGE_VERSION_GC_SCHEDULE_FENCE_LOST', 'Version GC schedule fence changed');
  }
}

export async function quarantineExpiredObjectStorageVersionGcSchedule(
  tx: Tx,
  candidate: ObjectStorageVersionGcScheduleCandidate,
  input: { errorCode: string; errorMessage: string },
): Promise<void> {
  if (candidate.status !== 'CLAIMED' || !candidate.lastOperationId) {
    throw versionGcError('OBJECT_STORAGE_VERSION_GC_SCHEDULE_INVALID', 'Version GC recovery candidate is invalid');
  }
  const updated = await tx.$executeRaw`
    UPDATE "ObjectStorageVersionGcSchedule"
    SET "status" = 'MANUAL_RECOVERY'::"ObjectStorageVersionGcStatus",
        "ownerToken" = NULL,
        "leaseExpiresAt" = NULL,
        "lastErrorCode" = ${input.errorCode.slice(0, 128)},
        "lastErrorMessage" = ${input.errorMessage.slice(0, 1000)},
        "updatedAt" = clock_timestamp()
    WHERE "projectId" = ${candidate.projectId}
      AND "expectedOrganizationId" = ${candidate.expectedOrganizationId}
      AND "status" = 'CLAIMED'
      AND "fencingToken" = ${candidate.fencingToken}
      AND "lastOperationId" = ${candidate.lastOperationId}
      AND "leaseExpiresAt" <= clock_timestamp()
  `;
  if (updated !== 1) {
    throw versionGcError('OBJECT_STORAGE_VERSION_GC_SCHEDULE_FENCE_LOST', 'Version GC schedule fence changed');
  }
}

export async function deferLeasedObjectStorageVersionGcSchedule(
  tx: Tx,
  lease: ObjectStorageVersionGcScheduleLease,
  input: {
    operationOwnerToken: string;
    operationLeaseExpiresAt: string;
    errorCode: string;
    errorMessage: string;
  },
): Promise<ObjectStorageVersionGcScheduleLease> {
  const rows = await tx.$queryRaw<Array<{ fencingToken: bigint | number | string }>>(Prisma.sql`
    UPDATE "ObjectStorageVersionGcSchedule"
    SET "ownerToken" = ${input.operationOwnerToken},
        "fencingToken" = "fencingToken" + 1,
        "leaseExpiresAt" = ${new Date(input.operationLeaseExpiresAt)},
        "attempts" = "attempts" + 1,
        "lastErrorCode" = ${input.errorCode.slice(0, 128)},
        "lastErrorMessage" = ${input.errorMessage.slice(0, 1000)},
        "updatedAt" = clock_timestamp()
    WHERE "projectId" = ${lease.projectId}
      AND "expectedOrganizationId" = ${lease.expectedOrganizationId}
      AND "status" = 'CLAIMED'
      AND "ownerToken" = ${lease.ownerToken}
      AND "fencingToken" = ${lease.fencingToken}
      AND "lastOperationId" = ${lease.operationId}
    RETURNING "fencingToken"
  `);
  const row = rows[0];
  if (!row) {
    throw versionGcError('OBJECT_STORAGE_VERSION_GC_SCHEDULE_FENCE_LOST', 'Version GC schedule fence changed');
  }
  return {
    ...lease,
    ownerToken: input.operationOwnerToken,
    fencingToken: bigint(row.fencingToken),
  };
}

export async function quarantineObjectStorageVersionGcSchedule(
  tx: Tx,
  lease: ObjectStorageVersionGcScheduleLease,
  input: { errorCode: string; errorMessage: string },
): Promise<void> {
  const updated = await tx.$executeRaw`
    UPDATE "ObjectStorageVersionGcSchedule"
    SET "status" = 'MANUAL_RECOVERY'::"ObjectStorageVersionGcStatus",
        "ownerToken" = NULL,
        "leaseExpiresAt" = NULL,
        "lastErrorCode" = ${input.errorCode.slice(0, 128)},
        "lastErrorMessage" = ${input.errorMessage.slice(0, 1000)},
        "updatedAt" = clock_timestamp()
    WHERE "projectId" = ${lease.projectId}
      AND "expectedOrganizationId" = ${lease.expectedOrganizationId}
      AND "status" = 'CLAIMED'
      AND "ownerToken" = ${lease.ownerToken}
      AND "fencingToken" = ${lease.fencingToken}
      AND "lastOperationId" = ${lease.operationId}
  `;
  if (updated !== 1) {
    throw versionGcError('OBJECT_STORAGE_VERSION_GC_SCHEDULE_FENCE_LOST', 'Version GC schedule fence changed');
  }
}

export async function deferPendingObjectStorageVersionGcSchedule(
  tx: Tx,
  input: {
    candidate: ObjectStorageVersionGcScheduleCandidate;
    nextAttemptAt: Date;
    errorCode?: string;
    errorMessage?: string;
  },
): Promise<void> {
  const updated = await tx.$executeRaw`
    UPDATE "ObjectStorageVersionGcSchedule"
    SET "notBefore" = GREATEST("notBefore", ${input.nextAttemptAt}),
        "nextAttemptAt" = ${input.nextAttemptAt},
        "lastErrorCode" = ${input.errorCode ?? null},
        "lastErrorMessage" = ${input.errorMessage?.slice(0, 1000) ?? null},
        "updatedAt" = clock_timestamp()
    WHERE "projectId" = ${input.candidate.projectId}
      AND "expectedOrganizationId" = ${input.candidate.expectedOrganizationId}
      AND "status" = 'PENDING'
      AND "fencingToken" = ${input.candidate.fencingToken}
  `;
  if (updated !== 1) {
    throw versionGcError('OBJECT_STORAGE_VERSION_GC_SCHEDULE_FENCE_LOST', 'Version GC schedule fence changed');
  }
}

export async function deletePendingObjectStorageVersionGcSchedule(
  tx: Tx,
  candidate: ObjectStorageVersionGcScheduleCandidate,
): Promise<void> {
  const deleted = await tx.$executeRaw`
    DELETE FROM "ObjectStorageVersionGcSchedule"
    WHERE "projectId" = ${candidate.projectId}
      AND "expectedOrganizationId" = ${candidate.expectedOrganizationId}
      AND "status" = 'PENDING'
      AND "fencingToken" = ${candidate.fencingToken}
  `;
  if (deleted !== 1) {
    throw versionGcError('OBJECT_STORAGE_VERSION_GC_SCHEDULE_FENCE_LOST', 'Version GC schedule fence changed');
  }
}

export async function quarantinePendingObjectStorageVersionGcSchedule(
  tx: Tx,
  candidate: ObjectStorageVersionGcScheduleCandidate,
  input: { errorCode: string; errorMessage: string },
): Promise<void> {
  const updated = await tx.$executeRaw`
    UPDATE "ObjectStorageVersionGcSchedule"
    SET "status" = 'MANUAL_RECOVERY'::"ObjectStorageVersionGcStatus",
        "ownerToken" = NULL,
        "leaseExpiresAt" = NULL,
        "lastErrorCode" = ${input.errorCode.slice(0, 128)},
        "lastErrorMessage" = ${input.errorMessage.slice(0, 1000)},
        "updatedAt" = clock_timestamp()
    WHERE "projectId" = ${candidate.projectId}
      AND "expectedOrganizationId" = ${candidate.expectedOrganizationId}
      AND "status" = 'PENDING'
      AND "fencingToken" = ${candidate.fencingToken}
  `;
  if (updated !== 1) {
    throw versionGcError('OBJECT_STORAGE_VERSION_GC_SCHEDULE_FENCE_LOST', 'Version GC schedule fence changed');
  }
}

function canonicalReferences(
  references: readonly ObjectStorageGenerationReference[],
): ObjectStorageGenerationReference[] {
  const canonical = references
    .map((reference) => {
      if (
        typeof reference.key !== 'string' ||
        reference.key.length < 1 ||
        reference.key.length > 1024 ||
        typeof reference.generation !== 'string' ||
        reference.generation.length < 1 ||
        reference.generation.length > 255
      ) {
        throw versionGcError('OBJECT_STORAGE_VERSION_GC_REFERENCE_INVALID', 'Generation reference is invalid');
      }
      return { ...reference };
    })
    .sort((left, right) => left.key.localeCompare(right.key) || left.generation.localeCompare(right.generation));
  const unique = new Map(canonical.map((reference) => [referenceKey(reference), reference]));
  return [...unique.values()];
}

function referenceKey(reference: ObjectStorageGenerationReference): string {
  return `${reference.key}\u0000${reference.generation}`;
}

export function objectStorageGenerationReferenceDigest(
  references: readonly ObjectStorageGenerationReference[],
): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalReferences(references)))
    .digest('hex');
}

export function activeObjectStorageGenerationReferences(
  sourceInventories: readonly unknown[],
): ObjectStorageGenerationReference[] {
  const references: ObjectStorageGenerationReference[] = [];
  for (const raw of sourceInventories) {
    const inventory = parseObjectStorageInventory(raw);
    if (!inventory) {
      throw versionGcError('OBJECT_STORAGE_VERSION_GC_SHARE_INVENTORY_INVALID', 'Active share inventory is invalid');
    }
    for (const object of inventory.objects) {
      if (!object.generation) {
        throw versionGcError(
          'OBJECT_STORAGE_VERSION_GC_SHARE_GENERATION_MISSING',
          'Active share inventory has no immutable generation',
        );
      }
      references.push({ key: object.key, generation: object.generation });
    }
  }
  return canonicalReferences(references);
}

function providerGenerations(result: ListObjectsResult): ObjectStoragePinnedGeneration[] {
  return result.objects
    .map((object) => {
      if (!object.generation) {
        throw versionGcError(
          'OBJECT_STORAGE_VERSION_GC_GENERATION_INSPECTION_REQUIRED',
          'Provider generation history contains an unpinned object',
        );
      }
      return {
        key: object.key,
        size: object.size,
        generation: object.generation,
        contentHash: object.contentHash,
      };
    })
    .sort((left, right) => left.key.localeCompare(right.key) || left.generation.localeCompare(right.generation));
}

export function planObjectStorageVersionGc(input: {
  live: ListObjectsResult;
  versions: ListObjectsResult;
  activeReferences: readonly ObjectStorageGenerationReference[];
  maxCandidates?: number;
}): ObjectStorageVersionGcPlan {
  const requestedMax = input.maxCandidates ?? OBJECT_STORAGE_VERSION_GC_MAX_CANDIDATES;
  if (!Number.isInteger(requestedMax) || requestedMax < 1) {
    throw versionGcError(
      'OBJECT_STORAGE_VERSION_GC_LIMIT_INVALID',
      'Version GC candidate limit must be a positive integer',
    );
  }
  const maxCandidates = Math.min(requestedMax, OBJECT_STORAGE_VERSION_GC_MAX_CANDIDATES);
  const live = providerGenerations(input.live);
  const versions = providerGenerations(input.versions);
  if (new Set(versions.map(referenceKey)).size !== versions.length) {
    throw versionGcError(
      'OBJECT_STORAGE_VERSION_GC_PROVIDER_HISTORY_INVALID',
      'Provider generation history contains duplicate identities',
    );
  }
  const activeReferences = canonicalReferences(input.activeReferences);
  const versionKeys = new Set(versions.map(referenceKey));
  for (const reference of activeReferences) {
    if (!versionKeys.has(referenceKey(reference))) {
      throw versionGcError(
        'OBJECT_STORAGE_VERSION_GC_ACTIVE_REFERENCE_MISSING',
        'An active share generation is missing from provider history',
      );
    }
  }
  const currentGenerations = canonicalReferences(live);
  const retained = new Set([...activeReferences, ...currentGenerations].map(referenceKey));
  const allCandidates = versions.filter((version) => !retained.has(referenceKey(version)));
  const candidates = allCandidates.slice(0, maxCandidates);
  return {
    candidates,
    candidateDigest: objectStoragePinnedGenerationDigest(candidates),
    activeReferences,
    activeReferenceDigest: objectStorageGenerationReferenceDigest(activeReferences),
    currentGenerations,
    currentGenerationDigest: objectStorageGenerationReferenceDigest(currentGenerations),
    remainingCandidateCount: allCandidates.length - candidates.length,
    disableVersioningWhenComplete: activeReferences.length === 0 && allCandidates.length === candidates.length,
  };
}

export async function verifyObjectStorageVersionGc(input: {
  storage: ObjectStorage;
  projectId: string;
  candidates: readonly ObjectStoragePinnedGeneration[];
  activeReferences: readonly ObjectStorageGenerationReference[];
  expectedCurrentGenerationDigest: string;
  disableVersioningWhenComplete: boolean;
  assertLease: () => Promise<void>;
}): Promise<{ evidence: ObjectStorageJsonObject; result: ObjectStorageJsonObject }> {
  if (!input.storage.listObjectVersions) {
    throw versionGcError(
      'OBJECT_STORAGE_VERSION_GC_INSPECTION_REQUIRED',
      'Object generation history cannot be inspected',
    );
  }
  await input.assertLease();
  const [live, versions] = await Promise.all([
    input.storage.listObjects(input.projectId),
    input.storage.listObjectVersions(input.projectId),
  ]);
  const providerVersionRows = providerGenerations(versions);
  const remaining = new Set(providerVersionRows.map(referenceKey));
  for (const candidate of canonicalizeObjectStoragePinnedGenerations(input.candidates)) {
    if (remaining.has(referenceKey(candidate))) {
      throw versionGcError('OBJECT_STORAGE_VERSION_GC_DELETE_INCOMPLETE', 'A collected generation still exists');
    }
  }
  const activeReferences = canonicalReferences(input.activeReferences);
  for (const reference of activeReferences) {
    if (!remaining.has(referenceKey(reference))) {
      throw versionGcError(
        'OBJECT_STORAGE_VERSION_GC_ACTIVE_REFERENCE_MISSING',
        'An active share generation disappeared during collection',
      );
    }
  }
  const currentGenerationDigest = objectStorageGenerationReferenceDigest(providerGenerations(live));
  if (currentGenerationDigest !== input.expectedCurrentGenerationDigest) {
    throw versionGcError(
      'OBJECT_STORAGE_VERSION_GC_CURRENT_GENERATION_CHANGED',
      'Current provider generations changed during collection',
    );
  }

  const retained = new Set([...activeReferences.map(referenceKey), ...providerGenerations(live).map(referenceKey)]);
  const remainingUnreferenced = providerVersionRows.filter((generation) => !retained.has(referenceKey(generation)));
  if (input.disableVersioningWhenComplete && remainingUnreferenced.length > 0) {
    throw versionGcError(
      'OBJECT_STORAGE_VERSION_GC_DELETE_INCOMPLETE',
      'Unreferenced provider generations remain after collection',
    );
  }

  let versioningEnabled = await input.storage.bucketVersioningEnabled?.(input.projectId);
  if (versioningEnabled === undefined) {
    throw versionGcError(
      'OBJECT_STORAGE_VERSION_GC_VERSIONING_INSPECTION_REQUIRED',
      'Bucket versioning cannot be inspected',
    );
  }
  if (input.disableVersioningWhenComplete) {
    if (!input.storage.setBucketVersioningEnabled) {
      throw versionGcError(
        'OBJECT_STORAGE_VERSION_GC_VERSIONING_MUTATION_REQUIRED',
        'Bucket versioning cannot be disabled safely',
      );
    }
    await input.assertLease();
    const disabled = await input.storage.setBucketVersioningEnabled(input.projectId, false, input.assertLease);
    versioningEnabled = disabled.enabled;
    if (versioningEnabled) {
      throw versionGcError(
        'OBJECT_STORAGE_VERSION_GC_VERSIONING_DISABLE_INCOMPLETE',
        'Bucket versioning is still enabled',
      );
    }
  } else if (!versioningEnabled) {
    throw versionGcError(
      'OBJECT_STORAGE_VERSION_GC_VERSIONING_LOST',
      'Active share retention requires bucket versioning',
    );
  }
  await input.assertLease();
  const candidateDigest = objectStoragePinnedGenerationDigest(input.candidates);
  const activeReferenceDigest = objectStorageGenerationReferenceDigest(activeReferences);
  return {
    evidence: {
      verifier: 'api-object-storage-version-gc-v1',
      candidatesAbsent: true,
      candidateCount: input.candidates.length,
      candidateDigest,
      activeReferencesPresent: true,
      activeReferenceDigest,
      currentGenerationDigest,
      versioningEnabled,
      remainingUnreferencedCount: remainingUnreferenced.length,
    },
    result: {
      schemaVersion: 'object-storage-version-gc-v1',
      deletedOrAbsentCount: input.candidates.length,
      candidateDigest,
      retainedReferenceDigest: activeReferenceDigest,
      versioningEnabled,
    },
  };
}
