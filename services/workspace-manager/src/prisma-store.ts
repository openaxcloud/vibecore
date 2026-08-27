import { Prisma, type DatabaseClient } from '@vibecore/database';
import type { WorkspacePlan } from '@vibecore/k8s-client';

import type {
  WorkspacePurgeEffectDescriptor,
  WorkspacePurgeLease,
  WorkspaceRecord,
  WorkspaceStatus,
  WorkspaceStore,
} from './manager.js';

const KNOWN_PLANS: ReadonlySet<WorkspacePlan> = new Set(['free', 'pro', 'team', 'enterprise']);

const WORKSPACE_PURGE_STORE_INVARIANT = {
  databaseTimeUnavailable: 'WORKSPACE_PURGE_DATABASE_TIME_UNAVAILABLE',
  frozen: 'WORKSPACE_PURGE_FROZEN',
  leaseInvalid: 'WORKSPACE_PURGE_LEASE_INVALID',
  fenceOwned: 'WORKSPACE_PURGE_FENCE_OWNED',
  fenceLost: 'WORKSPACE_PURGE_FENCE_LOST',
  effectDescriptorMismatch: 'WORKSPACE_PURGE_EFFECT_DESCRIPTOR_MISMATCH',
  effectReceiptCorrupt: 'WORKSPACE_PURGE_EFFECT_RECEIPT_CORRUPT',
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
  constructor(private readonly prisma: DatabaseClient) {}

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
    const now = new Date();
    const created = (await this.prisma.workspaceRuntime.create({
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

  async executeProvisionEffect<T>(workspaceId: string, effect: () => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe('SELECT id FROM "WorkspaceRuntime" WHERE id = $1 FOR UPDATE', workspaceId);
        const workspace = await tx.workspaceRuntime.findUnique({ where: { id: workspaceId } });
        if (!workspace || workspace.purgeFrozen) {
          throw workspacePurgeStoreInvariantError(WORKSPACE_PURGE_STORE_INVARIANT.frozen, { statusCode: 409 });
        }
        return effect();
      },
      { timeout: 180_000, maxWait: 20_000 },
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
