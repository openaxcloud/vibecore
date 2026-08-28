import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type DatabaseClient } from '@vibecore/database';
import {
  appBuildPodName,
  scheduledJobPodName,
  scheduledJobSecretName,
  serverDeploymentName,
  type WorkspacePlan,
} from '@vibecore/k8s-client';
import { Client } from 'pg';

import type {
  ProjectRuntimeEffectDescriptor,
  ProjectRuntimeEffectTarget,
  ProjectCsiProvisionEffectInput,
  WorkspacePurgeEffectDescriptor,
  WorkspacePurgeLease,
  WorkspaceProjectDeletionInventory,
  WorkspaceProjectDeletionLease,
  WorkspaceProjectDeletionState,
  WorkspaceProjectVolumeCandidate,
  WorkspaceProjectVolumeErasurePlan,
  ProjectVolumeCreationQuiescenceSnapshot,
  WorkspaceRecord,
  WorkspaceStatus,
  WorkspaceStore,
} from './manager.js';
import {
  assertProjectVolumeErasureInventory,
  hashProjectVolumeEvidence,
  observeProjectCsiSettlement,
  type CompleteProjectVolumeReferenceSnapshot,
  type ProjectCsiSettlementEvidence,
  type ProjectVolumeErasureEntryEvidence,
  type ProjectVolumeErasureEvidence,
  type ProjectVolumeErasureFinalScanEvidence,
  type ProjectVolumeErasureInventory,
  type ProjectVolumeSourceReference,
} from './project-volume-erasure.js';

const KNOWN_PLANS: ReadonlySet<WorkspacePlan> = new Set(['free', 'pro', 'team', 'enterprise']);
const VOLUME_KUBERNETES_NAME_RE = /^[a-z0-9](?:[-a-z0-9.]{0,251}[a-z0-9])?$/u;
const VOLUME_UID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;

const WORKSPACE_PURGE_STORE_INVARIANT = {
  databaseTimeUnavailable: 'WORKSPACE_PURGE_DATABASE_TIME_UNAVAILABLE',
  frozen: 'WORKSPACE_PURGE_FROZEN',
  leaseInvalid: 'WORKSPACE_PURGE_LEASE_INVALID',
  fenceOwned: 'WORKSPACE_PURGE_FENCE_OWNED',
  fenceLost: 'WORKSPACE_PURGE_FENCE_LOST',
  effectDescriptorMismatch: 'WORKSPACE_PURGE_EFFECT_DESCRIPTOR_MISMATCH',
  effectReceiptCorrupt: 'WORKSPACE_PURGE_EFFECT_RECEIPT_CORRUPT',
  projectDeletionLeaseInvalid: 'WORKSPACE_PROJECT_DELETION_LEASE_INVALID',
  projectDeletionScopeInvalid: 'WORKSPACE_PROJECT_DELETION_SCOPE_INVALID',
  projectDeletionFenceLost: 'WORKSPACE_PROJECT_DELETION_FENCE_LOST',
  projectProvisionLockUnavailable: 'WORKSPACE_PROJECT_PROVISION_LOCK_UNAVAILABLE',
  projectRuntimeEffectActive: 'WORKSPACE_PROJECT_RUNTIME_EFFECT_ACTIVE',
  projectRuntimeEffectFenceLost: 'WORKSPACE_PROJECT_RUNTIME_EFFECT_FENCE_LOST',
  projectRuntimeEffectInFlight: 'WORKSPACE_PROJECT_RUNTIME_EFFECT_IN_FLIGHT',
  projectRuntimeCsiCapabilityUnavailable: 'WORKSPACE_PROJECT_RUNTIME_CSI_CAPABILITY_UNAVAILABLE',
  projectVolumeErasureInvalid: 'WORKSPACE_PROJECT_VOLUME_ERASURE_INVALID',
  projectVolumeErasureRequired: 'WORKSPACE_PROJECT_VOLUME_ERASURE_REQUIRED',
  projectVolumeErasureFenceLost: 'WORKSPACE_PROJECT_VOLUME_ERASURE_FENCE_LOST',
  projectVolumeQuiescenceUnavailable: 'WORKSPACE_PROJECT_VOLUME_QUIESCENCE_UNAVAILABLE',
} as const;

type WorkspacePurgeStoreInvariantCode =
  (typeof WORKSPACE_PURGE_STORE_INVARIANT)[keyof typeof WORKSPACE_PURGE_STORE_INVARIANT];

/** Stable persistence invariant; the workspace-manager boundary localizes public copy. */
function workspacePurgeStoreInvariantError(
  code: WorkspacePurgeStoreInvariantCode,
  options: { statusCode?: number } = {},
): Error & { code: WorkspacePurgeStoreInvariantCode; statusCode?: number } {
  return Object.assign(new Error(code), { code, ...options });
}

function purgeErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && /^[A-Z0-9_]{1,100}$/.test(code)) return code;
  return 'WORKSPACE_PURGE_EFFECT_FAILED';
}

const RUNTIME_EFFECT_LEASE_SECONDS = 600;

function runtimeNamespace(): string {
  return process.env.WORKSPACE_RUNTIME_NAMESPACE?.trim() || 'workspaces';
}

