import { Prisma, type DatabaseClient } from '@vibecore/database';

import { appPublicEnglish, type AppPublicCopyKey } from './app-public-copy.js';
import { LedgerStore } from './ledger-store.js';

const TOPOLOGY_LOCK = 'account-purge:topology';
const ACCOUNT_PURGE_COMPLETED_CODE = 'ACCOUNT_PURGE_COMPLETED';
const ACCOUNT_PURGE_COMPLETED_ERROR = appPublicEnglish('ACCOUNT_PURGE_COMPLETED');
const ACTIVE_PURGE_STATUS = 'ACTIVE';
const MEMBERSHIP_RESOURCE = 'membership';
const PROJECT_RESOURCES = ['objectStorage', 'projectTopology'] as const;
const IMPORT_LEDGER_CURRENCY = 'credits';
const IMPORT_OPERATION = 'import';
const IMPORT_TERMINAL_STATES = ['COMMITTED', 'ROLLING_BACK', 'EXPIRED', 'CANCELLED', 'FAILED'] as const;
const REMIX_TERMINAL_STATES = ['COMPLETED', 'FAILED'] as const;
const CHECKPOINT_TERMINAL_STATES = ['COMMITTED', 'CLEANED', 'MANUAL_INTERVENTION'] as const;

export interface AccountPurgeMutationScope {
  userIds?: readonly (string | null | undefined)[];
  organizationIds?: readonly (string | null | undefined)[];
  projectIds?: readonly (string | null | undefined)[];
}

function uniqueIds(values: readonly (string | null | undefined)[] | undefined): string[] {
  return [...new Set((values ?? []).filter((value): value is string => Boolean(value)))].sort();
}

function purgeConflict(code: AppPublicCopyKey): Error {
  return Object.assign(new Error(appPublicEnglish(code)), { code, statusCode: 409 });
}

export function assertStateMachineNotPurged(errorCode?: string | null, error?: string | null): void {
  if (
    errorCode === ACCOUNT_PURGE_COMPLETED_CODE ||
    error === ACCOUNT_PURGE_COMPLETED_CODE ||
    error === ACCOUNT_PURGE_COMPLETED_ERROR
  ) {
    throw purgeConflict('ACCOUNT_PURGE_COMPLETED');
  }
}

/**
 * Union seam: account purge must drive the shared PROJECT_PERMANENT_DELETE
 * coordinator for every owned project before its relational purge transaction.
 * A committed child operation removes Project and writes the canonical receipt
 * atomically, so any Project row still present here proves the parent skipped or
 * has not yet completed that child saga. Never infer safety from empty image
 * tables: files, buckets, runtimes and late Cloud Build producers are part of
 * the same permanent-deletion proof.
 */
