import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

/*
 * Bound every kubectl invocation. Node's execFile default timeout is 0 (none),
 * so if the API server is reachable at TCP level but stops responding (control-
 * plane upgrade, node preemption, throttling, network blackhole), a provision /
 * delete / log call would hang forever, pinning the manager request and leaking
 * the child process. The timeout kills the child; --request-timeout also bounds
 * kubectl's own API wait so it exits cleanly first when possible.
 */
const KUBECTL_TIMEOUT_MS = Number(process.env.KUBECTL_TIMEOUT_MS) || 30_000;
const KUBECTL_REQUEST_TIMEOUT = process.env.KUBECTL_REQUEST_TIMEOUT || '25s';

export type WorkspacePlan = 'free' | 'pro' | 'enterprise';

// Platform-owned pod env names that user project env/secrets must never override.
// Platform/agent-control env names user project env/secrets must never set. Beyond
// the two the pod spec injects, the workspace-agent reads these resource-limit /
// control vars and falls back to in-agent defaults when unset — so a user env var
// would be the ONLY value, letting a tenant raise their own process/file/output
// caps and timeouts (resource abuse). Reserve the agent-control namespace.
const RESERVED_WORKSPACE_ENV = new Set([
  'WORKSPACE_ROOT',
  'WORKSPACE_AGENT_TOKEN_SECRET',
  'WORKSPACE_ID',
  'WORKSPACE_MAX_PROCESSES',
  'WORKSPACE_MAX_OUTPUT_BYTES',
  'WORKSPACE_MAX_FILE_BYTES',
  'WORKSPACE_COMMAND_TIMEOUT_MS',
  'WORKSPACE_STREAM_TIMEOUT_MS',
  'WORKSPACE_DISABLE_SANDBOX_SCHEDULING',
]);

export interface WorkspaceRuntimeInput {
  namespace: string;
  orgId: string;
  projectId: string;
  workspaceId: string;
  image: string;
  pvcName: string;
  agentTokenSecretName: string;
  env: Record<string, string>;
  secretEnv: Record<string, string>;
  plan: WorkspacePlan;
  resourceLimits?: WorkspaceResourceLimits;
  tokenSecret?: string;
  storageClassName?: string;
}

export interface WorkspaceResourceLimits {
  cpuMillicores?: number;
  ramMb?: number;
  storageGb?: number;
}

export interface K8sObject {
  apiVersion: string;
  kind: string;
  metadata: { name: string; namespace?: string; labels?: Record<string, string> };
  spec?: Record<string, unknown>;
  data?: Record<string, string>;
  stringData?: Record<string, string>;
  type?: string;
}

export interface WorkspaceK8sClient {
  apply(object: K8sObject): Promise<K8sObject>;
  delete(kind: string, namespace: string, name: string): Promise<void>;
  get(kind: string, namespace: string, name: string): Promise<K8sObject | undefined>;
  getPod(namespace: string, name: string): Promise<K8sObject | undefined>;
  streamPodLogs(namespace: string, name: string): AsyncIterable<string>;
}

export const defaultWorkspaceEgressBlockedCidrs = Object.freeze([
  '169.254.169.254/32',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
]);

export function workspaceEgressBlockedCidrs(additionalBlockedCidrs: readonly string[] = []) {
  const cidrs = new Set<string>();

  for (const cidr of [...defaultWorkspaceEgressBlockedCidrs, ...additionalBlockedCidrs]) {
    const normalized = cidr.trim();

    if (normalized) {
      cidrs.add(normalized);
    }
  }

  return Array.from(cidrs);
}

export function assertWorkspaceImageAllowed(image: string, production = process.env.NODE_ENV === 'production') {
  if (production && /(^|:)latest$/i.test(image)) {
    throw Object.assign(new Error('Workspace images must be pinned in production'), {
      code: 'WORKSPACE_IMAGE_LATEST_FORBIDDEN',
    });
  }
}

const planResources: Record<
  WorkspacePlan,
  { cpuRequest: string; memoryRequest: string; cpuLimit: string; memoryLimit: string; storageRequest: string }
