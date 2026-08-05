import type { DatabaseClient } from '@vibecore/database';
import type { WorkspacePlan } from '@vibecore/k8s-client';

import type { WorkspaceRecord, WorkspaceStatus, WorkspaceStore } from './manager.js';

const KNOWN_PLANS: ReadonlySet<WorkspacePlan> = new Set(['free', 'pro', 'team', 'enterprise']);

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
  purgeFenceToken: string | null;
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
    purgeFrozen: Boolean(row.purgeFrozen),
    ...(row.purgeFenceToken ? { purgeFenceToken: row.purgeFenceToken } : {}),
  };
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
        purgeFenceToken: input.purgeFenceToken ?? null,
        createdAt: now,
        lastActiveAt: now,
      },
    })) as PrismaRuntimeRow;
    return rowToRecord(created);
  }

  async update(workspaceId: string, patch: Partial<WorkspaceRecord>): Promise<WorkspaceRecord> {
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
    if (patch.purgeFrozen !== undefined) {
      data.purgeFrozen = patch.purgeFrozen;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'purgeFenceToken')) {
      data.purgeFenceToken = patch.purgeFenceToken ?? null;
    }

    try {
      const updated = (await this.prisma.workspaceRuntime.update({
        where: { id: workspaceId },
        data,
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
