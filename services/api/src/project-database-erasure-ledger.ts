import { Prisma } from '@vibecore/database';

import { assertObjectStorageOperationFence, type ObjectStorageOperationLease } from './object-storage-operation.js';
import {
  buildProjectDatabaseErasurePlan,
  type ProjectDatabaseErasureEffects,
  type ProjectDatabaseErasureFenceContext,
  type ProjectDatabaseLegacyAuthorityResolution,
  type ProjectDatabaseErasurePlan,
  type ProjectDatabaseErasureReceipt,
} from './project-database-erasure.js';

type Tx = Prisma.TransactionClient;

export interface ProjectDatabaseLegacyAuthorityRequest {
  id: string;
  environment: 'development' | 'production';
  retentionDays: number;
}

interface StoredPlanRow {
  operationId: string;
  projectId: string;
  organizationId: string;
  ownershipEpoch: number;
  inventorySha256: string;
  plan: unknown;
  stage: string;
  evidence: unknown;
  receipt: unknown | null;
}

const STAGE_RANK = new Map(
  [
    'INVENTORY_BOUND',
    'KUBERNETES_PURGE',
    'SHARED_SQL_PURGE',
    'BACKUP_PREFIX_PURGE',
    'FINAL_VERIFICATION',
    'VERIFIED',
  ].map((stage, index) => [stage, index]),
);

function ledgerError(code: string, message: string, statusCode = 409): Error {
  return Object.assign(new Error(message), { code, statusCode });
}

function asJsonObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw ledgerError('PROJECT_DATABASE_ERASURE_LEDGER_CORRUPT', `${field} is not an object`, 500);
  }
  return value as Record<string, unknown>;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function parseStoredPlan(row: StoredPlanRow): ProjectDatabaseErasurePlan {
  const plan = asJsonObject(row.plan, 'database erasure plan') as unknown as ProjectDatabaseErasurePlan;
  const rebound = buildProjectDatabaseErasurePlan({
    schemaVersion: plan.schemaVersion,
    operationId: plan.operationId,
    projectId: plan.projectId,
    organizationId: plan.organizationId,
    capturedAt: plan.capturedAt,
    instances: plan.instances,
  });
  if (
    rebound.operationId !== row.operationId ||
    rebound.projectId !== row.projectId ||
    rebound.organizationId !== row.organizationId ||
    rebound.inventorySha256 !== row.inventorySha256 ||
    !sameJson(rebound, plan)
  ) {
    throw ledgerError('PROJECT_DATABASE_ERASURE_LEDGER_CORRUPT', 'Database erasure plan identity changed', 500);
  }
  return plan;
}

function acknowledgedEffects(row: StoredPlanRow): ProjectDatabaseErasureEffects {
  const evidence = asJsonObject(row.evidence, 'database erasure evidence');
  const acknowledgedCount = (stage: string, field: string): number => {
    if (evidence[stage] === undefined) return 0;
    const count = asJsonObject(evidence[stage], `database erasure ${stage} evidence`)[field];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
      throw ledgerError(
        'PROJECT_DATABASE_ERASURE_LEDGER_CORRUPT',
        `Database erasure ${stage}.${field} is invalid`,
        500,
      );
    }
    return count;
  };
  const kubernetesEvidence =
    evidence.KUBERNETES_PURGE === undefined
      ? undefined
      : asJsonObject(evidence.KUBERNETES_PURGE, 'database erasure KUBERNETES_PURGE evidence');
  const persistentVolumeClaims = kubernetesEvidence?.persistentVolumeClaims;
  if (kubernetesEvidence !== undefined && !Array.isArray(persistentVolumeClaims)) {
    throw ledgerError(
      'PROJECT_DATABASE_ERASURE_LEDGER_CORRUPT',
      'Database erasure PVC candidate inventory is missing',
      500,
    );
  }
  const pvcIdentities = new Set<string>();
  const persistentVolumeClaimList: unknown[] = Array.isArray(persistentVolumeClaims) ? persistentVolumeClaims : [];
  const normalizedPersistentVolumeClaims = persistentVolumeClaimList.map((candidate) => {
    const value = asJsonObject(candidate, 'database erasure PVC candidate');
    if (
      value.namespace !== 'project-databases' ||
      typeof value.pvcName !== 'string' ||
      !value.pvcName ||
      typeof value.expectedPvcUid !== 'string' ||
      !value.expectedPvcUid
    ) {
      throw ledgerError('PROJECT_DATABASE_ERASURE_LEDGER_CORRUPT', 'Database erasure PVC candidate is invalid', 500);
    }
    const identity = `${value.namespace}/${value.pvcName}`;
    if (pvcIdentities.has(identity)) {
      throw ledgerError('PROJECT_DATABASE_ERASURE_LEDGER_CORRUPT', 'Database erasure PVC candidate is duplicated', 500);
    }
    pvcIdentities.add(identity);
    return {
      namespace: 'project-databases' as const,
      pvcName: value.pvcName,
      expectedPvcUid: value.expectedPvcUid,
    };
  });

  return {
    kubernetesResourcesDeleted: acknowledgedCount('KUBERNETES_PURGE', 'deleted'),
    sharedTenantsErased: acknowledgedCount('SHARED_SQL_PURGE', 'erased'),
    backupGenerationsDeleted: acknowledgedCount('BACKUP_PREFIX_PURGE', 'deletedGenerations'),
    persistentVolumeClaims: normalizedPersistentVolumeClaims,
  };
}

