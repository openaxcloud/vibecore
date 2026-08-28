import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

import { createDefaultProjectManifest, projectManifestDigest } from '../project-manifest.js';
import { PrismaApiStore } from '../prisma-store.js';
import type { ProjectReleaseFence } from '../store.js';

const runDbTests = process.env.DATABASE_URL ? describe : describe.skip;
const DIGEST = `sha256:${'a'.repeat(64)}`;
const TERMS = 'reserved-vm-monthly-v1';

function suffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function promotion(organizationId: string, imageRef: string) {
  return {
    promotionId: `promotion-${suffix()}`,
    sourceRepo: `europe-west9-docker.pkg.dev/build-project/build-repo/p-${suffix()}`,
    sourceDigest: DIGEST,
    targetRepo: imageRef,
    targetTenant: organizationId,
    retentionTag: `active-promo-${'b'.repeat(32)}`,
    attachments: ['signature', 'sbom', 'provenance'].map((type, index) => ({
      type,
      digest: `sha256:${String(index + 1).repeat(64)}`,
      subjectDigest: DIGEST,
      relinked: true,
    })),
    binaryAuthorizationResult: 'PASSED',
    binaryAuthorizationPolicy: 'projects/policy-project/platforms/gke/policies/release-policy',
    binaryAuthorizationPolicyEtag: 'policy-etag-reserved-publish',
    binaryAuthorizationEvaluatedImage: `${imageRef}@${DIGEST}`,
    binaryAuthorizationEvaluatedAt: '2026-08-27T10:00:00.000Z',
    state: 'PROMOTION_COMMITTED',
    preparedAt: '2026-08-27T09:59:58.000Z',
    committedAt: '2026-08-27T09:59:59.000Z',
  };
}

async function seedReservedPreview(
  prisma: ReturnType<typeof createDatabaseClient>,
  store: PrismaApiStore,
  label: string,
) {
  const token = suffix();
  const actor = await prisma.user.create({ data: { email: `${label}-${token}@example.test` } });
  const organization = await prisma.organization.create({
    data: { name: `${label} ${token}`, slug: `${label}-${token}` },
  });
  const project = await prisma.project.create({
    data: { organizationId: organization.id, name: label, slug: `${label}-project-${token}` },
  });
  const manifest = createDefaultProjectManifest(project.id);
  const manifestDigest = projectManifestDigest(manifest);
  await store.createProjectManifestRevision({
    projectId: project.id,
    expectedOrganizationId: organization.id,
    schemaVersion: manifest.schemaVersion,
    manifestVersion: manifest.manifestVersion,
    digest: manifestDigest,
    manifest,
  });

  const imageRef = `europe-west9-docker.pkg.dev/tenant-project/releases/p-${project.id.toLowerCase()}`;
  const previewUrl = `https://${project.id.toLowerCase()}.preview.example.test`;
  const deployment = await store.createDeployment({
    projectId: project.id,
    expectedOrganizationId: organization.id,
    provider: 'server',
    environment: 'preview',
    status: 'BUILDING',
    url: previewUrl,
    previewUrl,
    machineSize: 'shared-0.5',
    accessPolicy: { mode: 'INVITE_ONLY', createdByUserId: actor.id },
    metadata: {
      projectManifestDigest: manifestDigest,
      serverDeploy: {
        image: { imageRef, imageDigest: DIGEST },
        promotion: promotion(organization.id, imageRef),
      },
    },
    reservedVm: {
      organizationId: organization.id,
      actorUserId: actor.id,
      idempotencyKey: `create-${token}`,
      requestHash: 'c'.repeat(64),
      tier: 'shared-0.5',
      termsVersion: TERMS,
      monthlyPriceCents: 2_000,
      rateCardVersion: 1,
    },
  });
  const ownerToken = `create-owner-${token}`;
  const lease = await store.acquireReservedVmOperation({
    projectId: project.id,
    idempotencyKey: `create-${token}`,
    ownerToken,
    ttlMs: 60_000,
  });
  await store.markReservedVmRuntimeApplied({
    operationId: lease.operation.id,
    ownerToken,
    fencingToken: lease.operation.fencingToken,
  });
  await store.commitReservedVmOperation({
    operationId: lease.operation.id,
    ownerToken,
    fencingToken: lease.operation.fencingToken,
    response: { ready: true, url: 'https://reserved-stable.example.test' },
  });
  /*
   * The real image path marks READY in commitServerImageRelease's atomic
   * release transaction. This fixture has no build/promotion process, so move
   * the already-fenced/settled row to that exact post-release state directly.
   */
  await prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'READY' } });
  const readyDeployment = await store.getDeployment(project.id, deployment.id);

  if (!readyDeployment) throw new Error('Reserved VM publish fixture lost its deployment');
  const releaseSource = await store.createReleaseManifest({
    projectId: project.id,
    deploymentId: deployment.id,
    environment: 'preview',
    version: 1,
    provider: 'server',
    artifactKind: 'server-image',
    artifactRef: imageRef,
    artifactDigest: DIGEST,
    configDigest: 'config-v1',
    dbMigrationPoint: 'migration-v1',
    accessPolicyVersion: readyDeployment.accessPolicyVersion,
  });

  return { actor, organization, project, manifest, manifestDigest, deployment: readyDeployment, releaseSource };
}

