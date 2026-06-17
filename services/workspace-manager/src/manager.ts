import { signAgentToken, type WorkspaceEvent } from '@vibecore/workspace-sdk';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  workspaceAgentSecret,
  workspacePod,
  workspacePvc,
  workspaceService,
  type WorkspaceK8sClient,
  type WorkspacePlan,
} from '@vibecore/k8s-client';

export type WorkspaceStatus = 'STARTING' | 'RUNNING' | 'STOPPED' | 'FAILED' | 'DELETED';

/*
 * Activity touches (see WorkspaceManager.touch) are throttled to at most one
 * persisted write per workspace per this window. The IDE's file- and port-watch
 * WebSockets fetch an agent token every 2-5s for the entire time a project is
 * open, so without throttling every poll would be a DB write. The inactivity GC
 * window is measured in minutes, so 30s granularity keeps a live session's
 * lastActiveAt comfortably ahead of the reaper at negligible write cost.
 */
export const WORKSPACE_ACTIVITY_TOUCH_INTERVAL_MS = 30_000;

export interface WorkspaceRecord {
  id: string;
  orgId: string;
  projectId: string;
  plan: WorkspacePlan;
  status: WorkspaceStatus;
  pvcName: string;
  podName: string;
  serviceName: string;
  agentTokenSecretName: string;
  createdAt: string;
  lastActiveAt: string;
  // Last time this runtime's active compute was metered to billing (P4). The GC
  // meters the window from here (or createdAt) to lastActiveAt on stop, then
  // advances it — idempotent across restarts. Undefined until first metered.
  lastMeteredAt?: string;
  error?: string;
}

export interface WorkspaceStore {
  create(input: Omit<WorkspaceRecord, 'createdAt' | 'lastActiveAt'>): Promise<WorkspaceRecord>;
  update(workspaceId: string, patch: Partial<WorkspaceRecord>): Promise<WorkspaceRecord>;
  get(workspaceId: string): Promise<WorkspaceRecord | undefined>;
  list(): Promise<WorkspaceRecord[]>;

  /*
   * Like list() but excludes terminal DELETED rows. deleteWorkspace() never
   * removes a row (it flips status to DELETED), and nothing prunes them, so the
   * table grows unbounded with tombstones. The GC sweep only ever acts on
   * non-DELETED workspaces — scanning the tombstones on every pass is pure
   * O(lifetime-count) waste. Stores push the filter into the query.
   */
  listNonDeleted(): Promise<WorkspaceRecord[]>;
}

export interface EventBus {
  publish(event: WorkspaceEvent): Promise<void>;
}

export class JsonWorkspaceStore implements WorkspaceStore {
  constructor(
    readonly filePath = process.env.WORKSPACE_MANAGER_STORE_PATH ?? '.vibecore/workspace-manager/workspaces.json',
  ) {}

  async create(input: Omit<WorkspaceRecord, 'createdAt' | 'lastActiveAt'>) {
    const now = new Date().toISOString();
    const record = { ...input, createdAt: now, lastActiveAt: now };
    const workspaces = await this.read();
    workspaces.set(record.id, record);
    await this.write(workspaces);
    return record;
  }

  async update(workspaceId: string, patch: Partial<WorkspaceRecord>) {
    const workspaces = await this.read();
    const existing = workspaces.get(workspaceId);
    if (!existing) {
      throw new Error('Workspace not found');
    }
    const updated = { ...existing, ...patch };
    workspaces.set(workspaceId, updated);
    await this.write(workspaces);
    return updated;
  }

  async get(workspaceId: string) {
    return (await this.read()).get(workspaceId);
  }

  async list() {
    return [...(await this.read()).values()];
  }

  async listNonDeleted() {
    return [...(await this.read()).values()].filter((workspace) => workspace.status !== 'DELETED');
  }

  private async read() {
    const content = await readFile(this.filePath, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return '[]';
      }

      throw error;
    });

    return new Map<string, WorkspaceRecord>(
      (JSON.parse(content) as WorkspaceRecord[]).map((workspace) => [workspace.id, workspace]),
    );
  }

  private async write(workspaces: Map<string, WorkspaceRecord>) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify([...workspaces.values()], null, 2));
  }
}

