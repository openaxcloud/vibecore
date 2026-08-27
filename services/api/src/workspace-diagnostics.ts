/*
 * BLOCKER #5/#6 — persisted preview-readiness beacons + workspace diagnostics.
 *
 * All helpers are best-effort and DB-backed: they take a DatabaseClient and are
 * only wired when the API runs on the Prisma store. A missing/failed write must
 * never break the request path (readiness and shutdown are more important than a
 * diagnostic row), so callers wrap these in `.catch(() => …)`.
 */
import type { DatabaseClient } from '@vibecore/database';
import {
  assertWorkspaceLifecycleTransition,
  lifecycleStateFromStatus,
  LifecycleError,
  type WorkspaceLifecycleState,
} from './lifecycle-state-machines.js';
import type { PreviewClientBeacon } from './runtime-readiness.js';

/** A beacon older than this is stale and no longer vetoes readiness (#5). */
export const PREVIEW_BEACON_TTL_MS = 30_000;

export type PreviewBeaconStatus = 'ok' | 'blank' | 'error';

export async function recordPreviewBeacon(
  db: DatabaseClient,
  workspaceId: string,
  port: number,
  status: PreviewBeaconStatus,
  detail?: string,
): Promise<void> {
  await db.previewReadinessBeacon.upsert({
    where: { workspaceId_port: { workspaceId, port } },
    create: { workspaceId, port, status, detail: detail ?? null },
    update: { status, detail: detail ?? null, reportedAt: new Date() },
  });
}

/**
 * The client beacon signal to feed into aggregatePreviewReadiness: only a FRESH
 * blank/error vetoes; a stale row (> TTL) or a cleared 'ok' is neutral/positive.
 */
export async function readClientBeacon(
  db: DatabaseClient,
  workspaceId: string,
  port: number,
  nowMs: number = Date.now(),
): Promise<PreviewClientBeacon> {
  const row = await db.previewReadinessBeacon.findUnique({ where: { workspaceId_port: { workspaceId, port } } });

  if (!row) {
    return 'none';
  }

  if (nowMs - row.reportedAt.getTime() > PREVIEW_BEACON_TTL_MS) {
    return 'none';
  }

  return row.status === 'blank' ? 'blank' : row.status === 'error' ? 'error' : 'ok';
}

/**
 * Append a lifecycle event, validating the transition against the last recorded
 * state (#6). An illegal edge is logged-and-dropped rather than thrown: the
 * append-only trail is a diagnostic, it must never block a real status change.
 * Returns the state actually recorded (or null if skipped).
 */
export async function recordLifecycleEvent(
  db: DatabaseClient,
  workspaceId: string,
  toState: WorkspaceLifecycleState,
  reason?: string,
  detail?: unknown,
): Promise<WorkspaceLifecycleState | null> {
  const last = await db.workspaceLifecycleEvent.findFirst({
    where: { workspaceId },
    orderBy: { at: 'desc' },
  });

  /*
   * Genesis: with no prior event we may legitimately start observing a workspace
   * mid-life (a warm reopen surfaces straight as RUNNING; a cold provision as
   * STARTING). Record whatever the first observed state is unconditionally — the
   * machine only constrains transitions BETWEEN recorded events, not the entry
   * point. (Previously this defaulted `from` to PENDING and dropped any first
   * event that wasn't STARTING/FAILED, so a warm reopen recorded nothing at all.)
   */
  if (!last) {
    await db.workspaceLifecycleEvent.create({
      data: {
        workspaceId,
        state: toState,
        reason: reason ?? null,
        detail: detail === undefined ? undefined : (detail as object),
      },
    });

    return toState;
  }

  const from = last.state as WorkspaceLifecycleState;

  if (from === toState) {
    return null;
  }

  try {
    assertWorkspaceLifecycleTransition(from, toState);
  } catch (error) {
    if (error instanceof LifecycleError) {
      // Illegal edge between recorded events: recording it would corrupt the
      // machine, so skip. The status itself is still updated by the caller.
      return null;
    }

    throw error;
  }

  await db.workspaceLifecycleEvent.create({
    data: {
      workspaceId,
      state: toState,
      reason: reason ?? null,
      detail: detail === undefined ? undefined : (detail as object),
    },
  });

  return toState;
}

/** Convenience: derive the lifecycle state from a coarse WorkspaceStatus and record it. */
export async function recordLifecycleFromStatus(
  db: DatabaseClient,
  workspaceId: string,
  status: string,
  reason?: string,
): Promise<void> {
  await recordLifecycleEvent(db, workspaceId, lifecycleStateFromStatus(status), reason);
}

export interface PostMortemInput {
  reason: string;
  finalState: string;
  ports?: unknown;
  processes?: unknown;
  problems?: unknown;
  logsTail?: string;
}

/**
 * Freeze the last-known runtime state when a workspace stops/fails (#6). Captures
 * whatever the API already knows — persisted ports, the fresh readiness beacon
 * (the Problem that explains a blank preview), and a tail of logs — so a support
 * operator can see WHY it died after the pod is gone. Append-only.
 */
export async function captureWorkspacePostMortem(
  db: DatabaseClient,
  workspaceId: string,
  input: PostMortemInput,
): Promise<void> {
  await db.workspacePostMortem.create({
    data: {
      workspaceId,
      reason: input.reason,
      finalState: input.finalState,
      ports: input.ports === undefined ? undefined : (input.ports as object),
      processes: input.processes === undefined ? undefined : (input.processes as object),
      problems: input.problems === undefined ? undefined : (input.problems as object),
      logsTail: input.logsTail ?? null,
    },
  });
}

export async function getWorkspaceDiagnostics(
  db: DatabaseClient,
  workspaceId: string,
  limit = 100,
): Promise<{
  lifecycle: Array<{ state: string; reason: string | null; at: string }>;
  postMortems: Array<{
    reason: string;
    finalState: string;
    ports: unknown;
    processes: unknown;
    problems: unknown;
    logsTail: string | null;
    capturedAt: string;
  }>;
}> {
  const [events, mortems] = await Promise.all([
    db.workspaceLifecycleEvent.findMany({ where: { workspaceId }, orderBy: { at: 'asc' }, take: limit }),
    db.workspacePostMortem.findMany({ where: { workspaceId }, orderBy: { capturedAt: 'desc' }, take: 10 }),
  ]);

  return {
    lifecycle: events.map((e) => ({ state: e.state, reason: e.reason, at: e.at.toISOString() })),
    postMortems: mortems.map((m) => ({
      reason: m.reason,
      finalState: m.finalState,
      ports: m.ports,
      processes: m.processes,
      problems: m.problems,
      logsTail: m.logsTail,
      capturedAt: m.capturedAt.toISOString(),
    })),
  };
}