export async function assertAccountPurgeProjectChildrenComplete(
  tx: Prisma.TransactionClient,
  projectIds: readonly string[],
): Promise<void> {
  const ids = uniqueIds(projectIds);
  if (ids.length === 0) return;
  const blockers = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT project."id"
    FROM "Project" project
    WHERE project."id" IN (${Prisma.join(ids)})
    ORDER BY project."id"
    LIMIT 1
  `);
  if (blockers[0]) {
    throw Object.assign(new Error('Account purge requires the canonical project permanent-deletion receipt.'), {
      code: 'ACCOUNT_PURGE_PROJECT_PERMANENT_DELETE_REQUIRED',
      statusCode: 409,
      projectId: blockers[0].id,
    });
  }
}

/**
 * Linearize a state-machine mutation against account purge.
 *
 * Lock order is deliberately identical to AccountPurgeStore:
 *
 *   account-purge:<user> (sorted) -> account-purge:topology -> row/effect locks
 *
 * Mutators use shared locks, so unrelated jobs remain concurrent while the
 * destructive purge takes the corresponding exclusive locks.  The receipt
 * check is as important as the live freeze check: freezes are removed after a
 * verified purge, but a stale authenticated request must never recreate a job,
 * hold, file staging payload, checkpoint, or rollback authority afterwards.
 */
export async function assertAccountPurgeMutationAllowed(
  tx: Prisma.TransactionClient,
  scope: AccountPurgeMutationScope,
): Promise<void> {
  const userIds = uniqueIds(scope.userIds);
  const organizationIds = uniqueIds(scope.organizationIds);
  const projectIds = uniqueIds(scope.projectIds);

  for (const userId of userIds) {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock_shared(hashtext($1))', `account-purge:${userId}`);
  }
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock_shared(hashtext($1))', TOPOLOGY_LOCK);

  if (userIds.length > 0) {
    const receipt = await tx.purgeReceipt.findFirst({
      where: { userId: { in: userIds } },
      select: { userId: true },
    });
    if (receipt) {
      throw purgeConflict('ACCOUNT_PURGE_COMPLETED');
    }

    const activeUserPlan = await tx.purgePlan.findFirst({
      where: {
        userId: { in: userIds },
        OR: [{ status: ACTIVE_PURGE_STATUS }, { freezes: { some: {} } }],
      },
      select: { userId: true },
    });
    if (activeUserPlan) {
      throw purgeConflict('USER_TOPOLOGY_FROZEN_FOR_ACCOUNT_PURGE');
    }
  }

  if (organizationIds.length > 0) {
    const membershipFreeze = await tx.purgeFreeze.findFirst({
      where: {
        resourceType: MEMBERSHIP_RESOURCE,
        resourceId: { in: organizationIds },
      },
      select: { id: true },
    });
    if (membershipFreeze) {
      throw purgeConflict('MEMBERSHIP_FROZEN_FOR_ACCOUNT_PURGE');
    }
  }

  if (projectIds.length > 0) {
    const projectFreeze = await tx.purgeFreeze.findFirst({
      where: {
        resourceType: { in: [...PROJECT_RESOURCES] },
        resourceId: { in: projectIds },
      },
      select: { id: true },
    });
    if (projectFreeze) {
      throw purgeConflict('PROJECT_FROZEN_FOR_ACCOUNT_PURGE');
    }
  }
}

export interface PurgedStateMachineFenceResult {
  importJobsFenced: number;
  remixJobsFenced: number;
  rollbackOperationsFenced: number;
  reservationsReleased: number;
  partialProjectsVerifiedAbsent: number;
}

function actorOrSoleOrganization(
  userId: string,
  soleOrganizationIds: readonly string[],
): Prisma.RollbackIdempotencyRequestWhereInput['OR'] {
  return [
    { actorUserId: userId },
    ...(soleOrganizationIds.length > 0 ? [{ project: { organizationId: { in: [...soleOrganizationIds] } } }] : []),
  ];
}

async function transferSharedReservedVmAuthority(
  tx: Prisma.TransactionClient,
  input: { userId: string; soleOrganizationIds: readonly string[] },
): Promise<void> {
  const excluded = uniqueIds(input.soleOrganizationIds);
  const [operationOrganizations, periodOrganizations] = await Promise.all([
    tx.reservedVmOperation.findMany({
      where: {
        actorUserId: input.userId,
        status: { in: ['COMPLETED', 'FAILED'] },
        ...(excluded.length > 0 ? { organizationId: { notIn: excluded } } : {}),
      },
      select: { organizationId: true },
      distinct: ['organizationId'],
    }),
    tx.reservedVmBillingPeriod.findMany({
      where: {
        actorUserId: input.userId,
        ...(excluded.length > 0 ? { organizationId: { notIn: excluded } } : {}),
      },
      select: { organizationId: true },
      distinct: ['organizationId'],
    }),
  ]);
  const organizationIds = uniqueIds([
    ...operationOrganizations.map(({ organizationId }) => organizationId),
    ...periodOrganizations.map(({ organizationId }) => organizationId),
  ]);

  for (const organizationId of organizationIds) {
    const activeOperation = await tx.reservedVmOperation.findFirst({
      where: { organizationId, actorUserId: input.userId, status: { in: ['PENDING', 'APPLYING'] } },
      select: { id: true },
    });

    if (activeOperation) {
      /* Never transfer authority while an external effect may still be running. */
      continue;
    }

    await tx.$queryRaw`
      SELECT "id" FROM "OrganizationMember"
      WHERE "organizationId" = ${organizationId}
      ORDER BY "id" ASC
      FOR UPDATE
    `;
    const replacement = await tx.organizationMember.findFirst({
      where: {
        organizationId,
        userId: { not: input.userId },
        state: 'ACTIVE',
        AND: [
          { role: { permissions: { some: { permission: { key: 'billing:manage' } } } } },
          { role: { permissions: { some: { permission: { key: 'projects:write' } } } } },
        ],
      },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
      select: { userId: true },
    });
    await tx.$queryRaw`
      SELECT "id" FROM "Subscription"
      WHERE "organizationId" = ${organizationId}
      ORDER BY "id" ASC
      FOR UPDATE
    `;
    const paidSubscription = await tx.subscription.findFirst({
      where: {
        organizationId,
        status: { in: ['ACTIVE', 'TRIALING'] },
        plan: { key: { not: 'free' } },
      },
      select: { id: true },
    });

    if (!replacement || !paidSubscription) {
      throw purgeConflict('ACCOUNT_PURGE_RESERVED_VM_AUTHORITY_TRANSFER_REQUIRED');
    }

    const periods = await tx.reservedVmBillingPeriod.findMany({
      where: { organizationId, actorUserId: input.userId },
      select: { id: true, billingReservationId: true },
    });
    const operations = await tx.reservedVmOperation.findMany({
      where: { organizationId, actorUserId: input.userId, status: { in: ['COMPLETED', 'FAILED'] } },
      select: { id: true, billingReservationId: true },
    });
    const reservationIds = uniqueIds([
      ...periods.map(({ billingReservationId }) => billingReservationId),
      ...operations.map(({ billingReservationId }) => billingReservationId),
    ]);

    await tx.reservedVmBillingPeriod.updateMany({
      where: { organizationId, actorUserId: input.userId },
      data: { actorUserId: replacement.userId },
    });
    await tx.reservedVmOperation.updateMany({
      where: { organizationId, actorUserId: input.userId, status: { in: ['COMPLETED', 'FAILED'] } },
      data: { actorUserId: replacement.userId },
    });
    if (reservationIds.length > 0) {
      await tx.ledgerReservation.updateMany({
        where: { id: { in: reservationIds }, userId: input.userId },
        data: { userId: replacement.userId },
      });
    }
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: null,
        action: 'account.purge.reserved_vm.authority.transferred',
        resourceType: 'organization',
        resourceId: organizationId,
        metadata: {
          fromUserId: input.userId,
          toUserId: replacement.userId,
          operationCount: operations.length,
          billingPeriodCount: periods.length,
        },
      },
    });
  }
}

/**
 * Refuse destructive provider work while another actor-owned state machine has
 * an effect that cannot be proven cleaned. This runs while purge owns its
 * exclusive user/topology locks, before storage or billing erasure starts.
 */
export async function assertAccountPurgeStateMachinesSafeToStart(
  tx: Prisma.TransactionClient,
  input: { userId: string; soleOrganizationIds: readonly string[] },
): Promise<void> {
  await transferSharedReservedVmAuthority(tx, input);
  const soleOrganizationIds = uniqueIds(input.soleOrganizationIds);
  const jobScope = [
    { actorUserId: input.userId },
    ...(soleOrganizationIds.length > 0 ? [{ organizationId: { in: soleOrganizationIds } }] : []),
  ];
  const checkpointScope =
    soleOrganizationIds.length > 0
      ? Prisma.sql`(checkpoint."createdByUserId" = ${input.userId} OR project."organizationId" IN (${Prisma.join(
          soleOrganizationIds,
        )}))`
      : Prisma.sql`checkpoint."createdByUserId" = ${input.userId}`;
  const [
    imports,
    remixes,
    activeCheckpointRows,
    activeRollbackEffect,
    activeReservedVmOperation,
    activeReservedVmBillingPeriod,
    soleOrganizationReservedVmRuntime,
  ] = await Promise.all([
    tx.importJob.findMany({
      where: { OR: jobScope },
      select: { state: true, targetProjectId: true },
    }),
    tx.remixJob.findMany({
      where: { OR: jobScope },
      select: { state: true, targetProjectId: true },
    }),
    tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT checkpoint."id"
      FROM "ProjectCheckpoint" checkpoint
      JOIN "Project" project ON project."id" = checkpoint."projectId"
      WHERE ${checkpointScope}
        AND (
          (
            checkpoint."state" NOT IN (${Prisma.join([...CHECKPOINT_TERMINAL_STATES])})
            AND checkpoint."state" <> 'RELEASE_BARRIER'
          )
          OR (
            checkpoint."barrierProjectId" IS NOT NULL
            AND checkpoint."barrierExpiresAt" > clock_timestamp()
          )
        )
      LIMIT 1
    `),
    tx.rollbackIdempotencyRequest.findFirst({
      where: {
        status: 'IN_PROGRESS',
        phase: 'EFFECT_STARTED',
        OR: actorOrSoleOrganization(input.userId, soleOrganizationIds),
      },
      select: { id: true },
    }),
    tx.reservedVmOperation.findFirst({
      where: {
        status: { in: ['PENDING', 'APPLYING'] },
        OR: [
          { actorUserId: input.userId },
          ...(soleOrganizationIds.length > 0 ? [{ organizationId: { in: soleOrganizationIds } }] : []),
        ],
      },
      select: { id: true },
    }),
    tx.reservedVmBillingPeriod.findFirst({
      where: {
        status: { not: 'CANCELED' },
        deployment: { runtimeKind: 'reserved-vm' },
        OR: [
          { actorUserId: input.userId },
          ...(soleOrganizationIds.length > 0 ? [{ organizationId: { in: soleOrganizationIds } }] : []),
        ],
      },
      select: { id: true },
    }),
    soleOrganizationIds.length > 0
      ? tx.deployment.findFirst({
          where: {
            runtimeKind: 'reserved-vm',
            project: { organizationId: { in: soleOrganizationIds } },
          },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (activeCheckpointRows[0]) {
    throw purgeConflict('ACCOUNT_PURGE_CHECKPOINT_ACTIVE');
  }
  if (activeRollbackEffect) {
    throw purgeConflict('ACCOUNT_PURGE_ROLLBACK_EFFECT_ACTIVE');
  }
  if (activeReservedVmOperation) {
    throw purgeConflict('ACCOUNT_PURGE_RESERVED_VM_OPERATION_ACTIVE');
  }
  if (activeReservedVmBillingPeriod) {
    throw purgeConflict('ACCOUNT_PURGE_RESERVED_VM_BILLING_ACTIVE');
  }
  if (soleOrganizationReservedVmRuntime) {
    throw purgeConflict('ACCOUNT_PURGE_RESERVED_VM_RUNTIME_ACTIVE');
  }

  const possiblyVisibleTargets = [
    ...imports.filter(({ state }) => state !== 'COMMITTED').map(({ targetProjectId }) => targetProjectId),
    ...remixes.filter(({ state }) => state !== 'COMPLETED').map(({ targetProjectId }) => targetProjectId),
  ].filter((value): value is string => Boolean(value));
  if (possiblyVisibleTargets.length > 0) {
    const visibleTarget = await tx.project.findFirst({
      where: { id: { in: [...new Set(possiblyVisibleTargets)] }, deletedAt: null },
      select: { id: true },
    });
    if (visibleTarget) {
      throw purgeConflict('ACCOUNT_PURGE_STATE_MACHINE_TARGET_VISIBLE');
    }
  }
}

/**
 * Close actor-owned state machines inside the same transaction that writes the
 * erasure proof.  This runs while AccountPurgeStore owns the per-user and
 * topology locks, so no guarded worker can slip a transition between cleanup
 * and proof publication.
 */
export async function fencePurgedUserStateMachines(
  database: DatabaseClient,
  tx: Prisma.TransactionClient,
  input: { userId: string; soleOrganizationIds: readonly string[]; ownedProjectIds: readonly string[] },
): Promise<PurgedStateMachineFenceResult> {
  const soleOrganizationIds = uniqueIds(input.soleOrganizationIds);
  await assertAccountPurgeStateMachinesSafeToStart(tx, input);
  /* Terminal history may outlive its actor, but no resumable authority may. */
  await tx.reservedVmOperation.updateMany({
    where: {
      status: { in: ['COMPLETED', 'FAILED'] },
      actorUserId: input.userId,
    },
    data: { actorUserId: null },
  });
  await tx.reservedVmBillingPeriod.updateMany({
    where: { status: 'CANCELED', actorUserId: input.userId },
    data: { actorUserId: null },
  });
  const importJobs = await tx.importJob.findMany({
    where: {
      OR: [
        { actorUserId: input.userId },
        ...(soleOrganizationIds.length > 0 ? [{ organizationId: { in: soleOrganizationIds } }] : []),
      ],
    },
    select: {
      id: true,
      state: true,
      targetProjectId: true,
    },
    orderBy: { id: 'asc' },
  });
  const importJobIds = importJobs.map(({ id }) => id);
  const ledger = new LedgerStore(database);
  let reservationsReleased = 0;

  const activeReservations = await tx.ledgerReservation.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { userId: input.userId },
        ...(importJobIds.length > 0
          ? [
              {
                importJobId: { in: importJobIds },
                operation: IMPORT_OPERATION,
                currency: IMPORT_LEDGER_CURRENCY,
              },
            ]
          : []),
      ],
    },
    select: { id: true, importJobId: true, version: true },
    orderBy: { id: 'asc' },
  });

  const committedImportIds = new Set(importJobs.filter(({ state }) => state === 'COMMITTED').map(({ id }) => id));
  const corruptCommittedHold = activeReservations.find(
    ({ importJobId }) => importJobId !== null && committedImportIds.has(importJobId),
  );
  if (corruptCommittedHold) {
    throw purgeConflict('ACCOUNT_PURGE_IMPORT_LEDGER_STATE_INVALID');
  }

  for (const reservation of activeReservations) {
    const released = await ledger.releaseReservationInTransaction(tx, reservation.id, 'failure', {
      expectedVersion: reservation.version,
    });
    if (!released.released) {
      throw purgeConflict('ACCOUNT_PURGE_RESERVATION_FENCE_LOST');
    }
    reservationsReleased += 1;
  }

  if (importJobIds.length > 0) {
    await tx.importCreditReservation.updateMany({
      where: { importJobId: { in: importJobIds }, state: 'RESERVED' },
      data: { state: 'COMPENSATED', debitedCredits: 0, version: { increment: 1 } },
    });
  }

  const importJobsToFence = importJobs.filter(
    ({ state }) => !(IMPORT_TERMINAL_STATES as readonly string[]).includes(state),
  );
  const importIdsToFence = importJobsToFence.map(({ id }) => id);
  const importTargetIds = importJobs
    .filter(({ state }) => state !== 'COMMITTED')
    .map(({ targetProjectId }) => targetProjectId)
    .filter((value): value is string => Boolean(value));

  if (importJobIds.length > 0) {
    await tx.importJob.updateMany({
      where: { id: { in: importJobIds } },
      data: {
        stagedFiles: Prisma.DbNull,
        connectorPreview: Prisma.DbNull,
        operationToken: null,
        operationExpiresAt: null,
        cleanupTerminalState: null,
      },
    });
  }
  if (importIdsToFence.length > 0) {
    await tx.importJob.updateMany({
      where: { id: { in: importIdsToFence } },
      data: {
        state: 'FAILED',
        error: appPublicEnglish('ACCOUNT_PURGE_COMPLETED'),
        version: { increment: 1 },
      },
    });
  }
  const purgeMarkedImportIds = importJobs.filter(({ state }) => state !== 'COMMITTED').map(({ id }) => id);
  if (purgeMarkedImportIds.length > 0) {
    await tx.importJob.updateMany({
      where: { id: { in: purgeMarkedImportIds } },
      data: { error: appPublicEnglish('ACCOUNT_PURGE_COMPLETED') },
    });
  }

  const remixJobs = await tx.remixJob.findMany({
    where: {
      OR: [
        { actorUserId: input.userId },
        ...(soleOrganizationIds.length > 0 ? [{ organizationId: { in: soleOrganizationIds } }] : []),
      ],
    },
    select: { id: true, state: true, targetProjectId: true },
    orderBy: { id: 'asc' },
  });
  const remixJobsToFence = remixJobs.filter(
    ({ state }) => !(REMIX_TERMINAL_STATES as readonly string[]).includes(state),
  );
  const remixIdsToFence = remixJobsToFence.map(({ id }) => id);
  const remixTargetIds = remixJobs
    .filter(({ state }) => state !== 'COMPLETED')
    .map(({ targetProjectId }) => targetProjectId)
    .filter((value): value is string => Boolean(value));

  if (remixJobs.length > 0) {
    await tx.remixJob.updateMany({
      where: { id: { in: remixJobs.map(({ id }) => id) } },
      data: {
        actorUserId: null,
        operationToken: null,
        operationExpiresAt: null,
        cleanupTerminalState: null,
      },
    });
  }
  if (remixIdsToFence.length > 0) {
    await tx.remixJob.updateMany({
      where: { id: { in: remixIdsToFence } },
      data: {
        state: 'FAILED',
        errorCode: 'ACCOUNT_PURGE_COMPLETED',
        error: appPublicEnglish('ACCOUNT_PURGE_COMPLETED'),
        version: { increment: 1 },
      },
    });
  }
  const purgeMarkedRemixIds = remixJobs.filter(({ state }) => state !== 'COMPLETED').map(({ id }) => id);
  if (purgeMarkedRemixIds.length > 0) {
    await tx.remixJob.updateMany({
      where: { id: { in: purgeMarkedRemixIds } },
      data: { errorCode: 'ACCOUNT_PURGE_COMPLETED', error: appPublicEnglish('ACCOUNT_PURGE_COMPLETED') },
    });
  }

  const rollbackOperations = await tx.rollbackIdempotencyRequest.findMany({
    where: { OR: actorOrSoleOrganization(input.userId, soleOrganizationIds) },
    select: { id: true, status: true, phase: true, deploymentId: true },
    orderBy: { id: 'asc' },
  });
  const rollbackOperationsToFence = rollbackOperations.filter(({ status }) => status === 'IN_PROGRESS');
  const databaseTimeRows =
    rollbackOperationsToFence.length > 0
      ? await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`
      : [];
  const rollbackFenceTime = databaseTimeRows[0]?.now;
  if (rollbackOperationsToFence.length > 0 && !rollbackFenceTime) {
    throw purgeConflict('DATABASE_TIME_UNAVAILABLE');
  }
  const rollbackDeploymentIds = rollbackOperationsToFence
    .filter(({ phase }) => phase === 'DEPLOYMENT_CREATED')
    .map(({ deploymentId }) => deploymentId)
    .filter((value): value is string => Boolean(value));
  if (rollbackDeploymentIds.length > 0) {
    await tx.deployment.updateMany({
      where: {
        id: { in: rollbackDeploymentIds },
        status: { notIn: ['READY', 'FAILED', 'CANCELED'] },
      },
      data: {
        status: 'FAILED',
        url: null,
        previewUrl: null,
        productionUrl: null,
        finishedAt: rollbackFenceTime,
      },
    });
  }
  if (rollbackOperationsToFence.length > 0) {
    await tx.rollbackIdempotencyRequest.updateMany({
      where: { id: { in: rollbackOperationsToFence.map(({ id }) => id) }, status: 'IN_PROGRESS' },
      data: {
        status: 'COMPLETED',
        leaseOwner: null,
        leaseExpiresAt: null,
        responseStatus: 410,
        responseContentLanguage: 'en',
        responseBody: { code: 'ACCOUNT_PURGE_COMPLETED' },
        completedAt: rollbackFenceTime,
        actorUserId: null,
      },
    });
  }
  if (rollbackOperations.length > rollbackOperationsToFence.length) {
    await tx.rollbackIdempotencyRequest.updateMany({
      where: {
        id: {
          in: rollbackOperations.filter(({ status }) => status !== 'IN_PROGRESS').map(({ id }) => id),
        },
      },
      data: { actorUserId: null },
    });
  }

  const partialProjectIds = [...new Set([...importTargetIds, ...remixTargetIds])].sort();
  const ownedProjectIds = new Set(uniqueIds(input.ownedProjectIds));
  const partialOwnedProjectIds = partialProjectIds.filter((projectId) => ownedProjectIds.has(projectId));
  const partialProjectsRemaining =
    partialOwnedProjectIds.length > 0
      ? await tx.project.count({
          where: { id: { in: partialOwnedProjectIds } },
        })
      : 0;
  if (partialProjectsRemaining > 0) {
    /*
     * Every project row must already have been removed by its canonical
     * PROJECT_PERMANENT_DELETE child operation. Cascading it here would discard
     * the provider inventories and bypass the immutable physical receipt.
     */
    throw purgeConflict('ACCOUNT_PURGE_STATE_MACHINE_TARGET_VISIBLE');
  }

  const activeReservationCount = await tx.ledgerReservation.count({
    where: {
      status: 'ACTIVE',
      OR: [{ userId: input.userId }, ...(importJobIds.length > 0 ? [{ importJobId: { in: importJobIds } }] : [])],
    },
  });
  const activeImportCount =
    importJobIds.length > 0
      ? await tx.importJob.count({
          where: {
            id: { in: importJobIds },
            state: { notIn: [...IMPORT_TERMINAL_STATES] },
          },
        })
      : 0;
  const activeRemixCount =
    remixJobs.length > 0
      ? await tx.remixJob.count({
          where: {
            id: { in: remixJobs.map(({ id }) => id) },
            state: { notIn: [...REMIX_TERMINAL_STATES] },
          },
        })
      : 0;
  const activeRollbackCount = await tx.rollbackIdempotencyRequest.count({
    where: {
      status: 'IN_PROGRESS',
      id: { in: rollbackOperations.map(({ id }) => id) },
    },
  });

  if (activeReservationCount > 0 || activeImportCount > 0 || activeRemixCount > 0 || activeRollbackCount > 0) {
    throw purgeConflict('ACCOUNT_PURGE_STATE_MACHINE_FENCE_INCOMPLETE');
  }

  return {
    importJobsFenced: importIdsToFence.length,
    remixJobsFenced: remixIdsToFence.length,
    rollbackOperationsFenced: rollbackOperationsToFence.length,
    reservationsReleased,
    partialProjectsVerifiedAbsent: partialOwnedProjectIds.length,
  };
}