> = {
  free: { cpuRequest: '250m', memoryRequest: '512Mi', cpuLimit: '1', memoryLimit: '1Gi', storageRequest: '10Gi' },
  pro: { cpuRequest: '500m', memoryRequest: '1Gi', cpuLimit: '2', memoryLimit: '4Gi', storageRequest: '20Gi' },
  enterprise: { cpuRequest: '1', memoryRequest: '2Gi', cpuLimit: '4', memoryLimit: '8Gi', storageRequest: '100Gi' },
};

function labels(input: Pick<WorkspaceRuntimeInput, 'orgId' | 'projectId' | 'workspaceId'>) {
  return {
    'app.kubernetes.io/name': 'vibecore-workspace',
    'vibecore.ai/org-id': input.orgId,
    'vibecore.ai/project-id': input.projectId,
    'vibecore.ai/workspace-id': input.workspaceId,
  };
}

export function workspacePvc(input: WorkspaceRuntimeInput): K8sObject {
  const resources = resolveWorkspaceResources(input);
  return {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: { name: input.pvcName, namespace: input.namespace, labels: labels(input) },
    spec: {
      accessModes: ['ReadWriteOnce'],
      ...(input.storageClassName ? { storageClassName: input.storageClassName } : {}),
      resources: { requests: { storage: resources.storageRequest } },
    },
  };
}

export function workspaceService(input: WorkspaceRuntimeInput): K8sObject {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: `workspace-${input.workspaceId}`, namespace: input.namespace, labels: labels(input) },
    spec: {
      selector: labels(input),
      ports: [{ name: 'agent', port: 8080, targetPort: 8080 }],
    },
  };
}

export function workspaceAgentSecret(input: WorkspaceRuntimeInput): K8sObject {
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: { name: input.agentTokenSecretName, namespace: input.namespace, labels: labels(input) },
    type: 'Opaque',
    stringData: {
      tokenSecret: input.tokenSecret ?? '',
    },
  };
}

export function workspacePod(input: WorkspaceRuntimeInput): K8sObject {
  assertWorkspaceImageAllowed(input.image);

  const resources = resolveWorkspaceResources(input);
  const sandboxSchedulingEnabled = process.env.WORKSPACE_DISABLE_SANDBOX_SCHEDULING !== '1';

  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: `workspace-${input.workspaceId}`, namespace: input.namespace, labels: labels(input) },
    spec: {
      hostNetwork: false,
      hostPID: false,
      hostIPC: false,
      ...(sandboxSchedulingEnabled
        ? {
            runtimeClassName: 'gvisor',
            nodeSelector: { 'vibecore.ai/node-pool': 'sandbox' },
            tolerations: [
              { key: 'vibecore.ai/sandbox', operator: 'Equal', value: 'true', effect: 'NoSchedule' },
              { key: 'sandbox.gke.io/runtime', operator: 'Equal', value: 'gvisor', effect: 'NoSchedule' },
            ],
          }
        : {}),
      automountServiceAccountToken: false,
      securityContext: {
        runAsNonRoot: true,
        runAsUser: 1000,
        runAsGroup: 1000,
        fsGroup: 1000,
        seccompProfile: { type: 'RuntimeDefault' },
      },
      containers: [
        {
          name: 'workspace-agent',
          image: input.image,
          ports: [{ containerPort: 8080, name: 'agent' }],
          env: [
            { name: 'WORKSPACE_ROOT', value: '/workspace' },
            /*
             * WORKSPACE_ID is platform-reserved (the agent reads its identity from
             * process.env.WORKSPACE_ID), so it is filtered out of the manager/user
             * env below to stop a tenant spoofing it. Re-inject the authoritative
             * value here — exactly like WORKSPACE_ROOT — otherwise the reserved
             * filter strips the manager's own WORKSPACE_ID and the agent boots
             * with no identity (workspace provisioning broken).
             */
            { name: 'WORKSPACE_ID', value: input.workspaceId },
            {
              name: 'WORKSPACE_AGENT_TOKEN_SECRET',
              valueFrom: { secretKeyRef: { name: input.agentTokenSecretName, key: 'tokenSecret' } },
            },
            /*
             * Strip platform-reserved names from user-supplied env/secrets so a
             * project variable named WORKSPACE_AGENT_TOKEN_SECRET / WORKSPACE_ROOT
             * can't shadow or spoof the real ones (k8s keeps the LAST entry for a
             * duplicate name, so an appended user value would win).
             */
            ...Object.entries(input.env)
              .filter(([name]) => !RESERVED_WORKSPACE_ENV.has(name))
              .map(([name, value]) => ({ name, value })),
            ...Object.entries(input.secretEnv)
              .filter(([name]) => !RESERVED_WORKSPACE_ENV.has(name))
              .map(([name, key]) => ({
                name,

                /*
                 * optional so a referenced key that is absent from the Secret (e.g. a
                 * newly-added project secret not yet synced) cannot brick pod startup
                 * with CreateContainerConfigError.
                 */
                valueFrom: { secretKeyRef: { name: input.agentTokenSecretName, key, optional: true } },
              })),
          ],
          volumeMounts: [{ name: 'workspace', mountPath: '/workspace' }],
          resources: {
            requests: { cpu: resources.cpuRequest, memory: resources.memoryRequest },
            limits: { cpu: resources.cpuLimit, memory: resources.memoryLimit },
          },
          readinessProbe: { httpGet: { path: '/health', port: 8080 }, initialDelaySeconds: 2, periodSeconds: 5 },
          livenessProbe: { httpGet: { path: '/health', port: 8080 }, initialDelaySeconds: 10, periodSeconds: 10 },
          securityContext: {
            allowPrivilegeEscalation: false,
            privileged: false,
            runAsNonRoot: true,
            runAsUser: 1000,
            capabilities: { drop: ['ALL'] },
            seccompProfile: { type: 'RuntimeDefault' },
          },
        },
      ],
      volumes: [{ name: 'workspace', persistentVolumeClaim: { claimName: input.pvcName } }],
    },
  };
}

