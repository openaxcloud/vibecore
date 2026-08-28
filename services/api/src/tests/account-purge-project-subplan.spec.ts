import { describe, expect, it } from 'vitest';

import { objectStorageStaticArtifactSummary } from '../object-storage-operation.js';
import { projectPermanentDeletionRequestHash } from '../project-permanent-deletion.js';
import type { ProjectDatabaseErasureReceipt } from '../project-database-erasure.js';
import { TestApiStore } from './test-api-store.js';

describe('account purge owned-project coordinator', () => {
  it('uses the canonical PROJECT_PERMANENT_DELETE subplan under the exact outer lease', async () => {
    const store = new TestApiStore();
    const owner = await store.createUser({ email: 'purge-project-owner@example.test', passwordHash: 'hash' });
    await store.updateUser({
      userId: owner.id,
      preferences: {
        accountDeletion: { requestedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1_000).toISOString() },
      },
    });
    const organization = await store.createOrganization({
      name: 'Purge project organization',
      slug: 'purge-project-organization',
      ownerUserId: owner.id,
    });
    const project = await store.createProject({
      organizationId: organization.id,
      name: 'Purge project',
      slug: 'purge-project',
    });

    const result = await store.purgeUserAccount(
      { userId: owner.id },
      {
        eraseOwnedProjects: async (projects, lease) => {
          const receipts = [];
          for (const target of projects) {
            const authorityId = `account-purge:${lease.planId}`;
            const idempotencyKey = `account-purge:${lease.planId}:${target.id}`;
            const requestHash = projectPermanentDeletionRequestHash({
              projectId: target.id,
              organizationId: target.organizationId,
              actorUserId: authorityId,
              expectedProjectName: target.name,
            });
            const deleted = await store.hardDeleteProject({
              projectId: target.id,
              expectedOrganizationId: target.organizationId,
              expectedProjectName: target.name,
              idempotencyKey,
              requestHash,
              authorityId,
              accountPurgeCoordinator: {
                planId: lease.planId,
                ownerToken: lease.ownerToken,
                expectedOwnershipEpoch: target.ownershipEpoch,
                assertActive: lease.validate,
              },
              resolveLegacyDatabaseAuthorities: async () => [],
              preflightManagedDatabases: async () => undefined,
              purgeManagedDatabases: async () => ({
                kubernetesResourcesDeleted: 0,
                sharedTenantsErased: 0,
                backupGenerationsDeleted: 0,
                persistentVolumeClaims: [],
              }),
              verifyManagedDatabases: async (plan, _fence, _operationLease, effects) =>
                ({
                  schemaVersion: 2,
                  operationId: plan.operationId,
                  projectId: plan.projectId,
                  organizationId: plan.organizationId,
                  inventorySha256: plan.inventorySha256,
                  verifiedAt: new Date().toISOString(),
                  effects,
                  proof: {
                    kubernetesNamespace: 'project-databases',
                    kubernetesAbsent: true,
                    sharedTenantsAbsent: true,
                    backupTargets: [],
                    sharedRetentionBarriers: [],
                    backupGenerationsAbsent: true,
                  },
                }) satisfies ProjectDatabaseErasureReceipt,
              preflightPhysicalErasure: async () => objectStorageStaticArtifactSummary([]),
              erasePhysical: async (assertLease) => assertLease(),
              verifyPhysicalAbsence: async (assertLease) => {
                await assertLease();
                return {
                  outcome: 'VERIFIED_ABSENT',
                  verifiedAt: new Date().toISOString(),
                  verifier: 'account-purge-project-subplan-test-v1',
                  evidence: {
                    schemaVersion: 'project-permanent-erasure-v3',
                    filesystem: {
                      projectTreeAbsent: true,
                      workspaceTreesAbsent: true,
                      objectCacheAbsent: true,
                      staticSnapshotsAbsent: true,
                      staticAliasesAbsent: true,
                      staticArtifactSummary: objectStorageStaticArtifactSummary([]),
                    },
                    gcs: { bucketAbsent: true, objectCount: 0 },
                    workspaceManager: {
                      schemaVersion: 'workspace-project-erasure-v3',
                      projectId: target.id,
                      organizationId: target.organizationId,
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
                      volumes: {
                        schemaVersion: 'project-volume-erasure-receipt-v1',
                        operationId: `test-permanent-delete:${target.id}`,
                        projectId: target.id,
                        organizationId: target.organizationId,
                        inventoryHash: 'a'.repeat(64),
                        verificationHash: 'b'.repeat(64),
                        finalScanHash: 'c'.repeat(64),
                        quiescenceHash: 'd'.repeat(64),
                        entryCount: 0,
                        erasedEntryCount: 0,
                        alreadyAbsentEntryCount: 0,
                        persistentVolumeClaimsAbsent: true,
                        persistentVolumesAbsent: true,
                        providerVolumesAbsent: true,
                      },
                    },
                  },
                };
              },
            });
            receipts.push(deleted);
          }
          return receipts;
        },
        eraseStorage: async (inventory) => {
          expect(inventory.ownedProjects).toEqual([]);
          expect(inventory.bucketProjectIds).toEqual([]);
          return { classes: [], verified: true };
        },
      },
    );

    expect(result).toMatchObject({ outcome: 'purged' });
    expect(await store.getProject(project.id)).toBeUndefined();
    expect(store.projectPermanentDeletionReceipts.get(project.id)).toMatchObject({
      projectId: project.id,
      organizationId: organization.id,
      idempotencyKey: `account-purge:purge-${owner.id}:${project.id}`,
    });
  });
});