function parseStoredReceipt(row: StoredPlanRow, value: unknown): ProjectDatabaseErasureReceipt {
  const receipt = asJsonObject(value, 'database erasure receipt');
  const effects = asJsonObject(receipt.effects, 'database erasure receipt effects');
  const proof = asJsonObject(receipt.proof, 'database erasure receipt proof');
  const plan = parseStoredPlan(row);
  const expectedEffects = acknowledgedEffects(row);
  const verifiedAt = typeof receipt.verifiedAt === 'string' ? new Date(receipt.verifiedAt) : undefined;
  const sharedRetentionProof = Array.isArray(proof.sharedRetentionBarriers)
    ? proof.sharedRetentionBarriers.map((value) => asJsonObject(value, 'shared retention barrier proof'))
    : undefined;
  const sharedRetentionValid =
    sharedRetentionProof?.length === plan.sharedRetentionBarriers.length &&
    sharedRetentionProof.every((entry, index) => {
      const expected = plan.sharedRetentionBarriers[index];
      const satisfiedAt = typeof entry.satisfiedAt === 'string' ? new Date(entry.satisfiedAt) : undefined;
      return (
        expected !== undefined &&
        sameJson(Object.keys(entry).sort(), ['clusterName', 'notBefore', 'satisfiedAt']) &&
        entry.clusterName === expected.clusterName &&
        entry.notBefore === expected.notBefore &&
        satisfiedAt !== undefined &&
        Number.isFinite(satisfiedAt.getTime()) &&
        satisfiedAt.toISOString() === entry.satisfiedAt &&
        satisfiedAt.getTime() >= Date.parse(expected.notBefore) &&
        verifiedAt !== undefined &&
        satisfiedAt.getTime() <= verifiedAt.getTime()
      );
    });
  const expectedProof = {
    kubernetesNamespace: 'project-databases',
    kubernetesAbsent: true,
    sharedTenantsAbsent: true,
    backupTargets: plan.backupTargets.map((target) => ({
      ...target,
      generationsAbsent: true,
      softDeletedAbsent: true,
    })),
    sharedRetentionBarriers: sharedRetentionProof,
    backupGenerationsAbsent: true,
  };

  if (
    !sameJson(Object.keys(receipt).sort(), [
      'effects',
      'inventorySha256',
      'operationId',
      'organizationId',
      'projectId',
      'proof',
      'schemaVersion',
      'verifiedAt',
    ]) ||
    receipt.schemaVersion !== 2 ||
    receipt.operationId !== row.operationId ||
    receipt.projectId !== row.projectId ||
    receipt.organizationId !== row.organizationId ||
    receipt.inventorySha256 !== row.inventorySha256 ||
    !verifiedAt ||
    !Number.isFinite(verifiedAt.getTime()) ||
    verifiedAt.toISOString() !== receipt.verifiedAt ||
    !sharedRetentionValid ||
    !sameJson(effects, expectedEffects) ||
    !sameJson(proof, expectedProof)
  ) {
    throw ledgerError(
      'PROJECT_DATABASE_ERASURE_RECEIPT_INVALID',
      'Database erasure receipt does not prove this immutable tenant plan',
      500,
    );
  }

  return receipt as unknown as ProjectDatabaseErasureReceipt;
}