export class StructuredLogEventBus implements EventBus {
  async publish(event: WorkspaceEvent) {
    console.log(JSON.stringify({ level: 'info', service: 'workspace-manager', event }));
  }
}

export interface StartWorkspaceInput {
  namespace: string;
  orgId: string;
  projectId: string;
  workspaceId: string;
  image: string;
  plan: WorkspacePlan;
  env: Record<string, string>;
  allowedSecretKeys: string[];
  allowedSecrets?: Record<string, string>;
  resourceLimits?: {
    cpuMillicores?: number;
    ramMb?: number;
    storageGb?: number;
  };
  storageClassName?: string;
}

/*
 * Per-plan reserved compute used for runtime metering (P4). Mirrors the request
 * tier in packages/k8s-client planResources (free 250m/512Mi, pro 500m/1Gi, team
 * 750m/1.5Gi, enterprise 1/2Gi) expressed as millicores / MB. Metering the
 * reserved request (what's allocated for the active window) is the conservative,
 * deterministic choice; the api turns this into Replit compute units.
 */
const PLAN_METER_COMPUTE: Record<WorkspacePlan, { cpuMillicores: number; ramMb: number }> = {
  free: { cpuMillicores: 250, ramMb: 512 },
  pro: { cpuMillicores: 500, ramMb: 1024 },
  team: { cpuMillicores: 750, ramMb: 1536 },
  enterprise: { cpuMillicores: 1000, ramMb: 2048 },
};

/*
 * Best-effort POST of a workspace-compute metering event to the api's internal
 * ingest. Never throws — metering must not break GC. Returns true on a 2xx.
 */
