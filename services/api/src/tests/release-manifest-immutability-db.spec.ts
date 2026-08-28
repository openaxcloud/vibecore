import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

const runDbTests = process.env.DATABASE_URL ? describe : describe.skip;

function suffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

runDbTests('ReleaseManifest database immutability', () => {
  it('rejects pin rewrites and live-project deletion, survives Deployment prune, then cascades on Project erasure', async () => {
    const prisma = createDatabaseClient();
    let organizationId: string | undefined;

    try {
      const organization = await prisma.organization.create({
        data: { name: `Release immutable ${suffix()}`, slug: `release-immutable-${suffix()}` },
      });
      organizationId = organization.id;
      const project = await prisma.project.create({
        data: { organizationId: organization.id, name: 'Release immutable', slug: `release-${suffix()}` },
      });
      const deployment = await prisma.deployment.create({
        data: { projectId: project.id, provider: 'static', environmentName: 'preview', status: 'READY' },
      });
      const manifest = await prisma.releaseManifest.create({
        data: {
          projectId: project.id,
          deploymentId: deployment.id,
          environment: 'preview',
          version: 1,
          provider: 'static',
          artifactKind: 'static-snapshot',
          artifactRef: `static-artifacts/sha256/${'a'.repeat(64)}`,
          artifactDigest: `sha256:${'a'.repeat(64)}`,
          configDigest: `sha256:${'b'.repeat(64)}`,
          accessPolicyVersion: 1,
          planEntitlements: {
            version: 1,
            plan: 'pro',
            badgeRequired: false,
            publishRegion: 'platform-default',
            publishRegions: 'all',
          },
          projectManifestDigest: `sha256:${'c'.repeat(64)}`,
        },
      });

      const mutations = [
        { artifactRef: `static-artifacts/sha256/${'d'.repeat(64)}` },
        { artifactDigest: `sha256:${'d'.repeat(64)}` },
        { configDigest: `sha256:${'d'.repeat(64)}` },
        { dbMigrationPoint: `sha256:${'d'.repeat(64)}` },
        { runtimeSpec: { schemaVersion: 1, hash: `sha256:${'d'.repeat(64)}` } },
        { promotionEvidence: { schemaVersion: 1, hash: `sha256:${'d'.repeat(64)}` } },
        { accessPolicyVersion: 2 },
        {
          planEntitlements: {
            version: 1,
            plan: 'enterprise',
            badgeRequired: false,
            publishRegion: 'platform-default',
            publishRegions: 'all',
          },
        },
        { projectManifestDigest: `sha256:${'d'.repeat(64)}` },
      ] as const;

      for (const data of mutations) {
        await expect(prisma.releaseManifest.update({ where: { id: manifest.id }, data })).rejects.toThrow();
      }

      await expect(prisma.releaseManifest.delete({ where: { id: manifest.id } })).rejects.toThrow();
      await prisma.deployment.delete({ where: { id: deployment.id } });
      await expect(prisma.releaseManifest.findUnique({ where: { id: manifest.id } })).resolves.toBeTruthy();

      await prisma.project.delete({ where: { id: project.id } });
      await expect(prisma.releaseManifest.findUnique({ where: { id: manifest.id } })).resolves.toBeNull();
    } finally {
      if (organizationId) {
        await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }
      await prisma.$disconnect();
    }
  });
});
