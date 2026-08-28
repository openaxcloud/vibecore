import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type DatabaseClient } from '@vibecore/database';
import {
  assertAccountPurgeMutationAllowed,
  assertAccountPurgeStateMachinesSafeToStart,
  fencePurgedUserStateMachines,
} from './account-purge-state-machine-fence.js';
import {
  anonymizedEmail,
  anonymizedOrgSlug,
  buildErasureProof,
  type AccountPurgePreview,
  type PurgeClassReport,
  type PurgeEffectDescriptor,
  type PurgeEffectExecution,
  type PurgeLeaseContext,
  type PurgeStorageDeps,
  type PurgeStorageInventory,
  type PurgeUserAccountResult,
} from './account-purge.js';
import { appPublicEnglish } from './app-public-copy.js';
import { DELETION_GRACE_PERIOD_DAYS, FINANCIAL_RETENTION_DAYS } from './data-deletion.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MEMBERSHIP_RESOURCE = 'membership';
const OBJECT_STORAGE_RESOURCE = 'objectStorage';
const PROJECT_TOPOLOGY_RESOURCE = 'projectTopology';
const TOPOLOGY_LOCK = 'account-purge:topology';
const PENDING_SETTING_KEY = 'account.pendingDeletionUserIds';
const PLAN_ACTIVE = 'ACTIVE';
const PLAN_FAILED = 'FAILED';
const PLAN_ABANDONED = 'ABANDONED';
const PLAN_COMPLETED = 'COMPLETED';
const CANCELLATION_NOT_REQUESTED = 'not_requested' as const;
const CANCELLATION_NOT_CANCELLABLE = 'not_cancellable' as const;
const ACTIVE_SUBSCRIPTION_STATES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'UNPAID'] as const;
const RETRYABLE_VERIFIED_PURGE_EFFECT_TYPES = new Set([
  'billing_subscription',
  'gcs_bucket',
  'local_project_storage',
  'local_project_archive',
  'local_project_snapshot',
  'local_workspace_storage',
  'static_deployment_snapshot',
]);

type ActiveSubscriptionStatus = (typeof ACTIVE_SUBSCRIPTION_STATES)[number];

interface BillingSubscriptionInventory {
  id: string;
  externalId: string | null;
  status: ActiveSubscriptionStatus;
}

export interface AccountPurgeLeaseOptions {
  ttlMs: number;
  renewIntervalMs: number;
  reclaimGraceMs: number;
}

const DEFAULT_LEASE: AccountPurgeLeaseOptions = {
  ttlMs: 5 * 60_000,
  renewIntervalMs: 60_000,
  reclaimGraceMs: 60_000,
};

interface StorageTopology {
  orgIds: string[];
  soleOrgIds: string[];
  sharedOrgIds: string[];
  ownedProjects: PurgeStorageInventory['ownedProjects'];
  bucketProjectIds: string[];
  workspaceProjectIds: string[];
  localSnapshotObjects: Array<{ projectId: string; storageKey: string }>;
  staticDeploymentIds: string[];
  staticArtifactRefs: string[];
  staticAliasDeploymentIds: string[];
  billingSubscriptions: Array<{
    id: string;
    externalId: string | null;
    status: string;
  }>;
  fingerprint: string;
}

interface PurgeGuarantee extends PurgeStorageInventory {
  planId: string;
  userId: string;
  ownerToken: string;
  version: number;
  requestedAt: Date;
  purgeDueAt: Date;
  fingerprint: string;
  billingSubscriptions: BillingSubscriptionInventory[];
  correlationId?: string;
}

interface PurgeHeartbeat {
  lost(): boolean;
  markLost(): void;
  stop(): Promise<void>;
}

interface LockedPlan {
  id: string;
  userId: string;
  ownerToken: string;
  status: string;
  version: number;
  leaseExpiresAt: Date;
  databaseNow: Date;
}

function errorCode(error: unknown): string {
  const explicit = (error as { code?: unknown } | null)?.code;

  if (typeof explicit === 'string' && /^[A-Z0-9_]{1,100}$/.test(explicit)) {
    return explicit;
  }

  const message = error instanceof Error ? error.message : String(error);
  const prefix = message.match(/^([A-Z][A-Z0-9_]{2,99})(?::|\b)/)?.[1];

  return prefix ?? 'ACCOUNT_PURGE_EFFECT_FAILED';
}

function deletionPreference(value: unknown): { requestedAt?: string; purgedAt?: string } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const accountDeletion = (value as Record<string, unknown>).accountDeletion;

  if (!accountDeletion || typeof accountDeletion !== 'object' || Array.isArray(accountDeletion)) {
    return undefined;
  }

  const request = accountDeletion as Record<string, unknown>;

  return {
    ...(typeof request.requestedAt === 'string' ? { requestedAt: request.requestedAt } : {}),
    ...(typeof request.purgedAt === 'string' ? { purgedAt: request.purgedAt } : {}),
  };
}

function validDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function subjectWorkspaceId(projectId: string, userId: string): string {
  const digest = createHash('sha256').update(`${projectId}:${userId}`).digest('hex').slice(0, 16);
  return `ws-${digest}`;
}

