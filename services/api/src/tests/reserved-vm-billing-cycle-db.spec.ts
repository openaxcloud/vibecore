import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import { describe, expect, it } from 'vitest';

/* eslint-disable-next-line no-restricted-imports -- The API Vitest config has no ~/ resolver. */
import { PrismaApiStore } from '../prisma-store.js';
/* eslint-disable-next-line no-restricted-imports -- The API Vitest config has no ~/ resolver. */
import type { ReservedVmTier } from '../store.js';

const runDbTests = process.env.DATABASE_URL ? describe : describe.skip;
const TERMS = 'reserved-vm-monthly-v1';

const PRICES: Record<ReservedVmTier, number> = {
  'shared-0.5': 2_000,
  'dedicated-1': 4_000,
  'dedicated-2': 8_000,
  'dedicated-4': 16_000,
};

function suffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

async function createCommittedReservedVm(input: {
  prisma: DatabaseClient;
  store: PrismaApiStore;
  organizationId: string;
  projectId: string;
  tier: ReservedVmTier;
  token: string;
}) {
  const idempotencyKey = `reserved-cycle-create-${input.token}`;

  const deployment = await input.store.createDeployment({
    projectId: input.projectId,
    provider: 'server',
    status: 'READY',
    url: 'https://reserved-cycle.example.test',
    previewUrl: 'https://reserved-cycle.example.test',
    machineSize: input.tier,
    reservedVm: {
      organizationId: input.organizationId,
      idempotencyKey,
      requestHash: 'a'.repeat(64),
      tier: input.tier,
      termsVersion: TERMS,
      monthlyPriceCents: PRICES[input.tier],
      rateCardVersion: 1,
    },
  });

  const ownerToken = `initial-owner-${input.token}`;

  const lease = await input.store.acquireReservedVmOperation({
    projectId: input.projectId,
    idempotencyKey,
    ownerToken,
    ttlMs: 60_000,
  });
  expect(lease.acquired).toBe(true);
  await expect(
    input.store.markReservedVmRuntimeApplied({
      operationId: lease.operation.id,
      ownerToken,
      fencingToken: lease.operation.fencingToken,
    }),
  ).resolves.toBe(true);

  const committed = await input.store.commitReservedVmOperation({
    operationId: lease.operation.id,
    ownerToken,
    fencingToken: lease.operation.fencingToken,
    response: { ready: true },
  });

  const row = await input.prisma.deployment.findUniqueOrThrow({ where: { id: deployment.id } });

  return { deployment: committed.deployment, row };
}

async function forceCycleDue(prisma: DatabaseClient, deploymentId: string): Promise<Date> {
  const rows = await prisma.$queryRaw<Array<{ due: Date }>>`
    SELECT date_trunc('milliseconds', clock_timestamp() - INTERVAL '1 second') AS "due"
  `;

  const due = rows[0]!.due;
  await prisma.deployment.update({
    where: { id: deploymentId },
    data: {
      reservedVmBillingState: 'CURRENT',
      reservedVmCurrentPeriodStart: new Date(due.getTime() - 31 * 24 * 60 * 60_000),
      reservedVmNextChargeAt: due,
      reservedVmGraceEndsAt: null,
      reservedVmStopRequestedAt: null,
    },
  });

  return due;
}