async function readStoredPlan(tx: Tx, operationId: string, forUpdate = false): Promise<StoredPlanRow | undefined> {
  const rows = await tx.$queryRaw<StoredPlanRow[]>(Prisma.sql`
    SELECT
      "operationId", "projectId", "organizationId", "ownershipEpoch", "inventorySha256",
      "plan", "stage"::text AS "stage", "evidence", "receipt"
    FROM "ProjectDatabaseErasurePlan"
    WHERE "operationId" = ${operationId}
    ${forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty}
  `);
  return rows[0];
}

export async function readLegacyProjectDatabaseAuthorityRequests(
  tx: Tx,
  lease: ObjectStorageOperationLease,
  input: { projectId: string; expectedOrganizationId: string },
): Promise<ProjectDatabaseLegacyAuthorityRequest[]> {
  await assertObjectStorageOperationFence(tx, lease);
  const rows = await tx.$queryRaw<
    Array<{ id: string; environment: string; retentionDays: number; organizationId: string }>
  >(Prisma.sql`
    SELECT "id", "environment", "retentionDays", "organizationId"
    FROM "DatabaseInstance"
    WHERE "projectId" = ${input.projectId}
      AND "physicalAuthorityAt" IS NULL
    ORDER BY "environment", "id"
    FOR SHARE
  `);
  if (
    rows.some(
      (row) =>
        row.organizationId !== input.expectedOrganizationId ||
        (row.environment !== 'development' && row.environment !== 'production'),
    )
  ) {
    throw ledgerError('PROJECT_DATABASE_ERASURE_SCOPE_MISMATCH', 'Legacy database authority escaped tenant scope');
  }
  return rows.map(({ id, environment, retentionDays }) => ({
    id,
    environment: environment as 'development' | 'production',
    retentionDays,
  }));
}

