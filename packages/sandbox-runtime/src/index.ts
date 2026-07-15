/*
 * SandboxRuntime — the runtime-isolation boundary of the platform.
 *
 * ARCHITECTURE RULE (2026-07-15): no business object is a Kubernetes Pod. A
 * deployment, a workspace, a scheduled run are PRODUCT objects; how they are
 * isolated and executed (gVisor pod today, microVM tomorrow — Replit's public
 * trajectory, April 2026) is an adapter concern behind this interface. No
 * product API may depend on gVisor (or Kubernetes) directly.
 *
 * Adapters advertise capabilities so product features can gate on WHAT the
 * runtime can do (COW snapshots, suspend/resume, GPU…) instead of hard-coding
 * WHICH runtime is deployed. Runtime selection is env-driven with a canary
 * hook (SANDBOX_RUNTIME + SANDBOX_RUNTIME_PROJECTS) and no silent fallback: an
 * unknown runtime id is a startup error, not a quiet default.
 */
import {
  serverAppDeployment,
  serverAppIngress,
  serverAppService,
  serverDeploymentName,
  type K8sObject,
  type ServerRuntimeInput,
  type WorkspaceK8sClient,
} from '@vibecore/k8s-client';

/** What a runtime adapter can and cannot do. Product features gate on these. */
export interface RuntimeCapabilities {
  /** Copy-on-write filesystem snapshots of a running sandbox. */
  cowSnapshot: boolean;

  /** Freeze/thaw a sandbox with memory state (sub-second wake). */
  suspendResume: boolean;
  gpu: boolean;

  /** FUSE mounts inside the sandbox. */
  fuse: boolean;

  /** Per-sandbox egress policy enforcement. */
  egressPolicy: boolean;
  architectures: readonly string[];
  nestedVirtualization: boolean;
}

/** A durable server app (the product object behind a Publish). */
export interface ServerAppSpec {
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
  secretName?: string;
  secretEnv?: Record<string, string>;
  replicas?: number;
  healthPath?: string;
  readyTimeoutMs?: number;
  createIngress?: boolean;
  nixStorePvcName?: string;
}

export interface ServerAppStatus {
  exists: boolean;
  readyReplicas: number;
  replicas: number;
}

/**
 * The runtime-isolation contract. Today it covers the durable server-app
 * lifecycle (start/stop/status); workspaces and scheduled runs migrate next.
 */
export interface SandboxRuntime {
  readonly id: string;
  readonly capabilities: RuntimeCapabilities;

  startServerApp(spec: ServerAppSpec): Promise<{ ready: boolean; url: string; name: string; readyReplicas: number }>;
  stopServerApp(namespace: string, deploymentId: string): Promise<void>;
  serverAppStatus(namespace: string, deploymentId: string): Promise<ServerAppStatus>;
}

/*
 * ---------------------------------------------------------------------------
 * gVisor-on-Kubernetes adapter — the ONLY runtime in production today. It owns
 * every Kubernetes detail the manager used to hard-code: manifests, readiness
 * polling, teardown. Measured, not assumed: capabilities reflect what the
 * current GKE Sandbox deployment actually provides.
 * ---------------------------------------------------------------------------
 */
export class GvisorPodRuntime implements SandboxRuntime {
  readonly id = 'gvisor-pod';

  readonly capabilities: RuntimeCapabilities = {
    // PD/PVC-backed filesystems: no COW snapshot of a live sandbox.
    cowSnapshot: false,

    // Pods scale 0↔1; there is no memory-state suspend under gVisor.
    suspendResume: false,
    gpu: false,

    // gVisor blocks FUSE mounts in our GKE Sandbox config.
    fuse: false,

    // NetworkPolicy-based (namespace-scoped), enforced today.
    egressPolicy: true,
    architectures: ['amd64'],
    nestedVirtualization: false,
  };

  constructor(
    private readonly k8s: WorkspaceK8sClient,
    private readonly pollIntervalMs = 3000,
  ) {}