async function postWorkspaceComputeMetering(body: {
  organizationId: string;
  projectId: string;
  cpuMillicores: number;
  ramMb: number;
  seconds: number;
}): Promise<boolean> {
  const baseUrl = process.env.API_INTERNAL_URL ?? process.env.API_URL;
  const secret = (process.env.INTERNAL_API_SHARED_SECRET ?? process.env.WORKSPACE_MANAGER_SHARED_SECRET)?.trim();
  if (!baseUrl) {
    return false;
  }
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/internal/metering`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({ kind: 'compute', ...body }),
      signal: AbortSignal.timeout(15_000),
    });
    await response.body?.cancel().catch(() => {});
    return response.ok;
  } catch {
    return false;
  }
}

export class WorkspaceManager {
  /*
   * Per-workspace timestamp of the last persisted activity touch, used to
   * throttle writes (see touch()). In-memory and per-replica: a split across
   * the two manager replicas only means up to one extra write per window, which
   * is harmless — lastActiveAt still advances monotonically. Reset on restart
   * and pruned on stop/delete.
   */
  private readonly lastTouchAt = new Map<string, number>();

  constructor(
    readonly store: WorkspaceStore,
    readonly k8s: WorkspaceK8sClient,
    readonly events: EventBus,
    readonly tokenSecret: string,
  ) {}

  async startWorkspace(input: StartWorkspaceInput) {
    const pvcName = `pvc-${input.workspaceId}`;
    const agentTokenSecretName = `agent-token-${input.workspaceId}`;
    const allowedSecrets = input.allowedSecrets ?? {};
    const secretEnv = Object.fromEntries(
      [...new Set([...input.allowedSecretKeys, ...Object.keys(allowedSecrets)])].map((key) => [key, key]),
    );
    const runtimeInput = {
      ...input,
      pvcName,
      agentTokenSecretName,
      storageClassName: input.storageClassName ?? process.env.WORKSPACE_STORAGE_CLASS,
      tokenSecret: this.tokenSecret,
      secretEnv,
      env: { ...input.env, WORKSPACE_ID: input.workspaceId },
    };
    const baseRecord = {
      id: input.workspaceId,
      orgId: input.orgId,
      projectId: input.projectId,
      plan: input.plan,
      status: 'STARTING' as const,
      pvcName,
      podName: `workspace-${input.workspaceId}`,
      serviceName: `workspace-${input.workspaceId}`,
      agentTokenSecretName,
    };

    /*
     * Workspace ids are deterministic per (project, user), so reopening a
     * project re-enters this path with the SAME id. GC never drops the row —
     * stopWorkspace/deleteWorkspace only flip status to STOPPED/DELETED — so a
     * blind create() collides on the unique id under the Prisma store (the JSON
     * store silently overwrote, masking this in tests) and the workspace could
     * never be re-provisioned: the start 500s, the API returns 502, and the IDE
     * shows "Crashed runtime" forever. Reuse the existing row instead, resetting
     * it to STARTING and clearing any prior failure so a fresh pod/PVC/Service
     * is provisioned below. This also makes restartWorkspace (stop→start) work.
     */
    const resetUpdate = {
      ...baseRecord,
      error: undefined,
      lastActiveAt: new Date().toISOString(),
    };
    const existing = await this.store.get(input.workspaceId);
    let record;

    if (existing) {
      record = await this.store.update(input.workspaceId, resetUpdate);
    } else {
      try {
        record = await this.store.create(baseRecord);
      } catch (error) {
        /*
         * get()-then-create() is a TOCTOU: two concurrent FIRST-time starts for
         * the same deterministic id both see "no existing" and both create, so
         * the loser hits a P2002 unique violation → unhandled 500 → API 502 →
         * "Crashed runtime". Treat the lost create race as "row now exists" and
         * fall back to the reset update instead of crashing.
         */
        if ((error as { code?: string } | undefined)?.code === 'P2002') {
          record = await this.store.update(input.workspaceId, resetUpdate);
        } else {
          throw error;
        }
      }
    }

    try {
      /*
       * Create the PVC only if it doesn't already exist. startWorkspace is
       * re-entered with the SAME deterministic id on every reopen, and the PVC's
       * requested storage tracks the org's *current* plan entitlement. Re-applying
       * it after a plan change asks Kubernetes to shrink (forbidden outright →
       * permanent FAILED wedge) or grow (no-op/expansion error) a bound PVC. The
       * first-provision size is authoritative for the volume's lifetime; data and
       * size are preserved across reopens by never re-applying.
       */
      const pvc = workspacePvc(runtimeInput);

      /*
       * Do NOT swallow errors from get(): the k8s client returns undefined ONLY
       * for a real NotFound and THROWS on transient/RBAC failures. Catching here
       * would turn a transient error into "absent" → re-apply the bound PVC →
       * shrink-forbidden wedge (the exact bug this guard exists to avoid). Let it
       * propagate to the outer catch, which fails the start cleanly instead.
       */
      const existingPvc = await this.k8s.get('PersistentVolumeClaim', input.namespace, pvc.metadata?.name ?? '');

      if (!existingPvc) {
        await this.k8s.apply(pvc);
      }

      await this.k8s.apply({
        ...workspaceAgentSecret(runtimeInput),
        stringData: { tokenSecret: this.tokenSecret, ...allowedSecrets },
      });
      await this.k8s.apply(workspacePod(runtimeInput));
      await this.k8s.apply(workspaceService(runtimeInput));
      await this.waitForReadiness(input.namespace, record.podName);

      /*
       * Pod-Ready is necessary but NOT sufficient: the manager, api and
       * preview-proxy all reach the agent via the Service DNS the manager hands
       * out (workspace-<id>.<ns>.svc:8080), and the Service Endpoints can lag a
       * second or two before they route to the freshly (re)created pod IP. If we
       * mark RUNNING the instant the pod is Ready, the client starts seeding and
       * its first agent calls hit that window → connection refused → 502, which
       * the IDE surfaces as a permanent "Crashed runtime". Confirm the agent
       * actually answers THROUGH the Service before committing RUNNING so clients
       * only ever see a workspace whose agent is routable.
       */
      await this.waitForAgentReachable(input.workspaceId, input.namespace);

      const running = await this.store.update(input.workspaceId, {
        status: 'RUNNING',
        lastActiveAt: new Date().toISOString(),
      });

      /*
       * The workspace is fully provisioned and committed RUNNING at this point.
       * The success notification is best-effort: if publish throws it must NOT
       * fall into the catch below, which would tear down the live Pod/Service and
       * mark a healthy workspace FAILED. Publish outside the try.
       */
      void this.publish(running, 'workspace.running').catch(() => {});

      return running;
    } catch (error) {
      /*
       * Surface the actual provisioning failure to stdout. Previously the only
       * trace of a failed start was the `workspace.failed` event (which carries
       * no reason) — the real k8s error (PVC admission/quota, Pod scheduling,
       * readiness timeout, RBAC) was stored ONLY in the DB record's `error`
       * field, invisible to anyone tailing the manager. That left a user unable
       * to create a project with NOTHING in the logs explaining why. Log it
       * loudly, with enough context to correlate to a specific start.
       */
      console.error(
        JSON.stringify({
          level: 'error',
          service: 'workspace-manager',
          event: 'workspace.start.failed',
          workspaceId: input.workspaceId,
          orgId: input.orgId,
          projectId: input.projectId,
          plan: input.plan,
          namespace: input.namespace,
          resourceLimits: input.resourceLimits,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );

      /*
       * Tear down the compute objects we just created so a failed start (e.g. a
       * readiness timeout) doesn't leave a CrashLooping/Pending Pod and its
       * Service churning resources until the 24h GC. Best-effort — never let
       * cleanup errors mask the original failure. The PVC and agent-token Secret
       * are deliberately KEPT: the PVC may hold the user's existing data (this
       * path is re-entered on reopen with the same deterministic id), and both
       * are reused as-is when the deterministic-id start is retried.
       *
       * Run this BEFORE the store.update below: if the FAILED-status write throws
       * (DB error, or the row was concurrently deleted), the cleanup must still
       * happen — otherwise the Pod/Service leak until GC.
       */
      await Promise.allSettled([
        this.k8s.delete('Pod', input.namespace, record.podName),
        this.k8s.delete('Service', input.namespace, record.serviceName),
      ]);

      const failed = await this.store.update(input.workspaceId, {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Kubernetes error',
      });

      await this.publish(failed, 'workspace.failed');
      return failed;
    }
  }

  async stopWorkspace(namespace: string, workspaceId: string, guard?: { status?: string; lastActiveAt?: string }) {
    const workspace = await this.requireWorkspace(workspaceId);

    /*
     * Optional optimistic guard (used by GC): bail if the row changed since the
     * caller observed it — a concurrent reopen flips STOPPED/RUNNING→STARTING and
     * bumps lastActiveAt, and stopping/deleting against the stale decision would
     * kill the freshly re-provisioned workspace.
     */
    if (
      guard &&
      ((guard.status && workspace.status !== guard.status) ||
        (guard.lastActiveAt && workspace.lastActiveAt !== guard.lastActiveAt))
    ) {
      return workspace;
    }

    await this.k8s.delete('Pod', namespace, workspace.podName);
    const stopped = await this.store.update(workspaceId, { status: 'STOPPED' });
    // Drop the throttle marker so a later reopen (same deterministic id) touches
    // immediately instead of waiting out a stale window.
    this.lastTouchAt.delete(workspaceId);
    await this.publish(stopped, 'workspace.stopped');
    return stopped;
  }

  async restartWorkspace(input: StartWorkspaceInput) {
    await this.stopWorkspace(input.namespace, input.workspaceId).catch(() => undefined);
    return this.startWorkspace(input);
  }

  async deleteWorkspace(namespace: string, workspaceId: string, guard?: { status?: string; lastActiveAt?: string }) {
    const workspace = await this.requireWorkspace(workspaceId);

    /*
     * Optional optimistic guard (used by GC): if the row was re-provisioned/
     * touched since the caller observed it, abort — deleting the PVC of a
     * just-reopened workspace is the destructive TOCTOU this prevents.
     */
    if (
      guard &&
      ((guard.status && workspace.status !== guard.status) ||
        (guard.lastActiveAt && workspace.lastActiveAt !== guard.lastActiveAt))
    ) {
      return workspace;
    }

    /*
     * allSettled, not all: with Promise.all a single transient kubectl failure
     * rejected the whole call, so the remaining objects were never deleted AND
     * the row was never flipped to DELETED — leaving orphaned Pod/PVC/Secret/
     * Service and an inconsistent record. Attempt every delete; any straggler is
     * swept by garbageCollect.
     */
    await Promise.allSettled([
      this.k8s.delete('Service', namespace, workspace.serviceName),
      this.k8s.delete('Pod', namespace, workspace.podName),
      this.k8s.delete('Secret', namespace, workspace.agentTokenSecretName ?? `agent-token-${workspaceId}`),
      this.k8s.delete('PersistentVolumeClaim', namespace, workspace.pvcName),
    ]);
    const deleted = await this.store.update(workspaceId, { status: 'DELETED' });
    this.lastTouchAt.delete(workspaceId);
    await this.publish(deleted, 'workspace.deleted');
    return deleted;
  }

  #gcInFlight = false;

  async garbageCollect(namespace: string, inactiveMs: number, deleteMs: number) {
    /*
     * Skip if a sweep is already running. The worker triggers GC on a BullMQ
     * schedule with a client-side 60s AbortSignal that does NOT cancel this
     * server-side pass, so a slow GC + a BullMQ retry could otherwise run two
     * concurrent sweeps over the same rows, racing each other's delete/re-read.
     */
    if (this.#gcInFlight) {
      console.warn('workspace garbage-collection already in progress; skipping overlapping sweep');
      return;
    }

    this.#gcInFlight = true;

    try {
      await this.#garbageCollect(namespace, inactiveMs, deleteMs);
    } finally {
      this.#gcInFlight = false;
    }
  }

  async #garbageCollect(namespace: string, inactiveMs: number, deleteMs: number) {
    const now = Date.now();
    for (const snapshot of await this.store.listNonDeleted()) {
      // Isolate each workspace: a transient kubectl/network error (or a row
      // concurrently deleted by another sweep) must not abort the whole GC pass
      // and leave every later workspace's pod/PVC leaking. Log and continue.
      try {
        // Re-read each row under its freshest state before acting. store.list()
        // is a point-in-time snapshot, and workspace ids are deterministic per
        // (project, user): reopening a project re-enters startWorkspace for the
        // SAME id, flipping the row STOPPED→STARTING and bumping lastActiveAt.
        // Acting on the stale snapshot raced that re-provision — GC deleted the
        // PVC in the window between startWorkspace's PVC-apply and Pod-apply, so
        // the freshly created pod referenced a now-deleted claim and sat Pending
        // forever ("persistentvolumeclaim not found"), spinning the cluster
        // autoscaler at real cost. Re-evaluating against live state closes it.
        const workspace = await this.store.get(snapshot.id);
        if (!workspace) {
          continue;
        }
        const inactiveFor = now - new Date(workspace.lastActiveAt).getTime();
        // Pass the observed state as an optimistic guard so a reopen that races
        // between this decision and the actual k8s deletes aborts the reap.
        const guard = { status: workspace.status, lastActiveAt: workspace.lastActiveAt };

        /*
         * Reconcile a RUNNING row whose Pod no longer exists. Workspaces are bare
         * Pods (no Deployment/ReplicaSet), so an evicted/preempted/externally
         * deleted Pod is never recreated — the row stays RUNNING forever while
         * preview/terminal 404 on the dead pod, and touch() (every file/port-watch
         * tick of an open IDE) keeps lastActiveAt fresh so the inactivity branch
         * below never reaps it either. Flip it to STOPPED (keeps the PVC) so the
         * next open reprovisions. getPod returns undefined ONLY for a real NotFound
         * — transient/RBAC errors throw and are caught below, so we never
         * reconcile on a blip.
         */
        if (workspace.status === 'RUNNING') {
          const pod = await this.k8s.getPod(namespace, workspace.podName);

          if (!pod) {
            // The pod died externally; meter the runtime it consumed before reconciling.
            await this.#meterRuntimeOnStop(workspace);
            await this.stopWorkspace(namespace, workspace.id, guard);
            continue;
          }
        }

        if (workspace.status === 'RUNNING' && inactiveFor > inactiveMs) {
          // Meter the active runtime window (marker→lastActiveAt) before stopping.
          await this.#meterRuntimeOnStop(workspace);
          await this.stopWorkspace(namespace, workspace.id, guard);
        } else if (workspace.status === 'STOPPED' && inactiveFor > deleteMs) {
          await this.deleteWorkspace(namespace, workspace.id, guard);
        } else if ((workspace.status === 'FAILED' || workspace.status === 'STARTING') && inactiveFor > deleteMs) {
          // Reap abandoned provisioning. A FAILED start (readiness timeout, or a
          // PVC reaped out from under it) — and a STARTING row orphaned by a
          // manager crash mid-provision — were never collected: GC only walked
          // RUNNING→STOPPED→DELETED. Their Pod/PVC/Secret leaked indefinitely and
          // any Pending pod kept the autoscaler retrying scale-up. lastActiveAt is
          // stamped at start, so a legitimately in-flight start (seconds to the
          // ~180s readiness window, far below deleteMs) is never caught here. The
          // row goes DELETED and reopening re-provisions via the reuse path.
          await this.deleteWorkspace(namespace, workspace.id, guard);
        }
      } catch (error) {
        console.error('workspace garbage-collection failed', { workspaceId: snapshot.id, error });
      }
    }
  }

  /*
   * Meter the active-runtime window for a workspace about to be stopped (P4):
   * from the last-metered marker (or createdAt) up to lastActiveAt, at the plan's
   * reserved compute. Best-effort — failures never abort GC — and idempotent: the
   * marker only advances on a successful ingest, so a failed post just re-meters
   * the same window next time rather than double-charging.
   */
  async #meterRuntimeOnStop(workspace: WorkspaceRecord): Promise<void> {
    try {
      const startMs = workspace.lastMeteredAt
        ? new Date(workspace.lastMeteredAt).getTime()
        : new Date(workspace.createdAt).getTime();
      const endMs = new Date(workspace.lastActiveAt).getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        return;
      }
      const seconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
      if (seconds < 1) {
        return;
      }

      const compute = PLAN_METER_COMPUTE[workspace.plan] ?? PLAN_METER_COMPUTE.free;
      const ok = await postWorkspaceComputeMetering({
        organizationId: workspace.orgId,
        projectId: workspace.projectId,
        cpuMillicores: compute.cpuMillicores,
        ramMb: compute.ramMb,
        seconds,
      });

      if (ok) {
        await this.store
          .update(workspace.id, { lastMeteredAt: new Date(endMs).toISOString() })
          .catch(() => {});
      }
    } catch {
      // metering must never break GC
    }
  }

  async streamLogs(namespace: string, workspaceId: string) {
    const workspace = await this.requireWorkspace(workspaceId);
    return this.k8s.streamPodLogs(namespace, workspace.podName);
  }

  issueAgentToken(workspaceId: string, expiresInMs = 60_000) {
    return signAgentToken({ workspaceId, expiresAt: Date.now() + expiresInMs, secret: this.tokenSecret });
  }

  /**
   * Record that a workspace is actively in use, bumping its lastActiveAt so the
   * inactivity GC does not stop a session the user is still working in. The api
   * calls this (fire-and-forget) every time it mints an agent token on a user's
   * behalf — i.e. on every runtime request and, crucially, on every tick of the
   * always-open file/port watch pollers — so an open IDE keeps its workspace
   * alive without any explicit heartbeat.
   *
   * Previously lastActiveAt was stamped only at start, so the GC reaped any
   * session that outlived the inactivity window (default 30m) regardless of how
   * actively it was being used, killing live workspaces mid-edit and leaving the
   * preview blank until the user reloaded.
   *
   * Only RUNNING workspaces are touched: bumping a STOPPED/FAILED row would keep
   * the delete-window reaper from ever cleaning it up, and STARTING rows are
   * already freshly stamped by startWorkspace. Writes are throttled to one per
   * WORKSPACE_ACTIVITY_TOUCH_INTERVAL_MS since the watch pollers fire every few
   * seconds.
   */
  async touch(workspaceId: string) {
    const now = Date.now();
    const last = this.lastTouchAt.get(workspaceId) ?? 0;

    if (now - last < WORKSPACE_ACTIVITY_TOUCH_INTERVAL_MS) {
      return undefined;
    }

    const workspace = await this.store.get(workspaceId);

    if (!workspace || workspace.status !== 'RUNNING') {
      // Don't record a throttle entry for an unknown/non-running id — otherwise a
      // caller touching arbitrary ids grows lastTouchAt without bound (leak).
      return workspace;
    }

    this.lastTouchAt.set(workspaceId, now);

    try {
      return await this.store.update(workspaceId, { lastActiveAt: new Date(now).toISOString() });
    } catch (error) {
      /*
       * The row can be deleted (GC/offboarding) between the get() above and this
       * update — a best-effort activity touch must not throw P2025 and surface as
       * a 500 to the agent-token caller. Treat "gone" as a no-op.
       */
      if ((error as { code?: string } | undefined)?.code === 'P2025') {
        return undefined;
      }

      /*
       * A transient update failure (DB blip) already recorded the throttle entry
       * above, which would suppress re-touch for the whole interval and let
       * lastActiveAt go stale — risking premature GC of an active workspace. Roll
       * the throttle marker back so the next touch retries immediately.
       */
      this.lastTouchAt.delete(workspaceId);

      throw error;
    }
  }

  private async waitForReadiness(namespace: string, podName: string) {
    const startedAt = Date.now();

    /*
     * NaN-safe: `?? 180_000` only covers an undefined env var, so a misconfigured
     * non-numeric WORKSPACE_READINESS_TIMEOUT_MS would make Number(...) NaN and the
     * loop below (`< NaN` is always false) skip readiness polling entirely.
     */
    const parsedTimeout = Number(process.env.WORKSPACE_READINESS_TIMEOUT_MS);
    const timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 180_000;

    while (Date.now() - startedAt < timeoutMs) {
      /*
       * A transient control-plane error (API-server throttling, network blip —
       * common during node preemption / control-plane upgrades) must NOT abort
       * the provision: swallow it and retry on the next poll. Only a terminal
       * pod state or the overall timeout ends the wait.
       */
      const pod = await this.k8s.getPod(namespace, podName).catch(() => null);

      if (pod) {
        const typedPod = pod as unknown as PodStatusView;

        // Fail fast on a terminal pod state (OOMKilled / CrashLoopBackOff /
        // Failed) instead of spinning the full readiness timeout and throwing
        // an opaque "not ready" — the API can then surface an actionable error.
        const failure = detectPodTerminalFailure(typedPod);

        if (failure) {
          throw Object.assign(new Error(failure.message), { code: failure.code });
        }

        if (isPodReady(typedPod)) {
          return;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }

    throw new Error(`Pod ${podName} was not ready before timeout`);
  }

  /*
   * Agent health URL via the Service DNS — the SAME address the api/preview-proxy
   * resolve (kept in sync with app.ts agentBaseUrl, including the optional
   * WORKSPACE_AGENT_URL_TEMPLATE override) so this gate exercises the real client
   * path, not pod-local networking.
   */
  private agentHealthUrl(workspaceId: string, namespace: string): string {
    const template = process.env.WORKSPACE_AGENT_URL_TEMPLATE;
    const base = template
      ? template.replaceAll('{workspaceId}', workspaceId).replaceAll('{namespace}', namespace).replace(/\/+$/, '')
      : `http://workspace-${workspaceId}.${namespace}.svc.cluster.local:8080`;

    return `${base}/health`;
  }

  /*
   * Poll the agent's /health THROUGH the Service until it answers, so RUNNING is
   * only reported once the Endpoints route to the ready pod. Soft-bounded: the
   * pod is already Ready, so if the Service is still not routable after the
   * window we log and proceed rather than tear down a healthy pod over a
   * transient Endpoints lag — the client's start-poll covers any residual gap.
   */
  private async waitForAgentReachable(workspaceId: string, namespace: string) {
    const parsed = Number(process.env.WORKSPACE_AGENT_REACHABLE_TIMEOUT_MS);

    // An explicit 0/negative disables the probe entirely (unit tests, where there
    // is no real agent Service to reach).
    if (Number.isFinite(parsed) && parsed <= 0) {
      return;
    }

    const url = this.agentHealthUrl(workspaceId, namespace);
    // 45s default: a gVisor agent can take 20-30s to start listening under node
    // CPU contention, and RUNNING must not be reported before it is routable.
    const timeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : 45_000;
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;

    while (Date.now() < deadline) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3_000) });

        if (res.ok) {
          return;
        }

        lastError = new Error(`agent health responded ${res.status}`);
      } catch (error) {
        lastError = error;
      }

      await new Promise((resolve) => setTimeout(resolve, 750));
    }

    console.warn(
      JSON.stringify({
        level: 'warn',
        service: 'workspace-manager',
        event: 'workspace.agent.unreachable_at_start',
        workspaceId,
        namespace,
        error: lastError instanceof Error ? lastError.message : String(lastError),
      }),
    );
  }

  private async requireWorkspace(workspaceId: string) {
    const workspace = await this.store.get(workspaceId);
    if (!workspace) {
      // Surface a real 404 (the manager has no Fastify error handler, so a bare
      // Error would default to 500). Callers — notably the API stop route — need
      // to tell "this workspace no longer exists" apart from a transient fault
      // so they can treat a stop/delete of an unknown workspace as idempotent.
      throw Object.assign(new Error('Workspace not found'), {
        statusCode: 404,
        code: 'WORKSPACE_NOT_FOUND',
      });
    }
    return workspace;
  }

  private async publish(workspace: WorkspaceRecord, type: string) {
    await this.events.publish({
      type,
      workspaceId: workspace.id,
      orgId: workspace.orgId,
      projectId: workspace.projectId,
      createdAt: new Date().toISOString(),
    });
  }
}