runDbTests('Reserved VM monthly billing cycle — real PostgreSQL multi-client', () => {
  it('persists one period, recovers an expired reservation lease, and settles exactly once', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();

    let organizationId: string | undefined;

    try {
      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);
      const token = suffix();

      const organization = await prismaA.organization.create({
        data: { name: `Reserved cycle ${token}`, slug: `reserved-cycle-${token}` },
      });
      organizationId = organization.id;

      const project = await prismaA.project.create({
        data: { organizationId: organization.id, name: 'Reserved cycle', slug: `reserved-cycle-project-${token}` },
      });
      const initial = await createCommittedReservedVm({
        prisma: prismaA,
        store: storeA,
        organizationId: organization.id,
        projectId: project.id,
        tier: 'shared-0.5',
        token,
      });

      expect(initial.deployment).toMatchObject({
        reservedVmBillingState: 'CURRENT',
        reservedVmRateCardVersion: 1,
      });
      expect(Date.parse(initial.deployment.reservedVmNextChargeAt!)).toBeGreaterThan(
        Date.parse(initial.deployment.reservedVmCurrentPeriodStart!),
      );

      const initialPeriod = await prismaA.reservedVmBillingPeriod.findFirstOrThrow({
        where: { deploymentId: initial.deployment.id },
      });
      expect(initialPeriod).toMatchObject({ status: 'PAID', priceCents: 2_000, tier: 'shared-0.5' });
      expect(initialPeriod.periodEnd.toISOString()).toBe(initial.deployment.reservedVmNextChargeAt);

      const due = await forceCycleDue(prismaA, initial.deployment.id);

      const [claimA, claimB] = await Promise.all([
        storeA.claimDueReservedVmBillingPeriod({
          deploymentId: initial.deployment.id,
          ownerToken: `renew-owner-a-${token}`,
          ttlMs: 60_000,
        }),
        storeB.claimDueReservedVmBillingPeriod({
          deploymentId: initial.deployment.id,
          ownerToken: `renew-owner-b-${token}`,
          ttlMs: 60_000,
        }),
      ]);

      const firstClaim = claimA ?? claimB;
      expect([claimA, claimB].filter(Boolean)).toHaveLength(1);
      expect(firstClaim?.period).toMatchObject({
        periodStart: due.toISOString(),
        status: 'PROCESSING',
        priceCents: 2_000,
        reservationGeneration: 0,
      });

      const firstReservationId = firstClaim!.period.billingReservationId!;
      await prismaA.$transaction([
        prismaA.reservedVmBillingPeriod.update({
          where: { id: firstClaim!.period.id },
          data: { leaseExpiresAt: new Date(0) },
        }),
        prismaA.ledgerReservation.update({
          where: { id: firstReservationId },
          data: { expiresAt: new Date(0) },
        }),
      ]);

      const recoveryOwner = `renew-recovery-${token}`;

      const recovered = await storeB.claimDueReservedVmBillingPeriod({
        deploymentId: initial.deployment.id,
        ownerToken: recoveryOwner,
        ttlMs: 60_000,
      });
      expect(recovered?.period.fencingToken).toBeGreaterThan(firstClaim!.period.fencingToken);
      expect(recovered?.period.reservationGeneration).toBe(1);
      expect(recovered?.period.billingReservationId).not.toBe(firstReservationId);
      expect(await prismaA.ledgerReservation.findUniqueOrThrow({ where: { id: firstReservationId } })).toMatchObject({
        status: 'EXPIRED',
      });

      await expect(
        storeA.commitReservedVmBillingPeriod({
          periodId: firstClaim!.period.id,
          ownerToken: firstClaim!.period.leaseOwner!,
          fencingToken: firstClaim!.period.fencingToken,
        }),
      ).rejects.toMatchObject({ code: 'RESERVED_VM_BILLING_FENCE_LOST' });

      const [settledA, settledB] = await Promise.all([
        storeA.commitReservedVmBillingPeriod({
          periodId: recovered!.period.id,
          ownerToken: recoveryOwner,
          fencingToken: recovered!.period.fencingToken,
        }),
        storeB.commitReservedVmBillingPeriod({
          periodId: recovered!.period.id,
          ownerToken: recoveryOwner,
          fencingToken: recovered!.period.fencingToken,
        }),
      ]);
      expect([settledA.replayed, settledB.replayed].sort()).toEqual([false, true]);
      expect(await prismaA.reservedVmBillingPeriod.count({ where: { deploymentId: initial.deployment.id } })).toBe(2);
      expect(
        await prismaA.reservedVmBillingPeriod.count({
          where: { deploymentId: initial.deployment.id, periodStart: due },
        }),
      ).toBe(1);
      expect(
        await prismaA.ledgerTransaction.count({
          where: { organizationId: organization.id, reason: 'reservation.settle' },
        }),
      ).toBe(2);

      const advanced = await prismaA.deployment.findUniqueOrThrow({ where: { id: initial.deployment.id } });
      expect(advanced.reservedVmCurrentPeriodStart?.toISOString()).toBe(due.toISOString());
      expect(advanced.reservedVmNextChargeAt?.toISOString()).toBe(recovered!.period.periodEnd);
    } finally {
      if (organizationId) {
        await prismaA.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }

      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('does not refund a downgrade and applies the lower price only to the next period', async () => {
    const prisma = createDatabaseClient();

    let organizationId: string | undefined;

    try {
      const store = new PrismaApiStore(prisma);
      const token = suffix();

      const organization = await prisma.organization.create({
        data: { name: `Reserved downgrade ${token}`, slug: `reserved-downgrade-${token}` },
      });
      organizationId = organization.id;

      const project = await prisma.project.create({
        data: {
          organizationId: organization.id,
          name: 'Reserved downgrade',
          slug: `reserved-downgrade-project-${token}`,
        },
      });
      const initial = await createCommittedReservedVm({
        prisma,
        store,
        organizationId: organization.id,
        projectId: project.id,
        tier: 'dedicated-2',
        token,
      });

      const downgradeKey = `reserved-downgrade-${token}`;

      const downgrade = await store.createReservedVmChangeOperation({
        projectId: project.id,
        deploymentId: initial.deployment.id,
        organizationId: organization.id,
        idempotencyKey: downgradeKey,
        requestHash: 'b'.repeat(64),
        expectedRuntimeVersion: initial.deployment.runtimeVersion!,
        targetRuntimeKind: 'reserved-vm',
        targetTier: 'dedicated-1',
        targetMachineSize: 'dedicated-1',
        targetPriceCents: 4_000,
        termsVersion: TERMS,
        rateCardVersion: 1,
      });
      expect(downgrade.operation.billingAmountCents).toBe(0);
      expect(downgrade.operation.billingReservationId).toBeUndefined();

      const ownerToken = `downgrade-owner-${token}`;

      const lease = await store.acquireReservedVmOperation({
        projectId: project.id,
        idempotencyKey: downgradeKey,
        ownerToken,
        ttlMs: 60_000,
      });
      await store.markReservedVmRuntimeApplied({
        operationId: lease.operation.id,
        ownerToken,
        fencingToken: lease.operation.fencingToken,
      });

      const downgraded = await store.commitReservedVmOperation({
        operationId: lease.operation.id,
        ownerToken,
        fencingToken: lease.operation.fencingToken,
        response: { ready: true },
      });

      expect(downgraded.deployment).toMatchObject({
        reservedVmTier: 'dedicated-1',
        reservedVmPriceCents: 4_000,
      });
      expect(
        await prisma.ledgerTransaction.count({
          where: { organizationId: organization.id, reason: 'reservation.settle' },
        }),
      ).toBe(1);
      expect(
        await prisma.reservedVmBillingPeriod.findFirstOrThrow({
          where: { deploymentId: initial.deployment.id },
        }),
      ).toMatchObject({ status: 'PAID', tier: 'dedicated-2', priceCents: 8_000 });

      await forceCycleDue(prisma, initial.deployment.id);

      const renewal = await store.claimDueReservedVmBillingPeriod({
        deploymentId: initial.deployment.id,
        ownerToken: `downgrade-renewal-${token}`,
        ttlMs: 60_000,
      });
      expect(renewal?.period).toMatchObject({ tier: 'dedicated-1', priceCents: 4_000 });
      await store.commitReservedVmBillingPeriod({
        periodId: renewal!.period.id,
        ownerToken: `downgrade-renewal-${token}`,
        fencingToken: renewal!.period.fencingToken,
      });

      const settled = await prisma.ledgerReservation.aggregate({
        where: { organizationId: organization.id, status: 'COMMITTED' },
        _sum: { committedMinor: true },
      });
      expect(settled._sum.committedMinor).toBe(12_000n);
    } finally {
      if (organizationId) {
        await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }

      await prisma.$disconnect();
    }
  });

  it('keeps the original grace deadline and emits a compute-only stop signal while retaining the PVC', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();

    let organizationId: string | undefined;

    try {
      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);
      const token = suffix();

      const organization = await prismaA.organization.create({
        data: { name: `Reserved grace ${token}`, slug: `reserved-grace-${token}` },
      });
      organizationId = organization.id;

      const project = await prismaA.project.create({
        data: { organizationId: organization.id, name: 'Reserved grace', slug: `reserved-grace-project-${token}` },
      });
      const initial = await createCommittedReservedVm({
        prisma: prismaA,
        store: storeA,
        organizationId: organization.id,
        projectId: project.id,
        tier: 'shared-0.5',
        token,
      });
      await forceCycleDue(prismaA, initial.deployment.id);

      const firstOwner = `grace-owner-a-${token}`;

      const first = await storeA.claimDueReservedVmBillingPeriod({
        deploymentId: initial.deployment.id,
        ownerToken: firstOwner,
        ttlMs: 60_000,
      });
      const firstFailure = await storeA.failReservedVmBillingPeriod({
        periodId: first!.period.id,
        ownerToken: firstOwner,
        fencingToken: first!.period.fencingToken,
        errorCode: 'PAYMENT_AUTHORIZATION_FAILED',
        errorMessage: 'The monthly authorization was declined.',
        gracePeriodMs: 60_000,
      });
      expect(firstFailure).toMatchObject({
        period: { status: 'PAST_DUE' },
        deployment: { reservedVmBillingState: 'PAST_DUE' },
      });

      const originalGraceEndsAt = firstFailure.period.graceEndsAt;
      const reservationId = firstFailure.period.billingReservationId!;
      expect(await prismaA.ledgerReservation.findUniqueOrThrow({ where: { id: reservationId } })).toMatchObject({
        status: 'ACTIVE',
      });

      const retryOwner = `grace-owner-b-${token}`;

      const retry = await storeB.claimDueReservedVmBillingPeriod({
        deploymentId: initial.deployment.id,
        ownerToken: retryOwner,
        ttlMs: 60_000,
      });
      const secondFailure = await storeB.failReservedVmBillingPeriod({
        periodId: retry!.period.id,
        ownerToken: retryOwner,
        fencingToken: retry!.period.fencingToken,
        errorCode: 'PAYMENT_STILL_PAST_DUE',
        errorMessage: 'The retry was declined.',
        gracePeriodMs: 120_000,
      });
      expect(secondFailure.period.graceEndsAt).toBe(originalGraceEndsAt);

      await prismaA.$executeRaw`
        UPDATE "ReservedVmBillingPeriod"
        SET "graceEndsAt" = clock_timestamp() - INTERVAL '1 second'
        WHERE "id" = ${retry!.period.id}
      `;

      const signals = await storeA.listReservedVmStopSignals(10);
      expect(signals).toContainEqual(
        expect.objectContaining({
          periodId: retry!.period.id,
          projectId: project.id,
          deploymentId: initial.deployment.id,
          organizationId: organization.id,
          persistentStorageClaim: initial.deployment.persistentStorageClaim,
          deletePersistentStorage: false,
        }),
      );

      const stopped = await prismaA.deployment.findUniqueOrThrow({ where: { id: initial.deployment.id } });
      expect(stopped).toMatchObject({
        runtimeKind: 'reserved-vm',
        reservedVmBillingState: 'STOP_REQUIRED',
        persistentStorageClaim: initial.deployment.persistentStorageClaim,
      });
      expect(stopped.reservedVmStopRequestedAt).not.toBeNull();
      expect(
        await prismaA.reservedVmBillingPeriod.findUniqueOrThrow({ where: { id: retry!.period.id } }),
      ).toMatchObject({ status: 'STOP_REQUIRED' });
      expect(await prismaA.ledgerReservation.findUniqueOrThrow({ where: { id: reservationId } })).toMatchObject({
        status: 'RELEASED',
        releaseReason: 'failure',
      });
      expect(
        await prismaA.ledgerTransaction.count({
          where: { organizationId: organization.id, reason: 'reservation.settle' },
        }),
      ).toBe(1);
      await expect(
        storeB.claimDueReservedVmBillingPeriod({
          deploymentId: initial.deployment.id,
          ownerToken: `after-stop-${token}`,
          ttlMs: 60_000,
        }),
      ).resolves.toBeUndefined();
    } finally {
      if (organizationId) {
        await prismaA.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }

      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });
});
