import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

import { PrismaApiStore } from '../prisma-store.js';
import type { ImportJobRecord, ImportJobTransitionPatch } from '../store.js';

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

async function advance(store: PrismaApiStore, job: ImportJobRecord, state: string, patch?: ImportJobTransitionPatch) {
  const updated = await store.transitionImportJob({
    id: job.id,
    organizationId: job.organizationId,
    expectedVersion: job.version,
    expectedStates: [job.state],
    state,
    patch,
  });

  expect(updated).toBeDefined();
  return updated!;
}

runDbTests('durable import staging — real PostgreSQL multi-client CAS', () => {
  it('creates one idempotent job and grants exactly one commit claimant/project/debit across replicas', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    let organizationId: string | undefined;

    try {
      const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const organization = await prismaA.organization.create({
        data: { name: `Import CAS ${suffix}`, slug: `import-cas-${suffix}` },
      });
      organizationId = organization.id;
      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);
      const input = {
        organizationId: organization.id,
        provider: 'zip',
        sourceRef: 'archive.zip',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        idempotencyKey: 'same-create-key',
        requestHash: 'a'.repeat(64),
        reservedCredits: 1,
      };
      const [createdA, createdB] = await Promise.all([storeA.createImportJob(input), storeB.createImportJob(input)]);

      expect(createdA.job.id).toBe(createdB.job.id);
      expect([createdA.replayed, createdB.replayed].sort()).toEqual([false, true]);
      expect(await prismaA.importJob.count({ where: { organizationId: organization.id } })).toBe(1);
      expect(await prismaA.importCreditReservation.count({ where: { organizationId: organization.id } })).toBe(1);

      let job = createdA.job;
      job = await advance(storeA, job, 'STAGING_ISOLATED', {
        stagedFiles: [{ path: 'src/index.ts', content: 'export const ready = true;\n' }],
        connectorPreview: {
          provider: 'vercel',
          title: 'Retrieved configuration',
          sourceRef: 'project_123',
          fileCount: 1,
          byteCount: 27,
          facts: [],
          warnings: ['vercelConfigurationOnly'],
          paths: ['src/index.ts'],
        },
        stagedFileCount: 1,
      });
      job = await advance(storeA, job, 'SCANNING');
      job = await advance(storeA, job, 'READY_TO_COMMIT');

      const tokenA = `claim-a-${suffix}`;
      const tokenB = `claim-b-${suffix}`;
      const expires = new Date(Date.now() + 600_000).toISOString();
      const [claimA, claimB] = await Promise.all([
        storeA.transitionImportJob({
          id: job.id,
          organizationId: organization.id,
          expectedVersion: job.version,
          expectedStates: ['READY_TO_COMMIT'],
          state: 'COMMITTING',
          patch: { operationToken: tokenA, operationExpiresAt: expires },
        }),
        storeB.transitionImportJob({
          id: job.id,
          organizationId: organization.id,
          expectedVersion: job.version,
          expectedStates: ['READY_TO_COMMIT'],
          state: 'COMMITTING',
          patch: { operationToken: tokenB, operationExpiresAt: expires },
        }),
      ]);

      expect([claimA, claimB].filter(Boolean)).toHaveLength(1);
      const winnerStore = claimA ? storeA : storeB;
      const winnerToken = claimA ? tokenA : tokenB;
      const project = await winnerStore.createClaimedImportProject({
        importJobId: job.id,
        organizationId: organization.id,
        operationToken: winnerToken,
        name: 'Imported once',
        slug: `imported-once-${suffix}`,
        sourceType: 'zip',
      });
      expect(await prismaA.projectManifestRevision.count({ where: { projectId: project.id } })).toBe(1);

      // Crash-window mutation: a replay that finds the claimed Project row must
      // restore its v1 manifest before exposing or finalizing that project.
      await prismaA.projectManifestRevision.deleteMany({ where: { projectId: project.id } });
      const replayedProject = await winnerStore.createClaimedImportProject({
        importJobId: job.id,
        organizationId: organization.id,
        operationToken: winnerToken,
        name: 'Imported once',
        slug: `imported-once-${suffix}`,
        sourceType: 'zip',
      });
      expect(replayedProject.id).toBe(project.id);
      expect(await prismaA.projectManifestRevision.count({ where: { projectId: project.id } })).toBe(1);

      const finalized = await winnerStore.finalizeImportCommit({
        importJobId: job.id,
        organizationId: organization.id,
        operationToken: winnerToken,
        targetProjectId: project.id,
        actualCredits: 1,
      });

      expect(finalized?.job.state).toBe('COMMITTED');
      expect(finalized?.reservation).toMatchObject({ state: 'SETTLED', debitedCredits: 1 });
      expect(await prismaA.project.count({ where: { organizationId: organization.id } })).toBe(1);
      expect(await prismaA.importCreditReservation.findUnique({ where: { importJobId: job.id } })).toMatchObject({
        state: 'SETTLED',
        debitedCredits: 1,
        version: 1,
      });
      const nulls = await prismaA.$queryRawUnsafe<Array<{ staged: boolean; preview: boolean }>>(
        'SELECT "stagedFiles" IS NULL AS staged, "connectorPreview" IS NULL AS preview FROM "ImportJob" WHERE "id" = $1',
        job.id,
      );
      expect(nulls).toEqual([{ staged: true, preview: true }]);
    } finally {
      if (organizationId) {
        await prismaA.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('keeps idempotency and staging isolated by tenant even when clients reuse the same key', async () => {
    const prisma = createDatabaseClient();

    try {
      const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const [orgA, orgB] = await Promise.all([
        prisma.organization.create({ data: { name: `Tenant A ${suffix}`, slug: `tenant-a-${suffix}` } }),
        prisma.organization.create({ data: { name: `Tenant B ${suffix}`, slug: `tenant-b-${suffix}` } }),
      ]);
      const store = new PrismaApiStore(prisma);
      const createFor = (organizationId: string, requestHash: string) =>
        store.createImportJob({
          organizationId,
          provider: 'zip',
          idempotencyKey: 'shared-client-key',
          requestHash,
          reservedCredits: 1,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
      const [a, b] = await Promise.all([createFor(orgA.id, 'a'.repeat(64)), createFor(orgB.id, 'b'.repeat(64))]);

      expect(a.job.id).not.toBe(b.job.id);
      const stagedA = await advance(store, a.job, 'STAGING_ISOLATED', {
        stagedFiles: [{ path: 'tenant-a.txt', content: 'private to A' }],
        stagedFileCount: 1,
      });
      expect(await store.getImportStaging(stagedA.id, orgB.id)).toBeUndefined();
      expect(await store.getImportReservationByJob(stagedA.id, orgB.id)).toBeUndefined();
      await expect(createFor(orgA.id, 'different-request'.padEnd(64, 'x'))).rejects.toMatchObject({
        code: 'IMPORT_IDEMPOTENCY_CONFLICT',
        statusCode: 409,
      });

      await prisma.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('compensates and deletes a partial target plus its manifest before publishing rollback completion', async () => {
    const prisma = createDatabaseClient();
    let organizationId: string | undefined;

    try {
      const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const organization = await prisma.organization.create({
        data: { name: `Rollback ${suffix}`, slug: `rollback-${suffix}` },
      });
      organizationId = organization.id;
      const store = new PrismaApiStore(prisma);
      let job = (
        await store.createImportJob({
          organizationId: organization.id,
          provider: 'zip',
          idempotencyKey: 'rollback-key',
          requestHash: 'r'.repeat(64),
          reservedCredits: 2,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        })
      ).job;
      job = await advance(store, job, 'STAGING_ISOLATED', {
        stagedFiles: [{ path: 'partial.ts', content: 'partial' }],
        stagedFileCount: 1,
      });
      job = await advance(store, job, 'SCANNING');
      job = await advance(store, job, 'READY_TO_COMMIT');
      const token = `rollback-${suffix}`;
      job = await advance(store, job, 'COMMITTING', {
        operationToken: token,
        operationExpiresAt: new Date(Date.now() + 600_000).toISOString(),
      });
      const project = await store.createClaimedImportProject({
        importJobId: job.id,
        organizationId: organization.id,
        operationToken: token,
        name: 'Partial target',
        slug: `partial-${suffix}`,
        sourceType: 'zip',
      });
      await prisma.projectIdeState.create({
        data: { projectId: project.id, state: { files: [{ path: 'partial.ts' }] } },
      });

      const pending = await store.beginImportCleanup({
        importJobId: job.id,
        organizationId: organization.id,
        operationToken: token,
        expectedStates: ['COMMITTING'],
        terminalState: 'ROLLING_BACK',
        error: 'injected write failure',
      });
      expect(pending?.state).toBe('CLEANUP_PENDING');
      expect(
        await store.deleteClaimedImportProject({
          importJobId: job.id,
          organizationId: organization.id,
          operationToken: token,
          targetProjectId: project.id,
        }),
      ).toBe(true);
      const rolledBack = await store.finishImportCleanup({
        importJobId: job.id,
        organizationId: organization.id,
        operationToken: token,
      });

      expect(rolledBack).toMatchObject({ state: 'ROLLING_BACK', targetProjectId: undefined });
      expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull();
      expect(await prisma.projectIdeState.findUnique({ where: { projectId: project.id } })).toBeNull();
      expect(await prisma.importCreditReservation.findUnique({ where: { importJobId: job.id } })).toMatchObject({
        state: 'COMPENSATED',
        debitedCredits: 0,
      });
    } finally {
      if (organizationId) {
        await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }
      await prisma.$disconnect();
    }
  });

  it('cancels and reaps from another client with one CAS winner and JsonNull cleanup', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    let organizationId: string | undefined;

    try {
      const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const organization = await prismaA.organization.create({
        data: { name: `Reaper ${suffix}`, slug: `reaper-${suffix}` },
      });
      organizationId = organization.id;
      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);
      const create = async (key: string, expiresAt: string) => {
        let job = (
          await storeA.createImportJob({
            organizationId: organization.id,
            provider: 'zip',
            idempotencyKey: key,
            requestHash: key.padEnd(64, 'x'),
            reservedCredits: 1,
            expiresAt,
          })
        ).job;
        job = await advance(storeA, job, 'STAGING_ISOLATED', {
          stagedFiles: [{ path: `${key}.txt`, content: key }],
          stagedFileCount: 1,
        });
        return job;
      };
      const cancelledJob = await create('cancel-other-replica', new Date(Date.now() + 60_000).toISOString());
      expect(await storeB.cancelImportJob(cancelledJob.id, organization.id)).toMatchObject({ state: 'CANCELLED' });

      const expiredJob = await create('reap-other-replica', new Date(Date.now() - 60_000).toISOString());
      const nowIso = new Date().toISOString();
      const [reapedA, reapedB] = await Promise.all([
        storeA.reapExpiredImportJobs(nowIso),
        storeB.reapExpiredImportJobs(nowIso),
      ]);
      expect([...reapedA, ...reapedB].filter((id) => id === expiredJob.id)).toEqual([expiredJob.id]);
      expect(await prismaA.importJob.findUnique({ where: { id: expiredJob.id } })).toMatchObject({ state: 'EXPIRED' });
      expect(await prismaA.importCreditReservation.findUnique({ where: { importJobId: expiredJob.id } })).toMatchObject(
        {
          state: 'COMPENSATED',
          debitedCredits: 0,
        },
      );
      const nulls = await prismaA.$queryRawUnsafe<Array<{ staged: boolean; preview: boolean }>>(
        'SELECT "stagedFiles" IS NULL AS staged, "connectorPreview" IS NULL AS preview FROM "ImportJob" WHERE "id" = $1',
        expiredJob.id,
      );
      expect(nulls).toEqual([{ staged: true, preview: true }]);
    } finally {
      if (organizationId) {
        await prismaA.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });
});
