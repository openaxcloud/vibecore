import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

import { serverRollbackMachineMatchesRateCard } from '../deterministic-rollback.js';

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

  it('keeps historical RateCard machine pins immutable while allowing activation flips', async () => {
    const prisma = createDatabaseClient();
    const version = 1_000_000_000 + Math.floor(Math.random() * 100_000_000);
    const machine = {
      key: `rollback-${suffix()}`,
      rateCardVersion: version,
      cpuMillicores: 750,
      memoryMb: 3_072,
    };
    const data = {
      version,
      machineSizes: [
        {
          key: machine.key,
          cpuMillicores: machine.cpuMillicores,
          ramMb: machine.memoryMb,
        },
      ],
    };

    try {
      const card = await prisma.rateCard.create({
        data: { version, active: false, data },
      });

      await prisma.rateCard.update({ where: { id: card.id }, data: { active: true } });
      await prisma.rateCard.update({ where: { id: card.id }, data: { active: false } });

      const immutableMutations = [
        { id: `${card.id}-rewritten` },
        { version: version + 1 },
        { data: { ...data, machineSizes: [{ ...data.machineSizes[0], ramMb: machine.memoryMb + 1 }] } },
        { effectiveAt: new Date(card.effectiveAt.getTime() + 1_000) },
        { createdAt: new Date(card.createdAt.getTime() + 1_000) },
      ] as const;

      for (const mutation of immutableMutations) {
        await expect(prisma.rateCard.update({ where: { id: card.id }, data: mutation })).rejects.toThrow(
          'RateCard history is immutable',
        );
      }

      await expect(prisma.rateCard.delete({ where: { id: card.id } })).rejects.toThrow('RateCard history is immutable');

      const retained = await prisma.rateCard.findUniqueOrThrow({ where: { version } });
      expect(retained.active).toBe(false);
      expect(serverRollbackMachineMatchesRateCard(machine, retained.data)).toBe(true);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('keeps completed rollback receipts immutable while preserving user and project erasure', async () => {
    const prisma = createDatabaseClient();
    let organizationId: string | undefined;

    try {
      const actor = await prisma.user.create({ data: { email: `rollback-receipt-${suffix()}@example.test` } });
      const organization = await prisma.organization.create({
        data: { name: `Rollback receipt ${suffix()}`, slug: `rollback-receipt-${suffix()}` },
      });
      organizationId = organization.id;
      const project = await prisma.project.create({
        data: { organizationId: organization.id, name: 'Rollback receipt', slug: `rollback-receipt-${suffix()}` },
      });
      const targetDeploymentId = `rollback-target-${suffix()}`;
      const responseBody = {
        deployment: { id: targetDeploymentId, projectId: project.id, status: 'READY' },
        restoredFromVersion: 1,
      };
      const operation = await prisma.rollbackIdempotencyRequest.create({
        data: {
          projectId: project.id,
          actorUserId: actor.id,
          idempotencyKey: `rollback-key-${suffix()}`,
          requestFingerprint: 'e'.repeat(64),
          environment: 'preview',
          status: 'COMPLETED',
          phase: 'RELEASE_COMMITTED',
          fencingToken: 3,
          effectFencingToken: 3,
          deploymentId: targetDeploymentId,
          expectedHeadVersion: 2,
          previousManifestId: `manifest-${suffix()}`,
          projectManifestDigest: `sha256:${'f'.repeat(64)}`,
          responseStatus: 201,
          responseContentLanguage: 'en',
          responseBody,
          completedAt: new Date(),
        },
      });

      await expect(
        prisma.rollbackIdempotencyRequest.update({
          where: { id: operation.id },
          data: { responseBody: { forged: true } },
        }),
      ).rejects.toThrow('Completed RollbackIdempotencyRequest is immutable');
      await expect(
        prisma.rollbackIdempotencyRequest.update({ where: { id: operation.id }, data: { status: 'IN_PROGRESS' } }),
      ).rejects.toThrow('Completed RollbackIdempotencyRequest is immutable');
      await expect(
        prisma.rollbackIdempotencyRequest.update({ where: { id: operation.id }, data: { actorUserId: null } }),
      ).rejects.toThrow('Completed RollbackIdempotencyRequest is immutable');
      await expect(prisma.rollbackIdempotencyRequest.delete({ where: { id: operation.id } })).rejects.toThrow(
        'Completed RollbackIdempotencyRequest is immutable',
      );

      await prisma.user.delete({ where: { id: actor.id } });
      const afterUserErasure = await prisma.rollbackIdempotencyRequest.findUniqueOrThrow({
        where: { id: operation.id },
      });
      expect(afterUserErasure.actorUserId).toBeNull();
      expect(afterUserErasure.responseBody).toEqual(responseBody);
      expect(afterUserErasure.status).toBe('COMPLETED');

      await prisma.project.delete({ where: { id: project.id } });
      await expect(prisma.rollbackIdempotencyRequest.findUnique({ where: { id: operation.id } })).resolves.toBeNull();
    } finally {
      if (organizationId) {
        await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }
      await prisma.$disconnect();
    }
  });
});
