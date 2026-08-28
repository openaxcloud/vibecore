import type { ObjectStorageOperationLease } from '../object-storage-operation.js';
import type {
  ProjectDatabaseErasureEffects,
  ProjectDatabaseErasureFence,
  ProjectDatabaseErasurePlan,
  ProjectDatabaseErasureReceipt,
} from '../project-database-erasure.js';

/**
 * A complete zero-inventory database erasure authority for persistence tests
 * whose fixture deliberately has no DatabaseInstance rows.
 */
export function emptyManagedDatabaseErasureCallbacks() {
  return {
    databaseErasureConfiguration: {
      tier: 'isolated' as const,
      backupBucket: 'vibecore-test-db-backups',
    },
    purgeManagedDatabases: async (
      plan: ProjectDatabaseErasurePlan,
      fence: ProjectDatabaseErasureFence,
      _lease: ObjectStorageOperationLease,
    ): Promise<ProjectDatabaseErasureEffects> => {
      await fence.assertActive({ ...plan, stage: 'INVENTORY_BOUND' });
      await fence.checkpoint({
        operationId: plan.operationId,
        projectId: plan.projectId,
        organizationId: plan.organizationId,
        inventorySha256: plan.inventorySha256,
        stage: 'INVENTORY_BOUND',
        evidence: {
          capturedAt: plan.capturedAt,
          instanceCount: plan.instances.length,
          snapshotCount: plan.instances.reduce((count, instance) => count + instance.snapshots.length, 0),
          restoreCount: plan.instances.reduce((count, instance) => count + instance.restores.length, 0),
        },
      });
      await fence.checkpoint({
        operationId: plan.operationId,
        projectId: plan.projectId,
        organizationId: plan.organizationId,
        inventorySha256: plan.inventorySha256,
        stage: 'KUBERNETES_PURGE',
        evidence: { deleted: 0 },
      });
      await fence.checkpoint({
        operationId: plan.operationId,
        projectId: plan.projectId,
        organizationId: plan.organizationId,
        inventorySha256: plan.inventorySha256,
        stage: 'SHARED_SQL_PURGE',
        evidence: { erased: 0 },
      });
      await fence.checkpoint({
        operationId: plan.operationId,
        projectId: plan.projectId,
        organizationId: plan.organizationId,
        inventorySha256: plan.inventorySha256,
        stage: 'BACKUP_PREFIX_PURGE',
        evidence: { deletedGenerations: 0 },
      });
      return {
        kubernetesResourcesDeleted: 0,
        sharedTenantsErased: 0,
        backupGenerationsDeleted: 0,
      };
    },
    verifyManagedDatabases: async (
      plan: ProjectDatabaseErasurePlan,
      fence: ProjectDatabaseErasureFence,
      _lease: ObjectStorageOperationLease,
      effects: ProjectDatabaseErasureEffects,
    ): Promise<ProjectDatabaseErasureReceipt> => {
      await fence.checkpoint({
        operationId: plan.operationId,
        projectId: plan.projectId,
        organizationId: plan.organizationId,
        inventorySha256: plan.inventorySha256,
        stage: 'FINAL_VERIFICATION',
        evidence: {
          kubernetesResidueCount: 0,
          backupGenerationResidueCount: 0,
          sharedTenantsAbsent: true,
        },
      });
      const receipt: ProjectDatabaseErasureReceipt = {
        schemaVersion: 1,
        operationId: plan.operationId,
        projectId: plan.projectId,
        organizationId: plan.organizationId,
        inventorySha256: plan.inventorySha256,
        verifiedAt: plan.capturedAt,
        effects,
        proof: {
          kubernetesNamespace: 'project-databases',
          kubernetesAbsent: true,
          sharedTenantsAbsent: true,
          backupBucket: plan.backupBucket,
          backupPrefix: plan.backupPrefix,
          backupGenerationsAbsent: true,
        },
      };
      await fence.checkpoint({
        operationId: plan.operationId,
        projectId: plan.projectId,
        organizationId: plan.organizationId,
        inventorySha256: plan.inventorySha256,
        stage: 'VERIFIED',
        evidence: receipt,
      });
      return receipt;
    },
  };
}
