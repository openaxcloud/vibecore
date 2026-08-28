import { createHash, randomUUID } from 'node:crypto';

import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

import type { WorkspaceProjectDeletionLease } from '../../../workspace-manager/src/manager.js';
import { PrismaWorkspaceStore } from '../../../workspace-manager/src/prisma-store.js';
import { PrismaApiStore } from '../prisma-store.js';
import { projectPermanentDeletionRequestHash } from '../project-permanent-deletion.js';
import { objectStorageStaticArtifactSummary, type ObjectStorageOperationLease } from '../object-storage-operation.js';
import { emptyManagedDatabaseErasureCallbacks } from './project-database-erasure-test-support.js';
import { seedVerifiedEmptyProjectVolumeErasure } from './project-volume-erasure-fixture.js';

const runDbTests = process.env.DATABASE_URL ? describe.sequential : describe.skip;
const EMPTY_STATIC_ARTIFACT_SUMMARY = objectStorageStaticArtifactSummary([]);
const EMPTY_STATIC_ARTIFACT_PLAN = { summary: EMPTY_STATIC_ARTIFACT_SUMMARY, artifacts: [] };

type RuntimeEffectState = 'PREPARED' | 'IN_FLIGHT' | 'SETTLED';

interface TransferFixture {
  actorId: string;
  organizationAId: string;
  organizationBId: string;
  project: {
    id: string;
    name: string;
  };
  runtimeId: string;
}