type PodStatusView = {
  status?: {
    phase?: string;
    conditions?: Array<{ type?: string; status?: string }>;
    containerStatuses?: Array<{
      state?: { waiting?: { reason?: string }; terminated?: { reason?: string } };
      lastState?: { terminated?: { reason?: string } };
    }>;
  };
};

function isPodReady(pod: PodStatusView) {
  return (
    pod.status?.conditions?.some((condition) => condition.type === 'Ready' && condition.status === 'True') === true
  );
}

/**
 * Detect a terminal pod failure that readiness polling would otherwise never
 * recognize (it only checks Ready=True). Returns a coded error or null.
 */
function detectPodTerminalFailure(pod: PodStatusView): { message: string; code: string } | null {
  if (pod.status?.phase === 'Failed') {
    return { message: 'Workspace pod failed to start', code: 'WORKSPACE_POD_FAILED' };
  }

  for (const container of pod.status?.containerStatuses ?? []) {
    const oomReason = container.state?.terminated?.reason ?? container.lastState?.terminated?.reason;

    if (oomReason === 'OOMKilled') {
      return {
        message: 'Workspace pod was OOMKilled — increase the plan memory limit or restart',
        code: 'WORKSPACE_POD_OOMKILLED',
      };
    }

    if (container.state?.waiting?.reason === 'CrashLoopBackOff') {
      return {
        message: 'Workspace pod is crash-looping (CrashLoopBackOff)',
        code: 'WORKSPACE_POD_CRASHLOOP',
      };
    }

    /*
     * Image-pull and container-config failures are effectively permanent (bad/
     * unreachable image tag, missing/invalid secret or config) — they never
     * become Ready, so without fast-failing here the provision spins the full
     * readiness timeout and throws an opaque "not ready". Surface an actionable
     * error instead. (ImagePullBackOff is the backed-off persistent state; the
     * one-shot ErrImagePull usually transitions into it, so we key on the
     * persistent reasons.)
     */
    const waitingReason = container.state?.waiting?.reason;

    if (
      waitingReason === 'ImagePullBackOff' ||
      waitingReason === 'ErrImageNeverPull' ||
      waitingReason === 'InvalidImageName' ||
      waitingReason === 'CreateContainerConfigError' ||
      waitingReason === 'CreateContainerError'
    ) {
      return {
        message: `Workspace pod could not start its container (${waitingReason})`,
        code: 'WORKSPACE_POD_IMAGE_OR_CONFIG_ERROR',
      };
    }
  }

  return null;
}
