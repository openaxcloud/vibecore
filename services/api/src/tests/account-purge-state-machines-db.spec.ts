import { createDatabaseClient, Prisma } from '@vibecore/database';
import { describe, expect, it, vi } from 'vitest';

import { PrismaApiStore } from '../prisma-store.js';

async function canReachDatabase() {
  if (!process.env.DATABASE_URL) return false;
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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function seedSharedAccount(prisma: ReturnType<typeof createDatabaseClient>, due = false) {
  const unique = suffix();
  const requestedAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1_000).toISOString();
  const role = await prisma.role.upsert({
    where: { key: 'owner' },
    create: { key: 'owner', name: 'Owner' },
    update: {},
  });
  const [subject, other] = await Promise.all([
    prisma.user.create({
      data: {
        email: `purge-machine-${unique}@example.test`,
        ...(due
          ? { preferences: { accountDeletion: { requestedAt } } as Prisma.InputJsonValue }
          : {}),
      },
    }),
    prisma.user.create({ data: { email: `purge-machine-other-${unique}@example.test` } }),
  ]);
  const organization = await prisma.organization.create({
    data: {
      name: `Purge machine ${unique}`,
      slug: `purge-machine-${unique}`,
      members: {
        create: [
          { userId: subject.id, roleId: role.id },
          { userId: other.id, roleId: role.id },
        ],
      },
      projects: { create: { name: 'Shared source', slug: `shared-source-${unique}` } },
    },
    include: { projects: true },
  });
  return { subject, other, organization, project: organization.projects[0]! };
}

async function cleanup(
  prisma: ReturnType<typeof createDatabaseClient>,
  input: { userIds: string[]; organizationId?: string },
) {
  await prisma.purgeReceipt.deleteMany({ where: { userId: { in: input.userIds } } });
  await prisma.purgePlan.deleteMany({ where: { userId: { in: input.userIds } } });
  if (input.organizationId) {
    await prisma.remixJob.deleteMany({ where: { organizationId: input.organizationId } });
    await prisma.organization.deleteMany({ where: { id: input.organizationId } });
  }
  for (const userId of input.userIds) {
    await prisma.adminAuditLog
      .deleteMany({
        where: { action: 'account.purge_completed', metadata: { path: ['userId'], equals: userId } },
      })
      .catch(() => undefined);
  }
  await prisma.user.deleteMany({ where: { id: { in: input.userIds } } });
}

