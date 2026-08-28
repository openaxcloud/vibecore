import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

import { PrismaApiStore } from '../prisma-store.js';

async function canReachTransferTables(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = createDatabaseClient();
  try {
    const rows = await prisma.$queryRaw<Array<{ operationTable: string | null; scheduleTable: string | null }>>`
      SELECT
        to_regclass('"ObjectStorageOperation"')::text AS "operationTable",
        to_regclass('"ObjectStorageVersionGcSchedule"')::text AS "scheduleTable"
    `;
    return rows[0]?.operationTable !== null && rows[0]?.scheduleTable !== null;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

const runDbTests = (await canReachTransferTables()) ? describe.sequential : describe.skip;

function suffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function cleanup(prisma: DatabaseClient, projectId: string, organizationIds: string[]): Promise<void> {
  await prisma.objectStorageVersionGcSchedule.deleteMany({ where: { projectId } }).catch(() => undefined);
  await prisma.$executeRaw`
    DELETE FROM "ObjectStorageOperation" operation
    WHERE EXISTS (
      SELECT 1
      FROM "ObjectStorageOperationProjectScope" scope
      WHERE scope."operationId" = operation."id"
        AND scope."projectIdSnapshot" = ${projectId}
    )
  `;
  await prisma.auditLog.deleteMany({ where: { resourceId: projectId, action: 'project.transfer' } });
  await prisma.project.deleteMany({ where: { id: projectId } }).catch(() => undefined);
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } }).catch(() => undefined);
}

