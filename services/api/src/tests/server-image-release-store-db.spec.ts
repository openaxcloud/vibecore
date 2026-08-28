import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line no-restricted-imports -- this service has no ~/ path alias; keep the DB spec service-local.
import { PrismaApiStore } from '../prisma-store.js';
// eslint-disable-next-line no-restricted-imports -- this service has no ~/ path alias; keep the DB spec service-local.
import type { ServerImageReleaseCommitInput } from '../store.js';
import { deterministicServerReleaseFixture } from './deterministic-release-fixture.js';
import { acquireTestProjectReleaseFence } from './project-release-barrier-fixture.js';

const runDbTests = process.env.DATABASE_URL ? describe : describe.skip;
const DIGEST = `sha256:${'a'.repeat(64)}`;

function suffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

runDbTests('server-image release — durable Postgres linearization', () => {
  it('two replicas commit exactly one READY manifest and retain its promotion proof', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();

    let organizationId: string | undefined;
    let release: Awaited<ReturnType<typeof acquireTestProjectReleaseFence>> | undefined;

    try {
      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);

      const organization = await prismaA.organization.create({
        data: { name: `Promotion ${suffix()}`, slug: `promotion-${suffix()}` },
      });
      organizationId = organization.id;

      const project = await prismaA.project.create({
        data: { organizationId: organization.id, name: 'Promotion release', slug: `promotion-release-${suffix()}` },
      });

      const imageRef = `europe-west9-docker.pkg.dev/tenant-project/releases/p-${project.id.toLowerCase()}`;
      release = await acquireTestProjectReleaseFence(storeA, {
        projectId: project.id,
        organizationId: organization.id,
      });

      const pins = deterministicServerReleaseFixture({
        organizationId: organization.id,
        projectId: project.id,
        projectManifestDigest: release.digest,
        accessPolicyVersion: 1,
        artifactRef: imageRef,
        artifactDigest: DIGEST,
        promotionId: `promo-${suffix()}`,
      });
      const promotion = pins.promotion;
      const deployment = await storeA.createDeployment({
        projectId: project.id,
        expectedOrganizationId: project.organizationId,
        releaseFence: release.releaseFence,
        provider: 'server',
        environment: 'preview',
        status: 'BUILDING',
        machineSize: 'shared-0.5',
        accessPolicy: { mode: 'INVITE_ONLY' },
        metadata: {
          planEntitlements: pins.planEntitlements,
          projectManifestDigest: release.digest,
          serverDeploy: {
            image: { imageRef, imageDigest: DIGEST },
            promotion,
            rollbackRuntimeSpec: pins.runtimeSpec,
          },
        },
      });
      const input: ServerImageReleaseCommitInput = {
        projectId: project.id,
        organizationId: organization.id,
        deploymentId: deployment.id,
        environment: 'preview',
        artifactRef: imageRef,
        artifactDigest: DIGEST,
        runtimeSpec: pins.runtimeSpec,
        promotionEvidence: pins.promotionEvidence,
        url: 'https://release.example.test',
        previewUrl: 'https://release.example.test',
        metadata: deployment.metadata as Record<string, unknown>,
        logs: [],
        finishedAt: '2026-08-26T00:00:02.000Z',
        releaseFence: release.releaseFence,
      };

      await expect(
        storeB.updateDeployment(
          project.id,
          deployment.id,
          { metadata: { ...(deployment.metadata as Record<string, unknown>), fenceMarker: 'exact' } },
          release.releaseFence,
        ),
      ).resolves.toMatchObject({ metadata: { fenceMarker: 'exact' } });
      await expect(
        storeB.updateDeployment(
          project.id,
          deployment.id,
          { metadata: { ...(deployment.metadata as Record<string, unknown>), fenceMarker: 'forged' } },
          { ...release.releaseFence, ownerToken: 'forged-release-owner' },
        ),
      ).rejects.toMatchObject({ code: 'PROJECT_RELEASE_BARRIER_LOST', statusCode: 409 });
      expect((await prismaA.deployment.findUniqueOrThrow({ where: { id: deployment.id } })).metadata).toMatchObject({
        fenceMarker: 'exact',
      });

      const [first, second] = await Promise.all([
        storeA.commitServerImageRelease(input),
        storeB.commitServerImageRelease(input),
      ]);

      expect(first.committed).toBe(true);
      expect(second.committed).toBe(true);
      expect(first.manifest?.id).toBe(second.manifest?.id);
      expect(await prismaA.releaseManifest.count({ where: { deploymentId: deployment.id } })).toBe(1);
      expect((await prismaA.deployment.findUniqueOrThrow({ where: { id: deployment.id } })).status).toBe('READY');
      await expect(storeB.getServerImageReleasePromotion(deployment.id)).resolves.toEqual(promotion);
      await expect(storeB.commitServerImageRelease({ ...input, organizationId: 'org-cross-tenant' })).rejects.toThrow(
        /SERVER_RELEASE_PROMOTION_NOT_COMMITTED/u,
      );
      expect(await prismaA.releaseManifest.count({ where: { deploymentId: deployment.id } })).toBe(1);

      await prismaA.$executeRaw`
        UPDATE "ProjectCheckpoint"
        SET "barrierExpiresAt" = clock_timestamp() - INTERVAL '1 second'
        WHERE "id" = ${release.releaseFence.checkpointId}
      `;
      await expect(
        storeB.updateDeployment(
          project.id,
          deployment.id,
          { metadata: { ...(deployment.metadata as Record<string, unknown>), fenceMarker: 'lost' } },
          release.releaseFence,
        ),
      ).rejects.toMatchObject({ code: 'PROJECT_RELEASE_BARRIER_LOST', statusCode: 409 });
      expect((await prismaA.deployment.findUniqueOrThrow({ where: { id: deployment.id } })).metadata).not.toMatchObject(
        { fenceMarker: 'lost' },
      );
    } finally {
      await release?.release().catch(() => false);
      if (organizationId) {
        await prismaA.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }

      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });
});
