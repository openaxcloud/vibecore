import { randomUUID } from 'node:crypto';

import { type DatabaseClient, Prisma } from '@vibecore/database';

import {
  objectStorageIdempotencyScopeHash,
  objectStorageRequestHash,
  objectStorageScopeHash,
} from '../object-storage-operation.js';
import { buildProjectDatabaseErasurePlan, type ProjectDatabaseErasureReceipt } from '../project-database-erasure.js';
import { projectPermanentDeletionOperationRequest } from '../project-permanent-deletion.js';

interface DatabaseFixtureRow {
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
}

const destructiveFixtureOptIn = 'VIBECORE_ALLOW_DESTRUCTIVE_DATABASE_FIXTURE_ERASURE';

function assertDisposableDatabaseFixtureTarget(): void {
  if (process.env[destructiveFixtureOptIn] !== '1') {
    throw new Error('DATABASE_ERASURE_TEST_FIXTURE_EXPLICIT_OPT_IN_REQUIRED');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_ERASURE_TEST_FIXTURE_DATABASE_URL_REQUIRED');

  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error('DATABASE_ERASURE_TEST_FIXTURE_DATABASE_URL_INVALID');
  }

  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)) {
    throw new Error('DATABASE_ERASURE_TEST_FIXTURE_LOOPBACK_DATABASE_REQUIRED');
  }
}

/**
 * Remove one isolated DatabaseInstance fixture through the same v2 receipt gate
 * that protects production cascades. This is intentionally stricter than a raw
 * test cleanup: it refuses cross-project rows, multiple instances, legacy/null
 * physical authority, snapshots, and restores.
 *
 * The database erasure ledger is append-only, so the synthetic parent operation
 * is terminalized instead of deleted. COMMITTED is outside the active/frozen
 * status set and therefore cannot fence later mutations on the fixture project.
 */
