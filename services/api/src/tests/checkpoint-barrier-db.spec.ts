import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line no-restricted-imports -- API tsconfig has no ~/ path alias.
import { PrismaApiStore } from '../prisma-store.js';
import {
  canonicalizeProjectManifest,
  createDefaultProjectManifest,
  projectManifestDigest,
} from '../project-manifest.js';

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

const runDbTests = (await canReachDatabase()) ? describe : describe.skip;

function suffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

async function seedProject(prisma: ReturnType<typeof createDatabaseClient>) {
  const id = suffix();

  const organization = await prisma.organization.create({
    data: { name: `Checkpoint ${id}`, slug: `checkpoint-${id}` },
  });
  const project = await prisma.project.create({
    data: { organizationId: organization.id, name: `Checkpoint ${id}`, slug: `checkpoint-${id}` },
  });

  return { organization, project };
}

runDbTests('project checkpoint barrier — real PostgreSQL fencing', () => {
  it('serializes ProjectManifest appends with the durable checkpoint barrier across clients', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    let organizationId: string | undefined;
    let transferTargetId: string | undefined;

    try {
      const { organization, project } = await seedProject(prismaA);
      organizationId = organization.id;
      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);
      const initial = createDefaultProjectManifest(project.id);
      const revision = await storeA.createProjectManifestRevision({
        projectId: project.id,
        expectedOrganizationId: organization.id,
        schemaVersion: initial.schemaVersion,
        manifestVersion: initial.manifestVersion,
        digest: projectManifestDigest(initial),
        manifest: initial,
      });
      const checkpoint = await storeA.createProjectCheckpoint({
        projectId: project.id,
        expectedOrganizationId: organization.id,
      });
      const transferTarget = await prismaA.organization.create({
        data: { name: `Checkpoint transfer ${suffix()}`, slug: `checkpoint-transfer-${suffix()}` },
      });
      transferTargetId = transferTarget.id;
      const lease = await storeA.acquireProjectCheckpointBarrier({
        checkpointId: checkpoint.id,
        projectId: project.id,
        barrierId: `bar-manifest-${suffix()}`,
        ownerToken: `owner-manifest-${suffix()}`,
        ttlSeconds: 60,
      });
      expect(lease).toBeDefined();
      const next = canonicalizeProjectManifest({ ...initial, manifestVersion: 2, scopes: ['checkpoint:blocked'] });

      await expect(
        storeB.createProjectManifestRevision({
          projectId: project.id,
          expectedOrganizationId: organization.id,
          schemaVersion: next.schemaVersion,
          manifestVersion: next.manifestVersion,
          digest: projectManifestDigest(next),
          manifest: next,
          expectedDigest: revision.digest,
        }),
      ).rejects.toMatchObject({ statusCode: 423, code: 'CHECKPOINT_BARRIER_ACTIVE' });
      expect(await prismaA.projectManifestRevision.count({ where: { projectId: project.id } })).toBe(1);
      await expect(
        storeB.transferProject({
          projectId: project.id,
          expectedOrganizationId: organization.id,
          targetOrganizationId: transferTarget.id,
          assertExternalStorageDetached: async () => undefined,
          validateTargetAdmission: async () => undefined,
        }),
      ).rejects.toMatchObject({ statusCode: 423, code: 'CHECKPOINT_BARRIER_ACTIVE' });
      await expect(prismaA.project.findUniqueOrThrow({ where: { id: project.id } })).resolves.toMatchObject({
        organizationId: organization.id,
      });

      await storeA.releaseProjectCheckpointBarrier({
        checkpointId: checkpoint.id,
        ownerToken: lease!.ownerToken,
        fence: lease!.fence,
      });
      await expect(
        storeB.createProjectManifestRevision({
          projectId: project.id,
          expectedOrganizationId: organization.id,
          schemaVersion: next.schemaVersion,
          manifestVersion: next.manifestVersion,
          digest: projectManifestDigest(next),
          manifest: next,
          expectedDigest: revision.digest,
        }),
      ).resolves.toMatchObject({ manifestVersion: 2 });
    } finally {
      if (organizationId) {
        await prismaA.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }
      if (transferTargetId) {
        await prismaA.organization.delete({ where: { id: transferTargetId } }).catch(() => undefined);
      }
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('grants one cross-replica project singleton and keeps idempotency scoped to the exact request', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();

    let organizationId: string | undefined;

    try {
      const { organization, project } = await seedProject(prismaA);
      organizationId = organization.id;

      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);

      const [checkpointA, checkpointB] = await Promise.all([
        storeA.createProjectCheckpoint({ projectId: project.id, expectedOrganizationId: organization.id }),
        storeB.createProjectCheckpoint({ projectId: project.id, expectedOrganizationId: organization.id }),
      ]);

      const [leaseA, leaseB] = await Promise.all([
        storeA.acquireProjectCheckpointBarrier({
          checkpointId: checkpointA.id,
          projectId: project.id,
          barrierId: `bar-a-${suffix()}`,
          ownerToken: `owner-a-${suffix()}`,
          ttlSeconds: 60,
        }),
        storeB.acquireProjectCheckpointBarrier({
          checkpointId: checkpointB.id,
          projectId: project.id,
          barrierId: `bar-b-${suffix()}`,
          ownerToken: `owner-b-${suffix()}`,
          ttlSeconds: 60,
        }),
      ]);

      expect([leaseA, leaseB].filter(Boolean)).toHaveLength(1);
      expect(await storeA.getActiveCheckpointBarrier(project.id)).toMatchObject({
        checkpointId: (leaseA ?? leaseB)!.checkpointId,
      });
      expect(await storeB.getActiveCheckpointBarrier(project.id)).toMatchObject({
        checkpointId: (leaseA ?? leaseB)!.checkpointId,
      });

      const keyed = await storeA.createProjectCheckpoint({
        projectId: project.id,
        expectedOrganizationId: organization.id,
        idempotencyKey: `checkpoint-key-${suffix()}`,
        requestHash: 'a'.repeat(64),
      });
      const replay = await storeB.createProjectCheckpoint({
        projectId: project.id,
        expectedOrganizationId: organization.id,
        idempotencyKey: (await prismaA.projectCheckpoint.findUniqueOrThrow({ where: { id: keyed.id } }))
          .idempotencyKey!,
        requestHash: 'a'.repeat(64),
      });
      expect(replay).toMatchObject({ id: keyed.id, replayed: true });
      await expect(
        storeB.createProjectCheckpoint({
          projectId: project.id,
          expectedOrganizationId: organization.id,
          idempotencyKey: (await prismaA.projectCheckpoint.findUniqueOrThrow({ where: { id: keyed.id } }))
            .idempotencyKey!,
          requestHash: 'b'.repeat(64),
        }),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', statusCode: 409 });
    } finally {
      if (organizationId) {
        await prismaA.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }

      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('never resurrects an expired lease and fences the old owner after a successor takes over', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();

    let organizationId: string | undefined;

    try {
      const { organization, project } = await seedProject(prismaA);
      organizationId = organization.id;

      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);
      const oldCheckpoint = await storeA.createProjectCheckpoint({
        projectId: project.id,
        expectedOrganizationId: organization.id,
      });

      const oldLease = await storeA.acquireProjectCheckpointBarrier({
        checkpointId: oldCheckpoint.id,
        projectId: project.id,
        barrierId: `bar-old-${suffix()}`,
        ownerToken: `owner-old-${suffix()}`,
        ttlSeconds: 60,
      });
      expect(oldLease).toBeDefined();

      await prismaA.$executeRaw`
        UPDATE "ProjectCheckpoint"
        SET "barrierExpiresAt" = clock_timestamp() - INTERVAL '1 second'
        WHERE "id" = ${oldCheckpoint.id}
      `;
      await expect(
        storeA.renewProjectCheckpointBarrier({
          checkpointId: oldCheckpoint.id,
          ownerToken: oldLease!.ownerToken,
          fence: oldLease!.fence,
          ttlSeconds: 60,
        }),
      ).resolves.toBeUndefined();

      const successor = await storeB.createProjectCheckpoint({
        projectId: project.id,
        expectedOrganizationId: organization.id,
      });

      const successorLease = await storeB.acquireProjectCheckpointBarrier({
        checkpointId: successor.id,
        projectId: project.id,
        barrierId: `bar-new-${suffix()}`,
        ownerToken: `owner-new-${suffix()}`,
        ttlSeconds: 60,
      });
      expect(successorLease).toBeDefined();
      await expect(
        storeA.assertProjectCheckpointBarrier({
          checkpointId: oldCheckpoint.id,
          ownerToken: oldLease!.ownerToken,
          fence: oldLease!.fence,
        }),
      ).rejects.toMatchObject({ code: 'CHECKPOINT_BARRIER_LOST', statusCode: 409 });
    } finally {
      if (organizationId) {
        await prismaA.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }

      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('linearizes finalization at the database clock and allows exactly one COMMITTED winner', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();

    let organizationId: string | undefined;

    try {
      const { organization, project } = await seedProject(prismaA);
      organizationId = organization.id;

      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);
      const checkpoint = await storeA.createProjectCheckpoint({
        projectId: project.id,
        expectedOrganizationId: organization.id,
      });

      const lease = await storeA.acquireProjectCheckpointBarrier({
        checkpointId: checkpoint.id,
        projectId: project.id,
        barrierId: `bar-finalize-${suffix()}`,
        ownerToken: `owner-finalize-${suffix()}`,
        ttlSeconds: 60,
      });
      expect(lease).toBeDefined();
      await prismaA.projectCheckpoint.update({ where: { id: checkpoint.id }, data: { state: 'VERIFYING' } });

      const finalizeInput = {
        checkpointId: checkpoint.id,
        ownerToken: lease!.ownerToken,
        fence: lease!.fence,
        from: 'VERIFYING',
        to: 'COMMITTED',
        patch: { consistencyLevel: 'crash-consistent', manifest: { verified: true }, retentionSeconds: 60 },
      };
      const [a, b] = await Promise.allSettled([
        storeA.transitionProjectCheckpoint(finalizeInput),
        storeB.transitionProjectCheckpoint(finalizeInput),
      ]);
      expect([a, b].filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(await prismaA.projectCheckpoint.findUniqueOrThrow({ where: { id: checkpoint.id } })).toMatchObject({
        state: 'COMMITTED',
        consistencyLevel: 'crash-consistent',
        barrierProjectId: null,
      });

      const blockedCheckpoint = await storeA.createProjectCheckpoint({
        projectId: project.id,
        expectedOrganizationId: organization.id,
      });

      const blockedLease = await storeA.acquireProjectCheckpointBarrier({
        checkpointId: blockedCheckpoint.id,
        projectId: project.id,
        barrierId: `bar-blocked-${suffix()}`,
        ownerToken: `owner-blocked-${suffix()}`,
        ttlSeconds: 60,
      });
      expect(blockedLease).toBeDefined();
      await prismaA.projectCheckpoint.update({ where: { id: blockedCheckpoint.id }, data: { state: 'VERIFYING' } });

      let releaseExpiry!: () => void;

      const expiryGate = new Promise<void>((resolve) => {
        releaseExpiry = resolve;
      });

      let expiryLocked!: () => void;

      const locked = new Promise<void>((resolve) => {
        expiryLocked = resolve;
      });
      const expireTransaction = prismaA.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE "ProjectCheckpoint"
          SET "barrierExpiresAt" = clock_timestamp() - INTERVAL '1 second'
          WHERE "id" = ${blockedCheckpoint.id}
        `;
        expiryLocked();
        await expiryGate;
      });
      await locked;

      const blockedFinalize = storeB.transitionProjectCheckpoint({
        ...finalizeInput,
        checkpointId: blockedCheckpoint.id,
        ownerToken: blockedLease!.ownerToken,
        fence: blockedLease!.fence,
      });
      const whileLocked = await Promise.race([
        blockedFinalize.then(
          () => 'settled',
          () => 'settled',
        ),
        new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 100)),
      ]);
      expect(whileLocked).toBe('blocked');
      releaseExpiry();
      await expireTransaction;
      await expect(blockedFinalize).rejects.toMatchObject({ code: 'CHECKPOINT_BARRIER_LOST', statusCode: 409 });
      expect(await prismaA.projectCheckpoint.findUniqueOrThrow({ where: { id: blockedCheckpoint.id } })).toMatchObject({
        state: 'VERIFYING',
      });
    } finally {
      if (organizationId) {
        await prismaA.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }

      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });
});