export function workspaceRuntimeClass(): K8sObject {
  return {
    apiVersion: 'node.k8s.io/v1',
    kind: 'RuntimeClass',
    metadata: { name: 'gvisor' },
    spec: { handler: 'runsc' },
  };
}

export function workspaceResourceQuota(namespace: string): K8sObject {
  return {
    apiVersion: 'v1',
    kind: 'ResourceQuota',
    metadata: { name: 'workspace-runtime-quota', namespace },
    spec: {
      hard: {
        pods: '500',
        'requests.cpu': '250',
        'requests.memory': '500Gi',
        'limits.cpu': '1000',
        'limits.memory': '2Ti',
        /*
         * Keep requests.storage IN SYNC with the Helm chart's authoritative
         * value (infra/helm/workspaces-runtime/values.yaml resourceQuota.requestsStorage,
         * deliberately 4000Gi to stay under the regional persistent-disk quota —
         * the fix from audit waves 23/24). This object and the chart both produce
         * a ResourceQuota named `workspace-runtime-quota`; a divergent value here
         * (was 10Ti) would, if ever applied, overwrite the chart's and re-break
         * provisioning with QUOTA_EXCEEDED.
         */
        'requests.storage': '4000Gi',
        persistentvolumeclaims: '500',
      },
    },
  };
}

/*
 * Workspace pods run on modest sandbox nodes (e2-standard-4: ~3.9 vCPU / ~13Gi
 * allocatable) and the `workspaces` namespace enforces a per-Container LimitRange
 * (see workspaceLimitRange). Billing plans grant nominal ceilings far above what a
 * single sandbox node can host — enterprise entitles 16 vCPU / 64Gi — and those
 * entitlements arrive here as `resourceLimits`. A Pod whose limits exceed the
 * LimitRange max is REJECTED by admission ("maximum cpu usage per Container is 4,
 * but limit is 16"); because the PVC and Secret are applied first and survive, the
 * workspace is left stuck FAILED with a blank editor and a dead preview. Clamp the
 * per-container ceilings to what the namespace actually allows so every plan
 * provisions a working (if smaller) runtime instead of failing outright. These
 * constants are the single source of truth for the LimitRange max below — keep them
 * in sync so the clamp can never drift above admission again.
 *
 * Storage has the same failure mode through a different gate: the per-workspace PVC
 * size arrives as `resourceLimits.storageGb`, but callers may hand us an account-wide
 * entitlement (e.g. the Enterprise plan's `storage.gb: 10_000` total allotment) rather
 * than a per-workspace size. A 10_000Gi PVC exceeds the regional `DISKS_TOTAL_GB`
 * quota on its own, so the CSI provisioner rejects it (QUOTA_EXCEEDED), the PVC stays
 * Pending, and the Pod never schedules — same blank-editor / dead-preview outcome.
 * Clamp the per-workspace disk to the largest plan default so an oversized entitlement
 * can never wedge provisioning.
 */