function normalizeRuntimeEffectDescriptor(
  descriptor: ProjectRuntimeEffectDescriptor,
): ProjectRuntimeEffectDescriptor & { intentHash: string; targetDigest: string } {
  if (
    !/^[A-Z][A-Z0-9_]{0,79}$/.test(descriptor.action) ||
    descriptor.resourceId.length < 1 ||
    descriptor.resourceId.length > 255
  ) {
    throw new TypeError('Project runtime effect identity is invalid');
  }
  const seen = new Set<string>();
  const targets = descriptor.targets
    .map((target) => ({ kind: target.kind, namespace: target.namespace, name: target.name }))
    .sort(
      (left, right) =>
        left.kind.localeCompare(right.kind) ||
        left.namespace.localeCompare(right.namespace) ||
        left.name.localeCompare(right.name),
    )
    .filter((target) => {
      const key = `${target.kind}\u0000${target.namespace}\u0000${target.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  for (const target of targets) {
    if (
      !/^[A-Za-z][A-Za-z0-9.]{0,79}$/.test(target.kind) ||
      target.namespace.length < 1 ||
      target.namespace.length > 253 ||
      target.name.length < 1 ||
      target.name.length > 253
    ) {
      throw new TypeError('Project runtime effect target is invalid');
    }
  }
  const targetDigest = createHash('sha256').update(JSON.stringify(targets)).digest('hex');
  const intentHash = createHash('sha256')
    .update(JSON.stringify({ action: descriptor.action, resourceId: descriptor.resourceId, targetDigest }))
    .digest('hex');
  return { action: descriptor.action, resourceId: descriptor.resourceId, targets, intentHash, targetDigest };
}

function workspaceRuntimeTargets(input: {
  pvcName: string;
  podName: string;
  serviceName: string;
  agentTokenSecretName: string;
}): ProjectRuntimeEffectTarget[] {
  const namespace = runtimeNamespace();
  return [
    { kind: 'PersistentVolumeClaim', namespace, name: input.pvcName },
    { kind: 'Pod', namespace, name: input.podName },
    { kind: 'Service', namespace, name: input.serviceName },
    { kind: 'Endpoints', namespace, name: input.serviceName },
    { kind: 'Secret', namespace, name: input.agentTokenSecretName },
  ];
}

function deploymentRuntimeTargets(deploymentId: string): ProjectRuntimeEffectTarget[] {
  const namespace = runtimeNamespace();
  const name = serverDeploymentName(deploymentId);
  return [
    { kind: 'Pod', namespace, name: appBuildPodName(deploymentId) },
    { kind: 'Deployment', namespace, name },
    { kind: 'Service', namespace, name },
    { kind: 'Endpoints', namespace, name },
    { kind: 'Ingress', namespace, name },
    { kind: 'Secret', namespace, name: `app-secrets-${deploymentId}` },
  ];
}

function scheduledRunTargets(runId: string): ProjectRuntimeEffectTarget[] {
  const namespace = runtimeNamespace();
  return [
    { kind: 'Pod', namespace, name: scheduledJobPodName(runId) },
    { kind: 'Secret', namespace, name: scheduledJobSecretName(runId) },
  ];
}

const PROJECT_RUNTIME_TARGET_KINDS = new Set<ProjectRuntimeEffectTarget['kind']>([
  'Deployment',
  'ReplicaSet',
  'Pod',
  'Service',
  'Endpoints',
  'EndpointSlice',
  'Ingress',
  'Secret',
  'PersistentVolumeClaim',
]);

function parseRuntimeEffectTarget(row: {
  kind: string;
  namespace: string;
  name: string;
  expectedUid?: string | null;
}): ProjectRuntimeEffectTarget {
  if (!PROJECT_RUNTIME_TARGET_KINDS.has(row.kind as ProjectRuntimeEffectTarget['kind'])) {
    throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectDeletionScopeInvalid, {
      statusCode: 500,
    });
  }
  return {
    kind: row.kind as ProjectRuntimeEffectTarget['kind'],
    namespace: row.namespace,
    name: row.name,
    ...(row.expectedUid ? { expectedUid: row.expectedUid } : {}),
  };
}

interface ProjectVolumeErasureRow {
  operationId: string;
  projectIdSnapshot: string;
  organizationId: string;
  ownershipEpoch: number;
  namespace: string;
  state: string;
  sourceSnapshot: unknown;
  quiescenceSnapshot: unknown | null;
  quiescenceHash: string | null;
  inventory: unknown | null;
  evidence: unknown | null;
  verificationFencingToken: bigint | null;
  finalScanEvidence: unknown | null;
  finalScanFencingToken: bigint | null;
}

interface ProjectVolumeErasureTargetRow {
  ordinal: number;
  namespace: string;
  pvcName: string;
  expectedPvcUid: string | null;
  evidenceEntry: unknown | null;
  verifiedFencingToken: bigint | null;
}

function parseProjectVolumeErasurePlan(
  row: ProjectVolumeErasureRow,
  targets: readonly ProjectVolumeErasureTargetRow[],
): WorkspaceProjectVolumeErasurePlan {
  if (!['PREPARED', 'INVENTORIED', 'ERASING', 'VERIFIED'].includes(row.state)) {
    throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeErasureInvalid, {
      statusCode: 500,
    });
  }
  const sourceSnapshot = row.sourceSnapshot as CompleteProjectVolumeReferenceSnapshot;
  const quiescenceSnapshot = row.quiescenceSnapshot as ProjectVolumeCreationQuiescenceSnapshot | null;
  const inventory = row.inventory as ProjectVolumeErasureInventory | null;
  if (!quiescenceSnapshot || !row.quiescenceHash) {
    throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeErasureInvalid, {
      statusCode: 500,
    });
  }
  if (inventory) assertProjectVolumeErasureInventory(inventory);
  return {
    operationId: row.operationId,
    projectId: row.projectIdSnapshot,
    organizationId: row.organizationId,
    ownershipEpoch: row.ownershipEpoch,
    namespace: row.namespace,
    state: row.state as WorkspaceProjectVolumeErasurePlan['state'],
    sourceSnapshot,
    quiescenceSnapshot,
    quiescenceHash: row.quiescenceHash,
    ...(inventory ? { inventory } : {}),
    ...(row.evidence ? { evidence: row.evidence as ProjectVolumeErasureEvidence } : {}),
    ...(row.verificationFencingToken ? { verificationFencingToken: row.verificationFencingToken.toString() } : {}),
    ...(row.finalScanEvidence
      ? { finalScanEvidence: row.finalScanEvidence as ProjectVolumeErasureFinalScanEvidence }
      : {}),
    ...(row.finalScanFencingToken ? { finalScanFencingToken: row.finalScanFencingToken.toString() } : {}),
    targets: targets.map((target) => ({
      ordinal: target.ordinal,
      namespace: target.namespace,
      pvcName: target.pvcName,
      ...(target.expectedPvcUid ? { expectedPvcUid: target.expectedPvcUid } : {}),
      ...(target.evidenceEntry ? { evidence: target.evidenceEntry as ProjectVolumeErasureEntryEvidence } : {}),
      ...(target.verifiedFencingToken ? { verifiedFencingToken: target.verifiedFencingToken.toString() } : {}),
    })),
  };
}

function toPlan(value: unknown): WorkspacePlan {
  if (typeof value === 'string' && KNOWN_PLANS.has(value as WorkspacePlan)) {
    return value as WorkspacePlan;
  }

  // Defensive: rows pre-dating the typed plan default to "free" rather than
  // crashing the manager. Re-emit on next update.
  return 'free';
}

function toStatus(value: string): WorkspaceStatus {
  switch (value) {
    case 'STARTING':
    case 'RUNNING':
    case 'STOPPING':
    case 'STOPPED':
    case 'FAILED':
    case 'DELETED':
      return value;
    default:
      // Unknown statuses in the DB are surfaced as FAILED so the next GC
      // sweep clears them rather than leaving phantom RUNNING pods.
      return 'FAILED';
  }
}

interface PrismaRuntimeRow {
  id: string;
  orgId: string;
  projectId: string;
  plan: unknown;
  status: string;
  pvcName: string;
  podName: string;
  serviceName: string;
  agentTokenSecretName: string;
  error: string | null;
  createdAt: Date;
  lastActiveAt: Date;
  lastMeteredAt: Date | null;
  purgeFrozen: boolean;
  purgePlanId: string | null;
  purgeFenceToken: string | null;
  purgeFrozenAt: Date | null;
}

function rowToRecord(row: PrismaRuntimeRow): WorkspaceRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    projectId: row.projectId,
    plan: toPlan(row.plan),
    status: toStatus(row.status),
    pvcName: row.pvcName,
    podName: row.podName,
    serviceName: row.serviceName,
    agentTokenSecretName: row.agentTokenSecretName,
    createdAt: row.createdAt.toISOString(),
    lastActiveAt: row.lastActiveAt.toISOString(),
    ...(row.error ? { error: row.error } : {}),
    ...(row.lastMeteredAt ? { lastMeteredAt: row.lastMeteredAt.toISOString() } : {}),
    purgeFrozen: row.purgeFrozen,
    ...(row.purgePlanId !== null ? { purgePlanId: row.purgePlanId } : {}),
    ...(row.purgeFenceToken !== null ? { purgeFenceToken: row.purgeFenceToken } : {}),
    ...(row.purgeFrozenAt ? { purgeFrozenAt: row.purgeFrozenAt.toISOString() } : {}),
  };
}

function patchToData(patch: Partial<WorkspaceRecord>): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  if (patch.orgId !== undefined) {
    data.orgId = patch.orgId;
  }
  if (patch.projectId !== undefined) {
    data.projectId = patch.projectId;
  }
  if (patch.plan !== undefined) {
    data.plan = patch.plan;
  }
  if (patch.status !== undefined) {
    data.status = patch.status;
  }
  if (patch.pvcName !== undefined) {
    data.pvcName = patch.pvcName;
  }
  if (patch.podName !== undefined) {
    data.podName = patch.podName;
  }
  if (patch.serviceName !== undefined) {
    data.serviceName = patch.serviceName;
  }
  if (patch.agentTokenSecretName !== undefined) {
    data.agentTokenSecretName = patch.agentTokenSecretName;
  }
  if (patch.lastActiveAt !== undefined) {
    data.lastActiveAt = new Date(patch.lastActiveAt);
  }
  if (patch.lastMeteredAt !== undefined) {
    data.lastMeteredAt = new Date(patch.lastMeteredAt);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'error')) {
    data.error = patch.error ?? null;
  }
  if (patch.purgeFrozen !== undefined) data.purgeFrozen = patch.purgeFrozen;
  if (Object.prototype.hasOwnProperty.call(patch, 'purgePlanId')) data.purgePlanId = patch.purgePlanId ?? null;
  if (Object.prototype.hasOwnProperty.call(patch, 'purgeFenceToken'))
    data.purgeFenceToken = patch.purgeFenceToken ?? null;
  if (Object.prototype.hasOwnProperty.call(patch, 'purgeFrozenAt')) {
    data.purgeFrozenAt = patch.purgeFrozenAt ? new Date(patch.purgeFrozenAt) : null;
  }

  return data;
}

/**
 * PrismaWorkspaceStore — the production WorkspaceStore.
 *
 * Replaces JsonWorkspaceStore (single-file, single-replica) with a Postgres-
 * backed implementation that lets workspace-manager scale horizontally and
 * survive pod restarts under `readOnlyRootFilesystem: true`.
 *
 * Concurrency model:
 *   - create/get/list are single-statement and rely on the DB primary key
 *     to surface duplicate-id attempts as a 23505 unique violation
 *   - update is a single UPDATE … RETURNING; if the row is gone (DELETED was
 *     reaped by GC) we throw the same "Workspace not found" the JSON store
 *     would have thrown
 *   - we explicitly never read-then-write the same record; concurrent
 *     update calls compose via column-level merges in the patch
 */
export class PrismaWorkspaceStore implements WorkspaceStore {
  constructor(
    private readonly prisma: DatabaseClient,
    private readonly volumeSettlement?: {
      kubernetes: import('./project-volume-erasure.js').ProjectVolumeKubernetesAdapter;
      providers: import('./project-volume-erasure.js').ProjectVolumeProviderResolver;
    },
  ) {}

  private async withProjectProvisionBarrier<T>(
    input: {
      projectId: string;
      expectedOrganizationId: string;
      descriptor: ProjectRuntimeEffectDescriptor;
    },
    effect: (assertAuthority: () => Promise<void>) => Promise<T>,
  ): Promise<T> {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectProvisionLockUnavailable, {
        statusCode: 503,
      });
    }
    const client = new Client({ connectionString, application_name: 'vibecore-workspace-project-effect' });
    const descriptor = normalizeRuntimeEffectDescriptor(input.descriptor);
    const pvcTargets = descriptor.targets
      .map((target, ordinal) => ({ target, ordinal }))
      .filter(({ target }) => target.kind === 'PersistentVolumeClaim');
    if (pvcTargets.length > 0 && !this.volumeSettlement) {
      throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectRuntimeCsiCapabilityUnavailable, {
        statusCode: 503,
      });
    }
    const effectId = randomUUID();
    const ownerToken = randomUUID();
    let effectPrepared = false;
    let effectDispatched = false;
    let lockHeld = false;
    let connectionHealthy = true;
    const lockKey = `project-physical-mutation:${input.projectId}`;
    const onError = () => {
      connectionHealthy = false;
      lockHeld = false;
    };
    client.on('error', onError);
    const assertAuthority = async () => {
      if (!lockHeld || !connectionHealthy) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectProvisionLockUnavailable, {
          statusCode: 409,
        });
      }
      const result = await client.query<{
        organizationId: string;
        ownershipEpoch: number;
        deletedAt: Date | null;
        permanentDeletionStartedAt: Date | null;
        effectState: string | null;
        effectOwnerToken: string | null;
      }>(
        `SELECT project."organizationId", project."ownershipEpoch", project."deletedAt",
                project."permanentDeletionStartedAt", effect."state"::text AS "effectState",
                effect."ownerToken" AS "effectOwnerToken"
           FROM "Project" project
           LEFT JOIN "ProjectRuntimeEffect" effect ON effect.id = $2
          WHERE project.id = $1`,
        [input.projectId, effectId],
      );
      const project = result.rows[0];
      if (
        !project ||
        project.organizationId !== input.expectedOrganizationId ||
        project.deletedAt !== null ||
        project.permanentDeletionStartedAt !== null ||
        (effectDispatched && (project.effectState !== 'IN_FLIGHT' || project.effectOwnerToken !== ownerToken))
      ) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.frozen, { statusCode: 409 });
      }
    };

    try {
      await client.connect();
      await client.query(`SELECT set_config('statement_timeout', '20000', false)`);
      await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [lockKey]);
      lockHeld = true;
      await client.query(`SELECT set_config('statement_timeout', '0', false)`);
      await assertAuthority();

      try {
        await this.prisma.$transaction(async (tx) => {
          const projects = await tx.$queryRaw<
            Array<{
              organizationId: string;
              ownershipEpoch: number;
              deletedAt: Date | null;
              permanentDeletionStartedAt: Date | null;
            }>
          >`
            SELECT "organizationId", "ownershipEpoch", "deletedAt", "permanentDeletionStartedAt"
            FROM "Project"
            WHERE "id" = ${input.projectId}
            FOR SHARE
          `;
          const project = projects[0];
          if (
            !project ||
            project.organizationId !== input.expectedOrganizationId ||
            project.deletedAt !== null ||
            project.permanentDeletionStartedAt !== null
          ) {
            throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.frozen, { statusCode: 409 });
          }
          const activeEffects = await tx.$queryRaw<
            Array<{ id: string; state: string; leaseExpiresAt: Date | null; databaseNow: Date }>
          >`
            SELECT "id", "state"::text AS "state", "leaseExpiresAt",
                   date_trunc('milliseconds', clock_timestamp()) AS "databaseNow"
            FROM "ProjectRuntimeEffect"
            WHERE "projectId" = ${input.projectId}
              AND "action" = ${descriptor.action}
              AND "resourceId" = ${descriptor.resourceId}
              AND "state" IN (
                'PREPARED'::"ProjectRuntimeEffectState",
                'IN_FLIGHT'::"ProjectRuntimeEffectState"
              )
            ORDER BY "id"
            FOR UPDATE
          `;
          const activeEffect = activeEffects[0];
          if (activeEffect) {
            if (
              activeEffect.state === 'PREPARED' &&
              activeEffect.leaseExpiresAt !== null &&
              activeEffect.leaseExpiresAt <= activeEffect.databaseNow
            ) {
              await tx.$executeRaw(Prisma.sql`
                UPDATE "ProjectRuntimeEffect"
                SET "state" = 'ABORTED'::"ProjectRuntimeEffectState",
                    "ownerToken" = NULL,
                    "leaseExpiresAt" = NULL,
                    "lastErrorCode" = 'WORKSPACE_PROJECT_RUNTIME_EFFECT_PREPARED_LEASE_EXPIRED',
                    "abortedAt" = clock_timestamp(),
                    "updatedAt" = clock_timestamp()
                WHERE "id" = ${activeEffect.id}
                  AND "state" = 'PREPARED'::"ProjectRuntimeEffectState"
              `);
            } else {
              throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectRuntimeEffectActive, {
                statusCode: 409,
              });
            }
          }
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO "ProjectRuntimeEffect" (
              "id", "projectId", "organizationId", "ownershipEpoch", "action", "resourceId",
              "intentHash", "targetDigest", "fencingToken", "ownerToken", "state",
              "leaseExpiresAt", "preparedAt", "createdAt", "updatedAt"
            ) VALUES (
              ${effectId}, ${input.projectId}, ${input.expectedOrganizationId}, ${project.ownershipEpoch},
              ${descriptor.action}, ${descriptor.resourceId}, ${descriptor.intentHash}, ${descriptor.targetDigest},
              1, ${ownerToken}, 'PREPARED'::"ProjectRuntimeEffectState",
              clock_timestamp() + make_interval(secs => ${RUNTIME_EFFECT_LEASE_SECONDS}),
              clock_timestamp(), clock_timestamp(), clock_timestamp()
            )
          `);
          for (const [ordinal, target] of descriptor.targets.entries()) {
            await tx.$executeRaw(Prisma.sql`
              INSERT INTO "ProjectRuntimeEffectTarget" (
                "effectId", "ordinal", "kind", "namespace", "name"
              ) VALUES (${effectId}, ${ordinal}, ${target.kind}, ${target.namespace}, ${target.name})
            `);
          }
        });
        effectPrepared = true;
      } catch (error) {
        const detail = JSON.stringify(error);
        if (detail.includes('ProjectRuntimeEffect_active_resource_key') || detail.includes('Unique constraint')) {
          throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectRuntimeEffectActive, {
            statusCode: 409,
          });
        }
        throw error;
      }

      await assertAuthority();
      const dispatched = await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "ProjectRuntimeEffect" effect
        SET "state" = 'IN_FLIGHT'::"ProjectRuntimeEffectState",
            "dispatchedAt" = clock_timestamp(),
            "updatedAt" = clock_timestamp()
        WHERE effect.id = ${effectId}
          AND effect."ownerToken" = ${ownerToken}
          AND effect."state" = 'PREPARED'::"ProjectRuntimeEffectState"
          AND EXISTS (
            SELECT 1 FROM "Project" project
            WHERE project.id = effect."projectId"
              AND project."organizationId" = effect."organizationId"
              AND project."ownershipEpoch" = effect."ownershipEpoch"
              AND project."deletedAt" IS NULL
              AND project."permanentDeletionStartedAt" IS NULL
          )
      `);
      if (dispatched !== 1) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectRuntimeEffectFenceLost, {
          statusCode: 409,
        });
      }
      effectDispatched = true;
      await assertAuthority();

      try {
        const result = await effect(assertAuthority);
        await assertAuthority();
        const volumeEvidence: Array<{ ordinal: number; evidence: ProjectCsiSettlementEvidence }> = [];
        for (const { target, ordinal } of pvcTargets) {
          volumeEvidence.push({
            ordinal,
            evidence: await observeProjectCsiSettlement({
              scope: { projectId: input.projectId, organizationId: input.expectedOrganizationId },
              namespace: target.namespace,
              pvcName: target.name,
              kubernetes: this.volumeSettlement!.kubernetes,
              providers: this.volumeSettlement!.providers,
              assertCreationAuthority: assertAuthority,
            }),
          });
        }
        await assertAuthority();
        await this.prisma.$transaction(async (tx) => {
          const liveEffects = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "ProjectRuntimeEffect"
            WHERE "id" = ${effectId} AND "ownerToken" = ${ownerToken}
              AND "state" = 'IN_FLIGHT'::"ProjectRuntimeEffectState"
            FOR UPDATE
          `;
          if (!liveEffects[0]) {
            throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectRuntimeEffectFenceLost, {
              statusCode: 409,
            });
          }
          for (const { ordinal, evidence } of volumeEvidence) {
            await tx.$executeRaw(Prisma.sql`
              INSERT INTO "ProjectRuntimeEffectVolumeEvidence" (
                "effectId", "targetOrdinal", "pvcUid", "pvcResourceVersion", "pvName", "pvUid",
                "pvResourceVersion", "csiDriver", "csiVolumeHandle", "providerResourceId", "evidenceHash"
              ) VALUES (
                ${effectId}, ${ordinal}, ${evidence.pvcUid}, ${evidence.pvcResourceVersion},
                ${evidence.pvName}, ${evidence.pvUid}, ${evidence.pvResourceVersion}, ${evidence.csiDriver},
                ${evidence.csiVolumeHandle}, ${evidence.providerResourceId}, ${evidence.evidenceHash}
              )
            `);
          }
          const evidenceAggregateHash =
            volumeEvidence.length > 0
              ? createHash('sha256')
                  .update(JSON.stringify(volumeEvidence.map(({ evidence }) => evidence.evidenceHash).sort()))
                  .digest('hex')
              : null;
          const receipt =
            volumeEvidence.length > 0
              ? {
                  outcome: 'VERIFIED_BOUND_CSI',
                  evidenceHash: evidenceAggregateHash,
                  targetCount: volumeEvidence.length,
                }
              : { outcome: 'RETURNED' };
          const settled = await tx.$executeRaw(Prisma.sql`
            UPDATE "ProjectRuntimeEffect"
            SET "state" = 'SETTLED'::"ProjectRuntimeEffectState",
                "ownerToken" = NULL,
                "leaseExpiresAt" = NULL,
                "providerReceipt" = CAST(${JSON.stringify(receipt)} AS jsonb),
                "operatorQuiescenceHash" = ${evidenceAggregateHash},
                "settledAt" = clock_timestamp(),
                "updatedAt" = clock_timestamp()
            WHERE id = ${effectId}
              AND "ownerToken" = ${ownerToken}
              AND "state" = 'IN_FLIGHT'::"ProjectRuntimeEffectState"
          `);
          if (settled !== 1) {
            throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectRuntimeEffectFenceLost, {
              statusCode: 409,
            });
          }
        });
        return result;
      } catch (error) {
        if (lockHeld && connectionHealthy && effectDispatched) {
          await this.prisma
            .$executeRaw(
              Prisma.sql`
              UPDATE "ProjectRuntimeEffect"
              SET "lastErrorCode" = ${purgeErrorCode(error)},
                  "updatedAt" = clock_timestamp()
              WHERE id = ${effectId}
                AND "ownerToken" = ${ownerToken}
                AND "state" = 'IN_FLIGHT'::"ProjectRuntimeEffectState"
            `,
            )
            .catch(() => undefined);
        }
        throw error;
      }
    } finally {
      if (effectPrepared && !effectDispatched && lockHeld && connectionHealthy) {
        await this.prisma
          .$executeRaw(
            Prisma.sql`
            UPDATE "ProjectRuntimeEffect"
            SET "state" = 'ABORTED'::"ProjectRuntimeEffectState",
                "ownerToken" = NULL,
                "leaseExpiresAt" = NULL,
                "lastErrorCode" = 'WORKSPACE_PROJECT_RUNTIME_EFFECT_NOT_DISPATCHED',
                "abortedAt" = clock_timestamp(),
                "updatedAt" = clock_timestamp()
            WHERE id = ${effectId}
              AND "ownerToken" = ${ownerToken}
              AND "state" = 'PREPARED'::"ProjectRuntimeEffectState"
          `,
          )
          .catch(() => undefined);
      }
      if (lockHeld && connectionHealthy) {
        const unlocked = await client
          .query<{ unlocked: boolean }>('SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked', [lockKey])
          .catch(() => undefined);
        lockHeld = unlocked?.rows[0]?.unlocked === true ? false : lockHeld;
      }
      client.removeListener('error', onError);
      await client.end().catch(() => undefined);
    }
  }

  private async databaseNow(tx: Prisma.TransactionClient): Promise<Date> {
    const rows = await tx.$queryRawUnsafe<Array<{ databaseNow: Date }>>(
      `SELECT date_trunc('milliseconds', clock_timestamp()) AS "databaseNow"`,
    );
    const databaseNow = rows[0]?.databaseNow;
    if (!(databaseNow instanceof Date)) {
      throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.databaseTimeUnavailable);
    }
    return databaseNow;
  }

  async create(input: Omit<WorkspaceRecord, 'createdAt' | 'lastActiveAt'>): Promise<WorkspaceRecord> {
    return this.prisma.$transaction(async (tx) => {
      const projects = await tx.$queryRaw<
        Array<{ organizationId: string; deletedAt: Date | null; permanentDeletionStartedAt: Date | null }>
      >`
        SELECT "organizationId", "deletedAt", "permanentDeletionStartedAt"
        FROM "Project"
        WHERE "id" = ${input.projectId}
        FOR SHARE
      `;
      const project = projects[0];
      if (
        !project ||
        project.organizationId !== input.orgId ||
        project.deletedAt !== null ||
        project.permanentDeletionStartedAt !== null
      ) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.frozen, { statusCode: 409 });
      }
      const now = await this.databaseNow(tx);
      const created = (await tx.workspaceRuntime.create({
        data: {
          id: input.id,
          orgId: input.orgId,
          projectId: input.projectId,
          plan: input.plan,
          status: input.status,
          pvcName: input.pvcName,
          podName: input.podName,
          serviceName: input.serviceName,
          agentTokenSecretName: input.agentTokenSecretName,
          error: input.error ?? null,
          purgeFrozen: input.purgeFrozen ?? false,
          purgePlanId: input.purgePlanId ?? null,
          purgeFenceToken: input.purgeFenceToken ?? null,
          purgeFrozenAt: input.purgeFrozenAt ? new Date(input.purgeFrozenAt) : null,
          createdAt: now,
          lastActiveAt: now,
        },
      })) as PrismaRuntimeRow;
      return rowToRecord(created);
    });
  }

  async update(workspaceId: string, patch: Partial<WorkspaceRecord>): Promise<WorkspaceRecord> {
    try {
      const updated = (await this.prisma.workspaceRuntime.update({
        where: { id: workspaceId },
        data: patchToData(patch),
      })) as PrismaRuntimeRow;
      return rowToRecord(updated);
    } catch (error) {
      // Prisma's P2025 surfaces as a typed error; surfacing the same string
      // the JSON store throws keeps all WorkspaceManager error paths uniform.
      // PRESERVE the P2025 code on the thrown error — WorkspaceManager.touch()
      // and the GC/offboarding concurrent-deletion handling branch on
      // err.code === 'P2025' to swallow the race; stripping it made touch() 500
      // and stop/delete non-idempotent.
      const code = (error as { code?: string } | null)?.code;
      if (code === 'P2025') {
        throw Object.assign(new Error('Workspace not found'), { code: 'P2025' });
      }
      throw error;
    }
  }

  async updateIfUnchanged(
    workspaceId: string,
    expected: Pick<WorkspaceRecord, 'status' | 'lastActiveAt'>,
    patch: Partial<WorkspaceRecord>,
  ): Promise<WorkspaceRecord | undefined> {
    /*
     * One conditional UPDATE ... RETURNING is the cross-replica linearization
     * point. A read-then-update here would reintroduce the stop/reopen race that
     * can persist STOPPED while the new Pod is already Running.
     */
    const rows = (await this.prisma.workspaceRuntime.updateManyAndReturn({
      where: {
        id: workspaceId,
        purgeFrozen: false,
        status: expected.status,
        lastActiveAt: new Date(expected.lastActiveAt),
      },
      data: patchToData(patch),
    })) as PrismaRuntimeRow[];

    return rows[0] ? rowToRecord(rows[0]) : undefined;
  }

  async claimMeterWindow(workspaceId: string, expected: string | undefined, next: string): Promise<boolean> {
    /*
     * Atomic compare-and-set across the two manager replicas: advance
     * lastMeteredAt to `next` only if it still equals the value we read. The DB
     * applies this as a single conditional UPDATE, so exactly one replica's
     * updateMany matches a row — that caller meters the window, the loser skips it.
     */
    const result = await this.prisma.workspaceRuntime.updateMany({
      where: { id: workspaceId, lastMeteredAt: expected ? new Date(expected) : null },
      data: { lastMeteredAt: new Date(next) },
    });

    return result.count === 1;
  }

  async executeProvisionEffect<T>(
    workspaceId: string,
    effect: (assertAuthority: () => Promise<void>) => Promise<T>,
  ): Promise<T> {
    const observed = await this.prisma.workspaceRuntime.findUnique({
      where: { id: workspaceId },
      select: {
        projectId: true,
        orgId: true,
        pvcName: true,
        podName: true,
        serviceName: true,
        agentTokenSecretName: true,
      },
    });
    if (!observed) {
      throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.frozen, { statusCode: 409 });
    }
    return this.withProjectProvisionBarrier(
      {
        projectId: observed.projectId,
        expectedOrganizationId: observed.orgId,
        descriptor: {
          action: 'WORKSPACE_PROVISION',
          resourceId: workspaceId,
          targets: workspaceRuntimeTargets(observed),
        },
      },
      async (assertAuthority) => {
        const workspace = await this.prisma.workspaceRuntime.findUnique({ where: { id: workspaceId } });
        if (
          !workspace ||
          workspace.purgeFrozen ||
          workspace.projectId !== observed.projectId ||
          workspace.orgId !== observed.orgId
        ) {
          throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.frozen, { statusCode: 409 });
        }
        await assertAuthority();
        return effect(assertAuthority);
      },
    );
  }

  executeProjectCsiProvisionEffect<T>(
    input: ProjectCsiProvisionEffectInput,
    effect: (assertAuthority: () => Promise<void>) => Promise<T>,
  ): Promise<T> {
    return this.withProjectProvisionBarrier(
      {
        projectId: input.projectId,
        expectedOrganizationId: input.expectedOrganizationId,
        descriptor: {
          action: input.action,
          resourceId: input.resourceId,
          targets: input.targets.map((target) => ({
            kind: 'PersistentVolumeClaim' as const,
            namespace: target.namespace,
            name: target.pvcName,
          })),
        },
      },
      effect,
    );
  }

  executeProjectProvisionEffect<T>(
    input: { projectId: string; expectedOrganizationId: string },
    effect: (assertAuthority: () => Promise<void>) => Promise<T>,
  ): Promise<T> {
    return this.withProjectProvisionBarrier(
      {
        ...input,
        descriptor: { action: 'PROJECT_RUNTIME_MUTATION', resourceId: input.projectId, targets: [] },
      },
      effect,
    );
  }

  async executeDeploymentProvisionEffect<T>(
    input: string | { deploymentId: string; projectId: string; expectedOrganizationId: string },
    effect: (assertAuthority: () => Promise<void>) => Promise<T>,
  ): Promise<T> {
    const deploymentId = typeof input === 'string' ? input : input.deploymentId;
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: { projectId: true, project: { select: { organizationId: true } } },
    });
    if (
      !deployment ||
      (typeof input !== 'string' &&
        (deployment.projectId !== input.projectId ||
          deployment.project.organizationId !== input.expectedOrganizationId))
    ) {
      throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.frozen, { statusCode: 409 });
    }
    return this.withProjectProvisionBarrier(
      {
        projectId: deployment.projectId,
        expectedOrganizationId: deployment.project.organizationId,
        descriptor: {
          action: 'DEPLOYMENT_RUNTIME_MUTATION',
          resourceId: deploymentId,
          targets: deploymentRuntimeTargets(deploymentId),
        },
      },
      async (assertAuthority) => {
        const current = await this.prisma.deployment.findUnique({
          where: { id: deploymentId },
          select: { projectId: true },
        });
        if (!current || current.projectId !== deployment.projectId) {
          throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.frozen, { statusCode: 409 });
        }
        await assertAuthority();
        return effect(assertAuthority);
      },
    );
  }

  async executeScheduledRunProvisionEffect<T>(
    input: { runId: string; projectId: string; expectedOrganizationId: string },
    effect: (assertAuthority: () => Promise<void>) => Promise<T>,
  ): Promise<T> {
    return this.withProjectProvisionBarrier(
      {
        projectId: input.projectId,
        expectedOrganizationId: input.expectedOrganizationId,
        descriptor: {
          action: 'SCHEDULED_RUN',
          resourceId: input.runId,
          targets: scheduledRunTargets(input.runId),
        },
      },
      async (assertAuthority) => {
        const run = await this.prisma.scheduledTaskRun.findUnique({
          where: { id: input.runId },
          select: { projectId: true, organizationId: true, status: true },
        });
        if (
          !run ||
          run.projectId !== input.projectId ||
          run.organizationId !== input.expectedOrganizationId ||
          run.status !== 'RUNNING'
        ) {
          throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.frozen, { statusCode: 409 });
        }
        await assertAuthority();
        return effect(assertAuthority);
      },
    );
  }

  private async lockLivePurgePlan(tx: Prisma.TransactionClient, lease: WorkspacePurgeLease): Promise<Date> {
    const rows = await tx.$queryRawUnsafe<Array<{ leaseExpiresAt: Date; databaseNow: Date; status: string }>>(
      `WITH target AS MATERIALIZED (
         SELECT id, status, "leaseExpiresAt" FROM "PurgePlan"
          WHERE id = $1 AND "ownerToken" = $2 FOR UPDATE
       ), lease_clock AS MATERIALIZED (
         SELECT date_trunc('milliseconds', clock_timestamp()) AS "databaseNow" FROM target
       )
       SELECT target.status, target."leaseExpiresAt", lease_clock."databaseNow"
         FROM target CROSS JOIN lease_clock`,
      lease.planId,
      lease.ownerToken,
    );
    const plan = rows[0];
    if (!plan || plan.status !== 'ACTIVE' || plan.leaseExpiresAt <= plan.databaseNow) {
      throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.leaseInvalid);
    }
    return plan.databaseNow;
  }

  async acquirePurgeFence(workspaceId: string, lease: WorkspacePurgeLease): Promise<WorkspaceRecord> {
    return this.prisma.$transaction(async (tx) => {
      const databaseNow = await this.lockLivePurgePlan(tx, lease);
      const existing = await tx.workspaceRuntime.findUnique({ where: { id: workspaceId } });
      if (
        existing?.purgeFrozen &&
        (existing.purgePlanId !== lease.planId || existing.purgeFenceToken !== lease.ownerToken)
      ) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.fenceOwned, { statusCode: 409 });
      }
      const row = existing
        ? await tx.workspaceRuntime.update({
            where: { id: workspaceId },
            data: {
              purgeFrozen: true,
              purgePlanId: lease.planId,
              purgeFenceToken: lease.ownerToken,
              purgeFrozenAt: databaseNow,
            },
          })
        : await tx.workspaceRuntime.create({
            data: {
              id: workspaceId,
              orgId: '',
              projectId: '',
              plan: 'free',
              status: 'STOPPED',
              pvcName: `pvc-${workspaceId}`,
              podName: `workspace-${workspaceId}`,
              serviceName: `workspace-${workspaceId}`,
              agentTokenSecretName: `agent-token-${workspaceId}`,
              purgeFrozen: true,
              purgePlanId: lease.planId,
              purgeFenceToken: lease.ownerToken,
              purgeFrozenAt: databaseNow,
              createdAt: databaseNow,
              lastActiveAt: databaseNow,
            },
          });
      return rowToRecord(row as PrismaRuntimeRow);
    });
  }

  async releasePurgeFence(workspaceId: string, lease: WorkspacePurgeLease): Promise<boolean> {
    const result = await this.prisma.workspaceRuntime.updateMany({
      where: {
        id: workspaceId,
        purgeFrozen: true,
        purgePlanId: lease.planId,
        purgeFenceToken: lease.ownerToken,
      },
      data: { purgeFrozen: false, purgePlanId: null, purgeFenceToken: null, purgeFrozenAt: null },
    });
    return result.count === 1;
  }

  async completePurgeState(
    workspaceId: string,
    lease: WorkspacePurgeLease,
    status: Extract<WorkspaceStatus, 'STOPPED' | 'DELETED'>,
  ): Promise<WorkspaceRecord> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockLivePurgePlan(tx, lease);
      const rows = await tx.workspaceRuntime.updateManyAndReturn({
        where: {
          id: workspaceId,
          purgeFrozen: true,
          purgePlanId: lease.planId,
          purgeFenceToken: lease.ownerToken,
        },
        data: { status, error: null },
      });
      const row = rows[0];
      if (!row) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.fenceLost);
      }
      return rowToRecord(row as PrismaRuntimeRow);
    });
  }

  async executePurgeEffect<T extends Record<string, unknown>>(
    workspaceId: string,
    lease: WorkspacePurgeLease,
    descriptor: WorkspacePurgeEffectDescriptor,
    effect: () => Promise<T>,
  ): Promise<{ executed: boolean; receipt: T }> {
    const outcome = await this.prisma.$transaction(
      async (tx) => {
        const startedAt = await this.lockLivePurgePlan(tx, lease);
        const workspace = await tx.workspaceRuntime.findUnique({ where: { id: workspaceId } });
        if (
          !workspace?.purgeFrozen ||
          workspace.purgePlanId !== lease.planId ||
          workspace.purgeFenceToken !== lease.ownerToken
        ) {
          throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.fenceLost);
        }

        const existing = await tx.purgeEffect.findUnique({
          where: { planId_effectKey: { planId: lease.planId, effectKey: descriptor.key } },
        });
        if (existing?.status === 'SUCCEEDED') {
          if (existing.resourceType !== descriptor.resourceType || existing.resourceId !== descriptor.resourceId) {
            throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.effectDescriptorMismatch);
          }
          if (!existing.receipt || typeof existing.receipt !== 'object' || Array.isArray(existing.receipt)) {
            throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.effectReceiptCorrupt);
          }
          return { ok: true as const, executed: false, receipt: existing.receipt as T };
        }

        await tx.purgeEffect.upsert({
          where: { planId_effectKey: { planId: lease.planId, effectKey: descriptor.key } },
          create: {
            planId: lease.planId,
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

        try {
          const receipt = await effect();
          const completedAt = await this.databaseNow(tx);
          await tx.purgeEffect.update({
            where: { planId_effectKey: { planId: lease.planId, effectKey: descriptor.key } },
            data: {
              status: 'SUCCEEDED',
              receipt: receipt as Prisma.InputJsonValue,
              lastErrorCode: null,
              completedAt,
            },
          });
          return { ok: true as const, executed: true, receipt };
        } catch (error) {
          const code = purgeErrorCode(error);
          const completedAt = await this.databaseNow(tx).catch(() => startedAt);
          await tx.purgeEffect.update({
            where: { planId_effectKey: { planId: lease.planId, effectKey: descriptor.key } },
            data: { status: 'FAILED', lastErrorCode: code, completedAt },
          });
          return { ok: false as const, code };
        }
      },
      { timeout: 180_000, maxWait: 20_000 },
    );

    if (!outcome.ok) throw Object.assign(new Error(outcome.code), { code: outcome.code });
    return { executed: outcome.executed, receipt: outcome.receipt };
  }

  private async lockLiveProjectDeletionOperation(
    tx: Prisma.TransactionClient,
    lease: WorkspaceProjectDeletionLease,
    allowedStatuses: readonly ('PREPARED' | 'EFFECT_STARTED' | 'VERIFYING')[],
  ): Promise<void> {
    if (!/^[1-9][0-9]{0,39}$/.test(lease.fencingToken) || allowedStatuses.length === 0) {
      throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectDeletionLeaseInvalid, {
        statusCode: 409,
      });
    }
    const rows = await tx.$queryRaw<Array<{ status: string; leaseExpiresAt: Date; databaseNow: Date }>>(Prisma.sql`
      WITH lease_clock AS MATERIALIZED (
        SELECT date_trunc('milliseconds', clock_timestamp()) AS "databaseNow"
      )
      SELECT operation."status"::text AS "status", operation."leaseExpiresAt", lease_clock."databaseNow"
      FROM "ObjectStorageOperation" operation
      JOIN "ObjectStorageOperationProjectScope" scope
        ON scope."operationId" = operation."id"
      CROSS JOIN lease_clock
      WHERE operation."id" = ${lease.operationId}
        AND operation."kind" = 'PROJECT_PERMANENT_DELETE'::"ObjectStorageOperationKind"
        AND operation."ownerToken" = ${lease.ownerToken}
        AND operation."fencingToken" = ${BigInt(lease.fencingToken)}
        AND operation."requestHash" = ${lease.requestHash}
        AND operation."scopeHash" = ${lease.scopeHash}
        AND scope."projectIdSnapshot" = ${lease.projectId}
        AND scope."expectedOrganizationId" = ${lease.expectedOrganizationId}
      FOR UPDATE OF operation
    `);
    const operation = rows[0];
    if (
      !operation ||
      !allowedStatuses.includes(operation.status as 'PREPARED' | 'EFFECT_STARTED' | 'VERIFYING') ||
      operation.leaseExpiresAt <= operation.databaseNow
    ) {
      throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectDeletionLeaseInvalid, {
        statusCode: 409,
      });
    }
  }

  private async readProjectVolumeErasurePlan(
    tx: Prisma.TransactionClient,
    operationId: string,
    lock: boolean,
  ): Promise<WorkspaceProjectVolumeErasurePlan | undefined> {
    const rows = lock
      ? await tx.$queryRaw<ProjectVolumeErasureRow[]>`
          SELECT "operationId", "projectIdSnapshot", "organizationId", "ownershipEpoch", "namespace",
                 "state"::text AS "state", "sourceSnapshot", "quiescenceSnapshot", "quiescenceHash",
                 "inventory", "evidence", "verificationFencingToken", "finalScanEvidence",
                 "finalScanFencingToken"
          FROM "ProjectVolumeErasure"
          WHERE "operationId" = ${operationId}
          FOR UPDATE
        `
      : await tx.$queryRaw<ProjectVolumeErasureRow[]>`
          SELECT "operationId", "projectIdSnapshot", "organizationId", "ownershipEpoch", "namespace",
                 "state"::text AS "state", "sourceSnapshot", "quiescenceSnapshot", "quiescenceHash",
                 "inventory", "evidence", "verificationFencingToken", "finalScanEvidence",
                 "finalScanFencingToken"
          FROM "ProjectVolumeErasure"
          WHERE "operationId" = ${operationId}
        `;
    if (!rows[0]) return undefined;
    const targets = await tx.$queryRaw<ProjectVolumeErasureTargetRow[]>`
      SELECT "ordinal", "namespace", "pvcName", "expectedPvcUid", "evidenceEntry", "verifiedFencingToken"
      FROM "ProjectVolumeErasureTarget"
      WHERE "operationId" = ${operationId}
      ORDER BY "ordinal"
      ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}
    `;
    return parseProjectVolumeErasurePlan(rows[0], targets);
  }

  private assertProjectVolumePlanScope(
    plan: WorkspaceProjectVolumeErasurePlan,
    lease: WorkspaceProjectDeletionLease,
  ): void {
    if (
      plan.operationId !== lease.operationId ||
      plan.projectId !== lease.projectId ||
      plan.organizationId !== lease.expectedOrganizationId
    ) {
      throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeErasureInvalid, {
        statusCode: 409,
      });
    }
  }

  async assertProjectDeletionLease(
    lease: WorkspaceProjectDeletionLease,
    allowedStatuses: readonly ('PREPARED' | 'EFFECT_STARTED' | 'VERIFYING')[],
  ): Promise<void> {
    await this.prisma.$transaction((tx) => this.lockLiveProjectDeletionOperation(tx, lease, allowedStatuses));
  }

  async acquireProjectDeletionFence(
    lease: WorkspaceProjectDeletionLease,
    allowedStatuses: readonly ('PREPARED' | 'EFFECT_STARTED' | 'VERIFYING')[],
  ): Promise<WorkspaceProjectDeletionInventory> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.lockLiveProjectDeletionOperation(tx, lease, allowedStatuses);
      const projects = await tx.$queryRaw<
        Array<{
          organizationId: string;
          permanentDeletionStartedAt: Date | null;
          persistentVolumeClaim: string | null;
          ownershipEpoch: number;
        }>
      >`
        SELECT "organizationId", "permanentDeletionStartedAt", "persistentVolumeClaim", "ownershipEpoch"
        FROM "Project"
        WHERE "id" = ${lease.projectId}
        FOR UPDATE
      `;
      const project = projects[0];
      if (
        !project ||
        project.organizationId !== lease.expectedOrganizationId ||
        project.permanentDeletionStartedAt === null
      ) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectDeletionScopeInvalid, {
          statusCode: 409,
        });
      }
      const runtimeEffectScopes = await tx.$queryRaw<Array<{ id: string; ownershipEpoch: number }>>`
        SELECT "id", "ownershipEpoch"
        FROM "ProjectRuntimeEffect"
        WHERE "projectId" = ${lease.projectId}
        ORDER BY "id"
        FOR UPDATE
      `;
      if (runtimeEffectScopes.some(({ ownershipEpoch }) => ownershipEpoch > project.ownershipEpoch)) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectDeletionScopeInvalid, {
          statusCode: 409,
        });
      }
      await tx.$executeRaw(Prisma.sql`
        UPDATE "ProjectRuntimeEffect"
        SET "state" = 'ABORTED'::"ProjectRuntimeEffectState",
            "ownerToken" = NULL,
            "leaseExpiresAt" = NULL,
            "lastErrorCode" = 'WORKSPACE_PROJECT_RUNTIME_EFFECT_NOT_DISPATCHED',
            "abortedAt" = clock_timestamp(),
            "updatedAt" = clock_timestamp()
        WHERE "projectId" = ${lease.projectId}
          AND "state" = 'PREPARED'::"ProjectRuntimeEffectState"
      `);
      const inFlight = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "ProjectRuntimeEffect"
        WHERE "projectId" = ${lease.projectId}
          AND "state" = 'IN_FLIGHT'::"ProjectRuntimeEffectState"
        ORDER BY "id"
      `;
      if (inFlight.length > 0) {
        return { kind: 'IN_FLIGHT' as const, effectIds: inFlight.map(({ id }) => id) };
      }
      await tx.$executeRaw(Prisma.sql`
        UPDATE "ProjectRuntimeEffect"
        SET "state" = 'DRAINING'::"ProjectRuntimeEffectState",
            "drainingAt" = COALESCE("drainingAt", clock_timestamp()),
            "updatedAt" = clock_timestamp()
        WHERE "projectId" = ${lease.projectId}
          AND "state" = 'SETTLED'::"ProjectRuntimeEffectState"
      `);
      await tx.$queryRaw`
        SELECT "id"
        FROM "WorkspaceRuntime"
        WHERE "projectId" = ${lease.projectId}
        ORDER BY "id"
        FOR UPDATE
      `;
      await tx.$queryRaw`
        SELECT "id"
        FROM "ScheduledTask"
        WHERE "projectId" = ${lease.projectId}
        ORDER BY "id"
        FOR UPDATE
      `;
      await tx.$queryRaw`
        SELECT "id"
        FROM "ScheduledTaskRun"
        WHERE "projectId" = ${lease.projectId}
        ORDER BY "id"
        FOR UPDATE
      `;
      const existing = await tx.workspaceRuntime.findMany({ where: { projectId: lease.projectId } });
      if (
        existing.some(
          (workspace) =>
            workspace.orgId !== lease.expectedOrganizationId ||
            /* Never steal an account-purge fence. A null-plan permanent-delete
             * fence is safely rebound only after the ObjectStorageOperation
             * itself has granted this exact newer owner/fencing token. */
            (workspace.purgeFrozen && workspace.purgePlanId !== null),
        )
      ) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectDeletionFenceLost, {
          statusCode: 409,
        });
      }
      await tx.workspaceRuntime.updateMany({
        where: { projectId: lease.projectId },
        data: {
          purgeFrozen: true,
          purgePlanId: null,
          purgeFenceToken: lease.ownerToken,
          purgeFrozenAt: await this.databaseNow(tx),
        },
      });
      const runtimeEffects = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "ProjectRuntimeEffect"
        WHERE "projectId" = ${lease.projectId}
          AND "state" IN (
            'DRAINING'::"ProjectRuntimeEffectState",
            'DRAINED'::"ProjectRuntimeEffectState"
          )
        ORDER BY "id"
      `;
      const runtimeEffectTargets = await tx.$queryRaw<
        Array<{ kind: string; namespace: string; name: string; expectedUid: string | null }>
      >`
        SELECT target."kind", target."namespace", target."name",
               COALESCE(evidence."pvcUid", target."expectedUid") AS "expectedUid"
        FROM "ProjectRuntimeEffectTarget" target
        JOIN "ProjectRuntimeEffect" effect ON effect.id = target."effectId"
        LEFT JOIN "ProjectRuntimeEffectVolumeEvidence" evidence
          ON evidence."effectId" = target."effectId" AND evidence."targetOrdinal" = target."ordinal"
        WHERE effect."projectId" = ${lease.projectId}
          AND effect."state" IN (
            'DRAINING'::"ProjectRuntimeEffectState",
            'DRAINED'::"ProjectRuntimeEffectState"
          )
        ORDER BY target."kind", target."namespace", target."name"
      `;
      return {
        kind: 'READY' as const,
        inventory: {
          workspaces: (await tx.workspaceRuntime.findMany({ where: { projectId: lease.projectId } })).map((row) =>
            rowToRecord(row as PrismaRuntimeRow),
          ),
          workspaceIds: (
            await tx.workspace.findMany({
              where: { projectId: lease.projectId },
              select: { id: true },
              orderBy: { id: 'asc' },
            })
          ).map(({ id }) => id),
          persistentVolumeClaims: project.persistentVolumeClaim ? [project.persistentVolumeClaim] : [],
          serverDeploymentIds: (
            await tx.deployment.findMany({
              where: { projectId: lease.projectId, provider: { not: 'static' } },
              select: { id: true },
              orderBy: { id: 'asc' },
            })
          ).map(({ id }) => id),
          scheduledRunIds: (
            await tx.scheduledTaskRun.findMany({
              where: { projectId: lease.projectId },
              select: { id: true },
              orderBy: { id: 'asc' },
            })
          ).map(({ id }) => id),
          runtimeEffectTargets: runtimeEffectTargets.map(parseRuntimeEffectTarget),
          runtimeEffectIds: runtimeEffects.map(({ id }) => id),
        },
      };
    });
    if (outcome.kind === 'IN_FLIGHT') {
      throw Object.assign(
        workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectRuntimeEffectInFlight, {
          statusCode: 409,
        }),
        { effectIds: outcome.effectIds },
      );
    }
    return outcome.inventory;
  }

  async loadProjectVolumeErasure(
    lease: WorkspaceProjectDeletionLease,
  ): Promise<WorkspaceProjectVolumeErasurePlan | undefined> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockLiveProjectDeletionOperation(tx, lease, ['EFFECT_STARTED', 'VERIFYING']);
      const plan = await this.readProjectVolumeErasurePlan(tx, lease.operationId, false);
      if (plan) this.assertProjectVolumePlanScope(plan, lease);
      return plan;
    });
  }

  async prepareProjectVolumeErasure(
    lease: WorkspaceProjectDeletionLease,
    namespace: string,
    candidates: readonly WorkspaceProjectVolumeCandidate[],
  ): Promise<WorkspaceProjectVolumeErasurePlan> {
    const byIdentity = new Map<string, WorkspaceProjectVolumeCandidate>();
    for (const candidate of candidates) {
      const key = `${candidate.namespace}/${candidate.pvcName}`;
      const existing = byIdentity.get(key);
      if (
        existing?.expectedPvcUid &&
        candidate.expectedPvcUid &&
        existing.expectedPvcUid !== candidate.expectedPvcUid
      ) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeErasureInvalid, {
          statusCode: 409,
        });
      }
      byIdentity.set(key, {
        namespace: candidate.namespace,
        pvcName: candidate.pvcName,
        ...(existing?.expectedPvcUid || candidate.expectedPvcUid
          ? { expectedPvcUid: existing?.expectedPvcUid ?? candidate.expectedPvcUid! }
          : {}),
      });
    }
    const normalized = [...byIdentity.values()].sort(
      (left, right) => left.namespace.localeCompare(right.namespace) || left.pvcName.localeCompare(right.pvcName),
    );
    if (
      !VOLUME_KUBERNETES_NAME_RE.test(namespace) ||
      normalized.some(
        (candidate) =>
          !VOLUME_KUBERNETES_NAME_RE.test(candidate.namespace) ||
          !VOLUME_KUBERNETES_NAME_RE.test(candidate.pvcName) ||
          (candidate.expectedPvcUid !== undefined && !VOLUME_UID_RE.test(candidate.expectedPvcUid)),
      )
    ) {
      throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeErasureInvalid, {
        statusCode: 400,
      });
    }
    return this.prisma.$transaction(async (tx) => {
      await this.lockLiveProjectDeletionOperation(tx, lease, ['EFFECT_STARTED', 'VERIFYING']);
      const projects = await tx.$queryRaw<
        Array<{ organizationId: string; ownershipEpoch: number; permanentDeletionStartedAt: Date | null }>
      >`
        SELECT "organizationId", "ownershipEpoch", "permanentDeletionStartedAt"
        FROM "Project"
        WHERE "id" = ${lease.projectId}
        FOR UPDATE
      `;
      const project = projects[0];
      if (
        !project ||
        project.organizationId !== lease.expectedOrganizationId ||
        project.permanentDeletionStartedAt === null
      ) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectDeletionScopeInvalid, {
          statusCode: 409,
        });
      }

      const csiProducerRows = await tx.$queryRaw<
        Array<{
          effectId: string;
          state: string;
          ownershipEpoch: number;
          targetOrdinal: number;
          namespace: string;
          pvcName: string;
          evidenceHash: string | null;
        }>
      >`
        SELECT effect."id" AS "effectId", effect."state"::text AS "state", effect."ownershipEpoch",
               target."ordinal" AS "targetOrdinal", target."namespace", target."name" AS "pvcName",
               evidence."evidenceHash"
        FROM "ProjectRuntimeEffect" effect
        JOIN "ProjectRuntimeEffectTarget" target ON target."effectId" = effect."id"
        LEFT JOIN "ProjectRuntimeEffectVolumeEvidence" evidence
          ON evidence."effectId" = target."effectId" AND evidence."targetOrdinal" = target."ordinal"
        WHERE effect."projectId" = ${lease.projectId}
          AND target."kind" = 'PersistentVolumeClaim'
          AND effect."state" <> 'ABORTED'::"ProjectRuntimeEffectState"
        ORDER BY effect."id", target."ordinal"
        FOR SHARE OF effect, target
      `;
      if (
        csiProducerRows.some(
          (row) =>
            !['DRAINING', 'DRAINED'].includes(row.state) ||
            row.ownershipEpoch !== project.ownershipEpoch ||
            !row.evidenceHash,
        )
      ) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeQuiescenceUnavailable, {
          statusCode: 409,
        });
      }
      const quiescenceSnapshot: ProjectVolumeCreationQuiescenceSnapshot = {
        schemaVersion: 1,
        projectId: lease.projectId,
        organizationId: lease.expectedOrganizationId,
        ownershipEpoch: project.ownershipEpoch,
        effects: csiProducerRows.map((row) => ({
          effectId: row.effectId,
          targetOrdinal: row.targetOrdinal,
          namespace: row.namespace,
          pvcName: row.pvcName,
          evidenceHash: row.evidenceHash!,
        })),
      };
      const quiescenceHash = hashProjectVolumeEvidence(quiescenceSnapshot);

      const existing = await this.readProjectVolumeErasurePlan(tx, lease.operationId, true);
      if (existing) {
        this.assertProjectVolumePlanScope(existing, lease);
        if (
          existing.namespace !== namespace ||
          existing.ownershipEpoch !== project.ownershipEpoch ||
          existing.quiescenceHash !== quiescenceHash
        ) {
          throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeErasureInvalid, {
            statusCode: 409,
          });
        }
        return existing;
      }

      const candidateJson = JSON.stringify(normalized);
      const referenceRows = await tx.$queryRaw<
        Array<{
          referenceId: string;
          sourceKind: ProjectVolumeSourceReference['sourceKind'];
          organizationId: string;
          projectId: string;
          namespace: string;
          pvcName: string;
          expectedPvcUid: string | null;
          expectedPvUid: string | null;
          expectedCsiDriver: string | null;
          expectedCsiVolumeHandle: string | null;
          expectedProviderResourceId: string | null;
          allowLegacyUnlabelled: boolean;
        }>
      >(Prisma.sql`
        WITH candidates AS MATERIALIZED (
          SELECT candidate."namespace", candidate."pvcName"
          FROM jsonb_to_recordset(CAST(${candidateJson} AS jsonb))
            AS candidate("namespace" text, "pvcName" text)
        )
        SELECT 'workspace-runtime:' || runtime."id" AS "referenceId",
               'workspace-runtime' AS "sourceKind", runtime."orgId" AS "organizationId",
               runtime."projectId", candidate."namespace", runtime."pvcName", NULL::text AS "expectedPvcUid",
               NULL::text AS "expectedPvUid", NULL::text AS "expectedCsiDriver",
               NULL::text AS "expectedCsiVolumeHandle", NULL::text AS "expectedProviderResourceId",
               TRUE AS "allowLegacyUnlabelled"
        FROM "WorkspaceRuntime" runtime
        JOIN candidates candidate ON candidate."pvcName" = runtime."pvcName" AND candidate."namespace" = ${namespace}
        UNION ALL
        SELECT 'project-pvc:' || project."id", 'project-persistent-volume', project."organizationId",
               project."id", candidate."namespace", project."persistentVolumeClaim", NULL::text,
               NULL::text, NULL::text, NULL::text, NULL::text, TRUE
        FROM "Project" project
        JOIN candidates candidate
          ON candidate."pvcName" = project."persistentVolumeClaim" AND candidate."namespace" = ${namespace}
        UNION ALL
        SELECT 'deployment-pvc:' || deployment."id", 'reserved-vm', project."organizationId",
               project."id", candidate."namespace", deployment."persistentStorageClaim", NULL::text,
               NULL::text, NULL::text, NULL::text, NULL::text, TRUE
        FROM "Deployment" deployment
        JOIN "Project" project ON project."id" = deployment."projectId"
        JOIN candidates candidate
          ON candidate."pvcName" = deployment."persistentStorageClaim" AND candidate."namespace" = ${namespace}
        UNION ALL
        SELECT 'runtime-effect:' || target."effectId" || ':' || target."ordinal"::text,
               'runtime-effect-target', effect."organizationId", effect."projectId", target."namespace",
               target."name", evidence."pvcUid", evidence."pvUid", evidence."csiDriver",
               evidence."csiVolumeHandle", evidence."providerResourceId", evidence."pvcUid" IS NOT NULL
        FROM "ProjectRuntimeEffectTarget" target
        JOIN "ProjectRuntimeEffect" effect ON effect."id" = target."effectId"
        LEFT JOIN "ProjectRuntimeEffectVolumeEvidence" evidence
          ON evidence."effectId" = target."effectId" AND evidence."targetOrdinal" = target."ordinal"
        JOIN candidates candidate
          ON candidate."namespace" = target."namespace" AND candidate."pvcName" = target."name"
        WHERE target."kind" = 'PersistentVolumeClaim'
          AND effect."state" IN (
            'PREPARED'::"ProjectRuntimeEffectState", 'IN_FLIGHT'::"ProjectRuntimeEffectState",
            'SETTLED'::"ProjectRuntimeEffectState", 'DRAINING'::"ProjectRuntimeEffectState",
            'DRAINED'::"ProjectRuntimeEffectState"
          )
        ORDER BY "referenceId"
      `);
      const references: ProjectVolumeSourceReference[] = referenceRows.map((row) => ({
        referenceId: row.referenceId,
        sourceKind: row.sourceKind,
        organizationId: row.organizationId,
        projectId: row.projectId,
        namespace: row.namespace,
        pvcName: row.pvcName,
        ...(row.expectedPvcUid ? { expectedPvcUid: row.expectedPvcUid } : {}),
        ...(row.expectedPvUid ? { expectedPvUid: row.expectedPvUid } : {}),
        ...(row.expectedCsiDriver ? { expectedCsiDriver: row.expectedCsiDriver } : {}),
        ...(row.expectedCsiVolumeHandle ? { expectedCsiVolumeHandle: row.expectedCsiVolumeHandle } : {}),
        ...(row.expectedProviderResourceId ? { expectedProviderResourceId: row.expectedProviderResourceId } : {}),
        ...(row.allowLegacyUnlabelled ? { allowLegacyUnlabelled: true } : {}),
      }));
      const sourceSnapshot: CompleteProjectVolumeReferenceSnapshot = {
        snapshotId: lease.operationId,
        completeness: 'all-active-references-for-candidate-claims',
        candidates: normalized.map((candidate) => ({ ...candidate })),
        references,
      };
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ProjectVolumeErasure" (
          "operationId", "projectIdSnapshot", "organizationId", "ownershipEpoch", "namespace",
          "state", "sourceSnapshot", "quiescenceSnapshot", "quiescenceHash", "updatedAt"
        ) VALUES (
          ${lease.operationId}, ${lease.projectId}, ${lease.expectedOrganizationId}, ${project.ownershipEpoch},
          ${namespace}, 'PREPARED'::"ProjectVolumeErasureState", CAST(${JSON.stringify(sourceSnapshot)} AS jsonb),
          CAST(${JSON.stringify(quiescenceSnapshot)} AS jsonb), ${quiescenceHash}, clock_timestamp()
        )
      `);
      for (const [ordinal, candidate] of normalized.entries()) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "ProjectVolumeErasureTarget" (
            "operationId", "ordinal", "namespace", "pvcName", "expectedPvcUid", "updatedAt"
          ) VALUES (
            ${lease.operationId}, ${ordinal}, ${candidate.namespace}, ${candidate.pvcName},
            ${candidate.expectedPvcUid ?? null}, clock_timestamp()
          )
        `);
      }
      const result = await this.readProjectVolumeErasurePlan(tx, lease.operationId, true);
      if (!result) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeErasureInvalid, {
          statusCode: 500,
        });
      }
      return result;
    });
  }

  async recordProjectVolumeInventory(
    lease: WorkspaceProjectDeletionLease,
    inventory: ProjectVolumeErasureInventory,
  ): Promise<WorkspaceProjectVolumeErasurePlan> {
    assertProjectVolumeErasureInventory(inventory);
    return this.prisma.$transaction(async (tx) => {
      await this.lockLiveProjectDeletionOperation(tx, lease, ['EFFECT_STARTED', 'VERIFYING']);
      const plan = await this.readProjectVolumeErasurePlan(tx, lease.operationId, true);
      if (!plan) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeErasureRequired, {
          statusCode: 409,
        });
      }
      this.assertProjectVolumePlanScope(plan, lease);
      if (
        inventory.scope.projectId !== lease.projectId ||
        inventory.scope.organizationId !== lease.expectedOrganizationId ||
        inventory.entries.length !== plan.targets.length ||
        inventory.entries.some((entry, ordinal) => {
          const target = plan.targets[ordinal];
          return !target || target.namespace !== entry.namespace || target.pvcName !== entry.pvcName;
        })
      ) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeErasureInvalid, {
          statusCode: 409,
        });
      }
      if (plan.inventory) {
        if (plan.inventory.inventoryHash !== inventory.inventoryHash) {
          throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeErasureInvalid, {
            statusCode: 409,
          });
        }
        return plan;
      }
      for (const [ordinal, entry] of inventory.entries.entries()) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "ProjectVolumeErasureTarget"
          SET "inventoryEntry" = CAST(${JSON.stringify(entry)} AS jsonb), "updatedAt" = clock_timestamp()
          WHERE "operationId" = ${lease.operationId} AND "ordinal" = ${ordinal}
        `);
      }
      await tx.$executeRaw(Prisma.sql`
        UPDATE "ProjectVolumeErasure"
        SET "state" = 'INVENTORIED'::"ProjectVolumeErasureState",
            "inventory" = CAST(${JSON.stringify(inventory)} AS jsonb),
            "inventoryHash" = ${inventory.inventoryHash}, "inventoriedAt" = clock_timestamp(),
            "updatedAt" = clock_timestamp()
        WHERE "operationId" = ${lease.operationId} AND "state" = 'PREPARED'::"ProjectVolumeErasureState"
      `);
      return (await this.readProjectVolumeErasurePlan(tx, lease.operationId, true))!;
    });
  }

  async markProjectVolumeErasing(lease: WorkspaceProjectDeletionLease): Promise<WorkspaceProjectVolumeErasurePlan> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockLiveProjectDeletionOperation(tx, lease, ['EFFECT_STARTED', 'VERIFYING']);
      const plan = await this.readProjectVolumeErasurePlan(tx, lease.operationId, true);
      if (!plan?.inventory) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeErasureRequired, {
          statusCode: 409,
        });
      }
      this.assertProjectVolumePlanScope(plan, lease);
      if (plan.state === 'INVENTORIED') {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "ProjectVolumeErasure"
          SET "state" = 'ERASING'::"ProjectVolumeErasureState", "erasingAt" = clock_timestamp(),
              "updatedAt" = clock_timestamp()
          WHERE "operationId" = ${lease.operationId}
        `);
      }
      return (await this.readProjectVolumeErasurePlan(tx, lease.operationId, true))!;
    });
  }

  async recordProjectVolumeEntryEvidence(
    lease: WorkspaceProjectDeletionLease,
    ordinal: number,
    evidence: ProjectVolumeErasureEntryEvidence,
  ): Promise<WorkspaceProjectVolumeErasurePlan> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockLiveProjectDeletionOperation(tx, lease, ['EFFECT_STARTED', 'VERIFYING']);
      const plan = await this.readProjectVolumeErasurePlan(tx, lease.operationId, true);
      if (!plan?.inventory || !['ERASING', 'VERIFIED'].includes(plan.state)) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeErasureRequired, {
          statusCode: 409,
        });
      }
      this.assertProjectVolumePlanScope(plan, lease);
      const entry = plan.inventory.entries[ordinal];
      if (
        !entry ||
        evidence.namespace !== entry.namespace ||
        evidence.pvcName !== entry.pvcName ||
        evidence.disposition !== entry.disposition ||
        !evidence.pvcAbsent ||
        !evidence.pvAbsent ||
        !evidence.providerAbsent
      ) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeErasureInvalid, {
          statusCode: 409,
        });
      }
      const token = BigInt(lease.fencingToken);
      const current = plan.targets[ordinal];
      if (current?.verifiedFencingToken && BigInt(current.verifiedFencingToken) > token) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeErasureFenceLost, {
          statusCode: 409,
        });
      }
      await tx.$executeRaw(Prisma.sql`
        UPDATE "ProjectVolumeErasureTarget"
        SET "evidenceEntry" = CAST(${JSON.stringify(evidence)} AS jsonb),
            "verifiedFencingToken" = ${token}, "verifiedAt" = clock_timestamp(),
            "updatedAt" = clock_timestamp()
        WHERE "operationId" = ${lease.operationId} AND "ordinal" = ${ordinal}
          AND ("verifiedFencingToken" IS NULL OR "verifiedFencingToken" <= ${token})
      `);
      return (await this.readProjectVolumeErasurePlan(tx, lease.operationId, true))!;
    });
  }

  async completeProjectVolumeErasure(
    lease: WorkspaceProjectDeletionLease,
    evidence: ProjectVolumeErasureEvidence,
  ): Promise<WorkspaceProjectVolumeErasurePlan> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockLiveProjectDeletionOperation(tx, lease, ['EFFECT_STARTED', 'VERIFYING']);
      const plan = await this.readProjectVolumeErasurePlan(tx, lease.operationId, true);
      if (!plan?.inventory || !['ERASING', 'VERIFIED'].includes(plan.state)) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeErasureRequired, {
          statusCode: 409,
        });
      }
      this.assertProjectVolumePlanScope(plan, lease);
      const token = lease.fencingToken;
      if (
        evidence.inventoryHash !== plan.inventory.inventoryHash ||
        evidence.entries.length !== plan.targets.length ||
        plan.targets.some(
          (target, ordinal) =>
            target.verifiedFencingToken !== token ||
            JSON.stringify(target.evidence) !== JSON.stringify(evidence.entries[ordinal]),
        )
      ) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeErasureInvalid, {
          statusCode: 409,
        });
      }
      await tx.$executeRaw(Prisma.sql`
        UPDATE "ProjectVolumeErasure"
        SET "state" = 'VERIFIED'::"ProjectVolumeErasureState",
            "evidence" = CAST(${JSON.stringify(evidence)} AS jsonb),
            "verificationHash" = ${evidence.verificationHash},
            "verificationFencingToken" = ${BigInt(token)}, "verifiedAt" = clock_timestamp(),
            "updatedAt" = clock_timestamp()
        WHERE "operationId" = ${lease.operationId}
      `);
      return (await this.readProjectVolumeErasurePlan(tx, lease.operationId, true))!;
    });
  }

  async assertProjectVolumeCreationQuiescence(
    lease: WorkspaceProjectDeletionLease,
    expectedHash: string,
  ): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
      throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeQuiescenceUnavailable, {
        statusCode: 409,
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await this.lockLiveProjectDeletionOperation(tx, lease, ['EFFECT_STARTED', 'VERIFYING']);
      const roots = await tx.$queryRaw<Array<{ quiescenceHash: string | null; ownershipEpoch: number }>>`
        SELECT root."quiescenceHash", root."ownershipEpoch"
        FROM "ProjectVolumeErasure" root
        JOIN "Project" project ON project."id" = root."projectIdSnapshot"
        WHERE root."operationId" = ${lease.operationId}
          AND root."projectIdSnapshot" = ${lease.projectId}
          AND root."organizationId" = ${lease.expectedOrganizationId}
          AND project."permanentDeletionStartedAt" IS NOT NULL
        FOR SHARE OF root, project
      `;
      const root = roots[0];
      if (!root || root.quiescenceHash !== expectedHash) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeQuiescenceUnavailable, {
          statusCode: 409,
        });
      }
      const rows = await tx.$queryRaw<
        Array<{
          effectId: string;
          state: string;
          ownershipEpoch: number;
          targetOrdinal: number;
          namespace: string;
          pvcName: string;
          evidenceHash: string | null;
        }>
      >`
        SELECT effect."id" AS "effectId", effect."state"::text AS "state", effect."ownershipEpoch",
               target."ordinal" AS "targetOrdinal", target."namespace", target."name" AS "pvcName",
               evidence."evidenceHash"
        FROM "ProjectRuntimeEffect" effect
        JOIN "ProjectRuntimeEffectTarget" target ON target."effectId" = effect."id"
        LEFT JOIN "ProjectRuntimeEffectVolumeEvidence" evidence
          ON evidence."effectId" = target."effectId" AND evidence."targetOrdinal" = target."ordinal"
        WHERE effect."projectId" = ${lease.projectId}
          AND target."kind" = 'PersistentVolumeClaim'
          AND effect."state" <> 'ABORTED'::"ProjectRuntimeEffectState"
        ORDER BY effect."id", target."ordinal"
        FOR SHARE OF effect, target
      `;
      if (
        rows.some(
          (row) =>
            !['DRAINING', 'DRAINED'].includes(row.state) ||
            row.ownershipEpoch !== root.ownershipEpoch ||
            !row.evidenceHash,
        )
      ) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeQuiescenceUnavailable, {
          statusCode: 409,
        });
      }
      const snapshot: ProjectVolumeCreationQuiescenceSnapshot = {
        schemaVersion: 1,
        projectId: lease.projectId,
        organizationId: lease.expectedOrganizationId,
        ownershipEpoch: root.ownershipEpoch,
        effects: rows.map((row) => ({
          effectId: row.effectId,
          targetOrdinal: row.targetOrdinal,
          namespace: row.namespace,
          pvcName: row.pvcName,
          evidenceHash: row.evidenceHash!,
        })),
      };
      if (hashProjectVolumeEvidence(snapshot) !== expectedHash) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeQuiescenceUnavailable, {
          statusCode: 409,
        });
      }
    });
  }

  async recordProjectVolumeFinalScan(
    lease: WorkspaceProjectDeletionLease,
    evidence: ProjectVolumeErasureFinalScanEvidence,
  ): Promise<WorkspaceProjectVolumeErasurePlan> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockLiveProjectDeletionOperation(tx, lease, ['EFFECT_STARTED', 'VERIFYING']);
      const plan = await this.readProjectVolumeErasurePlan(tx, lease.operationId, true);
      if (
        !plan?.inventory ||
        !plan.evidence ||
        plan.state !== 'VERIFIED' ||
        evidence.inventoryHash !== plan.inventory.inventoryHash ||
        evidence.quiescenceHash !== plan.quiescenceHash ||
        !/^[a-f0-9]{64}$/.test(evidence.finalScanHash)
      ) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeErasureInvalid, {
          statusCode: 409,
        });
      }
      const token = BigInt(lease.fencingToken);
      if (plan.finalScanFencingToken && BigInt(plan.finalScanFencingToken) > token) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeErasureFenceLost, {
          statusCode: 409,
        });
      }
      await tx.$executeRaw(Prisma.sql`
        UPDATE "ProjectVolumeErasure"
        SET "finalScanEvidence" = CAST(${JSON.stringify(evidence)} AS jsonb),
            "finalScanHash" = ${evidence.finalScanHash}, "finalScanFencingToken" = ${token},
            "finalScannedAt" = clock_timestamp(), "updatedAt" = clock_timestamp()
        WHERE "operationId" = ${lease.operationId}
          AND ("finalScanFencingToken" IS NULL OR "finalScanFencingToken" <= ${token})
      `);
      return (await this.readProjectVolumeErasurePlan(tx, lease.operationId, true))!;
    });
  }

  async completeProjectDeletion(lease: WorkspaceProjectDeletionLease): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockLiveProjectDeletionOperation(tx, lease, ['EFFECT_STARTED', 'VERIFYING']);
      const projects = await tx.$queryRaw<Array<{ id: string; ownershipEpoch: number }>>`
        SELECT "id", "ownershipEpoch"
        FROM "Project"
        WHERE "id" = ${lease.projectId}
          AND "organizationId" = ${lease.expectedOrganizationId}
          AND "permanentDeletionStartedAt" IS NOT NULL
        FOR UPDATE
      `;
      if (!projects[0]) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectDeletionScopeInvalid, {
          statusCode: 409,
        });
      }
      const volumePlan = await this.readProjectVolumeErasurePlan(tx, lease.operationId, true);
      if (
        !volumePlan ||
        volumePlan.projectId !== lease.projectId ||
        volumePlan.organizationId !== lease.expectedOrganizationId ||
        volumePlan.ownershipEpoch !== projects[0].ownershipEpoch ||
        volumePlan.state !== 'VERIFIED' ||
        !volumePlan.inventory ||
        !volumePlan.evidence ||
        !volumePlan.finalScanEvidence ||
        volumePlan.verificationFencingToken !== lease.fencingToken ||
        volumePlan.finalScanFencingToken !== lease.fencingToken ||
        volumePlan.finalScanEvidence.inventoryHash !== volumePlan.inventory.inventoryHash ||
        volumePlan.finalScanEvidence.quiescenceHash !== volumePlan.quiescenceHash ||
        volumePlan.targets.some(
          (target) =>
            target.verifiedFencingToken !== lease.fencingToken ||
            !target.evidence?.pvcAbsent ||
            !target.evidence.pvAbsent ||
            !target.evidence.providerAbsent ||
            target.evidence.disposition === 'excluded-shared',
        )
      ) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectVolumeErasureRequired, {
          statusCode: 409,
        });
      }
      await tx.$queryRaw`
        SELECT "id"
        FROM "WorkspaceRuntime"
        WHERE "projectId" = ${lease.projectId}
        ORDER BY "id"
        FOR UPDATE
      `;
      const rows = await tx.workspaceRuntime.findMany({ where: { projectId: lease.projectId } });
      if (
        rows.some(
          (workspace) =>
            workspace.orgId !== lease.expectedOrganizationId ||
            !workspace.purgeFrozen ||
            workspace.purgePlanId !== null ||
            workspace.purgeFenceToken !== lease.ownerToken,
        )
      ) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectDeletionFenceLost, {
          statusCode: 409,
        });
      }
      const nonDrainable = await tx.$queryRaw<Array<{ id: string; state: string }>>`
        SELECT "id", "state"::text AS "state"
        FROM "ProjectRuntimeEffect"
        WHERE "projectId" = ${lease.projectId}
          AND "state" IN (
            'PREPARED'::"ProjectRuntimeEffectState",
            'IN_FLIGHT'::"ProjectRuntimeEffectState",
            'SETTLED'::"ProjectRuntimeEffectState"
          )
        ORDER BY "id"
        FOR UPDATE
      `;
      if (nonDrainable.length > 0) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectRuntimeEffectInFlight, {
          statusCode: 409,
        });
      }
      const advanced = await tx.$executeRaw(Prisma.sql`
        UPDATE "ProjectRuntimeEffect"
        SET "state" = 'DRAINED'::"ProjectRuntimeEffectState",
            "drainedAt" = clock_timestamp(),
            "updatedAt" = clock_timestamp()
        WHERE "projectId" = ${lease.projectId}
          AND "state" = 'DRAINING'::"ProjectRuntimeEffectState"
      `);
      /* Runtime rows and scheduled tasks are the crash-recovery inventory for
       * exact Pod/Secret names. Keep them until the API's final transaction
       * has accepted the physical proof; that transaction deletes them and the
       * Project atomically with the permanent receipt. */
      return advanced;
    });
  }

  async inspectProjectDeletionState(lease: WorkspaceProjectDeletionLease): Promise<WorkspaceProjectDeletionState> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockLiveProjectDeletionOperation(tx, lease, ['EFFECT_STARTED', 'VERIFYING']);
      const projects = await tx.$queryRaw<
        Array<{
          organizationId: string;
          permanentDeletionStartedAt: Date | null;
          persistentVolumeClaim: string | null;
        }>
      >`
        SELECT "organizationId", "permanentDeletionStartedAt", "persistentVolumeClaim"
        FROM "Project"
        WHERE "id" = ${lease.projectId}
        FOR SHARE
      `;
      const project = projects[0];
      if (
        !project ||
        project.organizationId !== lease.expectedOrganizationId ||
        project.permanentDeletionStartedAt === null
      ) {
        throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.projectDeletionScopeInvalid, {
          statusCode: 409,
        });
      }
      const runtimeEffects = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "ProjectRuntimeEffect"
        WHERE "projectId" = ${lease.projectId}
          AND "state" IN (
            'DRAINING'::"ProjectRuntimeEffectState",
            'DRAINED'::"ProjectRuntimeEffectState"
          )
        ORDER BY "id"
      `;
      const runtimeEffectTargets = await tx.$queryRaw<
        Array<{ kind: string; namespace: string; name: string; expectedUid: string | null }>
      >`
        SELECT target."kind", target."namespace", target."name",
               COALESCE(evidence."pvcUid", target."expectedUid") AS "expectedUid"
        FROM "ProjectRuntimeEffectTarget" target
        JOIN "ProjectRuntimeEffect" effect ON effect.id = target."effectId"
        LEFT JOIN "ProjectRuntimeEffectVolumeEvidence" evidence
          ON evidence."effectId" = target."effectId" AND evidence."targetOrdinal" = target."ordinal"
        WHERE effect."projectId" = ${lease.projectId}
          AND effect."state" IN (
            'DRAINING'::"ProjectRuntimeEffectState",
            'DRAINED'::"ProjectRuntimeEffectState"
          )
        ORDER BY target."kind", target."namespace", target."name"
      `;
      const runtimeEffectState = await tx.$queryRaw<Array<{ drained: boolean }>>`
        SELECT NOT EXISTS (
          SELECT 1
          FROM "ProjectRuntimeEffect"
          WHERE "projectId" = ${lease.projectId}
            AND "state" NOT IN (
              'DRAINED'::"ProjectRuntimeEffectState",
              'ABORTED'::"ProjectRuntimeEffectState"
            )
        ) AS "drained"
      `;
      return {
        runtimeCount: await tx.workspaceRuntime.count({ where: { projectId: lease.projectId } }),
        runtimeEffectsDrained: runtimeEffectState[0]?.drained === true,
        workspaceIds: (
          await tx.workspace.findMany({
            where: { projectId: lease.projectId },
            select: { id: true },
            orderBy: { id: 'asc' },
          })
        ).map(({ id }) => id),
        persistentVolumeClaims: project.persistentVolumeClaim ? [project.persistentVolumeClaim] : [],
        serverDeploymentIds: (
          await tx.deployment.findMany({
            where: { projectId: lease.projectId, provider: { not: 'static' } },
            select: { id: true },
            orderBy: { id: 'asc' },
          })
        ).map(({ id }) => id),
        scheduledRunIds: (
          await tx.scheduledTaskRun.findMany({
            where: { projectId: lease.projectId },
            select: { id: true },
            orderBy: { id: 'asc' },
          })
        ).map(({ id }) => id),
        runtimeEffectTargets: runtimeEffectTargets.map(parseRuntimeEffectTarget),
        runtimeEffectIds: runtimeEffects.map(({ id }) => id),
      };
    });
  }

  async reconcilePurgeFences(take = 500): Promise<{ scanned: number; reconciled: number; workspaceIds: string[] }> {
    const candidates = await this.prisma.workspaceRuntime.findMany({
      where: { purgeFrozen: true },
      select: { id: true, purgePlanId: true, purgeFenceToken: true },
      take: Math.max(1, Math.min(take, 500)),
      orderBy: { purgeFrozenAt: 'asc' },
    });
    const workspaceIds: string[] = [];

    for (const candidate of candidates) {
      const released = await this.prisma.$transaction(async (tx) => {
        let live = false;
        if (candidate.purgePlanId && candidate.purgeFenceToken) {
          const rows = await tx.$queryRawUnsafe<Array<{ live: boolean }>>(
            `WITH target AS MATERIALIZED (
               SELECT status, "leaseExpiresAt" FROM "PurgePlan"
                WHERE id = $1 AND "ownerToken" = $2 FOR UPDATE
             ), lease_clock AS MATERIALIZED (
               SELECT date_trunc('milliseconds', clock_timestamp()) AS ts FROM target
             )
             SELECT target.status = 'ACTIVE' AND target."leaseExpiresAt" > lease_clock.ts AS live
               FROM target CROSS JOIN lease_clock`,
            candidate.purgePlanId,
            candidate.purgeFenceToken,
          );
          live = rows[0]?.live === true;
        } else if (candidate.purgeFenceToken) {
          const rows = await tx.$queryRaw<Array<{ live: boolean }>>`
            WITH target AS MATERIALIZED (
              SELECT "status", "leaseExpiresAt"
              FROM "ObjectStorageOperation"
              WHERE "kind" = 'PROJECT_PERMANENT_DELETE'::"ObjectStorageOperationKind"
                AND "ownerToken" = ${candidate.purgeFenceToken}
              FOR UPDATE
            ), lease_clock AS MATERIALIZED (
              SELECT date_trunc('milliseconds', clock_timestamp()) AS ts FROM target
            )
            SELECT target."status" IN (
                     'EFFECT_STARTED'::"ObjectStorageOperationStatus",
                     'VERIFYING'::"ObjectStorageOperationStatus"
                   )
                   AND target."leaseExpiresAt" > lease_clock.ts AS live
            FROM target CROSS JOIN lease_clock
          `;
          live = rows[0]?.live === true;
        }
        if (live) return false;
        const result = await tx.workspaceRuntime.updateMany({
          where: {
            id: candidate.id,
            purgeFrozen: true,
            purgePlanId: candidate.purgePlanId,
            purgeFenceToken: candidate.purgeFenceToken,
          },
          data: { purgeFrozen: false, purgePlanId: null, purgeFenceToken: null, purgeFrozenAt: null },
        });
        return result.count === 1;
      });
      if (released) workspaceIds.push(candidate.id);
    }

    return { scanned: candidates.length, reconciled: workspaceIds.length, workspaceIds };
  }

  async get(workspaceId: string): Promise<WorkspaceRecord | undefined> {
    const row = (await this.prisma.workspaceRuntime.findUnique({
      where: { id: workspaceId },
    })) as PrismaRuntimeRow | null;
    return row ? rowToRecord(row) : undefined;
  }

  async list(): Promise<WorkspaceRecord[]> {
    const rows = (await this.prisma.workspaceRuntime.findMany({
      orderBy: { createdAt: 'asc' },
    })) as PrismaRuntimeRow[];
    return rows.map(rowToRecord);
  }

  async listNonDeleted(): Promise<WorkspaceRecord[]> {
    const rows = (await this.prisma.workspaceRuntime.findMany({
      where: { status: { not: 'DELETED' } },
      orderBy: { createdAt: 'asc' },
    })) as PrismaRuntimeRow[];
    return rows.map(rowToRecord);
  }

  async listByProject(projectId: string): Promise<WorkspaceRecord[]> {
    const rows = (await this.prisma.workspaceRuntime.findMany({
      where: { projectId, status: { not: 'DELETED' } },
      orderBy: { lastActiveAt: 'desc' },
    })) as PrismaRuntimeRow[];
    return rows.map(rowToRecord);
  }
}