function topologyFingerprint(topology: Omit<StorageTopology, 'fingerprint' | 'sharedOrgIds'>): string {
  const sort = (values: string[]) => [...new Set(values)].sort();

  return JSON.stringify({
    orgIds: sort(topology.orgIds),
    soleOrgIds: sort(topology.soleOrgIds),
    ownedProjects: [...topology.ownedProjects].sort((left, right) => left.id.localeCompare(right.id)),
    bucketProjectIds: sort(topology.bucketProjectIds),
    workspaceProjectIds: sort(topology.workspaceProjectIds),
    localSnapshotObjects: topology.localSnapshotObjects
      .map(({ projectId, storageKey }) => ({ projectId, storageKey }))
      .sort((left, right) =>
        `${left.projectId}:${left.storageKey}`.localeCompare(`${right.projectId}:${right.storageKey}`),
      ),
    staticDeploymentIds: sort(topology.staticDeploymentIds),
    staticArtifactRefs: sort(topology.staticArtifactRefs),
    staticAliasDeploymentIds: sort(topology.staticAliasDeploymentIds),
    billingSubscriptions: topology.billingSubscriptions
      .map(({ id, externalId }) => ({ id, externalId }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  });
}

function preferencesWithoutDeletion(preferences: unknown): Prisma.InputJsonValue {
  const next =
    preferences && typeof preferences === 'object' && !Array.isArray(preferences)
      ? { ...(preferences as Record<string, unknown>) }
      : {};
  delete next.accountDeletion;
  return next as Prisma.InputJsonValue;
}

/**
 * Production account-purge persistence and fencing. It is deliberately kept out
 * of PrismaApiStore's already-large file so the destructive state machine has a
 * reviewable boundary and can be mutation-tested independently.
 */
export class AccountPurgeStore {
  constructor(
    private readonly prisma: DatabaseClient,
    private readonly lease: AccountPurgeLeaseOptions = DEFAULT_LEASE,
  ) {}

  private async databaseNow(tx: Prisma.TransactionClient): Promise<Date> {
    const rows = await tx.$queryRawUnsafe<Array<{ databaseNow: Date }>>(
      `SELECT date_trunc('milliseconds', clock_timestamp()) AS "databaseNow"`,
    );
    const value = rows[0]?.databaseNow;

    if (!(value instanceof Date)) {
      throw Object.assign(new Error(appPublicEnglish('DATABASE_TIME_UNAVAILABLE')), {
        code: 'ACCOUNT_PURGE_DATABASE_TIME_UNAVAILABLE',
      });
    }

    return value;
  }

  private async mutatePendingSetting(
    tx: Prisma.TransactionClient,
    userId: string,
    mutation: 'add' | 'remove',
  ): Promise<void> {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `system-setting:${PENDING_SETTING_KEY}`);
    const existing = await tx.systemSetting.findUnique({ where: { key: PENDING_SETTING_KEY } });
    const ids = new Set(
      Array.isArray(existing?.value)
        ? (existing.value as unknown[]).filter((item): item is string => typeof item === 'string')
        : [],
    );
    mutation === 'add' ? ids.add(userId) : ids.delete(userId);
    const value = [...ids] as Prisma.InputJsonValue;
    await tx.systemSetting.upsert({
      where: { key: PENDING_SETTING_KEY },
      create: { key: PENDING_SETTING_KEY, value },
      update: { value },
    });
  }

  private async lockObjectStorageProject(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
    await tx.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      `account-purge:object-storage:${projectId}`,
    );
  }

  private async resolveTopology(tx: Prisma.TransactionClient, userId: string): Promise<StorageTopology> {
    const memberships = await tx.organizationMember.findMany({ where: { userId }, select: { organizationId: true } });
    const orgIds = [...new Set(memberships.map((membership) => membership.organizationId))];
    const soleOrgIds: string[] = [];
    const sharedOrgIds: string[] = [];

    for (const organizationId of orgIds) {
      const memberCount = await tx.organizationMember.count({ where: { organizationId } });
      (memberCount === 1 ? soleOrgIds : sharedOrgIds).push(organizationId);
    }

    const bucketProjects = soleOrgIds.length
      ? await tx.project.findMany({
          where: { organizationId: { in: soleOrgIds } },
          select: { id: true, organizationId: true, name: true, ownershipEpoch: true },
        })
      : [];
    const orgProjects = orgIds.length
      ? await tx.project.findMany({ where: { organizationId: { in: orgIds } }, select: { id: true } })
      : [];
    const collaborations = await tx.projectCollaborator.findMany({ where: { userId }, select: { projectId: true } });
    const directProjectGrants = await tx.$queryRawUnsafe<Array<{ projectId: string }>>(
      `SELECT access_grant."resourceId" AS "projectId"
         FROM "ResourceAccessGrant" AS access_grant
         JOIN "Project" AS project
           ON project.id = access_grant."resourceId"
          AND project."organizationId" = access_grant."organizationId"
        WHERE access_grant."subjectType" = 'USER'
          AND access_grant."subjectUserId" = $1
          AND access_grant."resourceType" = 'PROJECT'
          AND access_grant.status = 'ACTIVE'
          AND access_grant."acceptedAt" IS NOT NULL
          AND access_grant."revokedAt" IS NULL`,
      userId,
    );
    const billingSubscriptions = soleOrgIds.length
      ? await tx.subscription.findMany({
          where: { organizationId: { in: soleOrgIds } },
          select: { id: true, externalId: true, status: true },
        })
      : [];
    const bucketProjectIds = bucketProjects.map(({ id }) => id);
    const workspaceProjectIds = [
      ...new Set([
        ...orgProjects.map(({ id }) => id),
        ...collaborations.map(({ projectId }) => projectId),
        ...directProjectGrants.map(({ projectId }) => projectId),
      ]),
    ];
    const localSnapshotObjects = bucketProjectIds.length
      ? (
          await tx.projectSnapshot.findMany({
            where: { projectId: { in: bucketProjectIds }, storageKey: { not: null } },
            select: { projectId: true, storageKey: true },
          })
        ).flatMap(({ projectId, storageKey }) => (storageKey ? [{ projectId, storageKey }] : []))
      : [];
    const deploymentIds = bucketProjectIds.length
      ? await tx.deployment.findMany({
          where: { projectId: { in: bucketProjectIds }, provider: 'static' },
          select: { id: true },
        })
      : [];
    const staticManifests = bucketProjectIds.length
      ? await tx.releaseManifest.findMany({
          where: { projectId: { in: bucketProjectIds }, artifactKind: 'static-snapshot' },
          select: { deploymentId: true, artifactRef: true },
        })
      : [];
    const staticDeploymentIds = [
      ...new Set([...deploymentIds.map(({ id }) => id), ...staticManifests.map(({ deploymentId }) => deploymentId)]),
    ];
    const staticArtifactRefs = [...new Set(staticManifests.map(({ artifactRef }) => artifactRef))];
    const staticAliasDeploymentIds = staticDeploymentIds;
    const fingerprint = topologyFingerprint({
      orgIds,
      soleOrgIds,
      ownedProjects: bucketProjects,
      bucketProjectIds,
      workspaceProjectIds,
      localSnapshotObjects,
      staticDeploymentIds,
      staticArtifactRefs,
      staticAliasDeploymentIds,
      billingSubscriptions,
    });

    return {
      orgIds,
      soleOrgIds,
      sharedOrgIds,
      ownedProjects: bucketProjects,
      bucketProjectIds,
      workspaceProjectIds,
      localSnapshotObjects,
      staticDeploymentIds,
      staticArtifactRefs,
      staticAliasDeploymentIds,
      billingSubscriptions,
      fingerprint,
    };
  }

  async preview(userId: string): Promise<AccountPurgePreview> {
    return this.prisma.$transaction(async (tx) => {
      const databaseNow = await this.databaseNow(tx);
      const user = await tx.user.findUnique({ where: { id: userId }, select: { preferences: true } });

      if (!user) return { userId, status: 'missing', databaseNow: databaseNow.toISOString() };

      const request = deletionPreference(user.preferences);
      const requestedAt = validDate(request?.requestedAt);
      const purgedAt = validDate(request?.purgedAt);

      if (purgedAt) {
        const receipt = await tx.purgeReceipt.findUnique({ where: { userId }, select: { planId: true } });
        return {
          userId,
          status: 'purged',
          databaseNow: databaseNow.toISOString(),
          purgedAt: purgedAt.toISOString(),
          receiptVerified: Boolean(receipt),
        };
      }
      if (!requestedAt) return { userId, status: 'not_requested', databaseNow: databaseNow.toISOString() };

      const purgeDueAt = new Date(requestedAt.getTime() + DELETION_GRACE_PERIOD_DAYS * DAY_MS);

      if (databaseNow < purgeDueAt) {
        return {
          userId,
          status: 'not_due',
          databaseNow: databaseNow.toISOString(),
          requestedAt: requestedAt.toISOString(),
          purgeDueAt: purgeDueAt.toISOString(),
        };
      }

      const topology = await this.resolveTopology(tx, userId);
      return {
        userId,
        status: 'ready_to_purge',
        databaseNow: databaseNow.toISOString(),
        requestedAt: requestedAt.toISOString(),
        purgeDueAt: purgeDueAt.toISOString(),
        inventory: {
          ownedProjects: topology.ownedProjects,
          bucketProjectIds: topology.bucketProjectIds,
          workspaceProjectIds: topology.workspaceProjectIds,
          localSnapshotObjects: topology.localSnapshotObjects,
          staticDeploymentIds: topology.staticDeploymentIds,
          staticArtifactRefs: topology.staticArtifactRefs,
          staticAliasDeploymentIds: topology.staticAliasDeploymentIds,
        },
      };
    });
  }

  async requestDeletion(
    userId: string,
  ): Promise<{ requestedAt: string; purgeDueAt: string; alreadyRequested: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `account-purge:${userId}`);
      const databaseNow = await this.databaseNow(tx);
      const user = await tx.user.findUnique({ where: { id: userId } });

      if (!user)
        throw Object.assign(new Error(appPublicEnglish('USER_NOT_FOUND')), { code: 'USER_NOT_FOUND', statusCode: 404 });

      const existing = deletionPreference(user.preferences);
      const existingRequestedAt = validDate(existing?.requestedAt);
      const existingPurgedAt = validDate(existing?.purgedAt);

      if (existingPurgedAt) {
        throw Object.assign(new Error(appPublicEnglish('ACCOUNT_ALREADY_PURGED')), {
          code: 'ACCOUNT_ALREADY_PURGED',
          statusCode: 409,
        });
      }

      const requestedAt = existingRequestedAt ?? databaseNow;
      const purgeDueAt = new Date(requestedAt.getTime() + DELETION_GRACE_PERIOD_DAYS * DAY_MS);
      const preferences =
        user.preferences && typeof user.preferences === 'object' && !Array.isArray(user.preferences)
          ? { ...(user.preferences as Record<string, unknown>) }
          : {};
      preferences.accountDeletion = { requestedAt: requestedAt.toISOString() };
      await tx.user.update({ where: { id: userId }, data: { preferences: preferences as Prisma.InputJsonValue } });
      await this.mutatePendingSetting(tx, userId, 'add');

      return {
        requestedAt: requestedAt.toISOString(),
        purgeDueAt: purgeDueAt.toISOString(),
        alreadyRequested: Boolean(existingRequestedAt),
      };
    });
  }

  async cancelDeletion(userId: string): Promise<{ cancelled: boolean; reason?: 'not_requested' | 'not_cancellable' }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `account-purge:${userId}`);
      const databaseNow = await this.databaseNow(tx);
      const plans = await tx.$queryRawUnsafe<Array<{ status: string; leaseExpiresAt: Date }>>(
        `SELECT status, "leaseExpiresAt" FROM "PurgePlan" WHERE "userId" = $1 FOR UPDATE`,
        userId,
      );
      const active = plans[0];

      if (active?.status === PLAN_ACTIVE) {
        throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_ALREADY_STARTED')), {
          code: 'ACCOUNT_PURGE_ALREADY_STARTED',
          statusCode: 409,
        });
      }

      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) return { cancelled: false, reason: CANCELLATION_NOT_REQUESTED };
      const request = deletionPreference(user.preferences);
      const requestedAt = validDate(request?.requestedAt);

      if (!requestedAt) return { cancelled: false, reason: CANCELLATION_NOT_REQUESTED };
      if (request?.purgedAt || databaseNow.getTime() >= requestedAt.getTime() + DELETION_GRACE_PERIOD_DAYS * DAY_MS) {
        return { cancelled: false, reason: CANCELLATION_NOT_CANCELLABLE };
      }

      await tx.user.update({
        where: { id: userId },
        data: { preferences: preferencesWithoutDeletion(user.preferences) },
      });
      await this.mutatePendingSetting(tx, userId, 'remove');
      return { cancelled: true };
    });
  }

  async isObjectStorageFrozen(projectId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ frozen: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM "PurgeFreeze" AS freeze
         JOIN "PurgePlan" AS plan ON plan.id = freeze."planId"
        WHERE freeze."resourceType" = $1 AND freeze."resourceId" = $2
          AND plan.status = $3
       ) AS frozen`,
      OBJECT_STORAGE_RESOURCE,
      projectId,
      PLAN_ACTIVE,
    );
    return rows[0]?.frozen === true;
  }

  async hasReceipt(userId: string): Promise<boolean> {
    return (await this.prisma.purgeReceipt.count({ where: { userId } })) === 1;
  }

  private async assertUsersNotPurging(tx: Prisma.TransactionClient, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    const active = await tx.purgePlan.count({
      where: { userId: { in: [...new Set(userIds)] }, status: PLAN_ACTIVE },
    });
    if (active > 0) {
      throw Object.assign(new Error(appPublicEnglish('USER_TOPOLOGY_FROZEN_FOR_ACCOUNT_PURGE')), {
        code: 'USER_TOPOLOGY_FROZEN_FOR_ACCOUNT_PURGE',
        statusCode: 409,
      });
    }
  }

  async assertUserTopologyMutable(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', TOPOLOGY_LOCK);
    await this.assertUsersNotPurging(tx, [userId]);
  }

  async assertMembershipMutable(
    tx: Prisma.TransactionClient,
    organizationId: string,
    subjectUserIds: string[] = [],
  ): Promise<void> {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', TOPOLOGY_LOCK);
    await this.assertUsersNotPurging(tx, subjectUserIds);
    const count = await tx.purgeFreeze.count({
      where: { resourceType: MEMBERSHIP_RESOURCE, resourceId: organizationId, plan: { status: PLAN_ACTIVE } },
    });
    if (count > 0) {
      throw Object.assign(new Error(appPublicEnglish('MEMBERSHIP_FROZEN_FOR_ACCOUNT_PURGE')), {
        code: 'MEMBERSHIP_FROZEN_FOR_ACCOUNT_PURGE',
        statusCode: 409,
      });
    }
  }

  async assertProjectMutable(
    tx: Prisma.TransactionClient,
    projectId: string,
    subjectUserIds: string[] = [],
  ): Promise<void> {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', TOPOLOGY_LOCK);
    await this.assertUsersNotPurging(tx, subjectUserIds);
    const count = await tx.purgeFreeze.count({
      where: {
        resourceType: { in: [OBJECT_STORAGE_RESOURCE, PROJECT_TOPOLOGY_RESOURCE] },
        resourceId: projectId,
        plan: { status: PLAN_ACTIVE },
      },
    });
    if (count > 0) {
      throw Object.assign(new Error(appPublicEnglish('PROJECT_FROZEN_FOR_ACCOUNT_PURGE')), {
        code: 'PROJECT_FROZEN_FOR_ACCOUNT_PURGE',
        statusCode: 409,
      });
    }
  }

  /**
   * Storage writers are fenced while the owning purge plan is ACTIVE. A
   * completed/abandoned plan is immutable audit history, not a permanent write
   * denial for a surviving project that was conservatively inventoried.
   */
  async assertProjectStorageMutable(
    tx: Prisma.TransactionClient,
    projectId: string,
    workspaceId?: string,
    expectedOrganizationId?: string,
    coordinator?: { planId: string; ownerToken: string; expectedOwnershipEpoch: number },
  ): Promise<void> {
    if (coordinator) {
      const preliminary = await tx.purgePlan.findUnique({
        where: { id: coordinator.planId },
        select: { userId: true },
      });
      if (!preliminary) {
        throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_LEASE_LOST')), {
          code: 'ACCOUNT_PURGE_LEASE_LOST',
          statusCode: 409,
        });
      }
      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock_shared(hashtext($1))',
        `account-purge:${preliminary.userId}`,
      );
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock_shared(hashtext($1))', TOPOLOGY_LOCK);
      const databaseNow = await this.databaseNow(tx);
      const plan = await tx.purgePlan.findUnique({
        where: { id: coordinator.planId },
        select: {
          ownerToken: true,
          status: true,
          leaseExpiresAt: true,
          inventory: true,
        },
      });
      const inventory = plan?.inventory as { ownedProjects?: unknown } | null | undefined;
      const projectAuthority = Array.isArray(inventory?.ownedProjects)
        ? inventory.ownedProjects.find(
            (value): value is { id: string; organizationId: string; ownershipEpoch: number } =>
              Boolean(value) &&
              typeof value === 'object' &&
              (value as { id?: unknown }).id === projectId &&
              (value as { organizationId?: unknown }).organizationId === expectedOrganizationId &&
              (value as { ownershipEpoch?: unknown }).ownershipEpoch === coordinator.expectedOwnershipEpoch,
          )
        : undefined;
      const freezeCount = await tx.purgeFreeze.count({
        where: {
          planId: coordinator.planId,
          resourceId: projectId,
          resourceType: { in: [OBJECT_STORAGE_RESOURCE, PROJECT_TOPOLOGY_RESOURCE] },
        },
      });
      if (
        !plan ||
        plan.status !== PLAN_ACTIVE ||
        plan.ownerToken !== coordinator.ownerToken ||
        !plan.leaseExpiresAt ||
        plan.leaseExpiresAt <= databaseNow ||
        !projectAuthority ||
        freezeCount === 0
      ) {
        throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_LEASE_LOST')), {
          code: 'ACCOUNT_PURGE_LEASE_LOST',
          statusCode: 409,
        });
      }
      return;
    }

    /*
     * Physical writers already hold the project physical/NFS barrier. They use
     * the shared topology lock here so purge can install its exclusive freeze
     * as soon as an in-flight validation transaction commits; purge never waits
     * for the physical/NFS lock while holding topology.
     */
    await assertAccountPurgeMutationAllowed(tx, { projectIds: [projectId] });
    const rows = await tx.$queryRawUnsafe<Array<{ planned: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM "PurgePlan"
          WHERE COALESCE(inventory->'bucketProjectIds', '[]'::jsonb) ? $1
            AND status = $2
       ) AS planned`,
      projectId,
      PLAN_ACTIVE,
    );
    const workspacePlans = workspaceId
      ? await tx.$queryRawUnsafe<Array<{ userId: string }>>(
          `SELECT "userId" FROM "PurgePlan"
            WHERE COALESCE(inventory->'workspaceProjectIds', '[]'::jsonb) ? $1
              AND status = $2`,
          projectId,
          PLAN_ACTIVE,
        )
      : [];
    const subjectWorkspacePlanned = workspacePlans.some(
      (plan) => subjectWorkspaceId(projectId, plan.userId) === workspaceId,
    );

    if (rows[0]?.planned === true || subjectWorkspacePlanned) {
      throw Object.assign(new Error(appPublicEnglish('PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE')), {
        code: 'PROJECT_STORAGE_FENCED_FOR_ACCOUNT_PURGE',
        statusCode: 409,
      });
    }
  }

  private async acquire(userId: string, correlationId?: string): Promise<PurgeGuarantee | PurgeUserAccountResult> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `account-purge:${userId}`);
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', TOPOLOGY_LOCK);
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) return { outcome: 'not_requested' as const };

      const databaseNow = await this.databaseNow(tx);
      const request = deletionPreference(user.preferences);
      const requestedAt = validDate(request?.requestedAt);
      const purgedAt = validDate(request?.purgedAt);
      const receipt = await tx.purgeReceipt.findUnique({ where: { userId }, select: { planId: true, purgedAt: true } });

      if (purgedAt) {
        if (!receipt) {
          throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_RECEIPT_MISSING')), {
            code: 'ACCOUNT_PURGE_RECEIPT_MISSING',
          });
        }
        return {
          outcome: 'already_purged' as const,
          ...(receipt ? { planId: receipt.planId } : {}),
          purgedAt: purgedAt.toISOString(),
        };
      }
      if (!requestedAt) return { outcome: 'not_requested' as const };

      const purgeDueAt = new Date(requestedAt.getTime() + DELETION_GRACE_PERIOD_DAYS * DAY_MS);
      if (databaseNow < purgeDueAt) return { outcome: 'not_due' as const, purgeDueAt: purgeDueAt.toISOString() };

      const topology = await this.resolveTopology(tx, userId);
      await assertAccountPurgeStateMachinesSafeToStart(tx, {
        userId,
        soleOrganizationIds: topology.soleOrgIds,
      });

      /*
       * Cloud project bindings are owned by a separate tenant control plane and
       * restrict Project deletion. Refuse while the topology lock is held,
       * before issuing a purge guarantee: Stripe cancellation, GCS deletion and
       * workspace/PVC erasure therefore cannot run and leave an undeletable
       * half-purged account. A dedicated cloud teardown must remove the binding
       * first; every binding state is fail-closed here.
       */
      const cloudProjectBindingCount = topology.bucketProjectIds.length
        ? await tx.cloudProjectBinding.count({ where: { projectId: { in: topology.bucketProjectIds } } })
        : 0;

      if (cloudProjectBindingCount > 0) {
        throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_CLOUD_PROJECT_BINDING_ACTIVE')), {
          code: 'ACCOUNT_PURGE_CLOUD_PROJECT_BINDING_ACTIVE',
          statusCode: 409,
        });
      }
      for (const projectId of [...topology.bucketProjectIds].sort()) {
        await this.lockObjectStorageProject(tx, projectId);
      }
      const rows = await tx.$queryRawUnsafe<
        Array<{ id: string; ownerToken: string; status: string; leaseExpiresAt: Date; version: number }>
      >(
        `SELECT id, "ownerToken", status, "leaseExpiresAt", version
           FROM "PurgePlan" WHERE "userId" = $1 FOR UPDATE`,
        userId,
      );
      const existing = rows[0];
      // Topology/state-machine preflight can be intentionally expensive. Start
      // the provider lease from a fresh PostgreSQL clock after that work, not
      // from the deletion-policy timestamp read at transaction entry.
      const leaseDatabaseNow = await this.databaseNow(tx);

      if (existing?.status === PLAN_COMPLETED && receipt) {
        return { outcome: 'already_purged' as const, planId: existing.id, purgedAt: receipt.purgedAt.toISOString() };
      }

      if (existing?.status === PLAN_ACTIVE && existing.leaseExpiresAt > leaseDatabaseNow) {
        throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_ALREADY_ACTIVE')), {
          code: 'ACCOUNT_PURGE_ALREADY_ACTIVE',
          statusCode: 409,
        });
      }

      const ownerToken = randomUUID();
      const leaseExpiresAt = new Date(leaseDatabaseNow.getTime() + this.lease.ttlMs);
      const inventory = {
        ownedProjects: topology.ownedProjects,
        bucketProjectIds: topology.bucketProjectIds,
        workspaceProjectIds: topology.workspaceProjectIds,
        localSnapshotObjects: topology.localSnapshotObjects,
        staticDeploymentIds: topology.staticDeploymentIds,
        staticArtifactRefs: topology.staticArtifactRefs,
        staticAliasDeploymentIds: topology.staticAliasDeploymentIds,
      };
      const billingSubscriptions = topology.billingSubscriptions.filter(
        (subscription): subscription is BillingSubscriptionInventory =>
          ACTIVE_SUBSCRIPTION_STATES.includes(subscription.status as ActiveSubscriptionStatus),
      );
      const plan = existing
        ? await tx.purgePlan.update({
            where: { id: existing.id },
            data: {
              ownerToken,
              status: PLAN_ACTIVE,
              version: { increment: 1 },
              leaseExpiresAt,
              requestedAt,
              purgeDueAt,
              topologyFingerprint: topology.fingerprint,
              inventory: { ...inventory, billingSubscriptions } as unknown as Prisma.InputJsonValue,
              correlationId,
              lastErrorCode: null,
              completedAt: null,
            },
          })
        : await tx.purgePlan.create({
            data: {
              userId,
              ownerToken,
              status: PLAN_ACTIVE,
              leaseExpiresAt,
              requestedAt,
              purgeDueAt,
              topologyFingerprint: topology.fingerprint,
              inventory: { ...inventory, billingSubscriptions } as unknown as Prisma.InputJsonValue,
              correlationId,
            },
          });

      await tx.purgeFreeze.deleteMany({ where: { planId: plan.id } });
      const freezes = [
        ...topology.orgIds.map((resourceId) => ({ planId: plan.id, resourceType: MEMBERSHIP_RESOURCE, resourceId })),
        ...topology.bucketProjectIds.map((resourceId) => ({
          planId: plan.id,
          resourceType: OBJECT_STORAGE_RESOURCE,
          resourceId,
        })),
        ...topology.workspaceProjectIds.map((resourceId) => ({
          planId: plan.id,
          resourceType: PROJECT_TOPOLOGY_RESOURCE,
          resourceId,
        })),
      ];
      if (freezes.length) await tx.purgeFreeze.createMany({ data: freezes });

      return {
        planId: plan.id,
        userId,
        ownerToken,
        version: plan.version,
        requestedAt,
        purgeDueAt,
        fingerprint: topology.fingerprint,
        correlationId,
        billingSubscriptions,
        ...inventory,
      };
    });
  }

  private async lockedPlan(tx: Prisma.TransactionClient, guarantee: PurgeGuarantee): Promise<LockedPlan> {
    const rows = await tx.$queryRawUnsafe<LockedPlan[]>(
      `WITH target AS MATERIALIZED (
         SELECT id, "userId", "ownerToken", status, version, "leaseExpiresAt"
           FROM "PurgePlan"
          WHERE id = $1 AND "ownerToken" = $2
          FOR UPDATE
       ), lease_clock AS MATERIALIZED (
         SELECT date_trunc('milliseconds', clock_timestamp()) AS "databaseNow" FROM target
       )
       SELECT target.*, lease_clock."databaseNow" FROM target CROSS JOIN lease_clock`,
      guarantee.planId,
      guarantee.ownerToken,
    );
    const plan = rows[0];

    if (!plan || plan.status !== PLAN_ACTIVE || plan.leaseExpiresAt <= plan.databaseNow) {
      throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_LEASE_LOST')), {
        code: 'ACCOUNT_PURGE_LEASE_LOST',
      });
    }
    return plan;
  }

  private async validate(guarantee: PurgeGuarantee): Promise<void> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ valid: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM "PurgePlan"
          WHERE id = $1 AND "ownerToken" = $2 AND status = $3
            AND "leaseExpiresAt" > date_trunc('milliseconds', clock_timestamp())
       ) AS valid`,
      guarantee.planId,
      guarantee.ownerToken,
      PLAN_ACTIVE,
    );
    if (rows[0]?.valid !== true) {
      throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_LEASE_LOST')), {
        code: 'ACCOUNT_PURGE_LEASE_LOST',
      });
    }
  }

  async renewLease(planId: string, ownerToken: string, expectedVersion: number): Promise<number | null> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ version: number }>>(
      `WITH target AS MATERIALIZED (
         SELECT id FROM "PurgePlan"
          WHERE id = $1 AND "ownerToken" = $2 AND version = $3 AND status = $5
          FOR UPDATE
       ), lease_clock AS MATERIALIZED (
         SELECT date_trunc('milliseconds', clock_timestamp()) AS ts FROM target
       )
       UPDATE "PurgePlan" AS plan
          SET "leaseExpiresAt" = lease_clock.ts + ($4::bigint * interval '1 millisecond'),
              version = plan.version + 1,
              "updatedAt" = lease_clock.ts
         FROM target CROSS JOIN lease_clock
        WHERE plan.id = target.id AND plan."leaseExpiresAt" > lease_clock.ts
       RETURNING plan.version`,
      planId,
      ownerToken,
      expectedVersion,
      this.lease.ttlMs,
      PLAN_ACTIVE,
    );
    return rows[0]?.version ?? null;
  }

  private heartbeat(guarantee: PurgeGuarantee): PurgeHeartbeat {
    let version = guarantee.version;
    let lost = false;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wake: (() => void) | undefined;

    const running = (async () => {
      while (!stopped && !lost) {
        await new Promise<void>((resolve) => {
          wake = resolve;
          timer = setTimeout(resolve, this.lease.renewIntervalMs);
        });
        wake = undefined;
        if (stopped || lost) break;
        const next = await this.renewLease(guarantee.planId, guarantee.ownerToken, version).catch(() => null);
        if (next === null) lost = true;
        else version = next;
      }
    })();

    return {
      lost: () => lost,
      markLost: () => {
        lost = true;
      },
      async stop() {
        stopped = true;
        if (timer) clearTimeout(timer);
        wake?.();
        await running.catch(() => undefined);
      },
    };
  }

  private async executeEffect<T extends Record<string, unknown>>(
    guarantee: PurgeGuarantee,
    descriptor: PurgeEffectDescriptor,
    effect: () => Promise<T>,
  ): Promise<PurgeEffectExecution<T>> {
    /*
     * A RUNNING row after process death is ambiguous. Automatic retry is safe
     * only for this closed set: billing uses the same provider idempotency key;
     * every delete is idempotent and its callback verifies live absence before
     * producing a receipt. Any future effect must use a verify-first saga.
     */
    if (!RETRYABLE_VERIFIED_PURGE_EFFECT_TYPES.has(descriptor.resourceType)) {
      throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_EFFECT_FAILED')), {
        code: 'ACCOUNT_PURGE_EFFECT_REQUIRES_VERIFY_FIRST',
      });
    }

    const prepared = await this.prisma.$transaction(
      async (tx) => {
        await this.lockedPlan(tx, guarantee);
        const existing = await tx.purgeEffect.findUnique({
          where: { planId_effectKey: { planId: guarantee.planId, effectKey: descriptor.key } },
        });

        if (existing?.status === 'SUCCEEDED') {
          if (existing.resourceType !== descriptor.resourceType || existing.resourceId !== descriptor.resourceId) {
            throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_EFFECT_DESCRIPTOR_MISMATCH')), {
              code: 'ACCOUNT_PURGE_EFFECT_DESCRIPTOR_MISMATCH',
            });
          }
          if (!existing.receipt || typeof existing.receipt !== 'object' || Array.isArray(existing.receipt)) {
            throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_EFFECT_RECEIPT_CORRUPT')), {
              code: 'ACCOUNT_PURGE_EFFECT_RECEIPT_CORRUPT',
            });
          }
          return { kind: 'REPLAY' as const, receipt: existing.receipt as T };
        }

        const startedAt = await this.databaseNow(tx);
        await tx.purgeEffect.upsert({
          where: { planId_effectKey: { planId: guarantee.planId, effectKey: descriptor.key } },
          create: {
            planId: guarantee.planId,
            effectKey: descriptor.key,
            resourceType: descriptor.resourceType,
            resourceId: descriptor.resourceId,
            status: 'RUNNING',
            attempt: 1,
            startedAt,
          },
          update: {
            resourceType: descriptor.resourceType,
            resourceId: descriptor.resourceId,
            status: 'RUNNING',
            attempt: { increment: 1 },
            receipt: Prisma.DbNull,
            lastErrorCode: null,
            startedAt,
            completedAt: null,
          },
        });

        return { kind: 'PREPARED' as const };
      },
      { timeout: 30_000, maxWait: 20_000 },
    );

    if (prepared.kind === 'REPLAY') {
      return { executed: false, receipt: prepared.receipt };
    }

    /*
     * Provider/NFS/Kubernetes I/O must never run inside a Prisma transaction.
     * The short prepare transaction above persists intent under the live plan;
     * the already-committed PurgeFreeze remains the durable write authority
     * while this effect runs. The short completion transaction below refuses a
     * stale owner, so a lost lease can never certify another owner's effect.
     */
    let receipt: T;

    try {
      receipt = await effect();
    } catch (error) {
      const code = errorCode(error);
      await this.prisma
        .$transaction(
          async (tx) => {
            await this.lockedPlan(tx, guarantee);
            const completedAt = await this.databaseNow(tx);
            await tx.purgeEffect.updateMany({
              where: {
                planId: guarantee.planId,
                effectKey: descriptor.key,
                status: 'RUNNING',
              },
              data: { status: 'FAILED', completedAt, lastErrorCode: code },
            });
          },
          { timeout: 30_000, maxWait: 20_000 },
        )
        .catch(() => undefined);
      throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_EFFECT_FAILED')), { code, cause: error });
    }

    await this.prisma.$transaction(
      async (tx) => {
        await this.lockedPlan(tx, guarantee);
        const current = await tx.purgeEffect.findUnique({
          where: { planId_effectKey: { planId: guarantee.planId, effectKey: descriptor.key } },
          select: { resourceType: true, resourceId: true, status: true },
        });

        if (
          !current ||
          current.status !== 'RUNNING' ||
          current.resourceType !== descriptor.resourceType ||
          current.resourceId !== descriptor.resourceId
        ) {
          throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_EFFECT_DESCRIPTOR_MISMATCH')), {
            code: 'ACCOUNT_PURGE_EFFECT_DESCRIPTOR_MISMATCH',
          });
        }

        const completedAt = await this.databaseNow(tx);
        await tx.purgeEffect.update({
          where: { planId_effectKey: { planId: guarantee.planId, effectKey: descriptor.key } },
          data: {
            status: 'SUCCEEDED',
            receipt: receipt as Prisma.InputJsonValue,
            completedAt,
            lastErrorCode: null,
          },
        });
      },
      { timeout: 30_000, maxWait: 20_000 },
    );

    return { executed: true, receipt };
  }

  private async abandon(guarantee: PurgeGuarantee, code: string): Promise<void> {
    await this.prisma
      .$transaction(async (tx) => {
        const now = await this.databaseNow(tx);
        const updated = await tx.purgePlan.updateMany({
          where: { id: guarantee.planId, ownerToken: guarantee.ownerToken, status: PLAN_ACTIVE },
          data: { status: PLAN_FAILED, leaseExpiresAt: now, lastErrorCode: code, version: { increment: 1 } },
        });
        if (updated.count === 1) {
          const effectStarted = (await tx.purgeEffect.count({ where: { planId: guarantee.planId } })) > 0;

          /*
           * Once any physical/provider effect was attempted, a crash can leave
           * an outcome that only live verification can classify. Never remove
           * the durable write freeze in that state; the next idempotent purge
           * attempt reclaims the same plan and verifies its receipts.
           */
          if (!effectStarted) await tx.purgeFreeze.deleteMany({ where: { planId: guarantee.planId } });
        }
      })
      .catch(() => undefined);
  }

  async reconcile(): Promise<{ scanned: number; reconciled: number; planIds: string[] }> {
    const candidates = await this.prisma.$queryRawUnsafe<Array<{ id: string; ownerToken: string }>>(
      `SELECT id, "ownerToken" FROM "PurgePlan"
        WHERE status = $1
          AND "leaseExpiresAt" < date_trunc('milliseconds', clock_timestamp())
              - ($2::bigint * interval '1 millisecond')
        ORDER BY "leaseExpiresAt" ASC LIMIT 500`,
      PLAN_ACTIVE,
      this.lease.reclaimGraceMs,
    );
    const planIds: string[] = [];

    for (const candidate of candidates) {
      const changed = await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRawUnsafe<Array<{ expired: boolean }>>(
          `WITH target AS MATERIALIZED (
             SELECT id, "leaseExpiresAt" FROM "PurgePlan"
              WHERE id = $1 AND "ownerToken" = $2 AND status = $3 FOR UPDATE
           ), lease_clock AS MATERIALIZED (
             SELECT date_trunc('milliseconds', clock_timestamp()) AS ts FROM target
           )
           SELECT target."leaseExpiresAt" < lease_clock.ts - ($4::bigint * interval '1 millisecond') AS expired
             FROM target CROSS JOIN lease_clock`,
          candidate.id,
          candidate.ownerToken,
          PLAN_ACTIVE,
          this.lease.reclaimGraceMs,
        );
        if (rows[0]?.expired !== true) return false;
        const now = await this.databaseNow(tx);
        await tx.purgePlan.update({
          where: { id: candidate.id },
          data: {
            status: PLAN_ABANDONED,
            lastErrorCode: 'ACCOUNT_PURGE_LEASE_EXPIRED',
            leaseExpiresAt: now,
            version: { increment: 1 },
          },
        });
        const effectStarted = (await tx.purgeEffect.count({ where: { planId: candidate.id } })) > 0;

        if (!effectStarted) await tx.purgeFreeze.deleteMany({ where: { planId: candidate.id } });
        return true;
      });
      if (changed) planIds.push(candidate.id);
    }
    return { scanned: candidates.length, reconciled: planIds.length, planIds };
  }

  async purge(
    input: { userId: string; correlationId?: string },
    deps: PurgeStorageDeps,
  ): Promise<PurgeUserAccountResult> {
    const acquired = await this.acquire(input.userId, input.correlationId);
    if ('outcome' in acquired) return acquired;

    const guarantee = acquired;
    const heartbeat = this.heartbeat(guarantee);
    const leaseContext: PurgeLeaseContext = {
      planId: guarantee.planId,
      ownerToken: guarantee.ownerToken,
      validate: async () => {
        if (heartbeat.lost())
          throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_LEASE_LOST')), {
            code: 'ACCOUNT_PURGE_LEASE_LOST',
          });
        try {
          await this.validate(guarantee);
        } catch (error) {
          heartbeat.markLost();
          throw error;
        }
      },
      executeEffect: (descriptor, effect) => this.executeEffect(guarantee, descriptor, effect),
    };
    let completed = false;

    try {
      await leaseContext.validate();

      for (const subscription of guarantee.billingSubscriptions) {
        if (!subscription.externalId) continue;
        if (!deps.cancelExternalBilling) {
          throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_BILLING_CANCELLER_UNAVAILABLE')), {
            code: 'ACCOUNT_PURGE_BILLING_CANCELLER_UNAVAILABLE',
          });
        }

        const execution = await leaseContext.executeEffect(
          {
            key: `billing-subscription:${subscription.id}`,
            resourceType: 'billing_subscription',
            resourceId: subscription.externalId,
          },
          async () => {
            const receipt = await deps.cancelExternalBilling!(
              subscription.externalId!,
              `account-purge-${guarantee.planId}-${subscription.id}`,
            );
            if (receipt.canceled !== true) {
              throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_BILLING_CESSATION_UNVERIFIED')), {
                code: 'ACCOUNT_PURGE_BILLING_CESSATION_UNVERIFIED',
              });
            }
            return receipt;
          },
        );

        if (execution.receipt.canceled !== true) {
          throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_BILLING_CESSATION_UNVERIFIED')), {
            code: 'ACCOUNT_PURGE_BILLING_CESSATION_UNVERIFIED',
          });
        }
      }

      const projectReceipts =
        guarantee.ownedProjects.length === 0
          ? []
          : await (() => {
              if (!deps.eraseOwnedProjects) {
                throw Object.assign(new Error('Owned project permanent-deletion coordinator is unavailable'), {
                  code: 'ACCOUNT_PURGE_PROJECT_COORDINATOR_UNAVAILABLE',
                });
              }
              return deps.eraseOwnedProjects(guarantee.ownedProjects, leaseContext);
            })();
      const receiptByProject = new Map(projectReceipts.map((receipt) => [receipt.projectId, receipt]));
      if (
        receiptByProject.size !== projectReceipts.length ||
        projectReceipts.length !== guarantee.ownedProjects.length ||
        guarantee.ownedProjects.some((project) => {
          const receipt = receiptByProject.get(project.id);
          return (
            !receipt ||
            receipt.organizationId !== project.organizationId ||
            receipt.idempotencyKey !== `account-purge:${guarantee.planId}:${project.id}`
          );
        })
      ) {
        throw Object.assign(new Error('Owned project permanent-deletion receipt is incomplete'), {
          code: 'ACCOUNT_PURGE_PROJECT_RECEIPT_INCOMPLETE',
        });
      }

      const ownedProjectIds = new Set(guarantee.ownedProjects.map(({ id }) => id));
      const physical = await deps.eraseStorage(
        {
          ownedProjects: [],
          bucketProjectIds: [],
          workspaceProjectIds: guarantee.workspaceProjectIds.filter((projectId) => !ownedProjectIds.has(projectId)),
          localSnapshotObjects: [],
          staticDeploymentIds: [],
          staticArtifactRefs: [],
          staticAliasDeploymentIds: [],
        },
        leaseContext,
      );

      if (!physical?.verified) {
        throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_PHYSICAL_INCOMPLETE')), {
          code: 'ACCOUNT_PURGE_PHYSICAL_INCOMPLETE',
        });
      }

      const projectClass: PurgeClassReport = {
        dataClass: 'owned_project_permanent_deletion',
        action: 'deleted',
        models: { Project: projectReceipts.length },
        evidence: { receipts: projectReceipts },
        remainingAfterPurge: 0,
      };
      const result = await this.finalize(guarantee, [projectClass, ...physical.classes], projectReceipts);
      completed = result.outcome === 'purged' || result.outcome === 'already_purged';
      return result;
    } catch (error) {
      await this.abandon(guarantee, errorCode(error));
      throw error;
    } finally {
      await heartbeat.stop();
      await deps
        .releaseWorkspaceBarrier?.(
          {
            ownedProjects: guarantee.ownedProjects,
            bucketProjectIds: guarantee.bucketProjectIds,
            workspaceProjectIds: guarantee.workspaceProjectIds,
            localSnapshotObjects: guarantee.localSnapshotObjects,
            staticDeploymentIds: guarantee.staticDeploymentIds,
            staticArtifactRefs: guarantee.staticArtifactRefs,
            staticAliasDeploymentIds: guarantee.staticAliasDeploymentIds,
          },
          guarantee.planId,
          guarantee.ownerToken,
        )
        .catch(() => undefined);

      if (!completed) await this.abandon(guarantee, 'ACCOUNT_PURGE_ATTEMPT_ABORTED');
    }
  }

  private async finalize(
    guarantee: PurgeGuarantee,
    physicalClasses: PurgeClassReport[],
    projectReceipts: Array<{
      projectId: string;
      organizationId: string;
      operationId: string;
      idempotencyKey: string;
      requestHash: string;
      completedAt: string;
    }>,
  ): Promise<PurgeUserAccountResult> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `account-purge:${guarantee.userId}`);
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', TOPOLOGY_LOCK);
        const locked = await this.lockedPlan(tx, guarantee);
        const user = await tx.user.findUnique({ where: { id: guarantee.userId } });
        if (!user) return { outcome: 'not_requested' as const };

        const request = deletionPreference(user.preferences);
        const requestedAt = validDate(request?.requestedAt);
        const purgedAt = validDate(request?.purgedAt);
        if (purgedAt)
          return { outcome: 'already_purged' as const, planId: guarantee.planId, purgedAt: purgedAt.toISOString() };
        if (!requestedAt) return { outcome: 'not_requested' as const };
        const purgeDueAt = new Date(requestedAt.getTime() + DELETION_GRACE_PERIOD_DAYS * DAY_MS);
        if (locked.databaseNow < purgeDueAt)
          return { outcome: 'not_due' as const, purgeDueAt: purgeDueAt.toISOString() };

        const topology = await this.resolveTopology(tx, guarantee.userId);
        const reboundFingerprint = topologyFingerprint({
          ...topology,
          ownedProjects: guarantee.ownedProjects,
          bucketProjectIds: guarantee.bucketProjectIds,
          workspaceProjectIds: guarantee.workspaceProjectIds,
          localSnapshotObjects: guarantee.localSnapshotObjects,
          staticDeploymentIds: guarantee.staticDeploymentIds,
          staticArtifactRefs: guarantee.staticArtifactRefs,
          staticAliasDeploymentIds: guarantee.staticAliasDeploymentIds,
        });
        if (reboundFingerprint !== guarantee.fingerprint) {
          throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_TOPOLOGY_DRIFT')), {
            code: 'ACCOUNT_PURGE_TOPOLOGY_DRIFT',
          });
        }

        const receiptByProject = new Map(projectReceipts.map((receipt) => [receipt.projectId, receipt]));
        for (const project of guarantee.ownedProjects) {
          const supplied = receiptByProject.get(project.id);
          const durable = await tx.projectPermanentDeletionReceipt.findUnique({ where: { projectId: project.id } });
          const liveProject = await tx.project.findUnique({ where: { id: project.id }, select: { id: true } });
          const databasePlan = supplied
            ? await tx.projectDatabaseErasurePlan.findUnique({ where: { operationId: supplied.operationId } })
            : undefined;
          if (
            !supplied ||
            supplied.organizationId !== project.organizationId ||
            supplied.idempotencyKey !== `account-purge:${guarantee.planId}:${project.id}` ||
            liveProject ||
            !durable ||
            durable.operationId !== supplied.operationId ||
            durable.organizationId !== supplied.organizationId ||
            durable.idempotencyKey !== supplied.idempotencyKey ||
            durable.requestHash !== supplied.requestHash ||
            durable.state !== 'COMMITTED' ||
            !databasePlan ||
            databasePlan.projectId !== project.id ||
            databasePlan.organizationId !== project.organizationId ||
            databasePlan.ownershipEpoch !== project.ownershipEpoch ||
            databasePlan.stage !== 'VERIFIED' ||
            !databasePlan.receipt ||
            (databasePlan.receipt as { schemaVersion?: unknown }).schemaVersion !== 2
          ) {
            throw Object.assign(new Error('Owned project permanent-deletion receipt is not durable'), {
              code: 'ACCOUNT_PURGE_PROJECT_RECEIPT_INVALID',
            });
          }
        }

        const userId = guarantee.userId;
        const now = locked.databaseNow;
        const nowIso = now.toISOString();
        const { soleOrgIds, sharedOrgIds } = topology;
        const classes: PurgeClassReport[] = [];

        await fencePurgedUserStateMachines(this.prisma, tx, {
          userId,
          soleOrganizationIds: soleOrgIds,
        });

        // An impersonation session belongs operationally to both the target
        // (`userId`) and the administrator (`impersonatedBy`). Purging either
        // principal must revoke the bearer token immediately.
        const sessions = await tx.session.deleteMany({
          where: { OR: [{ userId }, { impersonatedBy: userId }] },
        });
        const websocketTickets = await tx.runtimeWebSocketTicket.deleteMany({ where: { userId } });
        classes.push({
          dataClass: 'sessions',
          action: 'deleted',
          models: { Session: sessions.count, RuntimeWebSocketTicket: websocketTickets.count },
        });

        const emailTokens = await tx.emailVerificationToken.deleteMany({ where: { userId } });
        const resetTokens = await tx.passwordResetToken.deleteMany({ where: { userId } });
        const recoveryCodes = await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
        const deploymentAccessTickets = await tx.deploymentAccessExchangeTicket.deleteMany({ where: { userId } });
        classes.push({
          dataClass: 'auth_tokens',
          action: 'deleted',
          models: {
            EmailVerificationToken: emailTokens.count,
            PasswordResetToken: resetTokens.count,
            MfaRecoveryCode: recoveryCodes.count,
            DeploymentAccessExchangeTicket: deploymentAccessTickets.count,
          },
        });

        const apiKeys = await tx.apiKey.deleteMany({ where: { userId } });
        classes.push({ dataClass: 'api_keys', action: 'deleted', models: { ApiKey: apiKeys.count } });

        const accounts = await tx.account.deleteMany({ where: { userId } });
        const oauthConnections = await tx.oAuthConnection.deleteMany({ where: { userId } });
        const userConnections = await tx.userConnection.deleteMany({ where: { userId } });
        classes.push({
          dataClass: 'connected_accounts',
          action: 'deleted',
          models: {
            Account: accounts.count,
            OAuthConnection: oauthConnections.count,
            UserConnection: userConnections.count,
          },
        });

        const aiMessages = await tx.aiMessage.count({ where: { conversation: { userId } } });
        const aiToolCalls = await tx.aiToolCall.count({ where: { message: { conversation: { userId } } } });
        const aiTokenUsages = await tx.aiTokenUsage.count({ where: { message: { conversation: { userId } } } });
        const aiConversations = await tx.aiConversation.deleteMany({ where: { userId } });
        const agentRuns = await tx.agentRun.deleteMany({ where: { userId } });
        const agentMemories = await tx.agentMemory.deleteMany({ where: { userId } });
        const agentMemoryPreferences = await tx.agentMemoryPreference.deleteMany({ where: { userId } });
        const mcpInstalls = await tx.mcpInstall.deleteMany({ where: { userId } });
        const mcpUserConfigs = await tx.mcpUserConfig.deleteMany({ where: { userId } });
        const aiFeedback = await tx.aiMessageFeedback.deleteMany({ where: { userId } });
        const notifications = await tx.notification.deleteMany({ where: { userId } });
        const featureRequests = await tx.integrationFeatureRequest.deleteMany({ where: { userId } });
        const soleOrgCheckpoints = soleOrgIds.length
          ? await tx.agentCheckpoint.deleteMany({ where: { organizationId: { in: soleOrgIds } } })
          : { count: 0 };
        classes.push({
          dataClass: 'ai_history',
          action: 'deleted',
          models: {
            AiConversation: aiConversations.count,
            AiMessage: aiMessages,
            AiToolCall: aiToolCalls,
            AiTokenUsage: aiTokenUsages,
            AgentRun: agentRuns.count,
            AgentMemory: agentMemories.count,
            AgentMemoryPreference: agentMemoryPreferences.count,
            McpInstall: mcpInstalls.count,
            McpUserConfig: mcpUserConfigs.count,
            AiMessageFeedback: aiFeedback.count,
            Notification: notifications.count,
            IntegrationFeatureRequest: featureRequests.count,
            AgentCheckpoint: soleOrgCheckpoints.count,
          },
        });

        const collaborators = await tx.projectCollaborator.deleteMany({ where: { userId } });
        const presence = await tx.collaborationPresence.deleteMany({ where: { userId } });
        const comments = await tx.collaborationComment.deleteMany({ where: { userId } });
        const shareLinks = await tx.projectShareLink.deleteMany({ where: { createdByUserId: userId } });
        const spendLimits = await tx.userSpendLimit.deleteMany({ where: { userId } });
        const subjectGrants = await tx.resourceAccessGrant.deleteMany({ where: { subjectUserId: userId } });
        classes.push({
          dataClass: 'collaboration',
          action: 'deleted',
          models: {
            ProjectCollaborator: collaborators.count,
            CollaborationPresence: presence.count,
            CollaborationComment: comments.count,
            ProjectShareLink: shareLinks.count,
            UserSpendLimit: spendLimits.count,
            ResourceAccessGrant: subjectGrants.count,
          },
        });

        // Public chat-share snapshots have no FK and can outlive their project.
        // Delete the payload itself; revoking the URL would leave the PII stored.
        const chatShares = await tx.chatShare.deleteMany({ where: { authorUserId: userId } });
        classes.push({ dataClass: 'chat_shares', action: 'deleted', models: { ChatShare: chatShares.count } });

        const remainingOwnedProjects = guarantee.ownedProjects.length
          ? await tx.project.count({ where: { id: { in: guarantee.ownedProjects.map(({ id }) => id) } } })
          : 0;
        if (remainingOwnedProjects !== 0) {
          throw Object.assign(new Error('Owned projects remain after permanent-deletion subplans'), {
            code: 'ACCOUNT_PURGE_PROJECTS_REMAIN',
          });
        }
        classes.push({
          dataClass: 'projects',
          action: 'deleted',
          models: { Project: guarantee.ownedProjects.length },
          remainingAfterPurge: 0,
        });

        const importJobs = soleOrgIds.length
          ? await tx.importJob.deleteMany({ where: { organizationId: { in: soleOrgIds } } })
          : { count: 0 };
        classes.push({ dataClass: 'imports', action: 'deleted', models: { ImportJob: importJobs.count } });

        const memberships = await tx.organizationMember.deleteMany({ where: { userId } });
        classes.push({
          dataClass: 'memberships',
          action: 'deleted',
          models: { OrganizationMember: memberships.count },
        });

        const newsletter = await tx.newsletterSubscriber.deleteMany({ where: { email: user.email } });
        classes.push({ dataClass: 'marketing', action: 'deleted', models: { NewsletterSubscriber: newsletter.count } });

        const redactionMarker = { redacted: true, redactedAt: nowIso } as Prisma.InputJsonValue;
        const auditRedacted = await tx.auditLog.updateMany({
          where: { actorUserId: userId },
          data: { ipAddress: null, metadata: redactionMarker },
        });
        const adminAuditRedacted = await tx.adminAuditLog.updateMany({
          where: { actorUserId: userId },
          data: { ipAddress: null, metadata: redactionMarker },
        });
        const adminAuditTargetRedacted = await tx.adminAuditLog.updateMany({
          where: {
            metadata: { path: ['userId'], equals: userId },
            NOT: { action: 'account.purge_completed' },
          },
          data: {
            metadata: { redacted: true, redactedAt: nowIso, target: 'purged-user' } as Prisma.InputJsonValue,
          },
        });
        classes.push({
          dataClass: 'audit_logs',
          action: 'anonymized',
          reason: appPublicEnglish('ACCOUNT_PURGE_RETENTION_AUDIT'),
          models: {
            AuditLog: auditRedacted.count,
            AdminAuditLog: adminAuditRedacted.count,
            AdminAuditLogTargetingUser: adminAuditTargetRedacted.count,
          },
        });

        const emailEventsAnonymized = await tx.emailDeliveryEvent.updateMany({
          where: { email: user.email },
          data: {
            email: anonymizedEmail(userId),
            subject: null,
            fromAddress: null,
            payload: redactionMarker,
          },
        });
        classes.push({
          dataClass: 'communications',
          action: 'anonymized',
          reason: appPublicEnglish('ACCOUNT_PURGE_RETENTION_DELIVERY'),
          models: { EmailDeliveryEvent: emailEventsAnonymized.count },
        });

        // Scrub free-form content before detaching its user references. The first
        // selector depends on SupportTicket.userId still identifying the subject.
        const ticketThreadBodies = await tx.ticketMessage.updateMany({
          where: { ticket: { userId } },
          data: { body: appPublicEnglish('ACCOUNT_PURGE_REDACTED_VALUE') },
        });
        const authoredMessages = await tx.ticketMessage.updateMany({
          where: { authorUserId: userId },
          data: { body: appPublicEnglish('ACCOUNT_PURGE_REDACTED_VALUE'), authorUserId: null },
        });
        const ticketSubjects = await tx.supportTicket.updateMany({
          where: { userId },
          data: { subject: appPublicEnglish('ACCOUNT_PURGE_REDACTED_VALUE'), metadata: redactionMarker },
        });
        const snapshotLabels = await tx.projectSnapshot.updateMany({
          where: { createdByUserId: userId },
          data: { label: null, createdByUserId: null },
        });
        classes.push({
          dataClass: 'free_form_pii',
          action: 'anonymized',
          reason: appPublicEnglish('ACCOUNT_PURGE_RETENTION_FREE_FORM'),
          models: {
            SupportTicketSubject: ticketSubjects.count,
            TicketMessageBodyInThread: ticketThreadBodies.count,
            TicketMessageBodyAuthored: authoredMessages.count,
            ProjectSnapshotLabel: snapshotLabels.count,
          },
        });

        const usageRefs = await tx.usageEvent.updateMany({ where: { userId }, data: { userId: null } });
        const callRefs = await tx.agentCallLog.updateMany({ where: { userId }, data: { userId: null } });
        const reservationRefs = await tx.ledgerReservation.updateMany({ where: { userId }, data: { userId: null } });
        const checkpointRefs = await tx.agentCheckpoint.updateMany({ where: { userId }, data: { userId: null } });
        const activityRefs = await tx.projectActivity.updateMany({
          where: { actorUserId: userId },
          data: { actorUserId: null },
        });
        const importRefs = await tx.importJob.updateMany({
          where: { actorUserId: userId },
          data: { actorUserId: null },
        });
        const galleryRefs = await tx.galleryListing.updateMany({
          where: { authorUserId: userId },
          data: { authorUserId: null, authorName: 'Deleted account' },
        });
        const ticketRefs = await tx.supportTicket.updateMany({ where: { userId }, data: { userId: null } });
        classes.push({
          dataClass: 'user_references',
          action: 'anonymized',
          reason: appPublicEnglish('ACCOUNT_PURGE_RETENTION_USER_REFERENCES'),
          models: {
            UsageEvent: usageRefs.count,
            AgentCallLog: callRefs.count,
            LedgerReservation: reservationRefs.count,
            AgentCheckpoint: checkpointRefs.count,
            ProjectActivity: activityRefs.count,
            ImportJob: importRefs.count,
            GalleryListing: galleryRefs.count,
            SupportTicket: ticketRefs.count,
          },
        });

        let organizationsAnonymized = 0;
        for (const organizationId of soleOrgIds) {
          await tx.organization.update({
            where: { id: organizationId },
            data: { name: 'Purged account', slug: anonymizedOrgSlug(organizationId), billingEmail: null },
          });
          organizationsAnonymized += 1;
        }
        classes.push({
          dataClass: 'organizations',
          action: 'anonymized',
          reason: appPublicEnglish('ACCOUNT_PURGE_RETENTION_FINANCIAL_ANCHOR'),
          models: { Organization: organizationsAnonymized },
        });

        const activeSubscriptionStates = [...ACTIVE_SUBSCRIPTION_STATES];
        const subscriptionsCancelled = soleOrgIds.length
          ? await tx.subscription.updateMany({
              where: { organizationId: { in: soleOrgIds }, status: { in: activeSubscriptionStates } },
              data: { status: 'CANCELED', cancelAtPeriodEnd: true },
            })
          : { count: 0 };
        const activeSubscriptionsRemaining = soleOrgIds.length
          ? await tx.subscription.count({
              where: { organizationId: { in: soleOrgIds }, status: { in: activeSubscriptionStates } },
            })
          : 0;
        classes.push({
          dataClass: 'billing_cessation',
          action: 'deleted',
          models: {
            SubscriptionsCancelled: subscriptionsCancelled.count,
            ExternalSubscriptions: guarantee.billingSubscriptions.filter(({ externalId }) => Boolean(externalId))
              .length,
          },
          remainingAfterPurge: activeSubscriptionsRemaining,
        });

        const financialCutoff = new Date(now.getTime() - FINANCIAL_RETENTION_DAYS * DAY_MS);
        const soleOrgWhere = { organizationId: { in: soleOrgIds } };
        let expiredRowsErased = 0;
        if (soleOrgIds.length) {
          expiredRowsErased += (
            await tx.usageEvent.deleteMany({ where: { ...soleOrgWhere, createdAt: { lt: financialCutoff } } })
          ).count;
          expiredRowsErased += (
            await tx.aiCostLedger.deleteMany({ where: { ...soleOrgWhere, createdAt: { lt: financialCutoff } } })
          ).count;
          expiredRowsErased += (
            await tx.creditLedger.deleteMany({ where: { ...soleOrgWhere, createdAt: { lt: financialCutoff } } })
          ).count;
        }
        const retainedFinancial = {
          UsageEvent: soleOrgIds.length ? await tx.usageEvent.count({ where: soleOrgWhere }) : 0,
          AiCostLedger: soleOrgIds.length ? await tx.aiCostLedger.count({ where: soleOrgWhere }) : 0,
          CreditLedger: soleOrgIds.length ? await tx.creditLedger.count({ where: soleOrgWhere }) : 0,
          StripeEvent: soleOrgIds.length ? await tx.stripeEvent.count({ where: soleOrgWhere }) : 0,
          Subscription: soleOrgIds.length ? await tx.subscription.count({ where: soleOrgWhere }) : 0,
        };
        classes.push({
          dataClass: 'financial_records',
          action: 'retained',
          reason: appPublicEnglish('ACCOUNT_PURGE_RETENTION_FINANCIAL_7Y'),
          models: { ...retainedFinancial, ExpiredRowsErased: expiredRowsErased },
        });

        const ledgerTransactions = soleOrgIds.length ? await tx.ledgerTransaction.count({ where: soleOrgWhere }) : 0;
        classes.push({
          dataClass: 'ledger',
          action: 'retained',
          reason: appPublicEnglish('ACCOUNT_PURGE_RETENTION_LEDGER'),
          models: { LedgerTransaction: ledgerTransactions },
        });
        const sharedProjects = sharedOrgIds.length
          ? await tx.project.count({ where: { organizationId: { in: sharedOrgIds } } })
          : 0;
        classes.push({
          dataClass: 'shared_org_content',
          action: 'retained',
          reason: appPublicEnglish('ACCOUNT_PURGE_RETENTION_SHARED_ORG'),
          models: { Project: sharedProjects },
        });

        await tx.user.update({
          where: { id: userId },
          data: {
            email: anonymizedEmail(userId),
            name: null,
            passwordHash: null,
            emailVerifiedAt: null,
            mfaEnabled: false,
            mfaSecretCiphertext: null,
            platformAdmin: false,
            language: null,
            timezone: null,
            lastActiveAt: null,
            preferences: {
              accountDeletion: { requestedAt: requestedAt.toISOString(), purgedAt: nowIso },
            } as Prisma.InputJsonValue,
          },
        });
        classes.push({
          dataClass: 'profile',
          action: 'anonymized',
          reason: appPublicEnglish('ACCOUNT_PURGE_RETENTION_TOMBSTONE'),
          models: { User: 1 },
        });

        const verify: Record<string, number> = {
          sessions:
            (await tx.session.count({
              where: { OR: [{ userId }, { impersonatedBy: userId }] },
            })) + (await tx.runtimeWebSocketTicket.count({ where: { userId } })),
          auth_tokens:
            (await tx.emailVerificationToken.count({ where: { userId } })) +
            (await tx.passwordResetToken.count({ where: { userId } })) +
            (await tx.mfaRecoveryCode.count({ where: { userId } })) +
            (await tx.deploymentAccessExchangeTicket.count({ where: { userId } })),
          api_keys: await tx.apiKey.count({ where: { userId } }),
          connected_accounts:
            (await tx.account.count({ where: { userId } })) +
            (await tx.oAuthConnection.count({ where: { userId } })) +
            (await tx.userConnection.count({ where: { userId } })),
          ai_history:
            (await tx.aiConversation.count({ where: { userId } })) +
            (await tx.agentRun.count({ where: { userId } })) +
            (await tx.agentMemory.count({ where: { userId } })) +
            (await tx.agentMemoryPreference.count({ where: { userId } })) +
            (await tx.mcpInstall.count({ where: { userId } })) +
            (await tx.mcpUserConfig.count({ where: { userId } })) +
            (await tx.aiMessageFeedback.count({ where: { userId } })) +
            (await tx.notification.count({ where: { userId } })) +
            (await tx.integrationFeatureRequest.count({ where: { userId } })),
          collaboration:
            (await tx.projectCollaborator.count({ where: { userId } })) +
            (await tx.collaborationPresence.count({ where: { userId } })) +
            (await tx.collaborationComment.count({ where: { userId } })) +
            (await tx.projectShareLink.count({ where: { createdByUserId: userId } })) +
            (await tx.userSpendLimit.count({ where: { userId } })) +
            (await tx.resourceAccessGrant.count({ where: { subjectUserId: userId } })),
          chat_shares: await tx.chatShare.count({ where: { authorUserId: userId } }),
          projects: soleOrgIds.length ? await tx.project.count({ where: soleOrgWhere }) : 0,
          imports: soleOrgIds.length ? await tx.importJob.count({ where: soleOrgWhere }) : 0,
          memberships: await tx.organizationMember.count({ where: { userId } }),
          marketing: await tx.newsletterSubscriber.count({ where: { email: user.email } }),
          billing_cessation: activeSubscriptionsRemaining,
        };
        for (const entry of classes)
          if (entry.action === 'deleted') entry.remainingAfterPurge = verify[entry.dataClass] ?? 0;
        const leftovers = Object.entries(verify).filter(([, count]) => count > 0);
        if (leftovers.length) {
          const detail = leftovers.map(([key, count]) => `${key}=${count}`).join(',');
          throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_VERIFICATION_FAILED', { detail })), {
            code: 'ACCOUNT_PURGE_VERIFICATION_FAILED',
          });
        }

        classes.push(...physicalClasses);
        const proof = buildErasureProof({ userId, requestedAt: requestedAt.toISOString(), purgedAt: nowIso, classes });
        if (!proof.verifiedZeroRemaining)
          throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_PROOF_UNVERIFIED')), {
            code: 'ACCOUNT_PURGE_PROOF_UNVERIFIED',
          });

        await tx.purgeReceipt.create({
          data: { userId, planId: guarantee.planId, purgedAt: now, proof: proof as unknown as Prisma.InputJsonValue },
        });
        await tx.adminAuditLog.create({
          data: {
            action: 'account.purge_completed',
            createdAt: now,
            metadata: {
              userId,
              planId: guarantee.planId,
              correlationId: guarantee.correlationId,
              proof,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        await tx.purgePlan.update({
          where: { id: guarantee.planId },
          data: {
            status: PLAN_COMPLETED,
            completedAt: now,
            leaseExpiresAt: now,
            version: { increment: 1 },
            lastErrorCode: null,
          },
        });
        await tx.purgeFreeze.deleteMany({ where: { planId: guarantee.planId } });
        await this.mutatePendingSetting(tx, userId, 'remove');

        return { outcome: 'purged' as const, planId: guarantee.planId, proof };
      },
      { timeout: 180_000, maxWait: 20_000 },
    );
  }
}