export async function persistLegacyProjectDatabaseAuthorities(
  tx: Tx,
  lease: ObjectStorageOperationLease,
  input: {
    projectId: string;
    expectedOrganizationId: string;
    requests: readonly ProjectDatabaseLegacyAuthorityRequest[];
    resolutions: readonly ProjectDatabaseLegacyAuthorityResolution[];
  },
): Promise<void> {
  await assertObjectStorageOperationFence(tx, lease);
  const resolutionById = new Map(input.resolutions.map((resolution) => [resolution.instanceId, resolution]));
  if (
    resolutionById.size !== input.resolutions.length ||
    input.requests.length !== input.resolutions.length ||
    input.requests.some(({ id }) => !resolutionById.has(id))
  ) {
    throw ledgerError('PROJECT_DATABASE_PHYSICAL_AUTHORITY_INCOMPLETE', 'Legacy CNPG authority set is incomplete');
  }
  const clock = await tx.$queryRaw<Array<{ capturedAt: Date }>>`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `;
  if (!(clock[0]?.capturedAt instanceof Date)) {
    throw ledgerError('PROJECT_DATABASE_ERASURE_DATABASE_CLOCK_UNAVAILABLE', 'Database clock unavailable', 503);
  }
  for (const request of input.requests) {
    const authority = resolutionById.get(request.id)!.authority;
    const safe = (value: string | undefined, field: string, max: number): string | null => {
      const normalized = value?.trim();
      if (value === undefined) return null;
      if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) {
        throw ledgerError('PROJECT_DATABASE_PHYSICAL_AUTHORITY_INVALID', `Invalid ${field}`, 400);
      }
      return normalized;
    };
    const clusterName = safe(authority.clusterName, 'clusterName', 253);
    const databaseCrName = safe(authority.databaseCrName, 'databaseCrName', 253);
    const databaseName = safe(authority.databaseName, 'databaseName', 63);
    const roleName = safe(authority.roleName, 'roleName', 63);
    const backupBucket = safe(authority.backupBucket, 'backupBucket', 222);
    const backupPrefix = safe(authority.backupPrefix, 'backupPrefix', 1024);
    const clusterUid = safe(authority.clusterUid, 'clusterUid', 255);
    const databaseCrUid = safe(authority.databaseCrUid, 'databaseCrUid', 255);
    if (
      !clusterName ||
      !/^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$/.test(clusterName) ||
      !clusterUid ||
      !Number.isInteger(authority.retentionDays) ||
      authority.retentionDays < 0 ||
      authority.retentionDays > 3650 ||
      Boolean(backupBucket) !== Boolean(backupPrefix) ||
      (authority.tier === 'isolated' &&
        (!backupBucket || !backupPrefix || databaseCrName || databaseName || roleName)) ||
      (authority.tier === 'shared' &&
        (!databaseCrName ||
          !/^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$/.test(databaseCrName) ||
          !databaseCrUid ||
          !databaseName ||
          !/^[a-z_][a-z0-9_]{0,62}$/.test(databaseName) ||
          !roleName ||
          !/^[a-z_][a-z0-9_]{0,62}$/.test(roleName))) ||
      (backupBucket !== null && !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(backupBucket)) ||
      (backupPrefix !== null &&
        (!backupPrefix.endsWith('/') || backupPrefix.startsWith('/') || backupPrefix.split('/').includes('..')))
    ) {
      throw ledgerError('PROJECT_DATABASE_PHYSICAL_AUTHORITY_INVALID', 'Legacy CNPG authority is incomplete', 409);
    }
    const updated = await tx.$executeRaw(Prisma.sql`
      UPDATE "DatabaseInstance"
      SET "physicalTier" = ${authority.tier === 'shared' ? 'SHARED' : 'ISOLATED'}::"DatabasePhysicalTier",
          "physicalClusterName" = ${clusterName},
          "physicalDatabaseCrName" = ${databaseCrName},
          "physicalDatabaseName" = ${databaseName},
          "physicalRoleName" = ${roleName},
          "physicalBackupBucket" = ${backupBucket},
          "physicalBackupPrefix" = ${backupPrefix},
          "physicalClusterUid" = ${clusterUid},
          "physicalDatabaseCrUid" = ${databaseCrUid},
          "physicalRetentionDays" = ${authority.retentionDays},
          "physicalAuthorityAt" = ${clock[0].capturedAt},
          "updatedAt" = clock_timestamp()
      WHERE "id" = ${request.id}
        AND "projectId" = ${input.projectId}
        AND "organizationId" = ${input.expectedOrganizationId}
        AND "environment" = ${request.environment}
        AND "physicalAuthorityAt" IS NULL
    `);
    if (updated !== 1) {
      throw ledgerError('PROJECT_DATABASE_PHYSICAL_AUTHORITY_FENCE_LOST', 'Legacy CNPG authority changed');
    }
  }
  await assertObjectStorageOperationFence(tx, lease);
}

