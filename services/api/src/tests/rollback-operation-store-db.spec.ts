import { createDatabaseClient } from '@vibecore/database';
import { PLAN_ENTITLEMENTS_VERSION } from '@vibecore/billing';
import { afterEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line no-restricted-imports -- this service has no ~/ path alias; keep the DB spec service-local.
import { PrismaApiStore } from '../prisma-store.js';
// eslint-disable-next-line no-restricted-imports -- this service has no ~/ path alias; keep the DB spec service-local.
import { createDefaultProjectManifest, projectManifestDigest } from '../project-manifest.js';
import { objectStorageStaticArtifactSummary } from '../object-storage-operation.js';
import { projectPermanentDeletionRequestHash } from '../project-permanent-deletion.js';
// eslint-disable-next-line no-restricted-imports -- this service has no ~/ path alias; keep the DB spec service-local.
import type { StaticRollbackReleaseCommitInput } from '../store.js';
import { acquireTestProjectReleaseFence } from './project-release-barrier-fixture.js';
import { emptyManagedDatabaseErasureCallbacks } from './project-database-erasure-test-support.js';

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

      const release = await acquireTestProjectReleaseFence(winnerStore, {
        projectId: seeded.project.id,
        organizationId: seeded.organization.id,
      });
      const operation = await winnerStore.bindRollbackOperationTarget({
        operationId: winner.record.id,
        ownerToken: winnerOwner,
        fencingToken: 1,
        deploymentId: `rollback-${suffix()}`,
        expectedHeadVersion: 2,
        previousManifestId: seeded.sourceManifest.id,
        projectManifestDigest: seeded.manifestDigest,
        releaseFence: release.releaseFence,
      });
      const metadata = rollbackMetadata({
        operationId: operation.id,
        projectManifestDigest: seeded.manifestDigest,
        sourceDeploymentId: seeded.previous.id,
      });
      await winnerStore.ensureRollbackDeployment({
        fence: { operationId: operation.id, ownerToken: winnerOwner, fencingToken: 1 },
        releaseFence: release.releaseFence,
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
        releaseFence: release.releaseFence,
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
          releaseFence: release.releaseFence,
          projectId: seeded.project.id,
          deploymentId: operation.deploymentId!,
          patch: { status: 'FAILED' },
        }),
      ).rejects.toThrow('ROLLBACK_OWNERSHIP_LOST');

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
        releaseFence: release.releaseFence,
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
          releaseFence: release.releaseFence,
        });
        const metadata = rollbackMetadata({
          operationId: operation.id,
          projectManifestDigest: seeded!.manifestDigest,
          sourceDeploymentId: seeded!.previous.id,
        });
        await store.ensureRollbackDeployment({
          fence: { operationId: operation.id, ownerToken, fencingToken: 1 },
          releaseFence: release.releaseFence,
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
          releaseFence: release.releaseFence,
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
        expectedOrganizationId: project.organizationId,
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
            artifactRef: `us-docker.pkg.dev/vibecore/runtime/p-${project.id}`,
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

  it('rechecks the permanent-deletion freeze after the project lock before inserting stale authority', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const storeB = new PrismaApiStore(prismaB);
    const unique = suffix();
    let actorId: string | undefined;
    let organizationId: string | undefined;
    let projectId: string | undefined;
    let releaseFreeze: () => void = () => undefined;

    try {
      const actor = await prismaA.user.create({ data: { email: `rollback-freeze-${unique}@example.test` } });
      actorId = actor.id;
      const organization = await prismaA.organization.create({
        data: { name: `Rollback freeze ${unique}`, slug: `rollback-freeze-${unique}` },
      });
      organizationId = organization.id;
      const project = await prismaA.project.create({
        data: { organizationId: organization.id, name: 'Rollback freeze', slug: `rollback-freeze-${unique}` },
      });
      projectId = project.id;

      let lockHeld: (() => void) | undefined;
      const held = new Promise<void>((resolve) => {
        lockHeld = resolve;
      });
      const mayFreeze = new Promise<void>((resolve) => {
        releaseFreeze = resolve;
      });
      const freeze = prismaA.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${`project-checkpoint:${project.id}`}, 0))
        `;
        lockHeld?.();
        await mayFreeze;
        await tx.project.update({
          where: { id: project.id },
          data: { deletedAt: new Date(), permanentDeletionStartedAt: new Date() },
        });
      });
      await held;

      const acquire = storeB.acquireRollbackOperation({
        projectId: project.id,
        actorUserId: actor.id,
        idempotencyKey: `stale-after-freeze-${unique}`,
        requestFingerprint: FINGERPRINT,
        environment: 'production',
        operationKind: 'PROVIDER',
        ownerToken: `stale-owner-${unique}`,
        leaseDurationMs: 30_000,
      });

      let waitingOnProjectLock = false;
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const rows = await prismaA.$queryRaw<Array<{ waiting: bigint }>>`
          SELECT count(*)::bigint AS "waiting"
          FROM pg_locks lock
          JOIN pg_stat_activity activity ON activity.pid = lock.pid
          WHERE lock.locktype = 'advisory'
            AND lock.database = (SELECT oid FROM pg_database WHERE datname = current_database())
            AND NOT lock.granted
            AND activity.query LIKE '%pg_advisory_xact_lock%'
        `;
        if (Number(rows[0]?.waiting ?? 0n) > 0) {
          waitingOnProjectLock = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waitingOnProjectLock).toBe(true);
      releaseFreeze();
      await freeze;

      await expect(acquire).rejects.toMatchObject({ code: 'PROJECT_PERMANENT_DELETION_ACTIVE', statusCode: 409 });
      await expect(prismaA.rollbackIdempotencyRequest.count({ where: { projectId: project.id } })).resolves.toBe(0);
    } finally {
      releaseFreeze();
      if (projectId) await prismaA.project.deleteMany({ where: { id: projectId } }).catch(() => undefined);
      if (organizationId) {
        await prismaA.organization.deleteMany({ where: { id: organizationId } }).catch(() => undefined);
      }
      if (actorId) await prismaA.user.deleteMany({ where: { id: actorId } }).catch(() => undefined);
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('persists provider ambiguity after release-fence loss and recovers without opening a second dispatch', async () => {
    const prisma = createDatabaseClient();
    const topologyBlocker = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const unique = suffix();
    let actorId: string | undefined;
    let organizationId: string | undefined;
    let projectId: string | undefined;
    let releaseTopologyBlocker: () => void = () => undefined;

    try {
      const actor = await prisma.user.create({ data: { email: `provider-recovery-${unique}@example.test` } });
      actorId = actor.id;
      const organization = await prisma.organization.create({
        data: { name: `Provider recovery ${unique}`, slug: `provider-recovery-${unique}` },
      });
      organizationId = organization.id;
      const project = await prisma.project.create({
        data: { organizationId: organization.id, name: 'Provider recovery', slug: `provider-recovery-${unique}` },
      });
      projectId = project.id;
      const source = await store.createDeployment({
        projectId: project.id,
        expectedOrganizationId: organization.id,
        provider: 'netlify',
        environment: 'production',
        status: 'READY',
        accessPolicy: { mode: 'PUBLIC' },
        productionUrl: `https://source-${unique}.example.test`,
        metadata: { providerBuildId: `netlify-deploy-${unique}` },
      });
      const firstRelease = await acquireTestProjectReleaseFence(store, {
        projectId: project.id,
        organizationId: organization.id,
      });
      const idempotencyKey = `provider-recovery-${unique}`;
      const firstOwner = `provider-owner-1-${unique}`;
      const acquired = await store.acquireRollbackOperation({
        projectId: project.id,
        actorUserId: actor.id,
        idempotencyKey,
        requestFingerprint: FINGERPRINT,
        environment: 'production',
        operationKind: 'PROVIDER',
        ownerToken: firstOwner,
        leaseDurationMs: 30_000,
      });
      expect(acquired.kind).toBe('ACQUIRED');

      const rollbackDeploymentId = `provider-rollback-${unique}`;
      const providerTarget = JSON.stringify({ provider: 'netlify', siteId: `site-${unique}` });
      const bindInput = {
        operationId: acquired.record.id,
        ownerToken: firstOwner,
        fencingToken: 1,
        deploymentId: rollbackDeploymentId,
        sourceDeploymentId: source.id,
        projectManifestDigest: firstRelease.digest,
        provider: 'netlify' as const,
        providerDeploymentId: `netlify-deploy-${unique}`,
        providerTarget,
      };
      const forgedReleaseFence = { ...firstRelease.releaseFence, ownerToken: `forged-${unique}` };
      const forgedManifestDigest = `sha256:${'e'.repeat(64)}`;

      await expect(
        store.bindProviderRollbackTarget({ ...bindInput, releaseFence: forgedReleaseFence }),
      ).rejects.toMatchObject({ code: 'PROJECT_RELEASE_BARRIER_LOST' });
      await expect(
        store.bindProviderRollbackTarget({
          ...bindInput,
          projectManifestDigest: forgedManifestDigest,
          releaseFence: firstRelease.releaseFence,
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_MANIFEST_CHANGED_BEFORE_PUBLISH' });
      await expect(
        prisma.rollbackIdempotencyRequest.findUniqueOrThrow({ where: { id: acquired.record.id } }),
      ).resolves.toMatchObject({ phase: 'CLAIMED', deploymentId: null, providerEffectState: null });

      let signalTopologyHeld: () => void = () => undefined;
      const topologyHeld = new Promise<void>((resolve) => {
        signalTopologyHeld = resolve;
      });
      const mayReleaseTopology = new Promise<void>((resolve) => {
        releaseTopologyBlocker = resolve;
      });
      const topologyBlockerTransaction = topologyBlocker.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock_shared(hashtext($1))', 'account-purge:topology');
        signalTopologyHeld();
        await mayReleaseTopology;
      });
      await topologyHeld;
      const bindPromise = store.bindProviderRollbackTarget({
        ...bindInput,
        releaseFence: firstRelease.releaseFence,
      });
      const deadline = Symbol('rollback-bind-deadline');
      let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
      const raced = await Promise.race([
        bindPromise,
        new Promise<typeof deadline>((resolve) => {
          deadlineTimer = setTimeout(() => resolve(deadline), 2_000);
        }),
      ]);
      if (deadlineTimer) clearTimeout(deadlineTimer);
      releaseTopologyBlocker();
      await topologyBlockerTransaction;
      const bound = await bindPromise;
      expect(raced).not.toBe(deadline);
      const metadata = {
        rollbackOperationId: bound.id,
        projectManifestDigest: firstRelease.digest,
        providerRollbackTarget: bindInput.providerDeploymentId,
        providerRollbackProvider: bindInput.provider,
        providerRollbackTargetScope: providerTarget,
      };
      const ensureInput = {
        fence: { operationId: bound.id, ownerToken: firstOwner, fencingToken: 1 },
        deployment: {
          id: rollbackDeploymentId,
          projectId: project.id,
          provider: 'netlify',
          environment: 'production' as const,
          status: 'QUEUED' as const,
          accessPolicyVersion: source.accessPolicyVersion,
          rolledBackFromId: source.id,
          metadata,
        },
      };

      await expect(
        store.ensureRollbackDeployment({ ...ensureInput, releaseFence: forgedReleaseFence }),
      ).rejects.toMatchObject({ code: 'PROJECT_RELEASE_BARRIER_LOST' });
      await expect(prisma.deployment.findUnique({ where: { id: rollbackDeploymentId } })).resolves.toBeNull();
      await store.ensureRollbackDeployment({ ...ensureInput, releaseFence: firstRelease.releaseFence });
      await expect(
        store.updateRollbackDeployment({
          fence: ensureInput.fence,
          releaseFence: firstRelease.releaseFence,
          projectId: project.id,
          deploymentId: rollbackDeploymentId,
          patch: { metadata: { ...metadata, projectManifestDigest: forgedManifestDigest } },
        }),
      ).rejects.toMatchObject({ code: 'ROLLBACK_DEPLOYMENT_CONFLICT' });
      await expect(prisma.deployment.findUniqueOrThrow({ where: { id: rollbackDeploymentId } })).resolves.toMatchObject(
        { metadata },
      );
      await expect(
        store.updateRollbackDeployment({
          fence: ensureInput.fence,
          releaseFence: forgedReleaseFence,
          projectId: project.id,
          deploymentId: rollbackDeploymentId,
          patch: { status: 'BUILDING' },
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_RELEASE_BARRIER_LOST' });
      await expect(
        store.beginProviderRollbackEffect({ ...ensureInput.fence, releaseFence: forgedReleaseFence }),
      ).rejects.toMatchObject({ code: 'PROJECT_RELEASE_BARRIER_LOST' });
      await expect(prisma.deployment.findUniqueOrThrow({ where: { id: rollbackDeploymentId } })).resolves.toMatchObject(
        { status: 'QUEUED' },
      );

      await expect(
        store.beginProviderRollbackEffect({ ...ensureInput.fence, releaseFence: firstRelease.releaseFence }),
      ).resolves.toMatchObject({
        kind: 'DISPATCH',
        record: { phase: 'EFFECT_STARTED', providerEffectState: 'DISPATCHING', effectFencingToken: 1 },
      });
      await expect(
        store.cancelDeployment({
          projectId: project.id,
          deploymentId: rollbackDeploymentId,
          canceledAt: new Date().toISOString(),
          logs: [],
        }),
      ).rejects.toMatchObject({ code: 'DEPLOYMENT_ROLLBACK_IN_PROGRESS', statusCode: 409 });
      await expect(prisma.deployment.findUniqueOrThrow({ where: { id: rollbackDeploymentId } })).resolves.toMatchObject(
        { status: 'QUEUED' },
      );
      await expect(firstRelease.release()).resolves.toBe(true);
      await expect(
        store.recordProviderRollbackDispatch({
          ...ensureInput.fence,
          state: 'AMBIGUOUS',
          responseEvidence: { reason: 'response_lost_after_provider_acceptance' },
        }),
      ).resolves.toMatchObject({ providerEffectState: 'AMBIGUOUS' });
      await expect(
        prisma.rollbackIdempotencyRequest.update({
          where: { id: bound.id },
          data: { providerResponseEvidence: { reason: 'tampered' } },
        }),
      ).rejects.toBeDefined();
      await expect(
        prisma.rollbackIdempotencyRequest.findUniqueOrThrow({ where: { id: bound.id } }),
      ).resolves.toMatchObject({ providerResponseEvidence: { reason: 'response_lost_after_provider_acceptance' } });
      await store.yieldRollbackOperationLease(ensureInput.fence);

      const secondOwner = `provider-owner-2-${unique}`;
      const recovered = await store.acquireRollbackOperation({
        projectId: project.id,
        actorUserId: actor.id,
        idempotencyKey,
        requestFingerprint: FINGERPRINT,
        environment: 'production',
        operationKind: 'PROVIDER',
        ownerToken: secondOwner,
        leaseDurationMs: 30_000,
      });
      expect(recovered).toMatchObject({
        kind: 'ACQUIRED',
        record: {
          fencingToken: 2,
          phase: 'EFFECT_STARTED',
          effectFencingToken: 1,
          providerEffectState: 'AMBIGUOUS',
        },
      });
      const secondFence = { operationId: bound.id, ownerToken: secondOwner, fencingToken: 2 };
      await expect(
        store.beginProviderRollbackEffect({ ...secondFence, releaseFence: firstRelease.releaseFence }),
      ).rejects.toMatchObject({ code: 'PROJECT_RELEASE_BARRIER_LOST' });
      const secondRelease = await acquireTestProjectReleaseFence(store, {
        projectId: project.id,
        organizationId: organization.id,
      });
      await expect(
        store.beginProviderRollbackEffect({ ...secondFence, releaseFence: secondRelease.releaseFence }),
      ).resolves.toMatchObject({
        kind: 'RECOVER',
        record: { phase: 'EFFECT_STARTED', effectFencingToken: 1, providerEffectState: 'AMBIGUOUS' },
      });
      await store.recordProviderRollbackObservation({
        ...secondFence,
        state: 'TARGET',
        evidence: {
          authority: 'site.published_deploy.id+traffic_splits',
          liveDeploymentIds: [bindInput.providerDeploymentId],
        },
      });
      await expect(
        store.commitProviderRollbackDeployment({
          fence: secondFence,
          releaseFence: secondRelease.releaseFence,
          projectId: project.id,
          deploymentId: rollbackDeploymentId,
          patch: { productionUrl: `https://rollback-${unique}.example.test`, finishedAt: new Date().toISOString() },
        }),
      ).rejects.toMatchObject({ code: 'PROVIDER_ROLLBACK_RECOVERY_AUTHORITY_INVALID' });
      await expect(prisma.deployment.findUniqueOrThrow({ where: { id: rollbackDeploymentId } })).resolves.toMatchObject(
        { status: 'QUEUED' },
      );
      await store.recordProviderRollbackObservation({
        ...secondFence,
        state: 'TARGET',
        evidence: {
          provider: 'netlify',
          authority: 'site.published_deploy.id+traffic_splits',
          providerTarget,
          targetDeploymentId: bindInput.providerDeploymentId,
          liveDeploymentIds: [bindInput.providerDeploymentId],
          responseStatus: 200,
        },
      });
      const observed = await prisma.rollbackIdempotencyRequest.findUniqueOrThrow({ where: { id: bound.id } });
      await expect(
        prisma.rollbackIdempotencyRequest.update({
          where: { id: bound.id },
          data: { providerRecoveryEvidence: [{ state: 'TARGET', authority: 'tampered' }] },
        }),
      ).rejects.toBeDefined();
      await expect(
        prisma.rollbackIdempotencyRequest.findUniqueOrThrow({ where: { id: bound.id } }),
      ).resolves.toMatchObject({ providerRecoveryEvidence: observed.providerRecoveryEvidence });
      await prisma.deployment.update({
        where: { id: rollbackDeploymentId },
        data: { metadata: { ...metadata, projectManifestDigest: forgedManifestDigest } },
      });
      await expect(
        store.commitProviderRollbackDeployment({
          fence: secondFence,
          releaseFence: secondRelease.releaseFence,
          projectId: project.id,
          deploymentId: rollbackDeploymentId,
          patch: { productionUrl: `https://rollback-${unique}.example.test`, finishedAt: new Date().toISOString() },
        }),
      ).rejects.toMatchObject({ code: 'ROLLBACK_DEPLOYMENT_CONFLICT' });
      await prisma.deployment.update({
        where: { id: rollbackDeploymentId },
        data: { metadata },
      });
      await expect(
        store.commitProviderRollbackDeployment({
          fence: secondFence,
          releaseFence: secondRelease.releaseFence,
          projectId: project.id,
          deploymentId: rollbackDeploymentId,
          patch: {
            metadata: { ...metadata, projectManifestDigest: forgedManifestDigest },
            productionUrl: `https://rollback-${unique}.example.test`,
            finishedAt: new Date().toISOString(),
          },
        }),
      ).rejects.toMatchObject({ code: 'ROLLBACK_DEPLOYMENT_CONFLICT' });
      await expect(
        store.commitProviderRollbackDeployment({
          fence: secondFence,
          releaseFence: firstRelease.releaseFence,
          projectId: project.id,
          deploymentId: rollbackDeploymentId,
          patch: { productionUrl: `https://rollback-${unique}.example.test`, finishedAt: new Date().toISOString() },
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_RELEASE_BARRIER_LOST' });
      await expect(prisma.deployment.findUniqueOrThrow({ where: { id: rollbackDeploymentId } })).resolves.toMatchObject(
        { status: 'QUEUED' },
      );

      await expect(
        store.commitProviderRollbackDeployment({
          fence: secondFence,
          releaseFence: secondRelease.releaseFence,
          projectId: project.id,
          deploymentId: rollbackDeploymentId,
          patch: { productionUrl: `https://rollback-${unique}.example.test`, finishedAt: new Date().toISOString() },
        }),
      ).resolves.toMatchObject({
        id: rollbackDeploymentId,
        status: 'READY',
        productionUrl: `https://rollback-${unique}.example.test`,
      });
      await store.completeRollbackOperation({
        ...secondFence,
        responseStatus: 201,
        responseContentLanguage: 'en',
        responseBody: { deployment: { id: rollbackDeploymentId, status: 'READY' } },
      });
      await expect(
        prisma.rollbackIdempotencyRequest.findUniqueOrThrow({ where: { id: bound.id } }),
      ).resolves.toMatchObject({
        status: 'COMPLETED',
        phase: 'RELEASE_COMMITTED',
        providerEffectState: 'COMMITTED',
        effectFencingToken: 1,
        fencingToken: 2,
      });
      await expect(prisma.releaseManifest.count({ where: { deploymentId: rollbackDeploymentId } })).resolves.toBe(0);
      await secondRelease.release();
    } finally {
      releaseTopologyBlocker();
      if (projectId) {
        await prisma.rollbackIdempotencyRequest.deleteMany({ where: { projectId } }).catch(() => undefined);
        await prisma.project.deleteMany({ where: { id: projectId } }).catch(() => undefined);
      }
      if (organizationId)
        await prisma.organization.deleteMany({ where: { id: organizationId } }).catch(() => undefined);
      if (actorId) await prisma.user.deleteMany({ where: { id: actorId } }).catch(() => undefined);
      await Promise.allSettled([prisma.$disconnect(), topologyBlocker.$disconnect()]);
    }
  });

  it('refuses provider recovery commits under a newer valid manifest fence', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const unique = suffix();
    let actorId: string | undefined;
    let organizationId: string | undefined;
    let projectId: string | undefined;
    let secondRelease: Awaited<ReturnType<typeof acquireTestProjectReleaseFence>> | undefined;

    try {
      const actor = await prisma.user.create({ data: { email: `provider-digest-${unique}@example.test` } });
      actorId = actor.id;
      const organization = await prisma.organization.create({
        data: { name: `Provider digest ${unique}`, slug: `provider-digest-${unique}` },
      });
      organizationId = organization.id;
      const project = await prisma.project.create({
        data: { organizationId: organization.id, name: 'Provider digest', slug: `provider-digest-${unique}` },
      });
      projectId = project.id;
      const firstManifest = createDefaultProjectManifest(project.id);
      const firstManifestDigest = projectManifestDigest(firstManifest);
      await store.createProjectManifestRevision({
        projectId: project.id,
        expectedOrganizationId: organization.id,
        schemaVersion: firstManifest.schemaVersion,
        manifestVersion: firstManifest.manifestVersion,
        digest: firstManifestDigest,
        manifest: firstManifest,
      });
      const source = await store.createDeployment({
        projectId: project.id,
        expectedOrganizationId: organization.id,
        provider: 'netlify',
        environment: 'production',
        status: 'READY',
        accessPolicy: { mode: 'PUBLIC' },
        metadata: { providerBuildId: `netlify-digest-${unique}`, projectManifestDigest: firstManifestDigest },
      });
      const firstRelease = await acquireTestProjectReleaseFence(store, {
        projectId: project.id,
        organizationId: organization.id,
      });
      const ownerToken = `provider-digest-owner-${unique}`;
      const acquired = await store.acquireRollbackOperation({
        projectId: project.id,
        actorUserId: actor.id,
        idempotencyKey: `provider-digest-${unique}`,
        requestFingerprint: FINGERPRINT,
        environment: 'production',
        operationKind: 'PROVIDER',
        ownerToken,
        leaseDurationMs: 30_000,
      });
      expect(acquired.kind).toBe('ACQUIRED');
      const fence = { operationId: acquired.record.id, ownerToken, fencingToken: 1 };
      const rollbackDeploymentId = `provider-digest-rollback-${unique}`;
      const providerDeploymentId = `netlify-digest-${unique}`;
      const providerTarget = JSON.stringify({ provider: 'netlify', siteId: `site-digest-${unique}` });
      await store.bindProviderRollbackTarget({
        ...fence,
        releaseFence: firstRelease.releaseFence,
        deploymentId: rollbackDeploymentId,
        sourceDeploymentId: source.id,
        projectManifestDigest: firstManifestDigest,
        provider: 'netlify',
        providerDeploymentId,
        providerTarget,
      });
      await store.ensureRollbackDeployment({
        fence,
        releaseFence: firstRelease.releaseFence,
        deployment: {
          id: rollbackDeploymentId,
          projectId: project.id,
          provider: 'netlify',
          environment: 'production',
          status: 'QUEUED',
          accessPolicyVersion: source.accessPolicyVersion,
          rolledBackFromId: source.id,
          metadata: {
            rollbackOperationId: acquired.record.id,
            projectManifestDigest: firstManifestDigest,
            providerRollbackTarget: providerDeploymentId,
            providerRollbackProvider: 'netlify',
            providerRollbackTargetScope: providerTarget,
          },
        },
      });
      await store.beginProviderRollbackEffect({ ...fence, releaseFence: firstRelease.releaseFence });
      await store.recordProviderRollbackDispatch({
        ...fence,
        state: 'ACCEPTED',
        responseStatus: 200,
        responseEvidence: { provider: 'netlify', status: 200 },
      });
      await store.recordProviderRollbackObservation({
        ...fence,
        state: 'TARGET',
        evidence: {
          provider: 'netlify',
          authority: 'site.published_deploy.id+traffic_splits',
          providerTarget,
          targetDeploymentId: providerDeploymentId,
          liveDeploymentIds: [providerDeploymentId],
          responseStatus: 200,
        },
      });
      await firstRelease.release();

      const secondManifest = { ...firstManifest, manifestVersion: 2 };
      const secondManifestDigest = projectManifestDigest(secondManifest);
      await store.createProjectManifestRevision({
        projectId: project.id,
        expectedOrganizationId: organization.id,
        schemaVersion: secondManifest.schemaVersion,
        manifestVersion: secondManifest.manifestVersion,
        digest: secondManifestDigest,
        manifest: secondManifest,
        expectedDigest: firstManifestDigest,
      });
      secondRelease = await acquireTestProjectReleaseFence(store, {
        projectId: project.id,
        organizationId: organization.id,
      });
      expect(secondRelease.digest).toBe(secondManifestDigest);

      await expect(
        store.beginProviderRollbackEffect({ ...fence, releaseFence: secondRelease.releaseFence }),
      ).rejects.toMatchObject({ code: 'PROJECT_MANIFEST_CHANGED_BEFORE_PUBLISH' });
      await expect(
        store.commitProviderRollbackDeployment({
          fence,
          releaseFence: secondRelease.releaseFence,
          projectId: project.id,
          deploymentId: rollbackDeploymentId,
          patch: { finishedAt: new Date().toISOString() },
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_MANIFEST_CHANGED_BEFORE_PUBLISH' });
      await expect(prisma.deployment.findUniqueOrThrow({ where: { id: rollbackDeploymentId } })).resolves.toMatchObject(
        { status: 'QUEUED' },
      );
    } finally {
      await secondRelease?.release().catch(() => undefined);
      if (projectId) {
        await prisma.rollbackIdempotencyRequest.deleteMany({ where: { projectId } }).catch(() => undefined);
        await prisma.project.deleteMany({ where: { id: projectId } }).catch(() => undefined);
      }
      if (organizationId) {
        await prisma.organization.deleteMany({ where: { id: organizationId } }).catch(() => undefined);
      }
      if (actorId) await prisma.user.deleteMany({ where: { id: actorId } }).catch(() => undefined);
      await prisma.$disconnect();
    }
  });

  it('blocks every project deletion path while a provider rollback effect is in progress', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const unique = suffix();
    let actorId: string | undefined;
    let organizationId: string | undefined;
    let projectId: string | undefined;

    try {
      const actor = await prisma.user.create({ data: { email: `provider-delete-guard-${unique}@example.test` } });
      actorId = actor.id;
      const organization = await prisma.organization.create({
        data: { name: `Provider delete guard ${unique}`, slug: `provider-delete-guard-${unique}` },
      });
      organizationId = organization.id;
      const project = await prisma.project.create({
        data: { organizationId: organization.id, name: 'Provider delete guard', slug: `provider-delete-${unique}` },
      });
      projectId = project.id;
      const operation = await prisma.rollbackIdempotencyRequest.create({
        data: {
          projectId: project.id,
          actorUserId: actor.id,
          idempotencyKey: `provider-delete-${unique}`,
          requestFingerprint: '9'.repeat(64),
          environment: 'production',
          operationKind: 'PROVIDER',
          status: 'IN_PROGRESS',
          phase: 'EFFECT_STARTED',
          leaseOwner: `provider-owner-${unique}`,
          leaseExpiresAt: new Date(Date.now() + 60_000),
          fencingToken: 1,
          effectFencingToken: 1,
          deploymentId: `rollback-deployment-${unique}`,
          sourceDeploymentId: `source-deployment-${unique}`,
          projectManifestDigest: `sha256:${'8'.repeat(64)}`,
          provider: 'netlify',
          providerDeploymentId: `netlify-deploy-${unique}`,
          providerTarget: JSON.stringify({ provider: 'netlify', siteId: `site-${unique}` }),
          providerEffectState: 'DISPATCHING',
          providerEffectStartedAt: new Date(),
        },
      });
      const providerEffects = vi.fn();
      const requestHash = projectPermanentDeletionRequestHash({
        projectId: project.id,
        organizationId: organization.id,
        actorUserId: actor.id,
        expectedProjectName: project.name,
      });

      await expect(
        store.hardDeleteProject({
          projectId: project.id,
          expectedOrganizationId: organization.id,
          expectedProjectName: project.name,
          actorUserId: actor.id,
          idempotencyKey: `hard-delete-${unique}`,
          requestHash,
          ...emptyManagedDatabaseErasureCallbacks(),
          preflightPhysicalErasure: async () => {
            providerEffects();
            return { summary: objectStorageStaticArtifactSummary([]), artifacts: [] };
          },
          erasePhysical: async () => {
            providerEffects();
          },
          verifyPhysicalAbsence: async () => {
            providerEffects();
            throw new Error('UNREACHABLE_PROVIDER_VERIFICATION');
          },
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_ROLLBACK_OPERATION_IN_PROGRESS', statusCode: 409 });
      expect(providerEffects).not.toHaveBeenCalled();
      await expect(
        prisma.project.findUniqueOrThrow({
          where: { id: project.id },
          select: { deletedAt: true, permanentDeletionStartedAt: true },
        }),
      ).resolves.toEqual({ deletedAt: null, permanentDeletionStartedAt: null });
      await expect(prisma.rollbackIdempotencyRequest.delete({ where: { id: operation.id } })).rejects.toBeDefined();
      await expect(prisma.rollbackIdempotencyRequest.count({ where: { id: operation.id } })).resolves.toBe(1);
      await expect(prisma.project.delete({ where: { id: project.id } })).rejects.toMatchObject({ code: 'P2003' });

      await prisma.rollbackIdempotencyRequest.update({
        where: { id: operation.id },
        data: {
          providerEffectState: 'OBSERVED_TARGET',
          providerRecoveryEvidence: [{ state: 'TARGET', liveDeploymentIds: [operation.providerDeploymentId] }],
        },
      });
      const completedAt = new Date();
      await prisma.rollbackIdempotencyRequest.update({
        where: { id: operation.id },
        data: {
          status: 'COMPLETED',
          phase: 'RELEASE_COMMITTED',
          leaseOwner: null,
          leaseExpiresAt: null,
          providerEffectState: 'COMMITTED',
          providerEffectResolvedAt: completedAt,
          responseStatus: 201,
          responseContentLanguage: 'en',
          responseBody: { deployment: { id: operation.deploymentId, status: 'READY' } },
          completedAt,
        },
      });

      await expect(prisma.project.delete({ where: { id: project.id } })).resolves.toMatchObject({ id: project.id });
      projectId = undefined;
      await expect(prisma.rollbackIdempotencyRequest.findUnique({ where: { id: operation.id } })).resolves.toBeNull();
    } finally {
      if (projectId) {
        await prisma.rollbackIdempotencyRequest.deleteMany({ where: { projectId } }).catch(() => undefined);
        await prisma.project.deleteMany({ where: { id: projectId } }).catch(() => undefined);
      }
      if (organizationId)
        await prisma.organization.deleteMany({ where: { id: organizationId } }).catch(() => undefined);
      if (actorId) await prisma.user.deleteMany({ where: { id: actorId } }).catch(() => undefined);
      await prisma.$disconnect();
    }
  });

  it('audits DB-clock supersession and releases the project deletion guard', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const unique = suffix();
    let actorId: string | undefined;
    let operatorId: string | undefined;
    let organizationId: string | undefined;
    let projectId: string | undefined;

    try {
      const actor = await prisma.user.create({ data: { email: `provider-superseded-actor-${unique}@example.test` } });
      actorId = actor.id;
      const operator = await prisma.user.create({
        data: { email: `provider-superseded-operator-${unique}@example.test`, platformAdmin: true },
      });
      operatorId = operator.id;
      const organization = await prisma.organization.create({
        data: { name: `Provider superseded ${unique}`, slug: `provider-superseded-${unique}` },
      });
      organizationId = organization.id;
      const project = await prisma.project.create({
        data: { organizationId: organization.id, name: 'Provider superseded', slug: `provider-superseded-${unique}` },
      });
      projectId = project.id;
      const providerDeploymentId = `netlify-target-${unique}`;
      const providerTarget = JSON.stringify({ provider: 'netlify', siteId: `site-${unique}` });
      const source = await store.createDeployment({
        projectId: project.id,
        expectedOrganizationId: organization.id,
        provider: 'netlify',
        environment: 'production',
        status: 'READY',
        accessPolicy: { mode: 'PUBLIC' },
        productionUrl: `https://source-${unique}.example.test`,
        metadata: { providerBuildId: providerDeploymentId },
      });
      const release = await acquireTestProjectReleaseFence(store, {
        projectId: project.id,
        organizationId: organization.id,
      });
      const operationId = `provider-superseded-${unique}`;
      const rollback = await store.createDeployment({
        projectId: project.id,
        expectedOrganizationId: organization.id,
        releaseFence: release.releaseFence,
        provider: 'netlify',
        environment: 'production',
        status: 'QUEUED',
        accessPolicyVersion: source.accessPolicyVersion,
        rolledBackFromId: source.id,
        metadata: {
          rollbackOperationId: operationId,
          providerRollbackTarget: providerDeploymentId,
          providerRollbackProvider: 'netlify',
          providerRollbackTargetScope: providerTarget,
          projectManifestDigest: release.digest,
        },
      });
      const firstObservedAt = new Date(Date.now() - 61_000).toISOString();
      await prisma.rollbackIdempotencyRequest.create({
        data: {
          id: operationId,
          projectId: project.id,
          actorUserId: actor.id,
          idempotencyKey: `provider-superseded-${unique}`,
          requestFingerprint: '7'.repeat(64),
          environment: 'production',
          operationKind: 'PROVIDER',
          status: 'IN_PROGRESS',
          phase: 'EFFECT_STARTED',
          leaseOwner: `provider-superseded-owner-${unique}`,
          leaseExpiresAt: new Date(Date.now() + 60_000),
          fencingToken: 1,
          effectFencingToken: 1,
          deploymentId: rollback.id,
          sourceDeploymentId: source.id,
          projectManifestDigest: release.digest,
          provider: 'netlify',
          providerDeploymentId,
          providerTarget,
          providerEffectState: 'MANUAL_RECOVERY',
          providerResponseStatus: 409,
          providerResponseEvidence: { provider: 'netlify', outcome: 'rejected' },
          providerRecoveryEvidence: [
            {
              provider: 'netlify',
              authority: 'site.published_deploy.id+traffic_splits',
              providerTarget,
              targetDeploymentId: providerDeploymentId,
              liveDeploymentIds: [`netlify-newer-${unique}`],
              responseStatus: 200,
              state: 'OTHER',
              recoveryMode: 'OPERATOR',
              operatorUserId: operator.id,
              observedAt: firstObservedAt,
            },
          ],
          providerEffectStartedAt: new Date(Date.now() - 120_000),
        },
      });
      const rollbackFence = {
        operationId,
        ownerToken: `provider-superseded-owner-${unique}`,
        fencingToken: 1,
      };
      await store.recordProviderRollbackObservation({
        ...rollbackFence,
        state: 'OTHER',
        evidence: {
          provider: 'netlify',
          authority: 'site.published_deploy.id+traffic_splits',
          providerTarget,
          targetDeploymentId: providerDeploymentId,
          liveDeploymentIds: [`netlify-newer-${unique}`],
          responseStatus: 200,
          recoveryMode: 'OPERATOR',
          operatorUserId: operator.id,
        },
      });

      const resolved = await store.resolveProviderRollbackOperator({
        fence: rollbackFence,
        releaseFence: release.releaseFence,
        operatorUserId: operator.id,
        ipAddress: '127.0.0.1',
        resolution: 'SUPERSEDED',
        projectId: project.id,
        deploymentId: rollback.id,
      });
      expect(resolved).toMatchObject({
        resolution: 'SUPERSEDED',
        operation: {
          status: 'COMPLETED',
          phase: 'PROVIDER_SUPERSEDED',
          providerEffectState: 'SUPERSEDED',
          responseStatus: 409,
        },
        deployment: { status: 'FAILED' },
      });
      await expect(prisma.auditLog.findUnique({ where: { id: resolved.auditLogId } })).resolves.toMatchObject({
        organizationId: organization.id,
        actorUserId: operator.id,
        action: 'deployment.rollback.recovery',
        resourceType: 'rollbackOperation',
        resourceId: operationId,
      });
      await release.release();
      await expect(prisma.project.delete({ where: { id: project.id } })).resolves.toMatchObject({ id: project.id });
      projectId = undefined;
      await expect(prisma.rollbackIdempotencyRequest.findUnique({ where: { id: operationId } })).resolves.toBeNull();
    } finally {
      if (projectId) {
        await prisma.rollbackIdempotencyRequest.deleteMany({ where: { projectId } }).catch(() => undefined);
        await prisma.project.deleteMany({ where: { id: projectId } }).catch(() => undefined);
      }
      if (organizationId) {
        await prisma.auditLog.deleteMany({ where: { organizationId } }).catch(() => undefined);
        await prisma.organization.deleteMany({ where: { id: organizationId } }).catch(() => undefined);
      }
      if (operatorId) await prisma.user.deleteMany({ where: { id: operatorId } }).catch(() => undefined);
      if (actorId) await prisma.user.deleteMany({ where: { id: actorId } }).catch(() => undefined);
      await prisma.$disconnect();
    }
  });
});
