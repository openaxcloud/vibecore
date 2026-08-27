import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

import { PrismaApiStore } from '../prisma-store.js';

const runDbTests = process.env.DATABASE_URL ? describe : describe.skip;
const TERMS = 'reserved-vm-monthly-v1';

function suffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

runDbTests('Reserved VM durable saga — real PostgreSQL multi-client', () => {
  it('deduplicates create, recovers an expired DB-clock lease, and settles the monthly charge exactly once', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    let organizationId: string | undefined;

    try {
      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);
      const token = suffix();
      const user = await prismaA.user.create({ data: { email: `reserved-${token}@example.test` } });
      const organization = await prismaA.organization.create({
        data: { name: `Reserved ${token}`, slug: `reserved-${token}` },
      });
      organizationId = organization.id;
      const project = await prismaA.project.create({
        data: { organizationId: organization.id, name: 'Reserved project', slug: `reserved-project-${token}` },
      });
      const reservedVm = {
        organizationId: organization.id,
        actorUserId: user.id,
        idempotencyKey: `reserved-create-${token}`,
        requestHash: 'a'.repeat(64),
        tier: 'shared-0.5' as const,
        termsVersion: TERMS,
        monthlyPriceCents: 2_000,
        rateCardVersion: 1,
      };

      const [createdA, createdB] = await Promise.all([
        storeA.createDeployment({
          projectId: project.id,
          provider: 'server',
          status: 'BUILDING',
          machineSize: 'shared-0.5',
          previewUrl: 'https://stable.example.test',
          reservedVm,
        }),
        storeB.createDeployment({
          projectId: project.id,
          provider: 'server',
          status: 'BUILDING',
          machineSize: 'shared-0.5',
          previewUrl: 'https://stable.example.test',
          reservedVm,
        }),
      ]);

      expect(createdA.id).toBe(createdB.id);
      expect(await prismaA.deployment.count({ where: { projectId: project.id } })).toBe(1);
      expect(await prismaA.reservedVmOperation.count({ where: { deploymentId: createdA.id } })).toBe(1);
      expect(await prismaA.ledgerReservation.count({ where: { organizationId: organization.id } })).toBe(1);

      const ownerA = `owner-a-${token}`;
      const firstLease = await storeA.acquireReservedVmOperation({
        projectId: project.id,
        idempotencyKey: reservedVm.idempotencyKey,
        ownerToken: ownerA,
        ttlMs: 60_000,
      });
      expect(firstLease.acquired).toBe(true);

      // Simulate process A dying. Recovery uses PostgreSQL clock, not either
      // API replica's wall clock, and advances the fencing token.
      await prismaA.$executeRaw`
        UPDATE "ReservedVmOperation"
        SET "leaseExpiresAt" = clock_timestamp() - interval '1 second'
        WHERE "id" = ${firstLease.operation.id}
      `;
      const ownerB = `owner-b-${token}`;
      const recovered = await storeB.acquireReservedVmOperation({
        projectId: project.id,
        idempotencyKey: reservedVm.idempotencyKey,
        ownerToken: ownerB,
        ttlMs: 60_000,
      });
      expect(recovered.acquired).toBe(true);
      expect(recovered.operation.fencingToken).toBeGreaterThan(firstLease.operation.fencingToken);
      await expect(
        storeA.markReservedVmRuntimeApplied({
          operationId: firstLease.operation.id,
          ownerToken: ownerA,
          fencingToken: firstLease.operation.fencingToken,
        }),
      ).resolves.toBe(false);
      await expect(
        storeB.markReservedVmRuntimeApplied({
          operationId: recovered.operation.id,
          ownerToken: ownerB,
          fencingToken: recovered.operation.fencingToken,
        }),
      ).resolves.toBe(true);

      const committed = await storeB.commitReservedVmOperation({
        operationId: recovered.operation.id,
        ownerToken: ownerB,
        fencingToken: recovered.operation.fencingToken,
        response: { ready: true, url: 'https://stable.example.test' },
      });
      const replayedCommit = await storeA.commitReservedVmOperation({
        operationId: recovered.operation.id,
        ownerToken: 'stale-owner',
        fencingToken: 0,
        response: { ignored: true },
      });

      expect(replayedCommit.deployment.id).toBe(committed.deployment.id);
      expect(committed.deployment).toMatchObject({
        runtimeKind: 'reserved-vm',
        runtimeVersion: 1,
        reservedVmTier: 'shared-0.5',
        reservedVmPriceCents: 2_000,
        persistentStorageClaim: `reserved-data-${createdA.id}`,
      });
      const reservation = await prismaA.ledgerReservation.findFirstOrThrow({
        where: { organizationId: organization.id },
      });
      expect(reservation.status).toBe('COMMITTED');
      expect(reservation.committedMinor).toBe(2_000n);
      expect(
        await prismaA.ledgerTransaction.count({
          where: { organizationId: organization.id, reason: 'reservation.settle' },
        }),
      ).toBe(1);

      await expect(
        storeA.createDeployment({
          projectId: project.id,
          provider: 'server',
          reservedVm: { ...reservedVm, requestHash: 'b'.repeat(64) },
        }),
      ).rejects.toMatchObject({ code: 'RESERVED_VM_IDEMPOTENCY_CONFLICT' });
    } finally {
      if (organizationId) {
        await prismaA.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('upgrades in place using only the price delta and serializes competing CAS changes', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    let organizationId: string | undefined;

    try {
      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);
      const token = suffix();
      const user = await prismaA.user.create({ data: { email: `reserved-upgrade-${token}@example.test` } });
      const organization = await prismaA.organization.create({
        data: { name: `Reserved upgrade ${token}`, slug: `reserved-upgrade-${token}` },
      });
      organizationId = organization.id;
      const project = await prismaA.project.create({
        data: { organizationId: organization.id, name: 'Reserved upgrade', slug: `reserved-upgrade-project-${token}` },
      });
      const createKey = `reserved-upgrade-create-${token}`;
      const deployment = await storeA.createDeployment({
        projectId: project.id,
        provider: 'server',
        status: 'READY',
        url: 'https://unchanged.example.test',
        previewUrl: 'https://unchanged.example.test',
        machineSize: 'shared-0.5',
        reservedVm: {
          organizationId: organization.id,
          actorUserId: user.id,
          idempotencyKey: createKey,
          requestHash: 'c'.repeat(64),
          tier: 'shared-0.5',
          termsVersion: TERMS,
          monthlyPriceCents: 2_000,
          rateCardVersion: 1,
        },
      });
      const createLease = await storeA.acquireReservedVmOperation({
        projectId: project.id,
        idempotencyKey: createKey,
        ownerToken: `create-owner-${token}`,
        ttlMs: 60_000,
      });
      await storeA.markReservedVmRuntimeApplied({
        operationId: createLease.operation.id,
        ownerToken: `create-owner-${token}`,
        fencingToken: createLease.operation.fencingToken,
      });
      const initial = await storeA.commitReservedVmOperation({
        operationId: createLease.operation.id,
        ownerToken: `create-owner-${token}`,
        fencingToken: createLease.operation.fencingToken,
        response: { ready: true },
      });

      const upgradeKey = `reserved-upgrade-change-${token}`;
      const upgrade = await storeA.createReservedVmChangeOperation({
        projectId: project.id,
        deploymentId: deployment.id,
        organizationId: organization.id,
        actorUserId: user.id,
        idempotencyKey: upgradeKey,
        requestHash: 'd'.repeat(64),
        expectedRuntimeVersion: initial.deployment.runtimeVersion!,
        targetRuntimeKind: 'reserved-vm',
        targetTier: 'dedicated-2',
        targetMachineSize: 'dedicated-2',
        targetCpuMillicores: 2_000,
        targetMemoryMb: 8_192,
        targetPriceCents: 8_000,
        termsVersion: TERMS,
        rateCardVersion: 1,
      });
      expect(upgrade.operation.billingAmountCents).toBe(6_000);
      const upgradeReservation = await prismaA.ledgerReservation.findUniqueOrThrow({
        where: { id: upgrade.operation.billingReservationId },
      });
      expect(upgradeReservation.maxAmountMinor).toBe(6_000n);

      const competing = await Promise.allSettled([
        storeA.createReservedVmChangeOperation({
          projectId: project.id,
          deploymentId: deployment.id,
          organizationId: organization.id,
          actorUserId: user.id,
          idempotencyKey: `competing-a-${token}`,
          requestHash: 'e'.repeat(64),
          expectedRuntimeVersion: initial.deployment.runtimeVersion!,
          targetRuntimeKind: 'reserved-vm',
          targetTier: 'dedicated-1',
          targetMachineSize: 'dedicated-1',
          targetCpuMillicores: 1_000,
          targetMemoryMb: 4_096,
          targetPriceCents: 4_000,
          termsVersion: TERMS,
          rateCardVersion: 1,
        }),
        storeB.createReservedVmChangeOperation({
          projectId: project.id,
          deploymentId: deployment.id,
          organizationId: organization.id,
          actorUserId: user.id,
          idempotencyKey: `competing-b-${token}`,
          requestHash: 'f'.repeat(64),
          expectedRuntimeVersion: initial.deployment.runtimeVersion!,
          targetRuntimeKind: 'autoscale',
          targetMachineSize: 'shared-0.5',
          targetCpuMillicores: 500,
          targetMemoryMb: 2_048,
          targetPriceCents: 0,
          termsVersion: TERMS,
          rateCardVersion: 1,
        }),
      ]);
      expect(competing.every((result) => result.status === 'rejected')).toBe(true);
      expect(
        competing.every(
          (result) =>
            result.status === 'rejected' &&
            (result.reason as { code?: string }).code === 'RESERVED_VM_CHANGE_IN_PROGRESS',
        ),
      ).toBe(true);

      const owner = `upgrade-owner-${token}`;
      const lease = await storeB.acquireReservedVmOperation({
        projectId: project.id,
        idempotencyKey: upgradeKey,
        ownerToken: owner,
        ttlMs: 60_000,
      });
      await storeB.markReservedVmRuntimeApplied({
        operationId: lease.operation.id,
        ownerToken: owner,
        fencingToken: lease.operation.fencingToken,
      });
      const completed = await storeB.commitReservedVmOperation({
        operationId: lease.operation.id,
        ownerToken: owner,
        fencingToken: lease.operation.fencingToken,
        response: { ready: true },
      });

      expect(completed.deployment).toMatchObject({
        id: deployment.id,
        url: 'https://unchanged.example.test',
        previewUrl: 'https://unchanged.example.test',
        runtimeVersion: 2,
        reservedVmTier: 'dedicated-2',
        reservedVmPriceCents: 8_000,
        persistentStorageClaim: initial.deployment.persistentStorageClaim,
      });
      expect(
        await prismaA.ledgerTransaction.count({
          where: { organizationId: organization.id, reason: 'reservation.settle' },
        }),
      ).toBe(2);
      const settled = await prismaA.ledgerReservation.aggregate({
        where: { organizationId: organization.id, status: 'COMMITTED' },
        _sum: { committedMinor: true },
      });
      expect(settled._sum.committedMinor).toBe(8_000n);

      const afterVersion = completed.deployment.runtimeVersion!;
      const race = await Promise.allSettled([
        storeA.createReservedVmChangeOperation({
          projectId: project.id,
          deploymentId: deployment.id,
          organizationId: organization.id,
          actorUserId: user.id,
          idempotencyKey: `race-a-${token}`,
          requestHash: '1'.repeat(64),
          expectedRuntimeVersion: afterVersion,
          targetRuntimeKind: 'reserved-vm',
          targetTier: 'dedicated-4',
          targetMachineSize: 'dedicated-4',
          targetCpuMillicores: 4_000,
          targetMemoryMb: 16_384,
          targetPriceCents: 16_000,
          termsVersion: TERMS,
          rateCardVersion: 1,
        }),
        storeB.createReservedVmChangeOperation({
          projectId: project.id,
          deploymentId: deployment.id,
          organizationId: organization.id,
          actorUserId: user.id,
          idempotencyKey: `race-b-${token}`,
          requestHash: '2'.repeat(64),
          expectedRuntimeVersion: afterVersion,
          targetRuntimeKind: 'autoscale',
          targetMachineSize: 'shared-0.5',
          targetCpuMillicores: 500,
          targetMemoryMb: 2_048,
          targetPriceCents: 0,
          termsVersion: TERMS,
          rateCardVersion: 1,
        }),
      ]);
      expect(race.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(race.filter((result) => result.status === 'rejected')).toHaveLength(1);
      const loser = race.find((result) => result.status === 'rejected');
      expect((loser as PromiseRejectedResult).reason).toMatchObject({ code: 'RESERVED_VM_CHANGE_IN_PROGRESS' });

      const winner = (
        race.find((result) => result.status === 'fulfilled') as PromiseFulfilledResult<
          Awaited<ReturnType<typeof storeA.createReservedVmChangeOperation>>
        >
      ).value;
      const cleanupOwner = `race-cleanup-${token}`;
      const cleanupLease = await storeA.acquireReservedVmOperation({
        projectId: project.id,
        idempotencyKey: winner.operation.idempotencyKey,
        ownerToken: cleanupOwner,
        ttlMs: 60_000,
      });
      await storeA.failReservedVmOperation({
        operationId: cleanupLease.operation.id,
        ownerToken: cleanupOwner,
        fencingToken: cleanupLease.operation.fencingToken,
        errorCode: 'TEST_CLEANUP',
        errorMessage: 'No external runtime effect was started.',
      });

      const autoscaleKey = `reserved-to-autoscale-${token}`;
      const autoscale = await storeB.createReservedVmChangeOperation({
        projectId: project.id,
        deploymentId: deployment.id,
        organizationId: organization.id,
        actorUserId: user.id,
        idempotencyKey: autoscaleKey,
        requestHash: '3'.repeat(64),
        expectedRuntimeVersion: afterVersion,
        targetRuntimeKind: 'autoscale',
        targetMachineSize: 'shared-0.5',
        targetCpuMillicores: 500,
        targetMemoryMb: 2_048,
        targetPriceCents: 0,
        termsVersion: TERMS,
        rateCardVersion: 1,
      });
      expect(autoscale.operation.billingAmountCents).toBe(0);
      expect(autoscale.operation.billingReservationId).toBeUndefined();
      const autoscaleOwner = `autoscale-owner-${token}`;
      const autoscaleLease = await storeA.acquireReservedVmOperation({
        projectId: project.id,
        idempotencyKey: autoscaleKey,
        ownerToken: autoscaleOwner,
        ttlMs: 60_000,
      });
      await storeA.markReservedVmRuntimeApplied({
        operationId: autoscaleLease.operation.id,
        ownerToken: autoscaleOwner,
        fencingToken: autoscaleLease.operation.fencingToken,
      });
      const converted = await storeA.commitReservedVmOperation({
        operationId: autoscaleLease.operation.id,
        ownerToken: autoscaleOwner,
        fencingToken: autoscaleLease.operation.fencingToken,
        response: { ready: true },
      });

      expect(converted.deployment).toMatchObject({
        id: deployment.id,
        projectId: project.id,
        url: 'https://unchanged.example.test',
        previewUrl: 'https://unchanged.example.test',
        runtimeKind: 'autoscale',
        runtimeVersion: afterVersion + 1,
        machineSize: 'shared-0.5',
        persistentStorageClaim: initial.deployment.persistentStorageClaim,
      });
      expect(converted.deployment.reservedVmTier).toBeUndefined();
      expect(converted.deployment.reservedVmPriceCents).toBeUndefined();
      expect(
        await prismaA.ledgerTransaction.count({
          where: { organizationId: organization.id, reason: 'reservation.settle' },
        }),
      ).toBe(2);

      await expect(storeA.softDeleteProject(project.id)).rejects.toMatchObject({
        code: 'PROJECT_RESERVED_VM_DECOMMISSION_REQUIRED',
      });
      const decommissionKey = `reserved-decommission-${token}`;
      const decommission = await storeA.createReservedVmDecommissionOperation({
        projectId: project.id,
        deploymentId: deployment.id,
        organizationId: organization.id,
        actorUserId: user.id,
        idempotencyKey: decommissionKey,
        requestHash: '4'.repeat(64),
        expectedRuntimeVersion: converted.deployment.runtimeVersion!,
        targetMachineSize: 'shared-0.5',
        targetCpuMillicores: 500,
        targetMemoryMb: 2_048,
      });
      expect(decommission.deployment.persistentStorageClaim).toBe(initial.deployment.persistentStorageClaim);
      const decommissionOwner = `decommission-owner-${token}`;
      const decommissionLease = await storeB.acquireReservedVmOperation({
        projectId: project.id,
        idempotencyKey: decommissionKey,
        ownerToken: decommissionOwner,
        ttlMs: 60_000,
      });
      await storeB.markReservedVmRuntimeApplied({
        operationId: decommissionLease.operation.id,
        ownerToken: decommissionOwner,
        fencingToken: decommissionLease.operation.fencingToken,
      });
      await expect(
        storeB.commitReservedVmDecommissionOperation({
          operationId: decommissionLease.operation.id,
          ownerToken: decommissionOwner,
          fencingToken: decommissionLease.operation.fencingToken,
          deletedPersistentStorageClaim: 'reserved-data-some-other-deployment',
          response: { persistentVolumeClaimAbsent: true },
        }),
      ).rejects.toMatchObject({ code: 'RESERVED_VM_RUNTIME_VERSION_CONFLICT' });
      const erased = await storeA.commitReservedVmDecommissionOperation({
        operationId: decommissionLease.operation.id,
        ownerToken: decommissionOwner,
        fencingToken: decommissionLease.operation.fencingToken,
        deletedPersistentStorageClaim: initial.deployment.persistentStorageClaim!,
        response: {
          decommissioned: true,
          persistentVolumeClaimName: initial.deployment.persistentStorageClaim,
          persistentVolumeClaimAbsent: true,
        },
      });
      expect(erased.deployment).toMatchObject({
        runtimeKind: 'autoscale',
        runtimeVersion: converted.deployment.runtimeVersion! + 1,
      });
      expect(erased.deployment.persistentStorageClaim).toBeUndefined();
      await expect(
        storeB.commitReservedVmDecommissionOperation({
          operationId: decommissionLease.operation.id,
          ownerToken: 'stale-decommission-owner',
          fencingToken: 0,
          deletedPersistentStorageClaim: initial.deployment.persistentStorageClaim!,
          response: { ignored: true },
        }),
      ).resolves.toMatchObject({ deployment: { persistentStorageClaim: undefined } });
      await expect(storeA.softDeleteProject(project.id)).resolves.toMatchObject({ id: project.id });
    } finally {
      if (organizationId) {
        await prismaA.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('fails closed on cross-tenant billing ownership before creating an operation or hold', async () => {
    const prisma = createDatabaseClient();
    let ownerOrganizationId: string | undefined;
    let attackerOrganizationId: string | undefined;
    let actorUserId: string | undefined;

    try {
      const store = new PrismaApiStore(prisma);
      const token = suffix();
      const owner = await prisma.organization.create({ data: { name: `Owner ${token}`, slug: `owner-${token}` } });
      const attacker = await prisma.organization.create({
        data: { name: `Attacker ${token}`, slug: `attacker-${token}` },
      });
      const actor = await prisma.user.create({ data: { email: `reserved-attacker-${token}@example.test` } });
      actorUserId = actor.id;
      ownerOrganizationId = owner.id;
      attackerOrganizationId = attacker.id;
      const project = await prisma.project.create({
        data: { organizationId: owner.id, name: 'Tenant protected', slug: `tenant-protected-${token}` },
      });

      await expect(
        store.createDeployment({
          projectId: project.id,
          provider: 'server',
          reservedVm: {
            organizationId: attacker.id,
            actorUserId: actor.id,
            idempotencyKey: `cross-tenant-${token}`,
            requestHash: '9'.repeat(64),
            tier: 'shared-0.5',
            termsVersion: TERMS,
            monthlyPriceCents: 2_000,
            rateCardVersion: 1,
          },
        }),
      ).rejects.toMatchObject({ code: 'RESERVED_VM_TENANT_FORBIDDEN', statusCode: 403 });
      expect(await prisma.deployment.count({ where: { projectId: project.id } })).toBe(0);
      expect(await prisma.reservedVmOperation.count({ where: { projectId: project.id } })).toBe(0);
      expect(await prisma.ledgerReservation.count({ where: { organizationId: attacker.id } })).toBe(0);
    } finally {
      if (ownerOrganizationId) {
        await prisma.organization.delete({ where: { id: ownerOrganizationId } }).catch(() => undefined);
      }
      if (attackerOrganizationId) {
        await prisma.organization.delete({ where: { id: attackerOrganizationId } }).catch(() => undefined);
      }
      if (actorUserId) {
        await prisma.user.delete({ where: { id: actorUserId } }).catch(() => undefined);
      }
      await prisma.$disconnect();
    }
  });

  it('serializes CREATE cancellation, excludes late build recovery, and releases hold/PVC state only after fenced cleanup', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    let organizationId: string | undefined;

    try {
      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);
      const token = suffix();
      const actor = await prismaA.user.create({ data: { email: `reserved-cancel-${token}@example.test` } });
      const organization = await prismaA.organization.create({
        data: { name: `Reserved cancel ${token}`, slug: `reserved-cancel-${token}` },
      });
      organizationId = organization.id;
      const project = await prismaA.project.create({
        data: { organizationId: organization.id, name: 'Reserved cancel', slug: `reserved-cancel-${token}` },
      });
      const createKey = `reserved-cancel-create-${token}`;
      const deployment = await storeA.createDeployment({
        projectId: project.id,
        provider: 'server',
        status: 'BUILDING',
        machineSize: 'shared-0.5',
        reservedVm: {
          organizationId: organization.id,
          actorUserId: actor.id,
          idempotencyKey: createKey,
          requestHash: '5'.repeat(64),
          tier: 'shared-0.5',
          termsVersion: TERMS,
          monthlyPriceCents: 2_000,
          rateCardVersion: 1,
        },
      });
      const [cancelA, cancelB] = await Promise.all([
        storeA.acquireReservedVmCreateCancellation({
          projectId: project.id,
          deploymentId: deployment.id,
          actorUserId: actor.id,
          ownerToken: `cancel-a-${token}`,
          ttlMs: 60_000,
        }),
        storeB.acquireReservedVmCreateCancellation({
          projectId: project.id,
          deploymentId: deployment.id,
          actorUserId: actor.id,
          ownerToken: `cancel-b-${token}`,
          ttlMs: 60_000,
        }),
      ]);
      const firstCancel = cancelA.acquired ? cancelA : cancelB;
      expect([cancelA, cancelB].filter((result) => result.acquired)).toHaveLength(1);
      expect(firstCancel.operation).toMatchObject({
        kind: 'CREATE',
        status: 'APPLYING',
        phase: 'LEASED',
        errorCode: 'RESERVED_VM_CANCEL_REQUESTED',
      });
      await expect(
        storeA.acquireReservedVmOperation({
          projectId: project.id,
          idempotencyKey: createKey,
          ownerToken: `late-build-${token}`,
          ttlMs: 60_000,
        }),
      ).resolves.toMatchObject({ acquired: false, operation: { errorCode: 'RESERVED_VM_CANCEL_REQUESTED' } });

      await prismaA.$executeRaw`
        UPDATE "ReservedVmOperation"
        SET "leaseExpiresAt" = clock_timestamp() - INTERVAL '1 second'
        WHERE "id" = ${firstCancel.operation.id}
      `;
      const recovered = await storeB.claimNextReservedVmCreateCancellation({
        ownerToken: `cancel-recovery-${token}`,
        ttlMs: 60_000,
      });
      expect(recovered?.operation.fencingToken).toBeGreaterThan(firstCancel.operation.fencingToken);
      await expect(
        storeA.claimNextRecoverableReservedVmOperation({
          ownerToken: `generic-recovery-${token}`,
          ttlMs: 60_000,
          kinds: ['CREATE'],
        }),
      ).resolves.toBeUndefined();

      const dbBefore = await prismaA.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
      const committed = await storeB.commitReservedVmCreateCancellation({
        operationId: recovered!.operation.id,
        ownerToken: recovered!.operation.leaseOwner!,
        fencingToken: recovered!.operation.fencingToken,
        deletedPersistentStorageClaim: `reserved-data-${deployment.id}`,
        logs: [],
      });
      const dbAfter = await prismaA.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;

      expect(committed).toMatchObject({
        replayed: false,
        operation: {
          status: 'FAILED',
          phase: 'ROLLED_BACK',
          errorCode: 'DEPLOYMENT_CANCELED_BY_USER',
        },
        deployment: { status: 'CANCELED', runtimeKind: 'autoscale' },
      });
      expect(committed.deployment.persistentStorageClaim).toBeUndefined();
      expect(Date.parse(committed.deployment.canceledAt!)).toBeGreaterThanOrEqual(dbBefore[0]!.now.getTime());
      expect(Date.parse(committed.deployment.canceledAt!)).toBeLessThanOrEqual(dbAfter[0]!.now.getTime());
      expect(
        await prismaA.ledgerReservation.findFirstOrThrow({ where: { organizationId: organization.id } }),
      ).toMatchObject({ status: 'RELEASED', releaseReason: 'cancel' });
      await expect(
        storeA.commitReservedVmCreateCancellation({
          operationId: recovered!.operation.id,
          ownerToken: 'stale-cancel-owner',
          fencingToken: 0,
          deletedPersistentStorageClaim: `reserved-data-${deployment.id}`,
          logs: [],
        }),
      ).resolves.toMatchObject({ replayed: true, deployment: { status: 'CANCELED' } });
    } finally {
      if (organizationId) {
        await prismaA.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });
});