/** Capture every relational database identity while the delete lease is live. */
export async function captureProjectDatabaseErasurePlan(
  tx: Tx,
  lease: ObjectStorageOperationLease,
  input: {
    projectId: string;
    expectedOrganizationId: string;
  },
): Promise<ProjectDatabaseErasurePlan> {
  await assertObjectStorageOperationFence(tx, lease);
  const existing = await readStoredPlan(tx, lease.operationId, true);
  if (existing) {
    const plan = parseStoredPlan(existing);
    if (plan.projectId !== input.projectId || plan.organizationId !== input.expectedOrganizationId) {
      throw ledgerError('PROJECT_DATABASE_ERASURE_SCOPE_MISMATCH', 'Database erasure tenant scope changed');
    }
    return plan;
  }

  const projects = await tx.$queryRaw<
    Array<{ id: string; organizationId: string; ownershipEpoch: number; permanentDeletionStartedAt: Date | null }>
  >`
    SELECT "id", "organizationId", "ownershipEpoch", "permanentDeletionStartedAt"
    FROM "Project"
    WHERE "id" = ${input.projectId}
    FOR UPDATE
  `;
  const project = projects[0];
  if (
    !project ||
    project.organizationId !== input.expectedOrganizationId ||
    project.permanentDeletionStartedAt === null
  ) {
    throw ledgerError('PROJECT_DATABASE_ERASURE_SCOPE_MISMATCH', 'Database erasure project fence changed');
  }

  const instances = await tx.$queryRaw<
    Array<{
      id: string;
      projectId: string;
      organizationId: string;
      environment: string;
      status: string;
      engine: string;
      region: string | null;
      sizeBytes: bigint;
      retentionDays: number;
      pitrEnabled: boolean;
      physicalTier: 'SHARED' | 'ISOLATED' | null;
      physicalClusterName: string | null;
      physicalDatabaseCrName: string | null;
      physicalDatabaseName: string | null;
      physicalRoleName: string | null;
      physicalBackupBucket: string | null;
      physicalBackupPrefix: string | null;
      physicalClusterUid: string | null;
      physicalDatabaseCrUid: string | null;
      physicalRetentionDays: number | null;
      physicalAuthorityAt: Date | null;
    }>
  >`
    SELECT
      "id", "projectId", "organizationId", "environment", "status"::text AS "status", "engine", "region",
      "sizeBytes", "retentionDays", "pitrEnabled", "physicalTier"::text AS "physicalTier",
      "physicalClusterName", "physicalDatabaseCrName", "physicalDatabaseName", "physicalRoleName",
      "physicalBackupBucket", "physicalBackupPrefix", "physicalClusterUid", "physicalDatabaseCrUid",
      "physicalRetentionDays", "physicalAuthorityAt"
    FROM "DatabaseInstance"
    WHERE "projectId" = ${input.projectId}
    ORDER BY "environment", "id"
    FOR SHARE
  `;
  const instanceIds = instances.map(({ id }) => id);
  if (
    instances.some(
      (instance) =>
        !instance.physicalTier ||
        !instance.physicalClusterName ||
        instance.physicalRetentionDays === null ||
        !instance.physicalAuthorityAt,
    )
  ) {
    throw ledgerError(
      'PROJECT_DATABASE_PHYSICAL_AUTHORITY_RECONCILIATION_REQUIRED',
      'Every DatabaseInstance requires immutable physical authority before erasure capture',
      409,
    );
  }
  const snapshots = instanceIds.length
    ? await tx.$queryRaw<
        Array<{
          id: string;
          databaseInstanceId: string;
          kind: string;
          lsn: string | null;
          storageKey: string | null;
          sizeBytes: bigint;
          createdAt: Date;
          expiresAt: Date | null;
        }>
      >(Prisma.sql`
        SELECT "id", "databaseInstanceId", "kind", "lsn", "storageKey", "sizeBytes", "createdAt", "expiresAt"
        FROM "DatabaseSnapshot"
        WHERE "databaseInstanceId" IN (${Prisma.join(instanceIds)})
        ORDER BY "databaseInstanceId", "id"
        FOR SHARE
      `)
    : [];
  const restores = instanceIds.length
    ? await tx.$queryRaw<
        Array<{
          id: string;
          databaseInstanceId: string;
          snapshotId: string | null;
          targetTimestamp: Date | null;
          status: string;
          createdAt: Date;
          startedAt: Date | null;
          completedAt: Date | null;
        }>
      >(Prisma.sql`
        SELECT
          "id", "databaseInstanceId", "snapshotId", "targetTimestamp", "status"::text AS "status",
          "createdAt", "startedAt", "completedAt"
        FROM "DatabaseRestore"
        WHERE "databaseInstanceId" IN (${Prisma.join(instanceIds)})
        ORDER BY "databaseInstanceId", "id"
        FOR SHARE
      `)
    : [];
  const safeNumber = (value: bigint, field: string): number => {
    const converted = Number(value);
    if (!Number.isSafeInteger(converted) || converted < 0) {
      throw ledgerError(
        'PROJECT_DATABASE_ERASURE_INVENTORY_UNREPRESENTABLE',
        `${field} exceeds safe integer range`,
        500,
      );
    }
    return converted;
  };
  const capturedAtRows = await tx.$queryRaw<Array<{ capturedAt: Date }>>`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `;
  const capturedAt = capturedAtRows[0]?.capturedAt;
  if (!(capturedAt instanceof Date)) {
    throw ledgerError('PROJECT_DATABASE_ERASURE_DATABASE_CLOCK_UNAVAILABLE', 'Database clock unavailable', 503);
  }
  const plan = buildProjectDatabaseErasurePlan({
    schemaVersion: 2,
    operationId: lease.operationId,
    projectId: input.projectId,
    organizationId: input.expectedOrganizationId,
    capturedAt: capturedAt.toISOString(),
    instances: instances.map((instance) => ({
      id: instance.id,
      projectId: instance.projectId,
      organizationId: instance.organizationId,
      environment: instance.environment as 'development' | 'production',
      status: instance.status as 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'FAILED' | 'DELETED',
      engine: instance.engine,
      region: instance.region ?? undefined,
      sizeBytes: safeNumber(instance.sizeBytes, 'DatabaseInstance.sizeBytes'),
      retentionDays: instance.retentionDays,
      pitrEnabled: instance.pitrEnabled,
      physicalAuthority: {
        tier: instance.physicalTier === 'SHARED' ? 'shared' : 'isolated',
        clusterName: instance.physicalClusterName!,
        databaseCrName: instance.physicalDatabaseCrName ?? undefined,
        databaseName: instance.physicalDatabaseName ?? undefined,
        roleName: instance.physicalRoleName ?? undefined,
        backupBucket: instance.physicalBackupBucket ?? undefined,
        backupPrefix: instance.physicalBackupPrefix ?? undefined,
        clusterUid: instance.physicalClusterUid ?? undefined,
        databaseCrUid: instance.physicalDatabaseCrUid ?? undefined,
        retentionDays: instance.physicalRetentionDays!,
        capturedAt: instance.physicalAuthorityAt!.toISOString(),
      },
      snapshots: snapshots
        .filter((snapshot) => snapshot.databaseInstanceId === instance.id)
        .map((snapshot) => ({
          id: snapshot.id,
          kind: snapshot.kind as 'auto' | 'manual',
          lsn: snapshot.lsn ?? undefined,
          storageKey: snapshot.storageKey ?? undefined,
          sizeBytes: safeNumber(snapshot.sizeBytes, 'DatabaseSnapshot.sizeBytes'),
          createdAt: snapshot.createdAt.toISOString(),
          expiresAt: snapshot.expiresAt?.toISOString(),
        })),
      restores: restores
        .filter((restore) => restore.databaseInstanceId === instance.id)
        .map((restore) => ({
          id: restore.id,
          snapshotId: restore.snapshotId ?? undefined,
          targetTimestamp: restore.targetTimestamp?.toISOString(),
          status: restore.status as 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED',
          createdAt: restore.createdAt.toISOString(),
          startedAt: restore.startedAt?.toISOString(),
          completedAt: restore.completedAt?.toISOString(),
        })),
    })),
  });
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "ProjectDatabaseErasurePlan" (
      "operationId", "projectId", "organizationId", "ownershipEpoch", "inventorySha256",
      "plan", "stage", "evidence", "createdAt", "updatedAt"
    ) VALUES (
      ${lease.operationId}, ${plan.projectId}, ${plan.organizationId}, ${project.ownershipEpoch},
      ${plan.inventorySha256}, ${JSON.stringify(plan)}::jsonb, 'INVENTORY_BOUND'::"ProjectDatabaseErasureStage",
      '{}'::jsonb,
      clock_timestamp(), clock_timestamp()
    )
  `);
  return plan;
}

export async function readProjectDatabaseErasurePlan(
  tx: Tx,
  lease: ObjectStorageOperationLease,
): Promise<ProjectDatabaseErasurePlan> {
  await assertObjectStorageOperationFence(tx, lease);
  const row = await readStoredPlan(tx, lease.operationId);
  if (!row) {
    throw ledgerError('PROJECT_DATABASE_ERASURE_PLAN_MISSING', 'Durable database erasure plan is missing', 503);
  }
  return parseStoredPlan(row);
}

/** Reconstruct only durably acknowledged mutation counts for crash recovery. */
export async function readProjectDatabaseErasureEffects(
  tx: Tx,
  lease: ObjectStorageOperationLease,
): Promise<ProjectDatabaseErasureEffects> {
  await assertObjectStorageOperationFence(tx, lease);
  const row = await readStoredPlan(tx, lease.operationId);
  if (!row) {
    throw ledgerError('PROJECT_DATABASE_ERASURE_PLAN_MISSING', 'Durable database erasure plan is missing', 503);
  }
  parseStoredPlan(row);
  return acknowledgedEffects(row);
}

/** Append a stage proof only while the exact parent deletion lease is live. */
export async function checkpointProjectDatabaseErasure(
  tx: Tx,
  lease: ObjectStorageOperationLease,
  context: ProjectDatabaseErasureFenceContext & { evidence: Readonly<Record<string, unknown>> },
): Promise<void> {
  await assertObjectStorageOperationFence(tx, lease);
  const row = await readStoredPlan(tx, lease.operationId, true);
  if (!row) {
    throw ledgerError('PROJECT_DATABASE_ERASURE_PLAN_MISSING', 'Durable database erasure plan is missing', 503);
  }
  if (
    row.projectId !== context.projectId ||
    row.organizationId !== context.organizationId ||
    row.inventorySha256 !== context.inventorySha256
  ) {
    throw ledgerError('PROJECT_DATABASE_ERASURE_SCOPE_MISMATCH', 'Database erasure checkpoint scope changed');
  }
  const currentRank = STAGE_RANK.get(row.stage);
  const requestedRank = STAGE_RANK.get(context.stage);
  if (currentRank === undefined || requestedRank === undefined) {
    throw ledgerError('PROJECT_DATABASE_ERASURE_LEDGER_CORRUPT', 'Database erasure stage is invalid', 500);
  }
  const existingEvidence = asJsonObject(row.evidence, 'database erasure evidence');
  const stageEvidence: Record<string, unknown> = {
    ...context.evidence,
    ...(context.effect ? { effect: context.effect } : {}),
  };
  if (requestedRank < currentRank) {
    if (!sameJson(existingEvidence[context.stage], stageEvidence)) {
      throw ledgerError('PROJECT_DATABASE_ERASURE_CHECKPOINT_CONFLICT', 'Database erasure checkpoint changed');
    }
    return;
  }
  if (requestedRank === currentRank && existingEvidence[context.stage] !== undefined) {
    if (
      context.stage === 'VERIFIED' &&
      row.receipt !== null &&
      sameJson(asJsonObject(row.receipt, 'database erasure receipt'), stageEvidence)
    ) {
      return;
    }
    if (!sameJson(existingEvidence[context.stage], stageEvidence)) {
      throw ledgerError('PROJECT_DATABASE_ERASURE_CHECKPOINT_CONFLICT', 'Database erasure checkpoint changed');
    }
    return;
  }
  const receipt = context.stage === 'VERIFIED' ? stageEvidence : undefined;
  if (receipt) {
    parseStoredReceipt(row, receipt);
  }
  const updated = await tx.$executeRaw(Prisma.sql`
    UPDATE "ProjectDatabaseErasurePlan"
    SET "stage" = ${context.stage}::"ProjectDatabaseErasureStage",
        "evidence" = "evidence" || jsonb_build_object(${context.stage}::text, ${JSON.stringify(stageEvidence)}::jsonb),
        "receipt" = ${receipt ? JSON.stringify(receipt) : null}::jsonb,
        "verifiedAt" = CASE WHEN ${context.stage}::text = 'VERIFIED' THEN clock_timestamp() ELSE NULL END,
        "updatedAt" = clock_timestamp()
    WHERE "operationId" = ${lease.operationId}
      AND "inventorySha256" = ${context.inventorySha256}
  `);
  if (updated !== 1) {
    throw ledgerError('PROJECT_DATABASE_ERASURE_FENCE_LOST', 'Database erasure checkpoint fence changed');
  }
}

export async function readVerifiedProjectDatabaseErasureReceipt(
  tx: Tx,
  lease: ObjectStorageOperationLease,
): Promise<ProjectDatabaseErasureReceipt> {
  await assertObjectStorageOperationFence(tx, lease);
  const row = await readStoredPlan(tx, lease.operationId);
  if (!row || row.stage !== 'VERIFIED' || row.receipt === null) {
    throw ledgerError('PROJECT_DATABASE_ERASURE_NOT_VERIFIED', 'Managed database absence is not durably verified');
  }
  return parseStoredReceipt(row, row.receipt);
}

export async function assertProjectDatabaseErasureVerified(
  tx: Tx,
  input: { operationId: string; projectId: string; organizationId: string },
): Promise<{ inventorySha256: string; receipt: Record<string, unknown> }> {
  const row = await readStoredPlan(tx, input.operationId, true);
  if (
    !row ||
    row.projectId !== input.projectId ||
    row.organizationId !== input.organizationId ||
    row.stage !== 'VERIFIED' ||
    row.receipt === null
  ) {
    throw ledgerError('PROJECT_DATABASE_ERASURE_NOT_VERIFIED', 'Managed database absence is not durably verified');
  }
  const receipt = parseStoredReceipt(row, row.receipt) as unknown as Record<string, unknown>;
  return { inventorySha256: row.inventorySha256, receipt };
}