export const WORKSPACE_CONTAINER_MAX_CPU_MILLICORES = 4000;
export const WORKSPACE_CONTAINER_MAX_RAM_MB = 8192;
export const WORKSPACE_CONTAINER_MAX_DISK_GB = 100;

function resolveWorkspaceResources(input: WorkspaceRuntimeInput) {
  const plan = planResources[input.plan];
  const cpuMillicores = clampPositive(
    positiveInteger(input.resourceLimits?.cpuMillicores),
    WORKSPACE_CONTAINER_MAX_CPU_MILLICORES,
  );
  const ramMb = clampPositive(positiveInteger(input.resourceLimits?.ramMb), WORKSPACE_CONTAINER_MAX_RAM_MB);
  const storageGb = clampPositive(positiveInteger(input.resourceLimits?.storageGb), WORKSPACE_CONTAINER_MAX_DISK_GB);

  /*
   * request = ceil-floor of the limit, but capped AT the limit: the request
   * floors (50m / 128Mi) must never exceed the limit for a sub-floor custom
   * entitlement (e.g. cpu=40m → floor 50m), or the Pod spec is invalid
   * (request > limit) and provisioning fails outright.
   */
  return {
    cpuRequest: cpuMillicores
      ? formatCpuMillicores(Math.min(cpuMillicores, Math.max(50, Math.floor(cpuMillicores / 4))))
      : plan.cpuRequest,
    memoryRequest: ramMb ? formatMemoryMb(Math.min(ramMb, Math.max(128, Math.floor(ramMb / 4)))) : plan.memoryRequest,
    cpuLimit: cpuMillicores ? formatCpuMillicores(cpuMillicores) : plan.cpuLimit,
    memoryLimit: ramMb ? formatMemoryMb(ramMb) : plan.memoryLimit,
    storageRequest: storageGb ? `${storageGb}Gi` : plan.storageRequest,
  };
}

function positiveInteger(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  const rounded = Math.floor(value);

  return rounded > 0 ? rounded : undefined;
}

function clampPositive(value: number | undefined, max: number): number | undefined {
  return value === undefined ? undefined : Math.min(value, max);
}

function formatCpuMillicores(value: number) {
  return value % 1000 === 0 ? String(value / 1000) : `${value}m`;
}

function formatMemoryMb(value: number) {
  return `${value}Mi`;
}

export function workspaceLimitRange(namespace: string): K8sObject {
  return {
    apiVersion: 'v1',
    kind: 'LimitRange',
    metadata: { name: 'workspace-runtime-limits', namespace },
    spec: {
      limits: [
        {
          type: 'Container',
          defaultRequest: { cpu: '250m', memory: '512Mi' },
          default: { cpu: '1', memory: '1Gi' },
          max: {
            cpu: formatCpuMillicores(WORKSPACE_CONTAINER_MAX_CPU_MILLICORES),
            memory: formatMemoryMb(WORKSPACE_CONTAINER_MAX_RAM_MB),
          },
        },
      ],
    },
  };
}

export function defaultDenyNetworkPolicy(namespace: string): K8sObject {
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: { name: 'workspace-default-deny', namespace },
    spec: { podSelector: {}, policyTypes: ['Ingress', 'Egress'] },
  };
}