export async function eraseIsolatedDatabaseInstanceFixture(
  prisma: DatabaseClient,
  input: { databaseInstanceId: string; projectId: string; organizationId: string },
): Promise<void> {
  assertDisposableDatabaseFixtureTarget();

  const operationId = `objop_test_${randomUUID()}`;
  const idempotencyKey = `test-database-erasure-${randomUUID()}`;
  const ownerToken = `test-database-erasure-owner:${randomUUID()}`;
  const request = projectPermanentDeletionOperationRequest({
    projectId: input.projectId,
    organizationId: input.organizationId,
    actorUserId: `test-fixture:${operationId}`,
    expectedProjectName: 'database-erasure-test-fixture',
  });
  const requestHash = objectStorageRequestHash(request);
  const scopeHash = objectStorageScopeHash(request.scopes);
  const idempotencyScopeHash = objectStorageIdempotencyScopeHash(request.scopes);

  await prisma.$transaction(async (tx) => {
    const projects = await tx.$queryRaw<Array<{ id: string; organizationId: string; ownershipEpoch: number }>>`
      SELECT "id", "organizationId", "ownershipEpoch"
      FROM "Project"
      WHERE "id" = ${input.projectId}
      FOR UPDATE
    `;
    const project = projects[0];
    if (!project || project.organizationId !== input.organizationId) {
      throw new Error('DATABASE_ERASURE_TEST_FIXTURE_PROJECT_SCOPE_INVALID');
    }

    const instances = await tx.$queryRaw<DatabaseFixtureRow[]>(Prisma.sql`
      SELECT
        "id", "projectId", "organizationId", "environment", "status"::text AS "status", "engine", "region",
        "sizeBytes", "retentionDays", "pitrEnabled", "physicalTier"::text AS "physicalTier",
        "physicalClusterName", "physicalDatabaseCrName", "physicalDatabaseName", "physicalRoleName",
        "physicalBackupBucket", "physicalBackupPrefix", "physicalClusterUid", "physicalDatabaseCrUid",
        "physicalRetentionDays", "physicalAuthorityAt"
      FROM "DatabaseInstance"
      WHERE "projectId" = ${input.projectId}
      ORDER BY "environment", "id"
      FOR UPDATE
    `);
    const instance = instances[0];
    if (
      instances.length !== 1 ||
      !instance ||
      instance.id !== input.databaseInstanceId ||
      instance.projectId !== input.projectId ||
      instance.organizationId !== input.organizationId ||
      (instance.environment !== 'development' && instance.environment !== 'production') ||
      !['PROVISIONING', 'ACTIVE', 'SUSPENDED', 'FAILED', 'DELETED'].includes(instance.status) ||
      instance.physicalTier !== 'ISOLATED' ||
      !instance.physicalClusterName ||
      !instance.physicalBackupBucket ||
      !instance.physicalBackupPrefix ||
      instance.physicalRetentionDays === null ||
      !instance.physicalAuthorityAt
    ) {
      throw new Error('DATABASE_ERASURE_TEST_FIXTURE_INSTANCE_SCOPE_INVALID');
    }

    const childCounts = await tx.$queryRaw<Array<{ snapshots: bigint; restores: bigint }>>`
      SELECT
        (SELECT count(*) FROM "DatabaseSnapshot" WHERE "databaseInstanceId" = ${instance.id}) AS snapshots,
        (SELECT count(*) FROM "DatabaseRestore" WHERE "databaseInstanceId" = ${instance.id}) AS restores
    `;
    if (childCounts[0]?.snapshots !== 0n || childCounts[0]?.restores !== 0n) {
      throw new Error('DATABASE_ERASURE_TEST_FIXTURE_CHILDREN_PRESENT');
    }

    const sizeBytes = Number(instance.sizeBytes);
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
      throw new Error('DATABASE_ERASURE_TEST_FIXTURE_SIZE_INVALID');
    }
    const clock = await tx.$queryRaw<Array<{ now: Date }>>`
      SELECT date_trunc('milliseconds', clock_timestamp()) AS "now"
    `;
    const now = clock[0]?.now;
    if (!(now instanceof Date)) throw new Error('DATABASE_ERASURE_TEST_FIXTURE_CLOCK_UNAVAILABLE');

    const plan = buildProjectDatabaseErasurePlan({
      schemaVersion: 2,
      operationId,
      projectId: instance.projectId,
      organizationId: instance.organizationId,
      capturedAt: now.toISOString(),
      instances: [
        {
          id: instance.id,
          projectId: instance.projectId,
          organizationId: instance.organizationId,
          environment: instance.environment,
          status: instance.status as 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'FAILED' | 'DELETED',
          engine: instance.engine,
          region: instance.region ?? undefined,
          sizeBytes,
          retentionDays: instance.retentionDays,
          pitrEnabled: instance.pitrEnabled,
          physicalAuthority: {
            tier: 'isolated',
            clusterName: instance.physicalClusterName,
            backupBucket: instance.physicalBackupBucket,
            backupPrefix: instance.physicalBackupPrefix,
            clusterUid: instance.physicalClusterUid ?? undefined,
            retentionDays: instance.physicalRetentionDays,
            capturedAt: instance.physicalAuthorityAt.toISOString(),
          },
          snapshots: [],
          restores: [],
        },
      ],
    });
    const receipt: ProjectDatabaseErasureReceipt = {
      schemaVersion: 2,
      operationId,
      projectId: instance.projectId,
      organizationId: instance.organizationId,
      inventorySha256: plan.inventorySha256,
      verifiedAt: now.toISOString(),
      effects: {
        kubernetesResourcesDeleted: 0,
        sharedTenantsErased: 0,
        backupGenerationsDeleted: 0,
        persistentVolumeClaims: [],
      },
      proof: {
        kubernetesNamespace: 'project-databases',
        kubernetesAbsent: true,
        sharedTenantsAbsent: true,
        backupTargets: plan.backupTargets.map((target) => ({
          ...target,
          generationsAbsent: true as const,
          softDeletedAbsent: true as const,
        })),
        sharedRetentionBarriers: [],
        backupGenerationsAbsent: true,
      },
    };
    const evidence = {
      INVENTORY_BOUND: {
        capturedAt: plan.capturedAt,
        instanceCount: 1,
        snapshotCount: 0,
        restoreCount: 0,
      },
      KUBERNETES_PURGE: { deleted: 0, persistentVolumeClaims: [] },
      SHARED_SQL_PURGE: { erased: 0 },
      BACKUP_PREFIX_PURGE: { deletedGenerations: 0 },
      FINAL_VERIFICATION: {
        kubernetesResidueCount: 0,
        backupGenerationResidueCount: 0,
        backupSoftDeletedResidueCount: 0,
        sharedRetentionBarrierCount: 0,
        sharedTenantsAbsent: true,
      },
      VERIFIED: receipt,
    };
    const leaseExpiresAt = new Date(now.getTime() + 60_000);

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "ObjectStorageOperation" (
        "id", "kind", "status", "scopeHash", "idempotencyScopeHash", "idempotencyKey", "requestHash",
        "payload", "preconditions", "ownerToken", "fencingToken", "leaseExpiresAt", "attempts",
        "preparedAt", "effectStartedAt", "verificationStartedAt", "createdAt", "updatedAt"
      ) VALUES (
        ${operationId}, 'PROJECT_PERMANENT_DELETE'::"ObjectStorageOperationKind",
        'VERIFYING'::"ObjectStorageOperationStatus", ${scopeHash}, ${idempotencyScopeHash}, ${idempotencyKey},
        ${requestHash}, ${JSON.stringify(request.payload)}::jsonb, ${JSON.stringify(request.preconditions)}::jsonb,
        ${ownerToken}, 1, ${leaseExpiresAt}, 1, ${now}, ${now}, ${now}, ${now}, ${now}
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "ObjectStorageOperationProjectScope" (
        "operationId", "ordinal", "projectIdSnapshot", "projectId", "expectedOrganizationId", "createdAt"
      ) VALUES (${operationId}, 0, ${input.projectId}, ${input.projectId}, ${input.organizationId}, ${now})
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "ProjectDatabaseErasurePlan" (
        "operationId", "projectId", "organizationId", "ownershipEpoch", "inventorySha256", "plan",
        "stage", "evidence", "receipt", "verifiedAt", "createdAt", "updatedAt"
      ) VALUES (
        ${operationId}, ${input.projectId}, ${input.organizationId}, ${project.ownershipEpoch},
        ${plan.inventorySha256}, ${JSON.stringify(plan)}::jsonb, 'VERIFIED'::"ProjectDatabaseErasureStage",
        ${JSON.stringify(evidence)}::jsonb, ${JSON.stringify(receipt)}::jsonb, ${now}, ${now}, ${now}
      )
    `);

    const deleted = await tx.databaseInstance.deleteMany({
      where: {
        id: input.databaseInstanceId,
        projectId: input.projectId,
        organizationId: input.organizationId,
      },
    });
    if (deleted.count !== 1) throw new Error('DATABASE_ERASURE_TEST_FIXTURE_DELETE_FENCE_LOST');

    const terminalized = await tx.$executeRaw(Prisma.sql`
      UPDATE "ObjectStorageOperation"
      SET "status" = 'COMMITTED'::"ObjectStorageOperationStatus",
          "ownerToken" = NULL,
          "leaseExpiresAt" = NULL,
          "result" = ${JSON.stringify({
            schemaVersion: 1,
            outcome: 'TEST_FIXTURE_DATABASE_ERASURE_VERIFIED',
            databaseInstanceId: input.databaseInstanceId,
          })}::jsonb,
          "committedAt" = ${now},
          "updatedAt" = ${now}
      WHERE "id" = ${operationId}
        AND "status" = 'VERIFYING'::"ObjectStorageOperationStatus"
        AND "requestHash" = ${requestHash}
    `);
    if (terminalized !== 1) throw new Error('DATABASE_ERASURE_TEST_FIXTURE_OPERATION_FENCE_LOST');
  });
}
