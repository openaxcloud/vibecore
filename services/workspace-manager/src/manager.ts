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
  error?: string;
}

export interface WorkspaceStore {
  create(input: Omit<WorkspaceRecord, 'createdAt' | 'lastActiveAt'>): Promise<WorkspaceRecord>;
  update(workspaceId: string, patch: Partial<WorkspaceRecord>): Promise<WorkspaceRecord>;
  get(workspaceId: string): Promise<WorkspaceRecord | undefined>;
  list(): Promise<WorkspaceRecord[]>;
}

export interface EventBus {
  publish(event: WorkspaceEvent): Promise<void>;
}

export class JsonWorkspaceStore implements WorkspaceStore {
  constructor(readonly filePath = process.env.WORKSPACE_MANAGER_STORE_PATH ?? '.vibecore/workspace-manager/workspaces.json') {}

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

  private async read() {
    const content = await readFile(this.filePath, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return '[]';
      }

      throw error;
    });

    return new Map<string, WorkspaceRecord>((JSON.parse(content) as WorkspaceRecord[]).map((workspace) => [workspace.id, workspace]));
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
    const secretEnv = Object.fromEntries([...new Set([...input.allowedSecretKeys, ...Object.keys(allowedSecrets)])].map((key) => [key, key]));
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
    const existing = await this.store.get(input.workspaceId);
    const record = existing
      ? await this.store.update(input.workspaceId, {
          ...baseRecord,
          error: undefined,
          lastActiveAt: new Date().toISOString(),
        })
      : await this.store.create(baseRecord);

    try {
      await this.k8s.apply(workspacePvc(runtimeInput));
      await this.k8s.apply({ ...workspaceAgentSecret(runtimeInput), stringData: { tokenSecret: this.tokenSecret, ...allowedSecrets } });
      await this.k8s.apply(workspacePod(runtimeInput));
      await this.k8s.apply(workspaceService(runtimeInput));
      await this.waitForReadiness(input.namespace, record.podName);
      const running = await this.store.update(input.workspaceId, { status: 'RUNNING', lastActiveAt: new Date().toISOString() });
      await this.publish(running, 'workspace.running');
      return running;
    } catch (error) {
      const failed = await this.store.update(input.workspaceId, { status: 'FAILED', error: error instanceof Error ? error.message : 'Kubernetes error' });

      /*
       * Tear down the compute objects we just created so a failed start (e.g. a
       * readiness timeout) doesn't leave a CrashLooping/Pending Pod and its
       * Service churning resources until the 24h GC. Best-effort — never let
       * cleanup errors mask the original failure. The PVC and agent-token Secret
       * are deliberately KEPT: the PVC may hold the user's existing data (this
       * path is re-entered on reopen with the same deterministic id), and both
       * are reused as-is when the deterministic-id start is retried.
       */
      await Promise.allSettled([
        this.k8s.delete('Pod', input.namespace, record.podName),
        this.k8s.delete('Service', input.namespace, record.serviceName),
      ]);

      await this.publish(failed, 'workspace.failed');
      return failed;
    }
  }

  async stopWorkspace(namespace: string, workspaceId: string) {
    const workspace = await this.requireWorkspace(workspaceId);
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

  async deleteWorkspace(namespace: string, workspaceId: string) {
    const workspace = await this.requireWorkspace(workspaceId);

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

  async garbageCollect(namespace: string, inactiveMs: number, deleteMs: number) {
    const now = Date.now();
    for (const snapshot of await this.store.list()) {
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
        if (workspace.status === 'RUNNING' && inactiveFor > inactiveMs) {
          await this.stopWorkspace(namespace, workspace.id);
        } else if (workspace.status === 'STOPPED' && inactiveFor > deleteMs) {
          await this.deleteWorkspace(namespace, workspace.id);
        } else if ((workspace.status === 'FAILED' || workspace.status === 'STARTING') && inactiveFor > deleteMs) {
          // Reap abandoned provisioning. A FAILED start (readiness timeout, or a
          // PVC reaped out from under it) — and a STARTING row orphaned by a
          // manager crash mid-provision — were never collected: GC only walked
          // RUNNING→STOPPED→DELETED. Their Pod/PVC/Secret leaked indefinitely and
          // any Pending pod kept the autoscaler retrying scale-up. lastActiveAt is
          // stamped at start, so a legitimately in-flight start (seconds to the
          // ~180s readiness window, far below deleteMs) is never caught here. The
          // row goes DELETED and reopening re-provisions via the reuse path.
          await this.deleteWorkspace(namespace, workspace.id);
        }
      } catch (error) {
        console.error('workspace garbage-collection failed', { workspaceId: snapshot.id, error });
      }
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

    return this.store.update(workspaceId, { lastActiveAt: new Date(now).toISOString() });
  }

  private async waitForReadiness(namespace: string, podName: string) {
    const startedAt = Date.now();
    const timeoutMs = Number(process.env.WORKSPACE_READINESS_TIMEOUT_MS ?? 180_000);

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
    await this.events.publish({ type, workspaceId: workspace.id, orgId: workspace.orgId, projectId: workspace.projectId, createdAt: new Date().toISOString() });
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
  return pod.status?.conditions?.some((condition) => condition.type === 'Ready' && condition.status === 'True') === true;
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
  }

  return null;
}
