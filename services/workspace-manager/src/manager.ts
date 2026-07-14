import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  serverAppDeployment,
  serverAppIngress,
  serverAppService,
  serverDeploymentName,
  workspaceAgentSecret,
  workspacePod,
  workspacePvc,
  workspaceService,
  type ServerRuntimeInput,
  type WorkspaceK8sClient,
  type WorkspacePlan,
} from '@vibecore/k8s-client';
import { signAgentToken, type WorkspaceEvent } from '@vibecore/workspace-sdk';

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

  /*
   * Last time this runtime's active compute was metered to billing (P4). The GC
   * meters the window from here (or createdAt) to lastActiveAt on stop, then
   * advances it — idempotent across restarts. Undefined until first metered.
   */
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

  /*
   * Atomic compare-and-set of the metering marker: advance lastMeteredAt to
   * `next` only if it currently equals `expected`. Returns true if this caller
   * won the claim. Used so only ONE GC replica meters a given stop window —
   * #gcInFlight only serializes within a process, but two manager replicas can
   * each run GC on the same dead-pod row and otherwise double-bill the window.
   */
  claimMeterWindow(workspaceId: string, expected: string | undefined, next: string): Promise<boolean>;
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

  async claimMeterWindow(workspaceId: string, expected: string | undefined, next: string) {
    const workspaces = await this.read();
    const existing = workspaces.get(workspaceId);

    if (!existing || (existing.lastMeteredAt ?? undefined) !== (expected ?? undefined)) {
      return false;
    }

    workspaces.set(workspaceId, { ...existing, lastMeteredAt: next });
    await this.write(workspaces);

    return true;
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

    /*
     * A corrupted registry (truncated by a crash mid-write, or hand-edited into
     * invalid/non-array JSON) must fail loudly with an actionable error rather
     * than throwing a bare SyntaxError/TypeError up the stack. Throwing here also
     * guards the read-modify-write callers: they never reach write() on a bad
     * parse, so the corrupted file is not overwritten with partial state.
     */
    let parsed: unknown;

    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new Error(
        `workspace registry at ${this.filePath} is corrupted (invalid JSON): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!Array.isArray(parsed)) {
      throw new Error(
        `workspace registry at ${this.filePath} is corrupted (expected a JSON array, got ${
          parsed === null ? 'null' : typeof parsed
        })`,
      );
    }

    return new Map<string, WorkspaceRecord>(
      (parsed as WorkspaceRecord[]).map((workspace) => [workspace.id, workspace]),
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
  /** The user the workspace runs as (audit; threaded into the object-storage token). */
  userId?: string;
  image: string;
  plan: WorkspacePlan;
  env: Record<string, string>;
  allowedSecretKeys: string[];
  allowedSecrets?: Record<string, string>;
  /** App-facing object storage: in-cluster API URL + the project-scoped access token. */
  objectStorage?: { apiUrl: string; accessToken: string };
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
    const existing = await this.store.get(input.workspaceId);

    /*
     * Reopening a workspace that is still RUNNING (the api always POSTs
     * /workspaces/start on every project reopen, even when already RUNNING) would
     * otherwise blindly stamp lastMeteredAt=now below, jumping the marker past the
     * entire un-metered RUNNING window (metering only happens at stop, never
     * periodically) — a user who keeps an IDE open for hours and reopens it is
     * never charged for that compute. Capture the window first: #meterRuntimeOnStop
     * is idempotent (claimMeterWindow CAS) and advances the marker to the current
     * lastActiveAt, so the fresh now-stamp below no longer discards anything.
     */
    if (existing && existing.status === 'RUNNING') {
      await this.#meterRuntimeOnStop(existing);
    }

    const resetUpdate = {
      ...baseRecord,
      error: undefined,
      lastActiveAt: new Date().toISOString(),

      /*
       * Reset the metering marker on reopen too. The previous session's stop meter
       * (or the RUNNING-reopen meter just above) advanced lastMeteredAt to the OLD
       * lastActiveAt; without resetting it here, the next stop meters
       * startMs=lastMeteredAt(old end) → endMs=new lastActiveAt, billing the entire
       * STOPPED window (pod deleted, zero compute) as reserved compute. Start the
       * meter fresh from the re-provision moment.
       */
      lastMeteredAt: new Date().toISOString(),
    };

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
      await this.#applyWorkspacePod(workspacePod(runtimeInput), input.namespace, record.podName);
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

  /*
   * SERVER DEPLOYMENTS (Replit-parity durable runtime). A server deployment runs
   * the user's built backend as a durable Deployment + Service + exact-host Ingress
   * (public URL under the preview wildcard cert). Env + per-env secrets (incl. the
   * prod DATABASE_URL) are injected via an `app-secrets-<id>` Secret. These live in
   * the SAME runtime namespace + gVisor sandbox as workspace pods.
   */
  async startServerDeployment(input: {
    deploymentId: string;
    namespace: string;
    orgId?: string;
    projectId?: string;
    image: string;
    command?: string[];
    args?: string[];
    port: number;
    host: string;
    tlsSecretName: string;
    env?: Record<string, string>;
    // Secret-backed env (name -> value); stored in an app-secrets-<id> Secret.
    secrets?: Record<string, string>;
    replicas?: number;
    healthPath?: string;
    readyTimeoutMs?: number;
    /*
     * Create an exact-host Ingress in the runtime namespace. OFF by default: the
     * default deploy routing is the preview-proxy host-routing `d-<id>.<domain>`
     * (which reuses the platform-ns wildcard cert). An exact-host Ingress here
     * would instead register its OWN server block for the host — with no cert in
     * this namespace it serves the fake default cert AND, being an exact match,
     * beats the wildcard so the proxy never sees the request. Only enable it in a
     * cluster where the wildcard TLS secret is mirrored into the runtime namespace.
     */
    createIngress?: boolean;
  }): Promise<{ ready: boolean; url: string; name: string; readyReplicas: number }> {
    const name = serverDeploymentName(input.deploymentId);
    const hasSecrets = Boolean(input.secrets && Object.keys(input.secrets).length > 0);
    const secretName = `app-secrets-${input.deploymentId}`;

    if (hasSecrets) {
      await this.k8s.apply({
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {
          name: secretName,
          namespace: input.namespace,
          labels: { 'vibecore.ai/server-deploy': input.deploymentId },
        },
        type: 'Opaque',
        stringData: input.secrets as Record<string, string>,
      });
    }

    const runtime: ServerRuntimeInput = {
      deploymentId: input.deploymentId,
      namespace: input.namespace,
      orgId: input.orgId,
      projectId: input.projectId,
      image: input.image,
      command: input.command,
      args: input.args,
      port: input.port,
      host: input.host,
      tlsSecretName: input.tlsSecretName,
      env: input.env,
      ...(hasSecrets
        ? {
            secretName,
            secretEnv: Object.fromEntries(Object.keys(input.secrets as Record<string, string>).map((k) => [k, k])),
          }
        : {}),
      replicas: input.replicas,
      healthPath: input.healthPath,
    };

    await this.k8s.apply(serverAppDeployment(runtime));
    await this.k8s.apply(serverAppService(runtime));

    if (input.createIngress) {
      await this.k8s.apply(serverAppIngress(runtime));
    }

    const ready = await this.#pollServerDeploymentReady(input.namespace, name, input.readyTimeoutMs ?? 120_000);
    const status = await this.getServerDeploymentStatus(input.namespace, input.deploymentId);

    return { ready, url: `https://${input.host}`, name, readyReplicas: status.readyReplicas };
  }

  async #pollServerDeploymentReady(namespace: string, name: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      const dep = (await this.k8s.get('Deployment', namespace, name).catch(() => undefined)) as
        | { status?: { readyReplicas?: number } }
        | undefined;

      if ((dep?.status?.readyReplicas ?? 0) >= 1) {
        return true;
      }

      if (Date.now() >= deadline) {
        return false;
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  async getServerDeploymentStatus(
    namespace: string,
    deploymentId: string,
  ): Promise<{ exists: boolean; readyReplicas: number; replicas: number }> {
    const dep = (await this.k8s
      .get('Deployment', namespace, serverDeploymentName(deploymentId))
      .catch(() => undefined)) as { status?: { readyReplicas?: number; replicas?: number } } | undefined;

    return {
      exists: Boolean(dep),
      readyReplicas: dep?.status?.readyReplicas ?? 0,
      replicas: dep?.status?.replicas ?? 0,
    };
  }

  async stopServerDeployment(namespace: string, deploymentId: string): Promise<{ stopped: true }> {
    const name = serverDeploymentName(deploymentId);

    // Best-effort teardown of all four resources; a straggler is caught by GC.
    await Promise.allSettled([
      this.k8s.delete('Ingress', namespace, name),
      this.k8s.delete('Service', namespace, name),
      this.k8s.delete('Deployment', namespace, name),
      this.k8s.delete('Secret', namespace, `app-secrets-${deploymentId}`),
    ]);

    return { stopped: true };
  }

  /*
   * ===== Server-deploy scale-to-zero (Replit-parity Autoscale) =====
   *
   * A deployed server app scales to 0 replicas when idle (no compute cost, the
   * Deployment/Service/routing stay in place) and back to 1 on the next request.
   * Unlike the workspace GC (which deletes bare Pods + PVCs), this is a pure
   * `replicas 0/1` toggle on the durable Deployment — the app source is baked
   * into the boot artifact, so a wake is a fresh pull+install+start, not a
   * reprovision. The annotation `vibecore.ai/last-request-at` (stamped by the
   * preview-proxy on live traffic, throttled) drives the idle decision.
   */
  static readonly LAST_REQUEST_ANNOTATION = 'vibecore.ai/last-request-at';

  private readonly lastServerTouchAt = new Map<string, number>();

  /**
   * Wake a server deployment: if it is scaled to 0 (or its pod is gone), scale to
   * 1 and poll readiness. Idempotent — a call while already ready is a fast
   * no-op. Also stamps the last-request time so it isn't immediately reaped.
   * Throws `{ code: 'SERVER_DEPLOY_NOT_FOUND' }` if the Deployment doesn't exist.
   */
  async activateServerDeployment(
    namespace: string,
    deploymentId: string,
    readyTimeoutMs = 60_000,
  ): Promise<{ ready: boolean; readyReplicas: number; wokeUp: boolean }> {
    const name = serverDeploymentName(deploymentId);
    const dep = (await this.k8s.get('Deployment', namespace, name).catch(() => undefined)) as
      | { spec?: { replicas?: number }; status?: { readyReplicas?: number } }
      | undefined;

    if (!dep) {
      throw Object.assign(new Error(`server deployment not found: ${deploymentId}`), {
        code: 'SERVER_DEPLOY_NOT_FOUND',
      });
    }

    // Best-effort activity stamp so the idle sweep doesn't race a just-woken app back to 0.
    await this.k8s
      .annotate('Deployment', namespace, name, WorkspaceManager.LAST_REQUEST_ANNOTATION, String(Date.now()))
      .catch(() => undefined);

    const alreadyReady = (dep.status?.readyReplicas ?? 0) >= 1;

    if (alreadyReady) {
      return { ready: true, readyReplicas: dep.status?.readyReplicas ?? 0, wokeUp: false };
    }

    const desiredReplicas = dep.spec?.replicas ?? 0;

    if (desiredReplicas < 1) {
      await this.k8s.scale('Deployment', namespace, name, 1);
    }

    const ready = await this.#pollServerDeploymentReady(namespace, name, readyTimeoutMs);
    const status = await this.getServerDeploymentStatus(namespace, deploymentId);

    return { ready, readyReplicas: status.readyReplicas, wokeUp: true };
  }

  /**
   * Record live traffic against a server deployment (throttled) so the idle
   * controller can measure inactivity. Cheap: an in-memory throttle gates the
   * annotation write to once per interval per deployment.
   */
  async touchServerDeployment(namespace: string, deploymentId: string): Promise<void> {
    const now = Date.now();
    const last = this.lastServerTouchAt.get(deploymentId) ?? 0;

    if (now - last < WORKSPACE_ACTIVITY_TOUCH_INTERVAL_MS) {
      return;
    }

    this.lastServerTouchAt.set(deploymentId, now);

    await this.k8s
      .annotate(
        'Deployment',
        namespace,
        serverDeploymentName(deploymentId),
        WorkspaceManager.LAST_REQUEST_ANNOTATION,
        String(now),
      )
      .catch(() => {
        // Row/Deployment may be gone; drop the throttle marker so a later touch retries.
        this.lastServerTouchAt.delete(deploymentId);
      });
  }

  /**
   * Scale to 0 every server deployment whose last request is older than
   * `idleMs`. A deployment with NO last-request annotation yet uses its creation
   * timestamp as the floor, so a freshly-deployed-but-never-hit app is given the
   * full idle window before its first sleep. Already-zero deployments are
   * skipped. Returns the ids it put to sleep (for logging/metrics).
   */
  async reapIdleServerDeployments(namespace: string, idleMs: number): Promise<string[]> {
    const now = Date.now();
    const deployments = await this.k8s
      .listByLabel('Deployment', namespace, 'vibecore.ai/server-deploy')
      .catch(() => [] as Awaited<ReturnType<typeof this.k8s.listByLabel>>);

    const slept: string[] = [];

    for (const dep of deployments) {
      try {
        const meta = (
          dep as {
            metadata?: {
              name?: string;
              labels?: Record<string, string>;
              annotations?: Record<string, string>;
              creationTimestamp?: string;
            };
          }
        ).metadata;
        const spec = (dep as { spec?: { replicas?: number } }).spec;
        const deploymentId = meta?.labels?.['vibecore.ai/server-deploy'];

        if (!meta?.name || !deploymentId) {
          continue;
        }

        // Already asleep — nothing to do.
        if ((spec?.replicas ?? 0) < 1) {
          continue;
        }

        const lastRequestRaw = meta.annotations?.[WorkspaceManager.LAST_REQUEST_ANNOTATION];
        const lastRequestMs = lastRequestRaw
          ? Number(lastRequestRaw)
          : new Date(meta.creationTimestamp ?? now).getTime();

        if (Number.isNaN(lastRequestMs) || now - lastRequestMs < idleMs) {
          continue;
        }

        await this.k8s.scale('Deployment', namespace, meta.name, 0);
        this.lastServerTouchAt.delete(deploymentId);
        slept.push(deploymentId);
      } catch (error) {
        // Isolate each deployment: a transient error must not abort the whole sweep.
        console.error('server-deploy idle reap failed', {
          deployment: (dep as { metadata?: { name?: string } }).metadata?.name,
          error,
        });
      }
    }

    return slept;
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

    /*
     * Meter the active-runtime window on EVERY stop transition, not just the GC
     * path. Runtime compute is metered only at stop (never periodically), so a
     * user-facing stop (api POST /workspaces/:id/stop), a restart (stop→start),
     * and the GC STOPPED→delete sweep must all capture marker→lastActiveAt here —
     * otherwise the active window of any explicitly stopped/restarted workspace
     * (the common case) is silently dropped from billing. #meterRuntimeOnStop is
     * idempotent via claimMeterWindow's CAS: the GC paths that already metered
     * before calling stopWorkspace advanced the marker, so this re-meter sees a
     * zero-length window and is a no-op rather than a double-charge.
     */
    await this.#meterRuntimeOnStop(workspace);

    await this.k8s.delete('Pod', namespace, workspace.podName);

    const stopped = await this.store.update(workspaceId, { status: 'STOPPED' });

    /*
     * Drop the throttle marker so a later reopen (same deterministic id) touches
     * immediately instead of waiting out a stale window.
     */
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
      /*
       * Isolate each workspace: a transient kubectl/network error (or a row
       * concurrently deleted by another sweep) must not abort the whole GC pass
       * and leave every later workspace's pod/PVC leaking. Log and continue.
       */
      try {
        /*
         * Re-read each row under its freshest state before acting. store.list()
         * is a point-in-time snapshot, and workspace ids are deterministic per
         * (project, user): reopening a project re-enters startWorkspace for the
         * SAME id, flipping the row STOPPED→STARTING and bumping lastActiveAt.
         * Acting on the stale snapshot raced that re-provision — GC deleted the
         * PVC in the window between startWorkspace's PVC-apply and Pod-apply, so
         * the freshly created pod referenced a now-deleted claim and sat Pending
         * forever ("persistentvolumeclaim not found"), spinning the cluster
         * autoscaler at real cost. Re-evaluating against live state closes it.
         */
        const workspace = await this.store.get(snapshot.id);

        if (!workspace) {
          continue;
        }

        const inactiveFor = now - new Date(workspace.lastActiveAt).getTime();

        /*
         * Pass the observed state as an optimistic guard so a reopen that races
         * between this decision and the actual k8s deletes aborts the reap.
         */
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
            /*
             * The pod died externally; stopWorkspace meters the consumed runtime
             * window (post-guard) before flipping the row to STOPPED.
             */
            await this.stopWorkspace(namespace, workspace.id, guard);
            continue;
          }
        }

        if (workspace.status === 'RUNNING' && inactiveFor > inactiveMs) {
          /*
           * Idle past the window — but never stop a pod mid build/install/deploy.
           * lastActiveAt is entirely CLIENT-driven (agent-token mints + the IDE's
           * 60s heartbeat), so a long headless `npm install` / `vite build` /
           * deploy with no open IDE tab does NOT refresh activity and would be
           * reaped mid-flight, corrupting node_modules or a half-written dist/.
           * Probe the agent's /busy first and skip this tick if it is running a
           * transient build/install. On ANY probe failure isAgentBusy returns
           * false and we proceed: an unreachable agent means the pod is dead/gone,
           * and stopping keeps the PVC (exactly what the pod-gone branch does).
           */
          if (await this.isAgentBusy(workspace.id, namespace)) {
            console.log(
              JSON.stringify({
                level: 'info',
                service: 'workspace-manager',
                event: 'workspace.gc.skip_busy',
                workspaceId: workspace.id,
                namespace,
              }),
            );
            continue;
          }

          /*
           * stopWorkspace meters the active runtime window (marker→lastActiveAt),
           * post-guard, before flipping to STOPPED.
           */
          await this.stopWorkspace(namespace, workspace.id, guard);
        } else if (workspace.status === 'STOPPED' && inactiveFor > deleteMs) {
          await this.deleteWorkspace(namespace, workspace.id, guard);
        } else if ((workspace.status === 'FAILED' || workspace.status === 'STARTING') && inactiveFor > deleteMs) {
          /*
           * Reap abandoned provisioning. A FAILED start (readiness timeout, or a
           * PVC reaped out from under it) — and a STARTING row orphaned by a
           * manager crash mid-provision — were never collected: GC only walked
           * RUNNING→STOPPED→DELETED. Their Pod/PVC/Secret leaked indefinitely and
           * any Pending pod kept the autoscaler retrying scale-up. lastActiveAt is
           * stamped at start, so a legitimately in-flight start (seconds to the
           * ~180s readiness window, far below deleteMs) is never caught here. The
           * row goes DELETED and reopening re-provisions via the reuse path.
           */
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

      /*
       * Claim the window via a compare-and-set BEFORE posting, so only one of the
       * two GC replicas meters it: advance lastMeteredAt to endMs only if it still
       * equals what we read. The losing replica's claim returns false and it skips
       * the POST — no cross-replica double-bill. (Conservative: if the POST then
       * fails we under-meter this window rather than risk double-charging.)
       */
      const claimed = await this.store.claimMeterWindow(
        workspace.id,
        workspace.lastMeteredAt,
        new Date(endMs).toISOString(),
      );

      if (!claimed) {
        return;
      }

      const compute = PLAN_METER_COMPUTE[workspace.plan] ?? PLAN_METER_COMPUTE.free;
      await postWorkspaceComputeMetering({
        organizationId: workspace.orgId,
        projectId: workspace.projectId,
        cpuMillicores: compute.cpuMillicores,
        ramMb: compute.ramMb,
        seconds,
      });
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
      /*
       * Don't record a throttle entry for an unknown/non-running id — otherwise a
       * caller touching arbitrary ids grows lastTouchAt without bound (leak).
       */
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

  /*
   * Apply the workspace Pod, recreating it when its spec changed in a way
   * Kubernetes forbids editing in place. On a cold start the pod is absent and
   * this is a plain create; on an unchanged reopen `kubectl apply` is a no-op and
   * the warm pod is left running untouched (preserving the live dev server). Only
   * a real immutable change — the user added a project secret / DATABASE_URL, the
   * plan resources changed — makes apply fail; we then delete and recreate the pod
   * so the new spec takes effect. The PVC (and therefore all project data) is
   * never touched, so this is non-destructive to files.
   */
  async #applyWorkspacePod(pod: Parameters<WorkspaceK8sClient['apply']>[0], namespace: string, podName: string) {
    try {
      await this.k8s.apply(pod);

      return;
    } catch (error) {
      if (!isImmutablePodUpdateError(error)) {
        throw error;
      }

      console.warn(
        JSON.stringify({
          level: 'warn',
          service: 'workspace-manager',
          event: 'workspace.pod.recreate_for_immutable_change',
          namespace,
          podName,
          message: 'Pod spec changed in an immutable field (e.g. added secret / DATABASE_URL); recreating the pod.',
        }),
      );
    }

    await this.k8s.delete('Pod', namespace, podName);
    await this.#waitForPodGone(namespace, podName);
    await this.k8s.apply(pod);
  }

  /*
   * Poll until the pod is fully gone after a delete, so the subsequent re-apply
   * doesn't race a still-terminating pod ("object is being deleted"). Bounded so a
   * stuck termination surfaces as a clean start failure rather than hanging.
   */
  async #waitForPodGone(namespace: string, podName: string) {
    const parsed = Number(process.env.WORKSPACE_POD_DELETE_TIMEOUT_MS);
    const timeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const pod = await this.k8s.getPod(namespace, podName).catch(() => null);

      if (!pod) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }

    throw Object.assign(new Error(`Timed out waiting for pod ${podName} to terminate before recreation`), {
      code: 'WORKSPACE_POD_DELETE_TIMEOUT',
    });
  }

  private async waitForReadiness(namespace: string, podName: string) {
    const startedAt = Date.now();

    /*
     * NaN-safe: `?? 180_000` only covers an undefined env var, so a misconfigured
     * non-numeric WORKSPACE_READINESS_TIMEOUT_MS would make Number(...) NaN and the
     * loop below (`< NaN` is always false) skip readiness polling entirely.
     */
    const parsedTimeout = Number(process.env.WORKSPACE_READINESS_TIMEOUT_MS);

    /*
     * 240s default (was 180s). Must comfortably exceed the unschedulable grace
     * (150s) so that a pod which schedules late — right after the autoscaler adds a
     * gvisor node — still has room to pull its image and reach Ready before the wait
     * times out, instead of failing the provision the moment the node arrives.
     */
    const timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 240_000;

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

        /*
         * Fail fast on a terminal pod state (OOMKilled / CrashLoopBackOff /
         * Failed) instead of spinning the full readiness timeout and throwing
         * an opaque "not ready" — the API can then surface an actionable error.
         */
        const failure = detectPodTerminalFailure(typedPod);

        if (failure) {
          throw Object.assign(new Error(failure.message), { code: failure.code });
        }

        /*
         * Within the grace window an Unschedulable pod is not yet terminal, but we
         * surface the scheduling reason so the stall reads as "allocating capacity"
         * rather than an opaque wait (the autoscaler may still bring up a node).
         */
        const pending = pendingScheduleReason(typedPod);

        if (pending) {
          console.warn(
            JSON.stringify({
              level: 'warn',
              service: 'workspace-manager',
              event: 'workspace.pod.unschedulable_waiting',
              namespace,
              podName,
              reason: pending.reason,
              message: pending.message,
            }),
          );
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
   * WORKSPACE_AGENT_URL_TEMPLATE / WORKSPACE_AGENT_BASE_URL overrides) so this
   * gate exercises the real client path, not pod-local networking.
   */
  private agentHealthUrl(workspaceId: string, namespace: string): string {
    return `${resolveAgentBaseUrl(workspaceId, namespace)}/health`;
  }

  /*
   * Ask the workspace agent whether it is running a transient build/install/
   * deploy, so #garbageCollect can spare an idle-but-busy pod from the idle-stop
   * branch. Probes the SAME Service DNS the start-gate uses, bounded at 3s.
   *
   * FAIL-SAFE: any error / timeout / non-2xx / malformed body → returns false
   * (NOT busy). An unreachable agent means a dead or gone pod; stopping it keeps
   * the PVC and is safe. A dedicated TS-private method (not a `#private`) so the
   * unit tests can spy it, mirroring the manager's existing injected-collaborator
   * style. Override the probe timeout — or disable the real fetch entirely with a
   * value <= 0 (unit tests, no real agent Service) — via
   * WORKSPACE_AGENT_BUSY_PROBE_TIMEOUT_MS.
   */
  private async isAgentBusy(workspaceId: string, namespace: string): Promise<boolean> {
    const parsed = Number(process.env.WORKSPACE_AGENT_BUSY_PROBE_TIMEOUT_MS);

    if (Number.isFinite(parsed) && parsed <= 0) {
      return false;
    }

    /*
     * Auto-disable under vitest unless explicitly configured (same reason as
     * waitForAgentReachable): the repo-root `vitest --run` glob omits this
     * package's vitest.config env, so this real `/busy` fetch would otherwise run
     * against an unresolvable cluster DNS on every GC test. Fail-safe default is
     * "not busy". VITEST is never set in production.
     */
    if (process.env.WORKSPACE_AGENT_BUSY_PROBE_TIMEOUT_MS === undefined && process.env.VITEST) {
      return false;
    }

    const timeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : 3_000;

    try {
      const res = await fetch(`${resolveAgentBaseUrl(workspaceId, namespace)}/busy`, {
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        return false;
      }

      const body = (await res.json().catch(() => null)) as { busy?: unknown } | null;

      return body?.busy === true;
    } catch {
      return false;
    }
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

    /*
     * An explicit 0/negative disables the probe entirely (unit tests, where there
     * is no real agent Service to reach).
     */
    if (Number.isFinite(parsed) && parsed <= 0) {
      return;
    }

    /*
     * Auto-disable under vitest unless a timeout is EXPLICITLY set. This
     * package's vitest.config sets WORKSPACE_AGENT_REACHABLE_TIMEOUT_MS=0, but the
     * repo-root `vitest --run` globs this spec WITHOUT that per-package env — so
     * every startWorkspace test would otherwise block the full 45s default on a
     * real fetch to a cluster DNS that can't resolve, turning the suite into a
     * ~16-minute run that trips the vitest worker's onTaskUpdate timeout and makes
     * CI flaky. VITEST is never set in production, so prod behavior is unchanged.
     */
    if (process.env.WORKSPACE_AGENT_REACHABLE_TIMEOUT_MS === undefined && process.env.VITEST) {
      return;
    }

    const url = this.agentHealthUrl(workspaceId, namespace);

    /*
     * 45s default: a gVisor agent can take 20-30s to start listening under node
     * CPU contention, and RUNNING must not be reported before it is routable.
     */
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
      /*
       * Surface a real 404 (the manager has no Fastify error handler, so a bare
       * Error would default to 500). Callers — notably the API stop route — need
       * to tell "this workspace no longer exists" apart from a transient fault
       * so they can treat a stop/delete of an unknown workspace as idempotent.
       */
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
    conditions?: Array<{
      type?: string;
      status?: string;
      reason?: string;
      message?: string;
      lastTransitionTime?: string;
    }>;
    containerStatuses?: Array<{
      state?: { waiting?: { reason?: string }; terminated?: { reason?: string } };
      lastState?: { terminated?: { reason?: string } };
    }>;
  };
};

/*
 * Grace period for an Unschedulable pod before it is treated as terminal.
 * A pod can sit PodScheduled=False/Unschedulable for a few seconds while the
 * cluster autoscaler provisions a new gvisor sandbox node (node-pool scale from
 * zero). Failing instantly would break the normal cold-start-from-zero path, so
 * we only surface the coded error once the condition has persisted past this
 * window. Override via WORKSPACE_UNSCHEDULABLE_GRACE_MS.
 */
/*
 * Resolve the agent base URL the SAME way as app.ts agentBaseUrl, so the
 * manager's start-time reachability gate probes the exact address the
 * api/preview-proxy clients use. Honors the optional WORKSPACE_AGENT_URL_TEMPLATE
 * override and its WORKSPACE_AGENT_BASE_URL alias before falling back to the
 * default per-workspace Service DNS. Templates may contain {workspaceId} and
 * {namespace} placeholders; trailing slashes are trimmed so callers can append
 * a path segment cleanly.
 */
export function resolveAgentBaseUrl(workspaceId: string, namespace: string): string {
  const template = process.env.WORKSPACE_AGENT_URL_TEMPLATE ?? process.env.WORKSPACE_AGENT_BASE_URL;

  if (template) {
    return template.replaceAll('{workspaceId}', workspaceId).replaceAll('{namespace}', namespace).replace(/\/+$/, '');
  }

  return `http://workspace-${workspaceId}.${namespace}.svc.cluster.local:8080`;
}

export function unschedulableGraceMs(): number {
  const parsed = Number(process.env.WORKSPACE_UNSCHEDULABLE_GRACE_MS);

  /*
   * 150s default (was 30s). When the gvisor sandbox pool is at capacity a new
   * workspace pod sits PodScheduled=False/Unschedulable ("Insufficient cpu") until
   * the cluster autoscaler provisions a fresh gvisor node — which, measured in prod,
   * takes ~75-120s (VM boot + gvisor runtime init + node registration). A 30s grace
   * declared the provision FAILED while the node was still coming up; the client then
   * threw a terminal "Workspace failed to start (status: stopped)" even though the pod
   * scheduled and ran ~a minute later. The grace must outlast a cold node scale-up so
   * a transient "allocating capacity" stall is not mistaken for a terminal failure.
   */
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 150_000;
}

function isPodReady(pod: PodStatusView) {
  return (
    pod.status?.conditions?.some((condition) => condition.type === 'Ready' && condition.status === 'True') === true
  );
}

/*
 * Returns the Unschedulable reason/message if the pod currently cannot be placed,
 * else null. Used to log "allocating capacity" while still inside the grace window
 * (before detectPodTerminalFailure escalates it to a terminal error).
 */
function pendingScheduleReason(pod: PodStatusView): { reason: string; message: string } | null {
  const scheduled = pod.status?.conditions?.find((condition) => condition.type === 'PodScheduled');

  if (scheduled && scheduled.status === 'False' && scheduled.reason === 'Unschedulable') {
    return { reason: scheduled.reason, message: scheduled.message ?? '' };
  }

  return null;
}

/**
 * Detect a terminal pod failure that readiness polling would otherwise never
 * recognize (it only checks Ready=True). Returns a coded error or null.
 *
 * `now`/`graceMs` only matter for the Unschedulable path: a pod that cannot be
 * placed (no gvisor sandbox node, CPU/quota exhausted, PVC unbound) sits Pending
 * with PodScheduled=False/Unschedulable. We give the autoscaler a grace window to
 * provision a node before surfacing the coded error, so the slow stall becomes an
 * actionable WORKSPACE_POD_UNSCHEDULABLE instead of an opaque 180s "not ready".
 */
/*
 * `kubectl apply` on a Pod that already exists and whose spec changed in a field
 * Kubernetes forbids editing in place (env, secret refs, resources, …) fails with
 * "Pod … is invalid: spec: Forbidden: pod updates may not change fields other than
 * `spec.containers[*].image`, …" (or a plain "field is immutable"). A running
 * workspace hitting this on reopen — the common trigger is the user adding a
 * project secret / DATABASE_URL, which the api folds into the pod env — used to
 * fail the ENTIRE start, so the secret never reached the pod and the workspace
 * would not come up. We detect this specific class so startWorkspace can recover
 * by recreating the pod instead of failing.
 */
export function isImmutablePodUpdateError(error: unknown): boolean {
  const parts = [
    (error as { stderr?: unknown } | undefined)?.stderr,
    (error as { message?: unknown } | undefined)?.message,
  ];
  const text = parts.map((part) => (typeof part === 'string' ? part : '')).join('\n');

  return /pod updates may not change fields other than|field is immutable|spec:\s*Forbidden/i.test(text);
}

export function detectPodTerminalFailure(
  pod: PodStatusView,
  now: number = Date.now(),
  graceMs: number = unschedulableGraceMs(),
): { message: string; code: string } | null {
  if (pod.status?.phase === 'Failed') {
    return { message: 'Workspace pod failed to start', code: 'WORKSPACE_POD_FAILED' };
  }

  /*
   * Unschedulable: the scheduler could not place the pod (no available gvisor
   * sandbox node, insufficient CPU/quota, or an unbound PVC). Only fail once the
   * condition has persisted past the grace window — a fresh scale-from-zero
   * legitimately sits Unschedulable for a few seconds. We anchor the elapsed time
   * on the condition's lastTransitionTime; if it is missing/unparseable we
   * conservatively keep waiting (return null) rather than fail an otherwise
   * possibly-progressing provision.
   */
  const scheduled = pod.status?.conditions?.find((condition) => condition.type === 'PodScheduled');

  if (scheduled && scheduled.status === 'False' && scheduled.reason === 'Unschedulable') {
    const since = scheduled.lastTransitionTime ? Date.parse(scheduled.lastTransitionTime) : Number.NaN;

    if (Number.isFinite(since) && now - since >= graceMs) {
      const detail = scheduled.message ? `: ${scheduled.message}` : '';

      return {
        message: `Workspace pod could not be scheduled — no capacity available${detail}`,
        code: 'WORKSPACE_POD_UNSCHEDULABLE',
      };
    }
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
