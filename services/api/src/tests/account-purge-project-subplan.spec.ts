import { describe, expect, it } from 'vitest';

import { objectStorageStaticArtifactSummary } from '../object-storage-operation.js';
import { emptyManagedDatabaseErasureCallbacks } from './project-database-erasure-test-support.js';
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
        permanentlyDeleteOwnedProject: async (authority, lease) => {
          expect(authority).toMatchObject({
            planId: lease.planId,
            ownerToken: lease.ownerToken,
            userId: owner.id,
            projectId: project.id,
            expectedOrganizationId: organization.id,
            expectedProjectName: project.name,
            expectedOwnershipEpoch: project.ownershipEpoch,
          });
          await lease.validate();
          await store.hardDeleteProject({
            projectId: authority.projectId,
            expectedOrganizationId: authority.expectedOrganizationId,
            expectedProjectName: authority.expectedProjectName,
            idempotencyKey: authority.idempotencyKey,
            requestHash: authority.requestHash,
            actorUserId: authority.userId,
            accountPurgeDeletionAuthority: authority,
            ...emptyManagedDatabaseErasureCallbacks(),
            preflightPhysicalErasure: async () => ({
              summary: objectStorageStaticArtifactSummary([]),
              artifacts: [],
            }),
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
                    projectId: authority.projectId,
                    organizationId: authority.expectedOrganizationId,
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
                      operationId: `test-permanent-delete:${authority.projectId}`,
                      projectId: authority.projectId,
                      organizationId: authority.expectedOrganizationId,
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
          await lease.validate();
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
