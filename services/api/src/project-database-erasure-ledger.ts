import { Prisma } from '@vibecore/database';

import { assertObjectStorageOperationFence, type ObjectStorageOperationLease } from './object-storage-operation.js';
import {
  buildProjectDatabaseErasurePlan,
  type ProjectDatabaseErasureEffects,
  type ProjectDatabaseErasureFenceContext,
  type ProjectDatabaseErasurePlan,
  type ProjectDatabaseErasureReceipt,
} from './project-database-erasure.js';
import type { DatabaseTier } from './database-provisioner.js';

type Tx = Prisma.TransactionClient;

export interface ProjectDatabaseErasureConfiguration {
  tier: DatabaseTier;
  sharedClusterName?: string;
  backupBucket: string;
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
    tier: plan.tier,
    sharedClusterName: plan.sharedClusterName,
    backupBucket: plan.backupBucket,
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

  return {
    kubernetesResourcesDeleted: acknowledgedCount('KUBERNETES_PURGE', 'deleted'),
    sharedTenantsErased: acknowledgedCount('SHARED_SQL_PURGE', 'erased'),
    backupGenerationsDeleted: acknowledgedCount('BACKUP_PREFIX_PURGE', 'deletedGenerations'),
  };
}

function parseStoredReceipt(row: StoredPlanRow, value: unknown): ProjectDatabaseErasureReceipt {
  const receipt = asJsonObject(value, 'database erasure receipt');
  const effects = asJsonObject(receipt.effects, 'database erasure receipt effects');
  const proof = asJsonObject(receipt.proof, 'database erasure receipt proof');
  const plan = parseStoredPlan(row);
  const expectedEffects = acknowledgedEffects(row);
  const expectedProof = {
    kubernetesNamespace: 'project-databases',
    kubernetesAbsent: true,
    sharedTenantsAbsent: true,
    backupBucket: plan.backupBucket,
    backupPrefix: plan.backupPrefix,
    backupGenerationsAbsent: true,
  };
  const verifiedAt = typeof receipt.verifiedAt === 'string' ? new Date(receipt.verifiedAt) : undefined;

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
    receipt.schemaVersion !== 1 ||
    receipt.operationId !== row.operationId ||
    receipt.projectId !== row.projectId ||
    receipt.organizationId !== row.organizationId ||
    receipt.inventorySha256 !== row.inventorySha256 ||
    !verifiedAt ||
    !Number.isFinite(verifiedAt.getTime()) ||
    verifiedAt.toISOString() !== receipt.verifiedAt ||
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

/** Capture every relational database identity while the delete lease is live. */
export async function captureProjectDatabaseErasurePlan(
  tx: Tx,
  lease: ObjectStorageOperationLease,
  input: {
    projectId: string;
    expectedOrganizationId: string;
    configuration: ProjectDatabaseErasureConfiguration;
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
    }>
  >`
    SELECT
      "id", "projectId", "organizationId", "environment", "status"::text AS "status", "engine", "region",
      "sizeBytes", "retentionDays", "pitrEnabled"
    FROM "DatabaseInstance"
    WHERE "projectId" = ${input.projectId}
    ORDER BY "environment", "id"
    FOR SHARE
  `;
  const instanceIds = instances.map(({ id }) => id);
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
    schemaVersion: 1,
    operationId: lease.operationId,
    projectId: input.projectId,
    organizationId: input.expectedOrganizationId,
    capturedAt: capturedAt.toISOString(),
    tier: input.configuration.tier,
    sharedClusterName: input.configuration.sharedClusterName,
    backupBucket: input.configuration.backupBucket,
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
      sameJson(asJsonObject(row.receipt, 'database erasure receipt').proof, stageEvidence.proof)
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
