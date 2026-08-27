import { createDatabaseClient } from '@vibecore/database';
import { afterEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line no-restricted-imports -- this service has no ~/ path alias; keep the DB spec service-local.
import { PrismaApiStore } from '../prisma-store.js';
// eslint-disable-next-line no-restricted-imports -- this service has no ~/ path alias; keep the DB spec service-local.
import { createDefaultProjectManifest, projectManifestDigest } from '../project-manifest.js';
// eslint-disable-next-line no-restricted-imports -- this service has no ~/ path alias; keep the DB spec service-local.
import type { StaticRollbackReleaseCommitInput } from '../store.js';

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
const CONFIG_DIGEST = `sha256:${'c'.repeat(64)}`;

function suffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

async function seedStaticHistory(store: PrismaApiStore, label: string) {
  const unique = suffix();

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
    provider: 'static',
    environment: 'preview',
    status: 'READY',
    accessPolicy: { mode: 'PUBLIC' },
  });
  const current = await store.createDeployment({
    projectId: project.id,
    provider: 'static',
    environment: 'preview',
    status: 'READY',
    accessPolicyVersion: previous.accessPolicyVersion,
  });
  const sourceManifest = await store.createReleaseManifest({
    projectId: project.id,
    deploymentId: previous.id,
    environment: 'preview',
    version: 1,
    provider: 'static',
    artifactKind: 'static-snapshot',
    artifactRef: `static-deployments/${previous.id}`,
    artifactDigest: SOURCE_DIGEST,
    configDigest: CONFIG_DIGEST,
    accessPolicyVersion: previous.accessPolicyVersion,
  });
  await store.createReleaseManifest({
    projectId: project.id,
    deploymentId: current.id,
    environment: 'preview',
    version: 2,
    provider: 'static',
    artifactKind: 'static-snapshot',
    artifactRef: `static-deployments/${current.id}`,
    artifactDigest: `sha256:${'d'.repeat(64)}`,
    accessPolicyVersion: current.accessPolicyVersion,
  });

  return { organization, project, previous, current, sourceManifest, manifestDigest };
}

function rollbackMetadata(input: { operationId: string; projectManifestDigest: string; sourceDeploymentId: string }) {
  return {
    rollbackToPrevious: true,
    rollbackOperationId: input.operationId,
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

      const commit: StaticRollbackReleaseCommitInput = {
        operationId: operation.id,
        ownerToken: 'owner-recovered',
        fencingToken: 2,
        expectedHeadVersion: 2,
        projectId: seeded.project.id,
        deploymentId: operation.deploymentId!,
        environment: 'preview',
        provider: 'static',
        artifactRef: `static-deployments/${operation.deploymentId}`,
        artifactDigest: SOURCE_DIGEST,
        configDigest: CONFIG_DIGEST,
        accessPolicyVersion: seeded.sourceManifest.accessPolicyVersion,
        url: 'https://rollback.example.test',
        metadata,
        logs: [],
        finishedAt: new Date().toISOString(),
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
      }

      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
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

      const prepare = async (store: PrismaApiStore, key: string, ownerToken: string, deploymentId: string) => {
        const acquired = await store.acquireRollbackOperation({
          projectId: seeded!.project.id,
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
            artifactRef: `static-deployments/${deploymentId}`,
            artifactDigest: SOURCE_DIGEST,
            configDigest: CONFIG_DIGEST,
            accessPolicyVersion: seeded!.sourceManifest.accessPolicyVersion,
            url: `https://${deploymentId}.example.test`,
            metadata,
            logs: [],
            finishedAt: new Date().toISOString(),
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
      const responseBody = { deployment: { id: winner.input.deploymentId }, restoredFromVersion: 1 };
      await winnerStore.completeRollbackOperation({
        operationId: winner.operation.id,
        ownerToken: winner.ownerToken,
        fencingToken: 1,
        responseStatus: 201,
        responseContentLanguage: 'fr',
        responseBody,
      });
      await expect(
        winnerStore.acquireRollbackOperation({
          projectId: seeded.project.id,
          idempotencyKey: winner.key,
          requestFingerprint: FINGERPRINT,
          environment: 'preview',
          ownerToken: 'replay-owner',
          leaseDurationMs: 30_000,
        }),
      ).resolves.toMatchObject({
        kind: 'REPLAY',
        record: { responseStatus: 201, responseContentLanguage: 'fr', responseBody },
      });
    } finally {
      if (seeded) {
        await prismaA.releaseManifest.deleteMany({ where: { projectId: seeded.project.id } }).catch(() => undefined);
        await prismaA.organization.delete({ where: { id: seeded.organization.id } }).catch(() => undefined);
      }

      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });
});