runDbTests('account purge state machines — PostgreSQL lock/proof fencing', () => {
  it('linearizes creates/acquisitions behind the purge locks and observes the committed freezes', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const release = deferred();
    const entered = deferred();
    let seeded: Awaited<ReturnType<typeof seedSharedAccount>> | undefined;

    try {
      seeded = await seedSharedAccount(prismaA);
      const checkpoint = await prismaA.projectCheckpoint.create({
        data: {
          projectId: seeded.project.id,
          createdByUserId: seeded.subject.id,
          state: 'PREPARING',
          requestHash: 'checkpoint-freeze',
        },
      });
      const freezer = prismaA.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'SELECT pg_advisory_xact_lock(hashtext($1))',
          `account-purge:${seeded!.subject.id}`,
        );
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', 'account-purge:topology');
        const timestamp = new Date();
        const plan = await tx.purgePlan.create({
          data: {
            userId: seeded!.subject.id,
            ownerToken: `freeze-owner-${suffix()}`,
            status: 'ACTIVE',
            leaseExpiresAt: new Date(Date.now() + 60_000),
            requestedAt: timestamp,
            purgeDueAt: timestamp,
            topologyFingerprint: 'test-freeze',
            inventory: {},
          },
        });
        await tx.purgeFreeze.createMany({
          data: [
            { planId: plan.id, resourceType: 'membership', resourceId: seeded!.organization.id },
            { planId: plan.id, resourceType: 'projectTopology', resourceId: seeded!.project.id },
          ],
        });
        entered.resolve();
        await release.promise;
      });

      await entered.promise;
      const store = new PrismaApiStore(prismaB);
      const attempts = [
        store.createImportJob({
          organizationId: seeded.organization.id,
          actorUserId: seeded.subject.id,
          provider: 'zip',
          idempotencyKey: `freeze-import-${suffix()}`,
          requestHash: 'a'.repeat(64),
          reservedCredits: 1,
          expiresInMs: 60_000,
        }),
        store.createRemixJob({
          sourceProjectId: seeded.project.id,
          organizationId: seeded.organization.id,
          actorUserId: seeded.subject.id,
          storagePolicy: 'DETACH',
          idempotencyKey: `freeze-remix-${suffix()}`,
          requestHash: 'b'.repeat(64),
        }),
        store.acquireRollbackOperation({
          projectId: seeded.project.id,
          actorUserId: seeded.subject.id,
          idempotencyKey: `freeze-rollback-${suffix()}`,
          requestFingerprint: 'c'.repeat(64),
          environment: 'production',
          ownerToken: `rollback-owner-${suffix()}`,
          leaseDurationMs: 60_000,
        }),
        store.acquireProjectCheckpointBarrier({
          checkpointId: checkpoint.id,
          projectId: seeded.project.id,
          barrierId: `freeze-barrier-${suffix()}`,
          ownerToken: `checkpoint-owner-${suffix()}`,
          ttlSeconds: 60,
        }),
      ].map((attempt) => attempt.then(
        () => ({ fulfilled: true as const }),
        (error: unknown) => ({ fulfilled: false as const, error }),
      ));
      let settled = false;
      const allAttempts = Promise.all(attempts).then((results) => {
        settled = true;
        return results;
      });

      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(settled).toBe(false);
      release.resolve();
      await freezer;
      const results = await allAttempts;

      expect(results).toHaveLength(4);
      for (const result of results) {
        expect(result.fulfilled).toBe(false);
        expect((result as { error: { code?: string } }).error).toMatchObject({
          code: 'USER_TOPOLOGY_FROZEN_FOR_ACCOUNT_PURGE',
        });
      }
      expect(await prismaA.importJob.count({ where: { organizationId: seeded.organization.id } })).toBe(0);
      expect(await prismaA.ledgerReservation.count({ where: { organizationId: seeded.organization.id } })).toBe(0);
      expect(await prismaA.remixJob.count({ where: { organizationId: seeded.organization.id } })).toBe(0);
      expect(await prismaA.rollbackIdempotencyRequest.count({ where: { projectId: seeded.project.id } })).toBe(0);
      expect(await prismaA.projectCheckpoint.findUnique({ where: { id: checkpoint.id } })).toMatchObject({
        state: 'PREPARING',
        barrierProjectId: null,
      });
    } finally {
      release.resolve();
      if (seeded) {
        await cleanup(prismaA, {
          userIds: [seeded.subject.id, seeded.other.id],
          organizationId: seeded.organization.id,
        }).catch(() => undefined);
      }
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('fences acquired work during a purge latch, releases the hold, and rejects every post-proof replay', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const entered = deferred();
    const release = deferred();
    let seeded: Awaited<ReturnType<typeof seedSharedAccount>> | undefined;

    try {
      seeded = await seedSharedAccount(prismaA, true);
      const storeA = new PrismaApiStore(prismaA, undefined, {
        ttlMs: 30_000,
        renewIntervalMs: 60_000,
        reclaimGraceMs: 0,
      });
      const storeB = new PrismaApiStore(prismaB);
      const createdImport = await storeB.createImportJob({
        organizationId: seeded.organization.id,
        actorUserId: seeded.subject.id,
        provider: 'zip',
        idempotencyKey: `purge-import-${suffix()}`,
        requestHash: 'd'.repeat(64),
        reservedCredits: 3,
        expiresInMs: 60_000,
      });
      const stagedImport = await storeB.transitionImportJob({
        id: createdImport.job.id,
        organizationId: seeded.organization.id,
        expectedVersion: createdImport.job.version,
        expectedStates: ['RECEIVED'],
        state: 'STAGING_ISOLATED',
        patch: {
          stagedFiles: [{ path: 'private.txt', content: 'purge me' }],
          stagedFileCount: 1,
        },
      });
      const remix = await storeB.createRemixJob({
        sourceProjectId: seeded.project.id,
        organizationId: seeded.organization.id,
        actorUserId: seeded.subject.id,
        storagePolicy: 'DETACH',
        idempotencyKey: `purge-remix-${suffix()}`,
        requestHash: 'e'.repeat(64),
      });
      const rollback = await storeB.acquireRollbackOperation({
        projectId: seeded.project.id,
        actorUserId: seeded.subject.id,
        idempotencyKey: `purge-rollback-${suffix()}`,
        requestFingerprint: 'f'.repeat(64),
        environment: 'production',
        ownerToken: `rollback-owner-${suffix()}`,
        leaseDurationMs: 60_000,
      });
      expect(rollback.kind).toBe('ACQUIRED');
      const terminalCheckpoint = await prismaA.projectCheckpoint.create({
        data: {
          projectId: seeded.project.id,
          createdByUserId: seeded.subject.id,
          state: 'CLEANED',
          requestHash: `terminal-checkpoint-${suffix()}`,
        },
      });

      const purge = storeA.purgeUserAccount(
        { userId: seeded.subject.id },
        {
          eraseStorage: async () => {
            entered.resolve();
            await release.promise;
            return { classes: [], verified: true };
          },
        },
      );
      await entered.promise;

      await expect(
        storeB.transitionImportJob({
          id: stagedImport!.id,
          organizationId: seeded.organization.id,
          expectedVersion: stagedImport!.version,
          expectedStates: ['STAGING_ISOLATED'],
          state: 'SCANNING',
        }),
      ).rejects.toMatchObject({ code: 'USER_TOPOLOGY_FROZEN_FOR_ACCOUNT_PURGE' });
      await expect(
        storeB.claimRemixJob({
          id: remix.job.id,
          organizationId: seeded.organization.id,
          operationToken: `remix-owner-${suffix()}`,
          leaseDurationMs: 60_000,
        }),
      ).rejects.toMatchObject({ code: 'USER_TOPOLOGY_FROZEN_FOR_ACCOUNT_PURGE' });
      await expect(
        storeB.renewRollbackOperationLease({
          operationId: rollback.record.id,
          ownerToken: rollback.record.leaseOwner!,
          fencingToken: rollback.record.fencingToken,
          leaseDurationMs: 60_000,
        }),
      ).rejects.toMatchObject({ code: 'USER_TOPOLOGY_FROZEN_FOR_ACCOUNT_PURGE' });

      release.resolve();
      await expect(purge).resolves.toMatchObject({ outcome: 'purged' });

      const [importRow, hold, remixRow, rollbackRow] = await Promise.all([
        prismaA.importJob.findUniqueOrThrow({ where: { id: createdImport.job.id } }),
        prismaA.ledgerReservation.findFirstOrThrow({ where: { importJobId: createdImport.job.id } }),
        prismaA.remixJob.findUniqueOrThrow({ where: { id: remix.job.id } }),
        prismaA.rollbackIdempotencyRequest.findUniqueOrThrow({ where: { id: rollback.record.id } }),
      ]);
      expect(importRow).toMatchObject({
        actorUserId: null,
        state: 'FAILED',
        error: 'ACCOUNT_PURGE_COMPLETED',
        stagedFiles: null,
        connectorPreview: null,
        operationToken: null,
      });
      expect(hold).toMatchObject({ status: 'RELEASED', userId: null, releaseReason: 'failure' });
      expect(remixRow).toMatchObject({
        actorUserId: null,
        state: 'FAILED',
        errorCode: 'ACCOUNT_PURGE_COMPLETED',
        operationToken: null,
      });
      expect(rollbackRow).toMatchObject({
        actorUserId: null,
        status: 'COMPLETED',
        responseStatus: 410,
        leaseOwner: null,
      });
      expect(await prismaA.ledgerReservation.count({ where: { status: 'ACTIVE', userId: seeded.subject.id } })).toBe(0);

      await expect(
        storeB.transitionImportJob({
          id: importRow.id,
          organizationId: seeded.organization.id,
          expectedVersion: importRow.version,
          expectedStates: ['FAILED'],
          state: 'RECEIVED',
        }),
      ).rejects.toMatchObject({ code: 'ACCOUNT_PURGE_COMPLETED' });
      await expect(
        storeB.createImportJob({
          organizationId: seeded.organization.id,
          actorUserId: seeded.subject.id,
          provider: 'zip',
          idempotencyKey: `post-proof-import-${suffix()}`,
          requestHash: '1'.repeat(64),
          reservedCredits: 1,
          expiresInMs: 60_000,
        }),
      ).rejects.toMatchObject({ code: 'ACCOUNT_PURGE_COMPLETED' });
      await expect(
        storeB.acquireRollbackOperation({
          projectId: seeded.project.id,
          actorUserId: seeded.subject.id,
          idempotencyKey: `post-proof-rollback-${suffix()}`,
          requestFingerprint: '2'.repeat(64),
          environment: 'production',
          ownerToken: `post-proof-owner-${suffix()}`,
          leaseDurationMs: 60_000,
        }),
      ).rejects.toMatchObject({ code: 'ACCOUNT_PURGE_COMPLETED' });
      await expect(
        storeB.updateProjectCheckpoint(terminalCheckpoint.id, {
          state: 'PREPARING',
          error: 'stale cleanup resumed',
        }),
      ).rejects.toMatchObject({ code: 'ACCOUNT_PURGE_COMPLETED' });
    } finally {
      release.resolve();
      if (seeded) {
        await cleanup(prismaA, {
          userIds: [seeded.subject.id, seeded.other.id],
          organizationId: seeded.organization.id,
        }).catch(() => undefined);
      }
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('fails before physical erasure when an actor-owned legacy target is already visible', async () => {
    const prisma = createDatabaseClient();
    let seeded: Awaited<ReturnType<typeof seedSharedAccount>> | undefined;
    const eraseStorage = vi.fn(async () => ({ classes: [], verified: true }));

    try {
      seeded = await seedSharedAccount(prisma, true);
      const visibleTarget = await prisma.project.create({
        data: {
          organizationId: seeded.organization.id,
          name: 'Legacy visible partial',
          slug: `legacy-visible-${suffix()}`,
          deletedAt: null,
        },
      });
      await prisma.importJob.create({
        data: {
          organizationId: seeded.organization.id,
          actorUserId: seeded.subject.id,
          provider: 'zip',
          state: 'COMMITTING',
          idempotencyKey: `legacy-visible-${suffix()}`,
          requestHash: '3'.repeat(64),
          targetProjectId: visibleTarget.id,
        },
      });

      const store = new PrismaApiStore(prisma);
      await expect(
        store.purgeUserAccount({ userId: seeded.subject.id }, { eraseStorage }),
      ).rejects.toMatchObject({ code: 'ACCOUNT_PURGE_STATE_MACHINE_TARGET_VISIBLE', statusCode: 409 });
      expect(eraseStorage).not.toHaveBeenCalled();
      expect(await prisma.purgePlan.count({ where: { userId: seeded.subject.id } })).toBe(0);
      expect(await prisma.purgeReceipt.count({ where: { userId: seeded.subject.id } })).toBe(0);
      expect(await prisma.project.findUnique({ where: { id: visibleTarget.id } })).toMatchObject({ deletedAt: null });
    } finally {
      if (seeded) {
        await cleanup(prisma, {
          userIds: [seeded.subject.id, seeded.other.id],
          organizationId: seeded.organization.id,
        }).catch(() => undefined);
      }
      await prisma.$disconnect();
    }
  });

  it('refuses purge while a terminal checkpoint still owns a live retained barrier by PostgreSQL time', async () => {
    const prisma = createDatabaseClient();
    let seeded: Awaited<ReturnType<typeof seedSharedAccount>> | undefined;
    const eraseStorage = vi.fn(async () => ({ classes: [], verified: true }));

    try {
      seeded = await seedSharedAccount(prisma, true);
      const checkpoint = await prisma.projectCheckpoint.create({
        data: {
          projectId: seeded.project.id,
          createdByUserId: seeded.subject.id,
          state: 'COMMITTED',
          requestHash: `retained-barrier-${suffix()}`,
          logicalBarrierId: `logical-${suffix()}`,
          barrierProjectId: seeded.project.id,
          barrierOwnerToken: `barrier-owner-${suffix()}`,
          barrierFence: 1,
          barrierExpiresAt: new Date(Date.now() + 60_000),
        },
      });

      const store = new PrismaApiStore(prisma);
      await expect(
        store.purgeUserAccount({ userId: seeded.subject.id }, { eraseStorage }),
      ).rejects.toMatchObject({ code: 'ACCOUNT_PURGE_CHECKPOINT_ACTIVE', statusCode: 409 });
      expect(eraseStorage).not.toHaveBeenCalled();
      expect(await prisma.purgeReceipt.count({ where: { userId: seeded.subject.id } })).toBe(0);
      expect(await prisma.projectCheckpoint.findUnique({ where: { id: checkpoint.id } })).toMatchObject({
        state: 'COMMITTED',
        barrierProjectId: seeded.project.id,
      });
    } finally {
      if (seeded) {
        await cleanup(prisma, {
          userIds: [seeded.subject.id, seeded.other.id],
          organizationId: seeded.organization.id,
        }).catch(() => undefined);
      }
      await prisma.$disconnect();
    }
  });

  it('treats RELEASE_BARRIER as live only until its PostgreSQL barrier lease expires', async () => {
    const prisma = createDatabaseClient();
    let seeded: Awaited<ReturnType<typeof seedSharedAccount>> | undefined;
    const eraseStorage = vi.fn(async () => ({ classes: [], verified: true }));

    try {
      seeded = await seedSharedAccount(prisma, true);
      const checkpoint = await prisma.projectCheckpoint.create({
        data: {
          projectId: seeded.project.id,
          createdByUserId: seeded.subject.id,
          state: 'RELEASE_BARRIER',
          requestHash: `release-barrier-${suffix()}`,
          logicalBarrierId: `logical-${suffix()}`,
          barrierProjectId: seeded.project.id,
          barrierOwnerToken: `barrier-owner-${suffix()}`,
          barrierFence: 1,
          barrierExpiresAt: new Date(Date.now() + 60_000),
        },
      });

      const store = new PrismaApiStore(prisma);
      await expect(
        store.purgeUserAccount({ userId: seeded.subject.id }, { eraseStorage }),
      ).rejects.toMatchObject({ code: 'ACCOUNT_PURGE_CHECKPOINT_ACTIVE', statusCode: 409 });
      expect(eraseStorage).not.toHaveBeenCalled();

      await prisma.projectCheckpoint.update({
        where: { id: checkpoint.id },
        data: { barrierExpiresAt: new Date(Date.now() - 60_000) },
      });

      await expect(store.purgeUserAccount({ userId: seeded.subject.id }, { eraseStorage })).resolves.toMatchObject({
        outcome: 'purged',
      });
      expect(eraseStorage).toHaveBeenCalledTimes(1);
      expect(await prisma.purgeReceipt.count({ where: { userId: seeded.subject.id } })).toBe(1);
    } finally {
      if (seeded) {
        await cleanup(prisma, {
          userIds: [seeded.subject.id, seeded.other.id],
          organizationId: seeded.organization.id,
        }).catch(() => undefined);
      }
      await prisma.$disconnect();
    }
  });
});
