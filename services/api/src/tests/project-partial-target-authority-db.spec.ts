import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { describe, expect, it, vi } from 'vitest';

import { PrismaApiStore } from '../prisma-store.js';
import type { ProjectPartialTargetAuthority, ProjectPhysicalAccessOperation } from '../store.js';

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

const runDbTests = (await canReachDatabase()) ? describe.sequential : describe.skip;
const authorityLost = {
  code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION',
  statusCode: 409,
};

function suffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function seedHiddenProject(prisma: DatabaseClient, label: string) {
  const token = suffix();
  const organization = await prisma.organization.create({
    data: { name: `${label} ${token}`, slug: `${label}-${token}` },
  });
  const project = await prisma.project.create({
    data: {
      organizationId: organization.id,
      name: `${label} target`,
      slug: `${label}-target-${token}`,
      deletedAt: new Date(),
    },
  });
  return { organization, project, token };
}

function scope(
  projectId: string,
  expectedOrganizationId: string,
  authority: ProjectPartialTargetAuthority | undefined,
  operation: ProjectPhysicalAccessOperation,
) {
  return {
    projectId,
    expectedOrganizationId,
    ...(authority ? { partialTargetAuthority: authority } : {}),
    physicalAccessOperation: operation,
  };
}

runDbTests('hidden target authority — Prisma row locks and DB lease clock', () => {
  it('fences IMPORT_TARGET by exact target, tenant, token, lease, state, and operation', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const seeded = await seedHiddenProject(prisma, 'partial-import');
    const jobId = `import-${seeded.token}`;
    const operationToken = `import-owner-${seeded.token}`;
    await prisma.importJob.create({
      data: {
        id: jobId,
        organizationId: seeded.organization.id,
        provider: 'zip',
        state: 'COMMITTING',
        idempotencyKey: `partial-import-key-${seeded.token}`,
        requestHash: `partial-import-hash-${seeded.token}`,
        targetProjectId: seeded.project.id,
        operationToken,
        operationExpiresAt: new Date(Date.now() + 60_000),
      },
    });
    const authority = { kind: 'IMPORT_TARGET' as const, jobId, operationToken };
    const effect = vi.fn(async () => 'written');

    try {
      await expect(
        store.withProjectPhysicalMutation(scope(seeded.project.id, seeded.organization.id, authority, 'WRITE'), effect),
      ).resolves.toBe('written');
      await expect(
        store.withProjectPhysicalAccess(
          scope(seeded.project.id, seeded.organization.id, authority, 'READ'),
          async () => 'listed',
        ),
      ).resolves.toBe('listed');
      await expect(
        store.withProjectPhysicalMutation(scope(seeded.project.id, seeded.organization.id, undefined, 'WRITE'), effect),
      ).rejects.toMatchObject(authorityLost);
      await expect(
        store.withProjectPhysicalMutation(
          scope(seeded.project.id, seeded.organization.id, { ...authority, operationToken: 'wrong-token' }, 'WRITE'),
          effect,
        ),
      ).rejects.toMatchObject(authorityLost);

      await prisma.importJob.update({
        where: { id: jobId },
        data: { state: 'CLEANUP_PENDING', operationExpiresAt: new Date(Date.now() + 60_000) },
      });
      await expect(
        store.withProjectPhysicalMutation(
          scope(seeded.project.id, seeded.organization.id, authority, 'DELETE'),
          async () => 'deleted',
        ),
      ).resolves.toBe('deleted');
      await expect(
        store.withProjectPhysicalMutation(scope(seeded.project.id, seeded.organization.id, authority, 'WRITE'), effect),
      ).rejects.toMatchObject(authorityLost);

      await prisma.importJob.update({
        where: { id: jobId },
        data: { operationExpiresAt: new Date('2000-01-01T00:00:00.000Z') },
      });
      await expect(
        store.withProjectPhysicalAccess(
          scope(seeded.project.id, seeded.organization.id, authority, 'READ'),
          async () => 'forbidden',
        ),
      ).rejects.toMatchObject(authorityLost);
    } finally {
      await prisma.importJob.deleteMany({ where: { id: jobId } }).catch(() => undefined);
      await prisma.project.updateMany({ where: { id: seeded.project.id }, data: { deletedAt: null } });
      await prisma.project.deleteMany({ where: { id: seeded.project.id } }).catch(() => undefined);
      await prisma.organization.deleteMany({ where: { id: seeded.organization.id } }).catch(() => undefined);
      await store.disconnect();
    }
  });

  it('fences REMIX_TARGET materialization and cleanup with the same exact lease contract', async () => {
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const seeded = await seedHiddenProject(prisma, 'partial-remix');
    const jobId = `remix-${seeded.token}`;
    const operationToken = `remix-owner-${seeded.token}`;
    await prisma.remixJob.create({
      data: {
        id: jobId,
        sourceProjectId: `source-${seeded.token}`,
        organizationId: seeded.organization.id,
        state: 'SOURCE_SANITIZED',
        storagePolicy: 'DETACH',
        targetProjectId: seeded.project.id,
        operationToken,
        operationExpiresAt: new Date(Date.now() + 60_000),
      },
    });
    const authority = { kind: 'REMIX_TARGET' as const, jobId, operationToken };
    const effect = vi.fn(async () => 'cloned');

    try {
      await expect(
        store.withProjectPhysicalMutation(scope(seeded.project.id, seeded.organization.id, authority, 'WRITE'), effect),
      ).resolves.toBe('cloned');
      await expect(
        store.withProjectPhysicalMutation(
          scope(seeded.project.id, seeded.organization.id, { ...authority, operationToken: 'wrong-token' }, 'WRITE'),
          effect,
        ),
      ).rejects.toMatchObject(authorityLost);

      await prisma.remixJob.update({
        where: { id: jobId },
        data: { state: 'STORAGE_PINNED', operationExpiresAt: new Date(Date.now() + 60_000) },
      });
      await expect(
        store.withProjectPhysicalAccess(
          scope(seeded.project.id, seeded.organization.id, authority, 'OBJECT_CLONE'),
          async () => 'objects-cloned',
        ),
      ).resolves.toBe('objects-cloned');

      await prisma.remixJob.update({
        where: { id: jobId },
        data: { state: 'CLEANUP_PENDING', operationExpiresAt: new Date(Date.now() + 60_000) },
      });
      await expect(
        store.withProjectPhysicalAccess(
          scope(seeded.project.id, seeded.organization.id, authority, 'READ'),
          async () => 'absent',
        ),
      ).resolves.toBe('absent');
      await expect(
        store.withProjectPhysicalMutation(
          scope(seeded.project.id, seeded.organization.id, authority, 'DELETE'),
          async () => 'deleted',
        ),
      ).resolves.toBe('deleted');
      await expect(
        store.withProjectPhysicalMutation(scope(seeded.project.id, seeded.organization.id, authority, 'WRITE'), effect),
      ).rejects.toMatchObject(authorityLost);

      await prisma.remixJob.update({
        where: { id: jobId },
        data: { operationExpiresAt: new Date('2000-01-01T00:00:00.000Z') },
      });
      await expect(
        store.withProjectPhysicalAccess(
          scope(seeded.project.id, seeded.organization.id, authority, 'READ'),
          async () => 'forbidden',
        ),
      ).rejects.toMatchObject(authorityLost);
    } finally {
      await prisma.remixJob.deleteMany({ where: { id: jobId } }).catch(() => undefined);
      await prisma.project.updateMany({ where: { id: seeded.project.id }, data: { deletedAt: null } });
      await prisma.project.deleteMany({ where: { id: seeded.project.id } }).catch(() => undefined);
      await prisma.organization.deleteMany({ where: { id: seeded.organization.id } }).catch(() => undefined);
      await store.disconnect();
    }
  });
});