async function acquirePublishFence(
  store: PrismaApiStore,
  input: { projectId: string; organizationId: string; manifestDigest: string; operationId: string },
) {
  const ownerToken = `publish-owner-${suffix()}`;
  const lease = await store.acquireProjectReleaseBarrier({
    projectId: input.projectId,
    expectedOrganizationId: input.organizationId,
    expectedManifestDigest: input.manifestDigest,
    operationId: input.operationId,
    ownerToken,
    ttlSeconds: 60,
  });
  if (!lease) throw new Error('PUBLISH_FENCE_NOT_ACQUIRED');
  const fence: ProjectReleaseFence = {
    checkpointId: lease.checkpointId,
    ownerToken: lease.ownerToken,
    fence: lease.fence,
    expectedOrganizationId: input.organizationId,
    expectedManifestDigest: input.manifestDigest,
  };
  return { lease, fence };
}

runDbTests('Reserved VM in-place publish — PostgreSQL release barrier', () => {
  it('atomically publishes one exact release while CHANGE, transfer and manifest mutation lose the barrier race', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    let sourceOrganizationId: string | undefined;
    let targetOrganizationId: string | undefined;
    let release: Awaited<ReturnType<typeof acquirePublishFence>> | undefined;

    try {
      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);
      const seeded = await seedReservedPreview(prismaA, storeA, 'reserved-publish');
      sourceOrganizationId = seeded.organization.id;
      const target = await prismaA.organization.create({
        data: { name: `publish-target-${suffix()}`, slug: `publish-target-${suffix()}` },
      });
      targetOrganizationId = target.id;
      release = await acquirePublishFence(storeA, {
        projectId: seeded.project.id,
        organizationId: seeded.organization.id,
        manifestDigest: seeded.manifestDigest,
        operationId: `publish:${seeded.deployment.id}`,
      });
      const prepared = await storeA.prepareReservedVmPublish({
        projectId: seeded.project.id,
        deploymentId: seeded.deployment.id,
        organizationId: seeded.organization.id,
        actorUserId: seeded.actor.id,
        expectedRuntimeVersion: seeded.deployment.runtimeVersion!,
        releaseFence: release.fence,
      });
      expect(prepared.releaseSource.id).toBe(seeded.releaseSource.id);

      const nextManifest = { ...seeded.manifest, manifestVersion: seeded.manifest.manifestVersion + 1 };
      await expect(
        storeB.createProjectManifestRevision({
          projectId: seeded.project.id,
          expectedOrganizationId: seeded.organization.id,
          schemaVersion: nextManifest.schemaVersion,
          manifestVersion: nextManifest.manifestVersion,
          digest: projectManifestDigest(nextManifest),
          manifest: nextManifest,
          expectedDigest: seeded.manifestDigest,
        }),
      ).rejects.toMatchObject({ code: 'CHECKPOINT_BARRIER_ACTIVE' });
      await expect(
        storeB.transferProject({
          projectId: seeded.project.id,
          expectedOrganizationId: seeded.organization.id,
          targetOrganizationId: target.id,
          actorUserId: seeded.actor.id,
          assertExternalStorageDetached: async () => undefined,
          validateTargetAdmission: async () => undefined,
        }),
      ).rejects.toMatchObject({ code: 'CHECKPOINT_BARRIER_ACTIVE' });

      const productionCount = () =>
        prismaA.releaseManifest.count({ where: { projectId: seeded.project.id, environment: 'production' } });
      await expect(
        storeA.publishReservedVmInPlace({
          projectId: seeded.project.id,
          deploymentId: seeded.deployment.id,
          organizationId: seeded.organization.id,
          actorUserId: seeded.actor.id,
          expectedRuntimeVersion: seeded.deployment.runtimeVersion! + 1,
          productionUrl: seeded.deployment.url!,
          sourceReleaseManifestId: prepared.releaseSource.id,
          releaseFence: release.fence,
        }),
      ).rejects.toMatchObject({ code: 'RESERVED_VM_RUNTIME_VERSION_CONFLICT' });
      expect(await productionCount()).toBe(0);

      await expect(
        storeA.publishReservedVmInPlace({
          projectId: seeded.project.id,
          deploymentId: seeded.deployment.id,
          organizationId: seeded.organization.id,
          actorUserId: seeded.actor.id,
          expectedRuntimeVersion: seeded.deployment.runtimeVersion!,
          productionUrl: seeded.deployment.url!,
          sourceReleaseManifestId: `missing-${suffix()}`,
          releaseFence: release.fence,
        }),
      ).rejects.toMatchObject({ code: 'RESERVED_VM_RELEASE_SOURCE_INVALID' });
      expect(await productionCount()).toBe(0);

      const badArtifact = await prismaA.releaseManifest.create({
        data: {
          projectId: seeded.project.id,
          deploymentId: seeded.deployment.id,
          environment: 'preview',
          version: 2,
          provider: 'server',
          artifactKind: 'server-image',
          artifactRef: prepared.releaseSource.artifactRef,
          artifactDigest: `sha256:${'d'.repeat(64)}`,
          accessPolicyVersion: seeded.deployment.accessPolicyVersion,
        },
      });
      await expect(
        storeA.publishReservedVmInPlace({
          projectId: seeded.project.id,
          deploymentId: seeded.deployment.id,
          organizationId: seeded.organization.id,
          actorUserId: seeded.actor.id,
          expectedRuntimeVersion: seeded.deployment.runtimeVersion!,
          productionUrl: seeded.deployment.url!,
          sourceReleaseManifestId: badArtifact.id,
          releaseFence: release.fence,
        }),
      ).rejects.toMatchObject({ code: 'RESERVED_VM_RELEASE_SOURCE_INVALID' });
      const badPolicy = await prismaA.releaseManifest.create({
        data: {
          projectId: seeded.project.id,
          deploymentId: seeded.deployment.id,
          environment: 'preview',
          version: 3,
          provider: 'server',
          artifactKind: 'server-image',
          artifactRef: prepared.releaseSource.artifactRef,
          artifactDigest: prepared.releaseSource.artifactDigest,
          accessPolicyVersion: seeded.deployment.accessPolicyVersion + 1,
        },
      });
      await expect(
        storeA.publishReservedVmInPlace({
          projectId: seeded.project.id,
          deploymentId: seeded.deployment.id,
          organizationId: seeded.organization.id,
          actorUserId: seeded.actor.id,
          expectedRuntimeVersion: seeded.deployment.runtimeVersion!,
          productionUrl: seeded.deployment.url!,
          sourceReleaseManifestId: badPolicy.id,
          releaseFence: release.fence,
        }),
      ).rejects.toMatchObject({ code: 'RESERVED_VM_RELEASE_SOURCE_INVALID' });
      expect(await productionCount()).toBe(0);

      const [publishResult, changeResult] = await Promise.allSettled([
        storeA.publishReservedVmInPlace({
          projectId: seeded.project.id,
          deploymentId: seeded.deployment.id,
          organizationId: seeded.organization.id,
          actorUserId: seeded.actor.id,
          expectedRuntimeVersion: seeded.deployment.runtimeVersion!,
          productionUrl: seeded.deployment.url!,
          sourceReleaseManifestId: prepared.releaseSource.id,
          releaseFence: release.fence,
        }),
        storeB.createReservedVmChangeOperation({
          projectId: seeded.project.id,
          deploymentId: seeded.deployment.id,
          organizationId: seeded.organization.id,
          actorUserId: seeded.actor.id,
          idempotencyKey: `change-${suffix()}`,
          requestHash: 'e'.repeat(64),
          expectedRuntimeVersion: seeded.deployment.runtimeVersion!,
          targetRuntimeKind: 'reserved-vm',
          targetTier: 'dedicated-1',
          targetMachineSize: 'dedicated-1',
          targetCpuMillicores: 1_000,
          targetMemoryMb: 4_096,
          targetPriceCents: 4_000,
          termsVersion: TERMS,
          rateCardVersion: 1,
        }),
      ]);
      expect(publishResult.status).toBe('fulfilled');
      expect(changeResult.status).toBe('rejected');
      if (changeResult.status !== 'rejected') throw new Error('CHANGE unexpectedly won publish barrier race');
      expect(changeResult.reason).toMatchObject({ code: 'CHECKPOINT_BARRIER_ACTIVE' });
      if (publishResult.status !== 'fulfilled') throw publishResult.reason;
      const published = publishResult.value;
      expect(published).toMatchObject({
        id: seeded.deployment.id,
        environment: 'production',
        url: seeded.deployment.url,
        persistentStorageClaim: seeded.deployment.persistentStorageClaim,
        runtimeVersion: seeded.deployment.runtimeVersion,
      });
      expect(await productionCount()).toBe(1);
      const productionRelease = await prismaA.releaseManifest.findFirstOrThrow({
        where: { projectId: seeded.project.id, environment: 'production' },
      });
      expect(productionRelease).toMatchObject({
        deploymentId: seeded.deployment.id,
        artifactRef: prepared.releaseSource.artifactRef,
        artifactDigest: prepared.releaseSource.artifactDigest,
        configDigest: prepared.releaseSource.configDigest,
        dbMigrationPoint: prepared.releaseSource.dbMigrationPoint,
        accessPolicyVersion: prepared.releaseSource.accessPolicyVersion,
      });

      const replay = await storeB.publishReservedVmInPlace({
        projectId: seeded.project.id,
        deploymentId: seeded.deployment.id,
        organizationId: seeded.organization.id,
        actorUserId: seeded.actor.id,
        expectedRuntimeVersion: seeded.deployment.runtimeVersion!,
        productionUrl: seeded.deployment.url!,
        sourceReleaseManifestId: prepared.releaseSource.id,
        releaseFence: release.fence,
      });
      expect(replay.id).toBe(seeded.deployment.id);
      expect(await productionCount()).toBe(1);
      expect((await prismaA.project.findUniqueOrThrow({ where: { id: seeded.project.id } })).organizationId).toBe(
        seeded.organization.id,
      );
    } finally {
      if (release) {
        await new PrismaApiStore(prismaA)
          .releaseProjectReleaseBarrier({
            checkpointId: release.lease.checkpointId,
            projectId: release.lease.projectId,
            ownerToken: release.lease.ownerToken,
            fence: release.lease.fence,
          })
          .catch(() => false);
      }
      if (sourceOrganizationId) {
        await prismaA.organization.delete({ where: { id: sourceOrganizationId } }).catch(() => undefined);
      }
      if (targetOrganizationId) {
        await prismaA.organization.delete({ where: { id: targetOrganizationId } }).catch(() => undefined);
      }
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('refuses publish before external work when a CHANGE operation linearized first', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    let organizationId: string | undefined;
    let release: Awaited<ReturnType<typeof acquirePublishFence>> | undefined;

    try {
      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);
      const seeded = await seedReservedPreview(prismaA, storeA, 'change-first');
      organizationId = seeded.organization.id;
      const change = await storeA.createReservedVmChangeOperation({
        projectId: seeded.project.id,
        deploymentId: seeded.deployment.id,
        organizationId: seeded.organization.id,
        actorUserId: seeded.actor.id,
        idempotencyKey: `change-first-${suffix()}`,
        requestHash: 'f'.repeat(64),
        expectedRuntimeVersion: seeded.deployment.runtimeVersion!,
        targetRuntimeKind: 'reserved-vm',
        targetTier: 'dedicated-1',
        targetMachineSize: 'dedicated-1',
        targetCpuMillicores: 1_000,
        targetMemoryMb: 4_096,
        targetPriceCents: 4_000,
        termsVersion: TERMS,
        rateCardVersion: 1,
      });
      release = await acquirePublishFence(storeB, {
        projectId: seeded.project.id,
        organizationId: seeded.organization.id,
        manifestDigest: seeded.manifestDigest,
        operationId: `publish:${seeded.deployment.id}`,
      });

      await expect(
        storeB.prepareReservedVmPublish({
          projectId: seeded.project.id,
          deploymentId: seeded.deployment.id,
          organizationId: seeded.organization.id,
          actorUserId: seeded.actor.id,
          expectedRuntimeVersion: seeded.deployment.runtimeVersion!,
          releaseFence: release.fence,
        }),
      ).rejects.toMatchObject({ code: 'RESERVED_VM_CHANGE_IN_PROGRESS' });
      expect(
        await prismaA.releaseManifest.count({ where: { projectId: seeded.project.id, environment: 'production' } }),
      ).toBe(0);

      await storeB.releaseProjectReleaseBarrier({
        checkpointId: release.lease.checkpointId,
        projectId: release.lease.projectId,
        ownerToken: release.lease.ownerToken,
        fence: release.lease.fence,
      });
      release = undefined;
      const ownerToken = `cleanup-${suffix()}`;
      const claimed = await storeA.acquireReservedVmOperation({
        projectId: seeded.project.id,
        idempotencyKey: change.operation.idempotencyKey,
        ownerToken,
        ttlMs: 60_000,
      });
      await storeA.failReservedVmOperation({
        operationId: claimed.operation.id,
        ownerToken,
        fencingToken: claimed.operation.fencingToken,
        errorCode: 'TEST_CLEANUP',
        errorMessage: 'No external runtime effect started.',
      });
    } finally {
      if (release) {
        await new PrismaApiStore(prismaA)
          .releaseProjectReleaseBarrier({
            checkpointId: release.lease.checkpointId,
            projectId: release.lease.projectId,
            ownerToken: release.lease.ownerToken,
            fence: release.lease.fence,
          })
          .catch(() => false);
      }
      if (organizationId) {
        await prismaA.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });
});
