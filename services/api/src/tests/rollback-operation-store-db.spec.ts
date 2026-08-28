import { createDatabaseClient } from '@vibecore/database';
import { PLAN_ENTITLEMENTS_VERSION } from '@vibecore/billing';
import { afterEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line no-restricted-imports -- this service has no ~/ path alias; keep the DB spec service-local.
import { PrismaApiStore } from '../prisma-store.js';
// eslint-disable-next-line no-restricted-imports -- this service has no ~/ path alias; keep the DB spec service-local.
import { createDefaultProjectManifest, projectManifestDigest } from '../project-manifest.js';
// eslint-disable-next-line no-restricted-imports -- this service has no ~/ path alias; keep the DB spec service-local.
import type { StaticRollbackReleaseCommitInput } from '../store.js';
import { acquireTestProjectReleaseFence } from './project-release-barrier-fixture.js';

async function canReachDatabase() {
  if (!process.env.DATABASE_URL) {
    return false;
  }

  const prisma = createDatabaseClient();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

const runDbTests = (await canReachDatabase()) ? describe.sequential : describe.skip;
const FINGERPRINT = 'a'.repeat(64);
const SOURCE_DIGEST = `sha256:${'b'.repeat(64)}`;
const SOURCE_ARTIFACT_REF = `static-artifacts/sha256/${'b'.repeat(64)}`;
const CONFIG_DIGEST = `sha256:${'c'.repeat(64)}`;
const PLAN_ENTITLEMENTS = {
  version: PLAN_ENTITLEMENTS_VERSION,
  plan: 'pro' as const,
  badgeRequired: false,
  publishRegion: 'platform-default',
  publishRegions: 'all' as const,
};

function suffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

async function seedStaticHistory(store: PrismaApiStore, label: string) {
  const unique = suffix();

  const actor = await store.prisma.user.create({
    data: { email: `rollback-${label}-${unique}@example.test` },
  });
  const organization = await store.prisma.organization.create({
    data: { name: `Rollback ${label} ${unique}`, slug: `rollback-${label}-${unique}` },
  });
  const project = await store.prisma.project.create({
    data: { organizationId: organization.id, name: `Rollback ${label}`, slug: `rollback-${label}-${unique}` },
  });

  const manifest = createDefaultProjectManifest(project.id);
  const manifestDigest = projectManifestDigest(manifest);
  await store.prisma.projectManifestRevision.create({
    data: {
      projectId: project.id,
      schemaVersion: manifest.schemaVersion,
      manifestVersion: manifest.manifestVersion,
      digest: manifestDigest,
      manifest,
    },
  });

  const previous = await store.createDeployment({
    projectId: project.id,
    expectedOrganizationId: project.organizationId,
    provider: 'static',
    environment: 'preview',
    status: 'READY',
    accessPolicy: { mode: 'PUBLIC' },
    metadata: { planEntitlements: PLAN_ENTITLEMENTS, projectManifestDigest: manifestDigest },
  });
  const current = await store.createDeployment({
    projectId: project.id,
    expectedOrganizationId: project.organizationId,
    provider: 'static',
    environment: 'preview',
    status: 'READY',
    accessPolicyVersion: previous.accessPolicyVersion,
    metadata: { planEntitlements: PLAN_ENTITLEMENTS, projectManifestDigest: manifestDigest },
  });
  const sourceManifest = await store.createReleaseManifest({
    projectId: project.id,
    deploymentId: previous.id,
    environment: 'preview',
    version: 1,
    provider: 'static',
    artifactKind: 'static-snapshot',
    artifactRef: SOURCE_ARTIFACT_REF,
    artifactDigest: SOURCE_DIGEST,
    configDigest: CONFIG_DIGEST,
    accessPolicyVersion: previous.accessPolicyVersion,
    planEntitlements: PLAN_ENTITLEMENTS,
    projectManifestDigest: manifestDigest,
  });
  await store.createReleaseManifest({
    projectId: project.id,
    deploymentId: current.id,
    environment: 'preview',
    version: 2,
    provider: 'static',
    artifactKind: 'static-snapshot',
    artifactRef: `static-artifacts/sha256/${'d'.repeat(64)}`,
    artifactDigest: `sha256:${'d'.repeat(64)}`,
    accessPolicyVersion: current.accessPolicyVersion,
    planEntitlements: PLAN_ENTITLEMENTS,
    projectManifestDigest: manifestDigest,
  });

  return { actor, organization, project, previous, current, sourceManifest, manifestDigest };
}

function rollbackMetadata(input: { operationId: string; projectManifestDigest: string; sourceDeploymentId: string }) {
  return {
    rollbackToPrevious: true,
    rollbackOperationId: input.operationId,
    planEntitlements: PLAN_ENTITLEMENTS,
    projectManifestDigest: input.projectManifestDigest,
    restoredFromVersion: 1,
    restoredFromDeploymentId: input.sourceDeploymentId,
    supersededVersion: 2,
  };
}

runDbTests('rollback operation — real PostgreSQL clock, lease, and release CAS', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('collapses two replicas, ignores process-clock skew, and refuses to publish an expired owner effect', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const storeA = new PrismaApiStore(prismaA);
    const storeB = new PrismaApiStore(prismaB);

    let seeded: Awaited<ReturnType<typeof seedStaticHistory>> | undefined;

    try {
      seeded = await seedStaticHistory(storeA, 'fence');

      const input = {
        projectId: seeded.project.id,
        actorUserId: seeded.actor.id,
        idempotencyKey: `same-${suffix()}`,
        requestFingerprint: FINGERPRINT,
        environment: 'preview',
        leaseDurationMs: 5_000,
      };
      const [left, right] = await Promise.all([
        storeA.acquireRollbackOperation({ ...input, ownerToken: 'owner-a' }),
        storeB.acquireRollbackOperation({ ...input, ownerToken: 'owner-b' }),
      ]);
      expect([left.kind, right.kind].sort()).toEqual(['ACQUIRED', 'BUSY']);

      const winner = left.kind === 'ACQUIRED' ? left : right;
      const winnerOwner = left.kind === 'ACQUIRED' ? 'owner-a' : 'owner-b';
      const winnerStore = left.kind === 'ACQUIRED' ? storeA : storeB;
      const otherStore = left.kind === 'ACQUIRED' ? storeB : storeA;

      vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2099-01-01T00:00:00.000Z'));
      await expect(
        otherStore.acquireRollbackOperation({ ...input, ownerToken: 'owner-future-clock' }),
      ).resolves.toMatchObject({
        kind: 'BUSY',
      });
      vi.restoreAllMocks();

      const operation = await winnerStore.bindRollbackOperationTarget({
        operationId: winner.record.id,
        ownerToken: winnerOwner,
        fencingToken: 1,
        deploymentId: `rollback-${suffix()}`,
        expectedHeadVersion: 2,
        previousManifestId: seeded.sourceManifest.id,
        projectManifestDigest: seeded.manifestDigest,
      });
      const metadata = rollbackMetadata({
        operationId: operation.id,
        projectManifestDigest: seeded.manifestDigest,
        sourceDeploymentId: seeded.previous.id,
      });
      await winnerStore.ensureRollbackDeployment({
        fence: { operationId: operation.id, ownerToken: winnerOwner, fencingToken: 1 },
        deployment: {
          id: operation.deploymentId!,
          projectId: seeded.project.id,
          provider: 'static',
          environment: 'preview',
          status: 'QUEUED',
          accessPolicyVersion: seeded.sourceManifest.accessPolicyVersion,
          rolledBackFromId: seeded.previous.id,
          metadata,
        },
      });
      await winnerStore.beginRollbackEffect({
        operationId: operation.id,
        ownerToken: winnerOwner,
        fencingToken: 1,
      });

      await prismaA.$executeRaw`
        UPDATE "RollbackIdempotencyRequest"
        SET "leaseExpiresAt" = clock_timestamp() - INTERVAL '1 second'
        WHERE "id" = ${operation.id}
      `;
      vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2000-01-01T00:00:00.000Z'));

      const recovered = await otherStore.acquireRollbackOperation({ ...input, ownerToken: 'owner-recovered' });
      expect(recovered).toMatchObject({
        kind: 'ACQUIRED',
        record: { fencingToken: 2, deploymentId: operation.deploymentId },
      });
      vi.restoreAllMocks();

      await expect(
        winnerStore.updateRollbackDeployment({
          fence: { operationId: operation.id, ownerToken: winnerOwner, fencingToken: 1 },
          projectId: seeded.project.id,
          deploymentId: operation.deploymentId!,
          patch: { status: 'FAILED' },
        }),
      ).rejects.toThrow('ROLLBACK_OWNERSHIP_LOST');

      const release = await acquireTestProjectReleaseFence(otherStore, {
        projectId: seeded.project.id,
        organizationId: seeded.organization.id,
      });

      const commit: StaticRollbackReleaseCommitInput = {
        operationId: operation.id,
        ownerToken: 'owner-recovered',
        fencingToken: 2,
        expectedHeadVersion: 2,
        projectId: seeded.project.id,
        deploymentId: operation.deploymentId!,
        environment: 'preview',
        provider: 'static',
        artifactRef: SOURCE_ARTIFACT_REF,
        artifactDigest: SOURCE_DIGEST,
        configDigest: CONFIG_DIGEST,
        accessPolicyVersion: seeded.sourceManifest.accessPolicyVersion,
        url: 'https://rollback.example.test',
        metadata,
        logs: [],
        finishedAt: new Date().toISOString(),
        releaseFence: release.releaseFence,
        responseContentLanguage: 'en',
      };
      await expect(otherStore.commitStaticRollbackRelease(commit)).rejects.toThrow('STATIC_ROLLBACK_RELEASE_CONFLICT');
      expect(await prismaA.releaseManifest.count({ where: { deploymentId: operation.deploymentId } })).toBe(0);
      await otherStore.updateRollbackDeployment({
        fence: { operationId: operation.id, ownerToken: 'owner-recovered', fencingToken: 2 },
        projectId: seeded.project.id,
        deploymentId: operation.deploymentId!,
        patch: { status: 'FAILED' },
      });
      await otherStore.completeRollbackEffectCleanup({
        operationId: operation.id,
        ownerToken: 'owner-recovered',
        fencingToken: 2,
      });
      await otherStore.completeRollbackOperation({
        operationId: operation.id,
        ownerToken: 'owner-recovered',
        fencingToken: 2,
        responseStatus: 409,
        responseContentLanguage: 'en',
        responseBody: { code: 'ROLLBACK_RECOVERED_FAILED_ATTEMPT' },
      });
      await expect(
        otherStore.acquireRollbackOperation({ ...input, ownerToken: 'owner-replay' }),
      ).resolves.toMatchObject({
        kind: 'REPLAY',
        record: {
          responseStatus: 409,
          fencingToken: 2,
          effectFencingToken: 1,
          responseBody: { code: 'ROLLBACK_RECOVERED_FAILED_ATTEMPT' },
        },
      });
    } finally {
      if (seeded) {
        await prismaA.releaseManifest.deleteMany({ where: { projectId: seeded.project.id } }).catch(() => undefined);
        await prismaA.organization.delete({ where: { id: seeded.organization.id } }).catch(() => undefined);
        await prismaA.user.delete({ where: { id: seeded.actor.id } }).catch(() => undefined);
      }

      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('fails closed on a historical actorless rollback row', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    let seeded: Awaited<ReturnType<typeof seedStaticHistory>> | undefined;

    try {
      seeded = await seedStaticHistory(store, 'actorless');
      const acquired = await store.acquireRollbackOperation({
        projectId: seeded.project.id,
        actorUserId: seeded.actor.id,
        idempotencyKey: `actorless-${suffix()}`,
        requestFingerprint: FINGERPRINT,
        environment: 'preview',
        ownerToken: 'legacy-owner',
        leaseDurationMs: 30_000,
      });
      expect(acquired.kind).toBe('ACQUIRED');
      await prisma.rollbackIdempotencyRequest.update({
        where: { id: acquired.record.id },
        data: { actorUserId: null },
      });

      await expect(
        store.renewRollbackOperationLease({
          operationId: acquired.record.id,
          ownerToken: 'legacy-owner',
          fencingToken: 1,
          leaseDurationMs: 30_000,
        }),
      ).rejects.toMatchObject({ code: 'ROLLBACK_OWNERSHIP_LOST' });
      await expect(
        store.validateRollbackOperationLease({
          operationId: acquired.record.id,
          ownerToken: 'legacy-owner',
          fencingToken: 1,
        }),
      ).resolves.toBe(false);
      await expect(
        store.acquireRollbackOperation({
          projectId: seeded.project.id,
          actorUserId: seeded.actor.id,
          idempotencyKey: acquired.record.idempotencyKey,
          requestFingerprint: FINGERPRINT,
          environment: 'preview',
          ownerToken: 'new-owner',
          leaseDurationMs: 30_000,
        }),
      ).resolves.toMatchObject({ kind: 'FINGERPRINT_CONFLICT' });
    } finally {
      if (seeded) {
        await prisma.releaseManifest.deleteMany({ where: { projectId: seeded.project.id } }).catch(() => undefined);
        await prisma.organization.delete({ where: { id: seeded.organization.id } }).catch(() => undefined);
        await prisma.user.delete({ where: { id: seeded.actor.id } }).catch(() => undefined);
      }
      await prisma.$disconnect();
    }
  });

  it('lets exactly one competing rollback append at a frozen release head', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const storeA = new PrismaApiStore(prismaA);
    const storeB = new PrismaApiStore(prismaB);

    let seeded: Awaited<ReturnType<typeof seedStaticHistory>> | undefined;

    try {
      seeded = await seedStaticHistory(storeA, 'cas');
      const release = await acquireTestProjectReleaseFence(storeA, {
        projectId: seeded.project.id,
        organizationId: seeded.organization.id,
      });

      const prepare = async (store: PrismaApiStore, key: string, ownerToken: string, deploymentId: string) => {
        const acquired = await store.acquireRollbackOperation({
          projectId: seeded!.project.id,
          actorUserId: seeded!.actor.id,
          idempotencyKey: key,
          requestFingerprint: FINGERPRINT,
          environment: 'preview',
          ownerToken,
          leaseDurationMs: 30_000,
        });
        expect(acquired.kind).toBe('ACQUIRED');

        const operation = await store.bindRollbackOperationTarget({
          operationId: acquired.record.id,
          ownerToken,
          fencingToken: 1,
          deploymentId,
          expectedHeadVersion: 2,
          previousManifestId: seeded!.sourceManifest.id,
          projectManifestDigest: seeded!.manifestDigest,
        });
        const metadata = rollbackMetadata({
          operationId: operation.id,
          projectManifestDigest: seeded!.manifestDigest,
          sourceDeploymentId: seeded!.previous.id,
        });
        await store.ensureRollbackDeployment({
          fence: { operationId: operation.id, ownerToken, fencingToken: 1 },
          deployment: {
            id: deploymentId,
            projectId: seeded!.project.id,
            provider: 'static',
            environment: 'preview',
            status: 'QUEUED',
            accessPolicyVersion: seeded!.sourceManifest.accessPolicyVersion,
            rolledBackFromId: seeded!.previous.id,
            metadata,
          },
        });
        await store.beginRollbackEffect({
          operationId: operation.id,
          ownerToken,
          fencingToken: 1,
        });

        return {
          key,
          ownerToken,
          operation,
          input: {
            operationId: operation.id,
            ownerToken,
            fencingToken: 1,
            expectedHeadVersion: 2,
            projectId: seeded!.project.id,
            deploymentId,
            environment: 'preview' as const,
            provider: 'static',
            artifactRef: SOURCE_ARTIFACT_REF,
            artifactDigest: SOURCE_DIGEST,
            configDigest: CONFIG_DIGEST,
            accessPolicyVersion: seeded!.sourceManifest.accessPolicyVersion,
            url: `https://${deploymentId}.example.test`,
            metadata,
            logs: [],
            finishedAt: new Date().toISOString(),
            releaseFence: release.releaseFence,
            responseContentLanguage: 'fr',
          } satisfies StaticRollbackReleaseCommitInput,
        };
      };

      const first = await prepare(storeA, `cas-a-${suffix()}`, 'owner-a', `rollback-a-${suffix()}`);
      const second = await prepare(storeB, `cas-b-${suffix()}`, 'owner-b', `rollback-b-${suffix()}`);

      const results = await Promise.allSettled([
        storeA.commitStaticRollbackRelease(first.input),
        storeB.commitStaticRollbackRelease(second.input),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      expect(
        String((results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason),
      ).toContain('ROLLBACK_RELEASE_MOVED');
      expect(await prismaA.releaseManifest.count({ where: { projectId: seeded.project.id } })).toBe(3);

      const rollbackDeployments = await prismaA.deployment.findMany({
        where: { id: { in: [first.input.deploymentId, second.input.deploymentId] } },
      });
      expect(rollbackDeployments.filter((deployment) => deployment.status === 'READY')).toHaveLength(1);
      expect(rollbackDeployments.filter((deployment) => deployment.status === 'QUEUED')).toHaveLength(1);

      const winnerIndex = results.findIndex((result) => result.status === 'fulfilled');
      const winner = winnerIndex === 0 ? first : second;
      const winnerStore = winnerIndex === 0 ? storeA : storeB;
      const winnerResult = results[winnerIndex] as PromiseFulfilledResult<
        Awaited<ReturnType<typeof storeA.commitStaticRollbackRelease>>
      >;
      const receipt = winnerResult.value.rollbackReceipt;
      expect(receipt).toMatchObject({
        responseStatus: 201,
        responseContentLanguage: 'fr',
        responseBody: {
          deployment: { id: winner.input.deploymentId, status: 'READY' },
          restoredFromVersion: 1,
          restoredFromDeploymentId: seeded.previous.id,
          supersededVersion: 2,
          verifiedArtifactDigest: SOURCE_DIGEST,
        },
      });

      // The HTTP onSend completion is deliberately an exact no-op after the
      // READY/manifest transaction has already made the receipt terminal.
      await winnerStore.completeRollbackOperation({
        operationId: winner.operation.id,
        ownerToken: winner.ownerToken,
        fencingToken: 1,
        ...receipt,
      });
      await expect(
        winnerStore.acquireRollbackOperation({
          projectId: seeded.project.id,
          actorUserId: seeded.actor.id,
          idempotencyKey: winner.key,
          requestFingerprint: FINGERPRINT,
          environment: 'preview',
          ownerToken: 'replay-owner',
          leaseDurationMs: 30_000,
        }),
      ).resolves.toMatchObject({
        kind: 'REPLAY',
        record: receipt,
      });
    } finally {
      if (seeded) {
        await prismaA.releaseManifest.deleteMany({ where: { projectId: seeded.project.id } }).catch(() => undefined);
        await prismaA.organization.delete({ where: { id: seeded.organization.id } }).catch(() => undefined);
        await prismaA.user.delete({ where: { id: seeded.actor.id } }).catch(() => undefined);
      }

      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('rejects a Reserved VM release under the project lock before inserting rollback authority', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const unique = suffix();
    let organizationId: string | undefined;
    let actorId: string | undefined;
    let projectId: string | undefined;

    try {
      const actor = await prisma.user.create({ data: { email: `reserved-rollback-${unique}@example.test` } });
      actorId = actor.id;
      const organization = await prisma.organization.create({
        data: { name: `Reserved rollback ${unique}`, slug: `reserved-rollback-${unique}` },
      });
      organizationId = organization.id;
      const project = await prisma.project.create({
        data: { organizationId: organization.id, name: 'Reserved rollback', slug: `reserved-rollback-${unique}` },
      });
      projectId = project.id;
      const manifest = createDefaultProjectManifest(project.id);
      const manifestDigest = projectManifestDigest(manifest);
      await store.createProjectManifestRevision({
        projectId: project.id,
        schemaVersion: manifest.schemaVersion,
        manifestVersion: manifest.manifestVersion,
        digest: manifestDigest,
        manifest,
      });
      const created = await store.createDeployment({
        projectId: project.id,
        expectedOrganizationId: project.organizationId,
        provider: 'server',
        environment: 'preview',
        status: 'READY',
        machineSize: 'dedicated-1',
        accessPolicy: { mode: 'PUBLIC' },
        metadata: { planEntitlements: PLAN_ENTITLEMENTS, projectManifestDigest: manifestDigest },
      });
      const claim = `reserved-data-${created.id}`;
      await prisma.deployment.update({
        where: { id: created.id },
        data: {
          runtimeKind: 'reserved-vm',
          reservedVmTier: 'dedicated-1',
          persistentStorageClaim: claim,
        },
      });
      for (const version of [1, 2]) {
        await prisma.releaseManifest.create({
          data: {
            projectId: project.id,
            deploymentId: created.id,
            environment: 'preview',
            version,
            provider: 'server',
            artifactKind: 'server-image',
            artifactRef: `registry.example.test/reserved@sha256:${String(version).repeat(64)}`,
            artifactDigest: `sha256:${String(version).repeat(64)}`,
            accessPolicyVersion: created.accessPolicyVersion,
            planEntitlements: PLAN_ENTITLEMENTS,
            projectManifestDigest: manifestDigest,
          },
        });
      }

      await expect(
        store.acquireRollbackOperation({
          projectId: project.id,
          actorUserId: actor.id,
          idempotencyKey: `reserved-refused-${unique}`,
          requestFingerprint: FINGERPRINT,
          environment: 'preview',
          ownerToken: 'reserved-refused-owner',
          leaseDurationMs: 30_000,
        }),
      ).rejects.toMatchObject({ code: 'RESERVED_VM_ROLLBACK_UNPINNED', statusCode: 409 });
      await expect(prisma.rollbackIdempotencyRequest.count({ where: { projectId: project.id } })).resolves.toBe(0);
      await expect(prisma.deployment.findUnique({ where: { id: created.id } })).resolves.toMatchObject({
        runtimeKind: 'reserved-vm',
        persistentStorageClaim: claim,
        status: 'READY',
      });
    } finally {
      if (projectId) {
        await prisma.releaseManifest.deleteMany({ where: { projectId } }).catch(() => undefined);
      }
      if (organizationId) {
        await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }
      if (actorId) await prisma.user.delete({ where: { id: actorId } }).catch(() => undefined);
      await prisma.$disconnect();
    }
  });
});
