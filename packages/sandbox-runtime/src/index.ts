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

/** Internal runtime invariant; public APIs map these failures to localized copy. */
function reservedVmRuntimeError(message: string): Error {
  return new Error(message);
}

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

  /** D3 multi-zone: zone of the mounted store clone (pins the app pod there). */
  nixStoreZone?: string;

  /** D3 drift guard: expected sha256 of /nix/ecode/catalog.json. */
  nixStoreGenerationHash?: string;

  /*
   * Machine size (rate-card catalogue): applied verbatim as the container's
   * resources. requests==limits by contract — the size the user picked is the
   * machine they get and the machine they are billed for.
   */
  cpuRequest?: string;
  cpuLimit?: string;
  memoryRequest?: string;
  memoryLimit?: string;
  runtimeKind?: 'autoscale' | 'reserved-vm';
  persistentVolumeClaimName?: string;
  persistentVolumeMountPath?: string;
  reservedNodeSelector?: { key: string; value: string };
  reservedToleration?: { key: string; value: string; effect: 'NoSchedule' };
  operationId?: string;
  fencingToken?: number;
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

  startServerApp(spec: ServerAppSpec): Promise<{
    ready: boolean;
    url: string;
    name: string;
    readyReplicas: number;
    appliedFencingToken?: number;
  }>;
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
    const hasOperationId = Boolean(spec.operationId);
    const hasFencingToken = Number.isInteger(spec.fencingToken) && Number(spec.fencingToken) >= 0;

    if (hasOperationId !== hasFencingToken) {
      throw Object.assign(reservedVmRuntimeError('Runtime operation fencing metadata is incomplete.'), {
        code: 'RESERVED_VM_OPERATION_FENCE_REQUIRED',
        statusCode: 409,
      });
    }

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
      nixStoreZone: spec.nixStoreZone,
      nixStoreGenerationHash: spec.nixStoreGenerationHash,
      cpuRequest: spec.cpuRequest,
      cpuLimit: spec.cpuLimit,
      memoryRequest: spec.memoryRequest,
      memoryLimit: spec.memoryLimit,
      runtimeKind: spec.runtimeKind,
      persistentVolumeClaimName: spec.persistentVolumeClaimName,
      persistentVolumeMountPath: spec.persistentVolumeMountPath,
      reservedNodeSelector: spec.reservedNodeSelector,
      reservedToleration: spec.reservedToleration,
      operationId: spec.operationId,
      fencingToken: spec.fencingToken,
    };

    const deployment = serverAppDeployment(runtime);

    if (hasOperationId && hasFencingToken) {
      await this.#applyFencedDeployment(deployment, spec.operationId!, spec.fencingToken!);
    } else {
      await this.k8s.apply(deployment);
    }
    await this.k8s.apply(serverAppService(runtime));

    if (spec.createIngress) {
      await this.k8s.apply(serverAppIngress(runtime));
    }

    const expectedFence =
      hasOperationId && hasFencingToken
        ? { operationId: spec.operationId!, fencingToken: spec.fencingToken! }
        : undefined;
    const ready = await this.#pollReady(spec.namespace, name, spec.readyTimeoutMs ?? 120_000, expectedFence);
    const status = await this.serverAppStatus(spec.namespace, spec.deploymentId);

    return {
      ready,
      url: `https://${spec.host}`,
      name,
      readyReplicas: status.readyReplicas,
      ...(hasFencingToken ? { appliedFencingToken: spec.fencingToken } : {}),
    };
  }

  async stopServerApp(namespace: string, deploymentId: string): Promise<void> {
    const name = serverDeploymentName(deploymentId);
    const targets = [
      { kind: 'Ingress', name },
      { kind: 'Service', name },
      { kind: 'Deployment', name },
      { kind: 'Secret', name: `app-secrets-${deploymentId}` },
    ] as const;

    // Attempt every teardown, then prove absence. Billing callers may only
    // release a Reserved VM hold after this method resolves successfully.
    await Promise.allSettled(targets.map((target) => this.k8s.delete(target.kind, namespace, target.name)));

    const remaining: string[] = [];

    try {
      for (const target of targets) {
        if (await this.k8s.get(target.kind, namespace, target.name)) {
          remaining.push(`${target.kind}/${target.name}`);
        }
      }
    } catch (error) {
      throw Object.assign(reservedVmRuntimeError('Server deployment cleanup could not be verified.'), {
        code: 'SERVER_DEPLOY_CLEANUP_UNVERIFIED',
        statusCode: 503,
        cause: error,
      });
    }

    if (remaining.length > 0) {
      throw Object.assign(reservedVmRuntimeError(`Server deployment resources remain: ${remaining.join(', ')}`), {
        code: 'SERVER_DEPLOY_CLEANUP_UNVERIFIED',
        statusCode: 503,
      });
    }
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

  async #applyFencedDeployment(object: K8sObject, operationId: string, fencingToken: number): Promise<K8sObject> {
    if (!this.k8s.applyFenced) {
      throw Object.assign(reservedVmRuntimeError('Kubernetes fenced writes are unavailable.'), {
        code: 'RESERVED_VM_OPERATION_FENCE_UNAVAILABLE',
        statusCode: 503,
      });
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.k8s
        .get(object.kind, object.metadata.namespace ?? 'default', object.metadata.name)
        .catch(() => undefined);
      const currentOperationId = current?.metadata.annotations?.['vibecore.ai/runtime-operation-id'];
      const currentFencingToken = Number(current?.metadata.annotations?.['vibecore.ai/runtime-fencing-token']);

      if (
        Number.isInteger(currentFencingToken) &&
        (currentFencingToken > fencingToken ||
          (currentFencingToken === fencingToken && currentOperationId && currentOperationId !== operationId))
      ) {
        throw Object.assign(reservedVmRuntimeError('A newer runtime operation owns this deployment.'), {
          code: 'RESERVED_VM_OPERATION_FENCE_LOST',
          statusCode: 409,
        });
      }

      if (current && !current.metadata.resourceVersion) {
        throw Object.assign(reservedVmRuntimeError('Kubernetes resourceVersion is unavailable for a fenced write.'), {
          code: 'RESERVED_VM_OPERATION_FENCE_UNAVAILABLE',
          statusCode: 503,
        });
      }

      try {
        return await this.k8s.applyFenced(object, current?.metadata.resourceVersion);
      } catch (error) {
        if (attempt === 2) {
          throw Object.assign(reservedVmRuntimeError('Kubernetes rejected the runtime fencing precondition.'), {
            code: 'RESERVED_VM_OPERATION_FENCE_CONFLICT',
            statusCode: 409,
            cause: error,
          });
        }
      }
    }

    throw reservedVmRuntimeError('unreachable');
  }

  async #pollReady(
    namespace: string,
    name: string,
    timeoutMs: number,
    expectedFence?: { operationId: string; fencingToken: number },
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      const dep = (await this.k8s.get('Deployment', namespace, name).catch(() => undefined)) as
        | (K8sObject & {
            status?: {
              availableReplicas?: number;
              observedGeneration?: number;
              readyReplicas?: number;
              updatedReplicas?: number;
            };
          })
        | undefined;

      if (dep && expectedFence) {
        const actualOperationId = dep.metadata.annotations?.['vibecore.ai/runtime-operation-id'];
        const actualFencingToken = Number(dep.metadata.annotations?.['vibecore.ai/runtime-fencing-token']);

        if (
          Number.isInteger(actualFencingToken) &&
          (actualFencingToken > expectedFence.fencingToken ||
            (actualFencingToken === expectedFence.fencingToken && actualOperationId !== expectedFence.operationId))
        ) {
          throw Object.assign(reservedVmRuntimeError('A newer runtime operation owns this deployment.'), {
            code: 'RESERVED_VM_OPERATION_FENCE_LOST',
            statusCode: 409,
          });
        }
      }

      const generation = dep?.metadata?.generation;
      const rolloutObserved = expectedFence
        ? dep?.metadata?.annotations?.['vibecore.ai/runtime-operation-id'] === expectedFence.operationId &&
          dep?.metadata?.annotations?.['vibecore.ai/runtime-fencing-token'] === String(expectedFence.fencingToken) &&
          Number.isInteger(generation) &&
          Number(dep?.status?.observedGeneration ?? -1) >= Number(generation) &&
          Number(dep?.status?.updatedReplicas ?? 0) >= 1 &&
          Number(dep?.status?.availableReplicas ?? 0) >= 1
        : true;

      if (rolloutObserved && (dep?.status?.readyReplicas ?? 0) >= 1) {
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

  /*
   * No silent fallback: an unknown runtime is a deploy-time configuration
   * error, not something to paper over with a default at request time.
   */
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