runDbTests('project transfer — ownership epoch and durable idempotency', () => {
  it('replays exact receipts, rejects stale authority, cycles epochs, and blocks version-GC schedules', async () => {
    const prisma = createDatabaseClient();
    const observer = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const token = suffix();
    const [organizationA, organizationB, organizationC] = await Promise.all([
      prisma.organization.create({ data: { name: `Transfer A ${token}`, slug: `transfer-a-${token}` } }),
      prisma.organization.create({ data: { name: `Transfer B ${token}`, slug: `transfer-b-${token}` } }),
      prisma.organization.create({ data: { name: `Transfer C ${token}`, slug: `transfer-c-${token}` } }),
    ]);
    const project = await prisma.project.create({
      data: {
        organizationId: organizationA.id,
        name: `Transfer epoch ${token}`,
        slug: `transfer-epoch-${token}`,
        persistentVolumeClaim: `pvc-transfer-epoch-${token}`,
      },
    });

    let providerProbes = 0;
    let admissionChecks = 0;
    const firstKey = 'ownership-epoch-a-b-0001';
    const firstInput = {
      projectId: project.id,
      expectedOrganizationId: organizationA.id,
      expectedOwnershipEpoch: 0,
      targetOrganizationId: organizationB.id,
      idempotencyKey: firstKey,
      assertExternalStorageDetached: async () => {
        providerProbes += 1;
        const visible = await observer.objectStorageOperation.findFirst({
          where: { kind: 'PROJECT_TRANSFER', idempotencyKey: firstKey },
          select: { status: true },
        });
        expect(visible).toEqual({ status: 'PREPARED' });
      },
      validateTargetAdmission: async () => {
        admissionChecks += 1;
      },
    };

    try {
      const first = await store.transferProject(firstInput);
      expect(first).toMatchObject({
        id: project.id,
        organizationId: organizationB.id,
        ownershipEpoch: 1,
      });
      expect(providerProbes).toBe(1);
      expect(admissionChecks).toBe(1);

      const replay = await store.transferProject({
        ...firstInput,
        assertExternalStorageDetached: async () => {
          providerProbes += 1;
        },
        validateTargetAdmission: async () => {
          admissionChecks += 1;
        },
      });
      expect(replay).toEqual(first);
      expect(providerProbes).toBe(1);
      expect(admissionChecks).toBe(1);
      expect(await prisma.projectActivity.count({ where: { projectId: project.id, action: 'project.transfer' } })).toBe(
        1,
      );
      expect(await prisma.auditLog.count({ where: { resourceId: project.id, action: 'project.transfer' } })).toBe(1);

      await expect(
        store.transferProject({
          ...firstInput,
          expectedOrganizationId: organizationB.id,
          targetOrganizationId: organizationC.id,
          assertExternalStorageDetached: async () => {
            providerProbes += 1;
          },
          validateTargetAdmission: async () => {
            admissionChecks += 1;
          },
        }),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT', statusCode: 409 });
      expect(providerProbes).toBe(1);
      expect(admissionChecks).toBe(1);

      const revisionCountAfterFirst = await prisma.projectManifestRevision.count({ where: { projectId: project.id } });
      await expect(
        store.transferProject({
          projectId: project.id,
          expectedOrganizationId: organizationB.id,
          expectedOwnershipEpoch: 0,
          targetOrganizationId: organizationC.id,
          idempotencyKey: 'ownership-epoch-stale-0001',
          assertExternalStorageDetached: async () => {
            providerProbes += 1;
          },
          validateTargetAdmission: async () => {
            admissionChecks += 1;
          },
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_ORGANIZATION_CHANGED_DURING_MUTATION', statusCode: 409 });
      expect(providerProbes).toBe(1);
      expect(admissionChecks).toBe(1);
      expect(await prisma.projectManifestRevision.count({ where: { projectId: project.id } })).toBe(
        revisionCountAfterFirst,
      );

      for (const status of ['PENDING', 'CLAIMED', 'MANUAL_RECOVERY'] as const) {
        const now = new Date();
        await prisma.objectStorageVersionGcSchedule.create({
          data: {
            projectId: project.id,
            expectedOrganizationId: organizationB.id,
            status,
            notBefore: now,
            nextAttemptAt: now,
            ownerToken: status === 'CLAIMED' ? `gc-schedule-owner-${token}` : undefined,
            leaseExpiresAt: status === 'CLAIMED' ? new Date(Date.now() + 60_000) : undefined,
          },
        });
        await expect(
          store.transferProject({
            projectId: project.id,
            expectedOrganizationId: organizationB.id,
            expectedOwnershipEpoch: 1,
            targetOrganizationId: organizationC.id,
            idempotencyKey: `ownership-epoch-gc-${status.toLowerCase()}`,
            assertExternalStorageDetached: async () => {
              providerProbes += 1;
            },
            validateTargetAdmission: async () => {
              admissionChecks += 1;
            },
          }),
        ).rejects.toMatchObject({ code: 'PROJECT_TRANSFER_MANAGED_RESOURCES_ACTIVE', statusCode: 409 });
        expect(providerProbes).toBe(1);
        expect(admissionChecks).toBe(1);
        await expect(
          prisma.objectStorageVersionGcSchedule.findUniqueOrThrow({ where: { projectId: project.id } }),
        ).resolves.toMatchObject({
          expectedOrganizationId: organizationB.id,
          status,
        });
        await prisma.objectStorageVersionGcSchedule.delete({ where: { projectId: project.id } });
      }

      const lateScheduleKey = 'ownership-epoch-gc-after-probe';
      await expect(
        store.transferProject({
          projectId: project.id,
          expectedOrganizationId: organizationB.id,
          expectedOwnershipEpoch: 1,
          targetOrganizationId: organizationC.id,
          idempotencyKey: lateScheduleKey,
          assertExternalStorageDetached: async () => {
            providerProbes += 1;
            const now = new Date();
            await observer.objectStorageVersionGcSchedule.create({
              data: {
                projectId: project.id,
                expectedOrganizationId: organizationB.id,
                status: 'PENDING',
                notBefore: now,
                nextAttemptAt: now,
              },
            });
          },
          validateTargetAdmission: async () => {
            admissionChecks += 1;
          },
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_TRANSFER_MANAGED_RESOURCES_ACTIVE', statusCode: 409 });
      expect(providerProbes).toBe(2);
      expect(admissionChecks).toBe(2);
      await expect(
        prisma.objectStorageVersionGcSchedule.findUniqueOrThrow({ where: { projectId: project.id } }),
      ).resolves.toMatchObject({ expectedOrganizationId: organizationB.id, status: 'PENDING' });
      await prisma.objectStorageVersionGcSchedule.delete({ where: { projectId: project.id } });
      await prisma.objectStorageOperation.deleteMany({
        where: { kind: 'PROJECT_TRANSFER', idempotencyKey: lateScheduleKey },
      });

      const gcOperation = await prisma.objectStorageOperation.create({
        data: {
          id: `gc-transfer-block-${token}`,
          kind: 'PROJECT_VERSION_GC',
          status: 'PREPARED',
          scopeHash: '1'.repeat(64),
          idempotencyScopeHash: '2'.repeat(64),
          idempotencyKey: `gc-transfer-block-${token}`,
          requestHash: '3'.repeat(64),
          payload: { command: 'gc-object-generations' },
          preconditions: {},
          ownerToken: `gc-transfer-owner-${token}`,
          leaseExpiresAt: new Date(Date.now() + 60_000),
          scopes: {
            create: {
              ordinal: 0,
              projectIdSnapshot: project.id,
              projectId: project.id,
              expectedOrganizationId: organizationB.id,
            },
          },
        },
      });
      await expect(
        store.transferProject({
          projectId: project.id,
          expectedOrganizationId: organizationB.id,
          expectedOwnershipEpoch: 1,
          targetOrganizationId: organizationC.id,
          idempotencyKey: 'ownership-epoch-gc-op-block-0001',
          assertExternalStorageDetached: async () => {
            providerProbes += 1;
          },
          validateTargetAdmission: async () => {
            admissionChecks += 1;
          },
        }),
      ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_OPERATION_ACTIVE', statusCode: 409 });
      expect(providerProbes).toBe(2);
      expect(admissionChecks).toBe(2);
      await prisma.objectStorageOperation.delete({ where: { id: gcOperation.id } });

      const returnedToA = await store.transferProject({
        projectId: project.id,
        expectedOrganizationId: organizationB.id,
        expectedOwnershipEpoch: 1,
        targetOrganizationId: organizationA.id,
        idempotencyKey: 'ownership-epoch-b-a-0002',
        assertExternalStorageDetached: async () => {
          providerProbes += 1;
        },
        validateTargetAdmission: async () => {
          admissionChecks += 1;
        },
      });
      expect(returnedToA).toMatchObject({
        organizationId: organizationA.id,
        ownershipEpoch: 2,
      });

      const returnedToB = await store.transferProject({
        projectId: project.id,
        expectedOrganizationId: organizationA.id,
        expectedOwnershipEpoch: 2,
        targetOrganizationId: organizationB.id,
        idempotencyKey: 'ownership-epoch-a-b-0003',
        assertExternalStorageDetached: async () => {
          providerProbes += 1;
        },
        validateTargetAdmission: async () => {
          admissionChecks += 1;
        },
      });
      expect(returnedToB).toMatchObject({
        organizationId: organizationB.id,
        ownershipEpoch: 3,
      });
      expect(providerProbes).toBe(4);
      expect(admissionChecks).toBe(4);
      expect(await prisma.projectActivity.count({ where: { projectId: project.id, action: 'project.transfer' } })).toBe(
        3,
      );
      expect(await prisma.auditLog.count({ where: { resourceId: project.id, action: 'project.transfer' } })).toBe(3);

      const operations = await prisma.objectStorageOperation.findMany({
        where: { kind: 'PROJECT_TRANSFER', scopes: { some: { projectIdSnapshot: project.id } } },
        orderBy: { createdAt: 'asc' },
        include: { scopes: { orderBy: { ordinal: 'asc' } } },
      });
      expect(operations).toHaveLength(3);
      expect(
        operations.map((operation) => ({
          status: operation.status,
          source: operation.scopes[0]?.expectedOrganizationId,
          epoch: (operation.payload as Record<string, unknown>).ownershipEpoch,
          target: (operation.payload as Record<string, unknown>).targetOrganizationId,
          hasClientKeyDigest: /^[0-9a-f]{64}$/.test(
            String((operation.payload as Record<string, unknown>).clientIdempotencyKeyHash),
          ),
        })),
      ).toEqual([
        { status: 'COMMITTED', source: organizationA.id, epoch: 0, target: organizationB.id, hasClientKeyDigest: true },
        { status: 'COMMITTED', source: organizationB.id, epoch: 1, target: organizationA.id, hasClientKeyDigest: true },
        { status: 'COMMITTED', source: organizationA.id, epoch: 2, target: organizationB.id, hasClientKeyDigest: true },
      ]);
    } finally {
      await cleanup(prisma, project.id, [organizationA.id, organizationB.id, organizationC.id]);
      await Promise.allSettled([store.disconnect(), observer.$disconnect()]);
    }
  });
});