  async startServerApp(spec: ServerAppSpec) {
    const name = serverDeploymentName(spec.deploymentId);
    const runtime: ServerRuntimeInput = {
      deploymentId: spec.deploymentId,
      namespace: spec.namespace,
      orgId: spec.orgId,
      projectId: spec.projectId,
      image: spec.image,
      command: spec.command,
      args: spec.args,
      port: spec.port,
      host: spec.host,
      tlsSecretName: spec.tlsSecretName,
      env: spec.env,
      ...(spec.secretName ? { secretName: spec.secretName, secretEnv: spec.secretEnv ?? {} } : {}),
      replicas: spec.replicas,
      healthPath: spec.healthPath,
      nixStorePvcName: spec.nixStorePvcName,
    };

    await this.k8s.apply(serverAppDeployment(runtime));
    await this.k8s.apply(serverAppService(runtime));

    if (spec.createIngress) {
      await this.k8s.apply(serverAppIngress(runtime));
    }

    const ready = await this.#pollReady(spec.namespace, name, spec.readyTimeoutMs ?? 120_000);
    const status = await this.serverAppStatus(spec.namespace, spec.deploymentId);

    return { ready, url: `https://${spec.host}`, name, readyReplicas: status.readyReplicas };
  }

  async stopServerApp(namespace: string, deploymentId: string): Promise<void> {
    const name = serverDeploymentName(deploymentId);

    // Best-effort teardown of all four resources; a straggler is caught by GC.
    await Promise.allSettled([
      this.k8s.delete('Ingress', namespace, name),
      this.k8s.delete('Service', namespace, name),
      this.k8s.delete('Deployment', namespace, name),
      this.k8s.delete('Secret', namespace, `app-secrets-${deploymentId}`),
    ]);
  }

  async serverAppStatus(namespace: string, deploymentId: string): Promise<ServerAppStatus> {
    const dep = (await this.k8s
      .get('Deployment', namespace, serverDeploymentName(deploymentId))
      .catch(() => undefined)) as (K8sObject & { status?: { readyReplicas?: number; replicas?: number } }) | undefined;

    return {
      exists: Boolean(dep),
      readyReplicas: dep?.status?.readyReplicas ?? 0,
      replicas: dep?.status?.replicas ?? 0,
    };
  }

  async #pollReady(namespace: string, name: string, timeoutMs: number): Promise<boolean> {
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

      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
  }
}

/*
 * Runtime selection. SANDBOX_RUNTIME picks the adapter (default gvisor-pod —
 * the kill-switch is "unset"); SANDBOX_RUNTIME_PROJECTS is the canary hook: a
 * '*'/comma-list of project ids that get the selected runtime while everyone
 * else stays on the default. With one adapter today the canary resolves to the
 * same implementation — the wiring exists so a second runtime (microVM) lands
 * as pure configuration, never a product-code change.
 */
export function resolveSandboxRuntime(
  k8s: WorkspaceK8sClient,
  env: Record<string, string | undefined> = process.env,
): SandboxRuntime {
  const id = env.SANDBOX_RUNTIME?.trim() || 'gvisor-pod';

  // No silent fallback: an unknown runtime is a deploy-time configuration
  // error, not something to paper over with a default at request time.
  if (id !== 'gvisor-pod') {
    throw Object.assign(new Error(`Unknown sandbox runtime '${id}' (known: gvisor-pod)`), {
      code: 'SANDBOX_RUNTIME_UNKNOWN',
    });
  }

  return new GvisorPodRuntime(k8s);
}

/** True when `projectId` is in the canary allowlist ('*' = all, empty = none). */
export function sandboxRuntimeCanaryIncludes(
  projectId: string | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const allow = env.SANDBOX_RUNTIME_PROJECTS?.trim();

  if (!allow || !projectId) {
    return false;
  }

  return (
    allow === '*' ||
    allow
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .includes(projectId)
  );
}