function unique(label: string): string {
  return `${label}-${randomUUID()}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function seedFixture(prisma: DatabaseClient, label: string): Promise<TransferFixture> {
  const token = randomUUID();
  const [actor, organizationA, organizationB] = await Promise.all([
    prisma.user.create({ data: { email: `${label}-${token}@example.test` } }),
    prisma.organization.create({ data: { name: `${label} organization A`, slug: `${label}-a-${token}` } }),
    prisma.organization.create({ data: { name: `${label} organization B`, slug: `${label}-b-${token}` } }),
  ]);
  const project = await prisma.project.create({
    data: {
      organizationId: organizationA.id,
      name: `${label} project`,
      slug: `${label}-project-${token}`,
    },
  });
  const runtimeId = unique(`${label}-runtime`);
  await prisma.workspaceRuntime.create({
    data: {
      id: runtimeId,
      orgId: organizationA.id,
      projectId: project.id,
      plan: { tier: 'pro' },
      status: 'DELETED',
      pvcName: `pvc-${runtimeId}`,
      podName: `workspace-${runtimeId}`,
      serviceName: `workspace-${runtimeId}`,
      agentTokenSecretName: `agent-token-${runtimeId}`,
    },
  });
  return {
    actorId: actor.id,
    organizationAId: organizationA.id,
    organizationBId: organizationB.id,
    project: { id: project.id, name: project.name },
    runtimeId,
  };
}

async function createRuntimeEffect(
  prisma: DatabaseClient,
  fixture: TransferFixture,
  input: {
    organizationId: string;
    ownershipEpoch: number;
    state: RuntimeEffectState;
    resourceLabel?: string;
  },
) {
  const resourceId = unique(input.resourceLabel ?? 'workspace-effect');
  const target = {
    kind: 'Pod',
    namespace: 'workspaces',
    name: `workspace-${resourceId}`,
  };
  const targetDigest = sha256(JSON.stringify([target]));
  const intentHash = sha256(JSON.stringify({ action: 'START_WORKSPACE', resourceId, targetDigest }));
  const active = input.state === 'PREPARED' || input.state === 'IN_FLIGHT';
  const now = new Date();

  return prisma.projectRuntimeEffect.create({
    data: {
      id: unique('runtime-effect'),
      projectId: fixture.project.id,
      organizationId: input.organizationId,
      ownershipEpoch: input.ownershipEpoch,
      action: 'START_WORKSPACE',
      resourceId,
      intentHash,
      targetDigest,
      state: input.state,
      ownerToken: active ? unique('runtime-owner') : undefined,
      leaseExpiresAt: active ? new Date(now.getTime() + 10 * 60_000) : undefined,
      dispatchedAt: input.state === 'IN_FLIGHT' ? now : undefined,
      settledAt: input.state === 'SETTLED' ? now : undefined,
      providerReceipt: input.state === 'SETTLED' ? { outcome: 'APPLIED' } : undefined,
      targets: { create: { ordinal: 0, ...target } },
    },
    include: { targets: true },
  });
}

function transferProject(
  store: PrismaApiStore,
  fixture: TransferFixture,
  sourceOrganizationId: string,
  targetOrganizationId: string,
  expectedOwnershipEpoch: number,
) {
  return store.transferProject({
    projectId: fixture.project.id,
    expectedOrganizationId: sourceOrganizationId,
    expectedOwnershipEpoch,
    targetOrganizationId,
    idempotencyKey: `runtime-effect-transfer-${fixture.project.id}-${expectedOwnershipEpoch}`,
    actorUserId: fixture.actorId,
    assertExternalStorageDetached: async () => undefined,
    validateTargetAdmission: async () => undefined,
  });
}

function workspaceDeletionLease(
  fixture: TransferFixture,
  organizationId: string,
  lease: ObjectStorageOperationLease,
): WorkspaceProjectDeletionLease {
  return {
    operationId: lease.operationId,
    ownerToken: lease.ownerToken,
    fencingToken: lease.fencingToken.toString(),
    requestHash: lease.requestHash,
    scopeHash: lease.scopeHash,
    projectId: fixture.project.id,
    expectedOrganizationId: organizationId,
  };
}

async function cleanupFixture(prisma: DatabaseClient, fixture: TransferFixture): Promise<void> {
  const operationIds = (
    await prisma.objectStorageOperationProjectScope.findMany({
      where: { projectIdSnapshot: fixture.project.id },
      select: { operationId: true },
    })
  ).map(({ operationId }) => operationId);
  const receiptedOperationIds = new Set(
    (
      await prisma.projectPermanentDeletionReceipt.findMany({
        where: { operationId: { in: operationIds } },
        select: { operationId: true },
      })
    ).map(({ operationId }) => operationId),
  );
  const mutableOperationIds = operationIds.filter((operationId) => !receiptedOperationIds.has(operationId));

  await prisma.projectRuntimeEffect.deleteMany({ where: { projectId: fixture.project.id } });
  await prisma.workspaceRuntime.deleteMany({ where: { projectId: fixture.project.id } });
  await prisma.project.deleteMany({ where: { id: fixture.project.id } });
  if (mutableOperationIds.length > 0) {
    await prisma.objectStorageCapabilityReservation.deleteMany({
      where: { operationId: { in: mutableOperationIds } },
    });
    await prisma.objectStorageOperation.deleteMany({ where: { id: { in: mutableOperationIds } } });
  }
  await prisma.organization.deleteMany({
    where: { id: { in: [fixture.organizationAId, fixture.organizationBId] } },
  });
  await prisma.user.deleteMany({ where: { id: fixture.actorId } });
}

runDbTests('project runtime-effect ownership transfer (PostgreSQL)', () => {
  it('rebinds a DELETED runtime tombstone and drains a source-epoch SETTLED effect before finalization', async () => {
    const prisma = createDatabaseClient();
    const fixture = await seedFixture(prisma, 'runtime-effect-transfer-finalize');
    const apiStore = new PrismaApiStore(prisma);
    const workspaceStore = new PrismaWorkspaceStore(prisma);
    const historicalEffect = await createRuntimeEffect(prisma, fixture, {
      organizationId: fixture.organizationAId,
      ownershipEpoch: 0,
      state: 'SETTLED',
    });

    try {
      await expect(
        transferProject(apiStore, fixture, fixture.organizationAId, fixture.organizationBId, 0),
      ).resolves.toMatchObject({ organizationId: fixture.organizationBId });
      await expect(
        prisma.project.findUniqueOrThrow({
          where: { id: fixture.project.id },
          select: { organizationId: true, ownershipEpoch: true },
        }),
      ).resolves.toEqual({ organizationId: fixture.organizationBId, ownershipEpoch: 1 });
      await expect(
        prisma.workspaceRuntime.findUniqueOrThrow({
          where: { id: fixture.runtimeId },
          select: { orgId: true, status: true },
        }),
      ).resolves.toEqual({ orgId: fixture.organizationBId, status: 'DELETED' });
      await expect(
        prisma.projectRuntimeEffect.findUniqueOrThrow({
          where: { id: historicalEffect.id },
          select: { organizationId: true, ownershipEpoch: true, state: true },
        }),
      ).resolves.toEqual({
        organizationId: fixture.organizationAId,
        ownershipEpoch: 0,
        state: 'SETTLED',
      });

      const requestHash = projectPermanentDeletionRequestHash({
        projectId: fixture.project.id,
        organizationId: fixture.organizationBId,
        actorUserId: fixture.actorId,
        expectedProjectName: fixture.project.name,
      });
      let volumeProof: Awaited<ReturnType<typeof seedVerifiedEmptyProjectVolumeErasure>> | undefined;
      const deletion = apiStore.hardDeleteProject({
        projectId: fixture.project.id,
        expectedOrganizationId: fixture.organizationBId,
        expectedProjectName: fixture.project.name,
        actorUserId: fixture.actorId,
        idempotencyKey: unique('runtime-effect-transfer-delete'),
        requestHash,
        ...emptyManagedDatabaseErasureCallbacks(),
        preflightPhysicalErasure: async () => EMPTY_STATIC_ARTIFACT_PLAN,
        erasePhysical: async (assertLease, lease) => {
          await assertLease();
          const managerLease = workspaceDeletionLease(fixture, fixture.organizationBId, lease);
          const inventory = await workspaceStore.acquireProjectDeletionFence(managerLease, ['EFFECT_STARTED']);
          expect(inventory.runtimeEffectIds).toEqual([historicalEffect.id]);
          expect(inventory.runtimeEffectTargets).toEqual([
            {
              kind: historicalEffect.targets[0]!.kind,
              namespace: historicalEffect.targets[0]!.namespace,
              name: historicalEffect.targets[0]!.name,
            },
          ]);
          await expect(
            prisma.projectRuntimeEffect.findUniqueOrThrow({
              where: { id: historicalEffect.id },
              select: { state: true, organizationId: true, ownershipEpoch: true },
            }),
          ).resolves.toEqual({
            state: 'DRAINING',
            organizationId: fixture.organizationAId,
            ownershipEpoch: 0,
          });
          const currentProject = await prisma.project.findUniqueOrThrow({
            where: { id: fixture.project.id },
            select: { ownershipEpoch: true },
          });
          volumeProof = await seedVerifiedEmptyProjectVolumeErasure(prisma, {
            operationId: managerLease.operationId,
            projectId: fixture.project.id,
            organizationId: fixture.organizationBId,
            ownershipEpoch: currentProject.ownershipEpoch,
            fencingToken: BigInt(managerLease.fencingToken),
          });
          await expect(workspaceStore.completeProjectDeletion(managerLease)).resolves.toBe(1);
        },
        verifyPhysicalAbsence: async () => {
          await expect(
            prisma.projectRuntimeEffect.findUniqueOrThrow({
              where: { id: historicalEffect.id },
              select: { state: true },
            }),
          ).resolves.toEqual({ state: 'DRAINED' });
          await expect(
            prisma.workspaceRuntime.findUniqueOrThrow({
              where: { id: fixture.runtimeId },
              select: { orgId: true, status: true },
            }),
          ).resolves.toEqual({ orgId: fixture.organizationBId, status: 'DELETED' });
          return {
            outcome: 'VERIFIED_ABSENT',
            verifier: 'runtime-effect-transfer-db-v1',
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
              workspaceManager: {
                schemaVersion: 'workspace-project-erasure-v3',
                projectId: fixture.project.id,
                organizationId: fixture.organizationBId,
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
                volumes: volumeProof!,
              },
            },
          };
        },
      });

      await expect(deletion).resolves.toMatchObject({
        project: {
          id: fixture.project.id,
          organizationId: fixture.organizationBId,
          state: 'PERMANENTLY_DELETED',
        },
      });
      await expect(prisma.project.findUnique({ where: { id: fixture.project.id } })).resolves.toBeNull();
      await expect(prisma.workspaceRuntime.findUnique({ where: { id: fixture.runtimeId } })).resolves.toBeNull();
      await expect(prisma.projectRuntimeEffect.findUnique({ where: { id: historicalEffect.id } })).resolves.toBeNull();
      await expect(
        prisma.projectPermanentDeletionReceipt.findUniqueOrThrow({
          where: { projectId: fixture.project.id },
          select: { organizationId: true },
        }),
      ).resolves.toEqual({ organizationId: fixture.organizationBId });
    } finally {
      await cleanupFixture(prisma, fixture).finally(() => prisma.$disconnect());
    }
  });

  it.each(['PREPARED', 'IN_FLIGHT'] as const)('blocks transfer while a runtime effect is %s', async (state) => {
    const prisma = createDatabaseClient();
    const fixture = await seedFixture(prisma, `runtime-effect-transfer-${state.toLowerCase()}`);
    const store = new PrismaApiStore(prisma);
    const activeEffect = await createRuntimeEffect(prisma, fixture, {
      organizationId: fixture.organizationAId,
      ownershipEpoch: 0,
      state,
    });

    try {
      await expect(
        transferProject(store, fixture, fixture.organizationAId, fixture.organizationBId, 0),
      ).rejects.toMatchObject({ code: 'PROJECT_TRANSFER_MANAGED_RESOURCES_ACTIVE', statusCode: 409 });
      await expect(
        prisma.project.findUniqueOrThrow({
          where: { id: fixture.project.id },
          select: { organizationId: true, ownershipEpoch: true },
        }),
      ).resolves.toEqual({ organizationId: fixture.organizationAId, ownershipEpoch: 0 });
      await expect(
        prisma.workspaceRuntime.findUniqueOrThrow({
          where: { id: fixture.runtimeId },
          select: { orgId: true, status: true },
        }),
      ).resolves.toEqual({ orgId: fixture.organizationAId, status: 'DELETED' });
      await expect(
        prisma.projectRuntimeEffect.findUniqueOrThrow({
          where: { id: activeEffect.id },
          select: { state: true, organizationId: true, ownershipEpoch: true },
        }),
      ).resolves.toEqual({
        state,
        organizationId: fixture.organizationAId,
        ownershipEpoch: 0,
      });
    } finally {
      await cleanupFixture(prisma, fixture).finally(() => prisma.$disconnect());
    }
  });

  it('supports A to B to A without wedging historical effects or the DELETED runtime tombstone', async () => {
    const prisma = createDatabaseClient();
    const fixture = await seedFixture(prisma, 'runtime-effect-transfer-round-trip');
    const store = new PrismaApiStore(prisma);
    const sourceEffect = await createRuntimeEffect(prisma, fixture, {
      organizationId: fixture.organizationAId,
      ownershipEpoch: 0,
      state: 'SETTLED',
      resourceLabel: 'source-effect',
    });

    try {
      await expect(
        transferProject(store, fixture, fixture.organizationAId, fixture.organizationBId, 0),
      ).resolves.toMatchObject({ organizationId: fixture.organizationBId });
      const targetEffect = await createRuntimeEffect(prisma, fixture, {
        organizationId: fixture.organizationBId,
        ownershipEpoch: 1,
        state: 'SETTLED',
        resourceLabel: 'target-effect',
      });

      await expect(
        transferProject(store, fixture, fixture.organizationBId, fixture.organizationAId, 1),
      ).resolves.toMatchObject({ organizationId: fixture.organizationAId });
      await expect(
        prisma.project.findUniqueOrThrow({
          where: { id: fixture.project.id },
          select: { organizationId: true, ownershipEpoch: true },
        }),
      ).resolves.toEqual({ organizationId: fixture.organizationAId, ownershipEpoch: 2 });
      await expect(
        prisma.workspaceRuntime.findUniqueOrThrow({
          where: { id: fixture.runtimeId },
          select: { orgId: true, status: true },
        }),
      ).resolves.toEqual({ orgId: fixture.organizationAId, status: 'DELETED' });
      await expect(
        prisma.projectRuntimeEffect.findMany({
          where: { id: { in: [sourceEffect.id, targetEffect.id] } },
          select: { id: true, organizationId: true, ownershipEpoch: true, state: true },
          orderBy: { ownershipEpoch: 'asc' },
        }),
      ).resolves.toEqual([
        {
          id: sourceEffect.id,
          organizationId: fixture.organizationAId,
          ownershipEpoch: 0,
          state: 'SETTLED',
        },
        {
          id: targetEffect.id,
          organizationId: fixture.organizationBId,
          ownershipEpoch: 1,
          state: 'SETTLED',
        },
      ]);
    } finally {
      await cleanupFixture(prisma, fixture).finally(() => prisma.$disconnect());
    }
  });
});