export function controlledEgressNetworkPolicy(
  namespace: string,
  additionalBlockedCidrs: readonly string[] = [],
): K8sObject {
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: { name: 'workspace-controlled-egress', namespace },
    spec: {
      podSelector: { matchLabels: { 'app.kubernetes.io/name': 'vibecore-workspace' } },
      policyTypes: ['Egress'],
      egress: [
        {
          to: [{ namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': 'kube-system' } } }],
          ports: [
            { protocol: 'UDP', port: 53 },
            { protocol: 'TCP', port: 53 },
          ],
        },
        {
          to: [{ ipBlock: { cidr: '0.0.0.0/0', except: workspaceEgressBlockedCidrs(additionalBlockedCidrs) } }],
          ports: [{ protocol: 'TCP', port: 443 }],
        },
      ],
    },
  };
}

export function managerAndPreviewIngressNetworkPolicy(namespace: string, platformNamespace = 'vibecore'): K8sObject {
  const platformCaller = (name: string) => ({
    namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': platformNamespace } },
    podSelector: { matchLabels: { 'app.kubernetes.io/name': name } },
  });

  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: { name: 'workspace-manager-preview-ingress', namespace },
    spec: {
      podSelector: { matchLabels: { 'app.kubernetes.io/name': 'vibecore-workspace' } },
      policyTypes: ['Ingress'],
      ingress: [
        {
          from: [platformCaller('workspace-manager')],
          ports: [{ protocol: 'TCP', port: 8080 }],
        },
        {
          from: [platformCaller('api')],
          ports: [{ protocol: 'TCP', port: 8080 }],
        },
        {
          from: [platformCaller('preview-proxy')],
          ports: [{ protocol: 'TCP', port: 8080 }],
        },
      ],
    },
  };
}

export class KubectlWorkspaceK8sClient implements WorkspaceK8sClient {
  constructor(readonly kubectl = process.env.KUBECTL_BIN ?? 'kubectl') {}

  async apply(object: K8sObject) {
    const dir = await mkdtemp(join(tmpdir(), 'vibecore-k8s-'));
    const manifest = join(dir, 'object.json');

    try {
      await writeFile(manifest, JSON.stringify(object));
      await execFile(this.kubectl, ['apply', '-f', manifest, `--request-timeout=${KUBECTL_REQUEST_TIMEOUT}`], {
        timeout: KUBECTL_TIMEOUT_MS,
      });

      return object;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async delete(kind: string, namespace: string, name: string) {
    await execFile(
      this.kubectl,
      ['delete', kind, name, '-n', namespace, '--ignore-not-found=true', `--request-timeout=${KUBECTL_REQUEST_TIMEOUT}`],
      { timeout: KUBECTL_TIMEOUT_MS },
    );
  }

  async getPod(namespace: string, name: string) {
    return this.getResource('pod', namespace, name);
  }

  // Generic single-resource read; returns undefined when the object is genuinely
  // absent. Used to make apply idempotent for immutable resources like PVCs that
  // must not be re-applied with a changed spec.
  async get(kind: string, namespace: string, name: string) {
    return this.getResource(kind, namespace, name);
  }

  /*
   * Only a real "NotFound" maps to undefined. kubectl exits 1 for MANY reasons —
   * Forbidden (RBAC), Unauthorized, connection-refused, API-server throttling —
   * and mapping all of them to "absent" masked transient/permission failures and
   * defeated the PVC idempotency guard (a transient error → "not found" → re-apply
   * a bound PVC → shrink-forbidden wedge). Inspect stderr and rethrow anything
   * that isn't an explicit NotFound.
   */
  private async getResource(kind: string, namespace: string, name: string): Promise<K8sObject | undefined> {
    const { stdout } = await execFile(
      this.kubectl,
      ['get', kind, name, '-n', namespace, '-o', 'json', `--request-timeout=${KUBECTL_REQUEST_TIMEOUT}`],
      { timeout: KUBECTL_TIMEOUT_MS },
    ).catch(
      (error: any) => {
        const stderr = String(error?.stderr ?? '');

        if (error?.code === 1 && /\bNotFound\b|not found/i.test(stderr)) {
          return { stdout: '' };
        }

        throw error;
      },
    );

    return stdout ? (JSON.parse(stdout) as K8sObject) : undefined;
  }

  async *streamPodLogs(namespace: string, name: string) {
    // Bump maxBuffer well above Node's 1MB default: 500 tail lines of a verbose
    // workspace can exceed 1MB, which would otherwise throw ENOBUFS and 500.
    const { stdout } = await execFile(
      this.kubectl,
      ['logs', name, '-n', namespace, '--tail=500', `--request-timeout=${KUBECTL_REQUEST_TIMEOUT}`],
      {
        maxBuffer: 16 * 1024 * 1024,
        timeout: KUBECTL_TIMEOUT_MS,
      },
    );

    for (const line of stdout.split('\n').filter(Boolean)) {
      yield line;
    }
  }
}
