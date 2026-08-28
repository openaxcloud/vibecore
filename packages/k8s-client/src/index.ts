import { execFile as execFileCallback } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { parseClusterCapacity, type ClusterCapacity } from './cluster-capacity.js';

export * from './cluster-capacity.js';

/*
 * Ephemeral per-run Pod for the "Scheduled" deployment type. Its own symbols
 * (scheduledJob*) — no overlap with the durable serverApp* runtime.
 */
export * from './scheduled-job.js';

/*
 * Ephemeral per-deploy build Pod (reproducible pipeline): revision in, built
 * artifact out, throwaway sandbox. Its own symbols (appBuild*).
 */
export * from './app-build.js';

/*
 * Nix store generation registry (rotation/révocation) + ecode.lock.json
 * (per-project toolchain lockfile) — CTR-RUNTIME-NIX. Pure domain modules;
 * consumed by the api (lock enforcement at publish) and the manager
 * (generation-aware store placement).
 */
export * from './nix-generations.js';
export * from './ecode-lock.js';

const execFile = promisify(execFileCallback);

/*
 * Plain `kubectl` does NOT auto-use a pod's service-account credentials: with no
 * kubeconfig it falls back to the default server `http://localhost:8080` and every
 * call dies with "connection refused" — which silently broke ALL workspace
 * provisioning in prod (manager start → kubectl get PVC → localhost:8080 refused →
 * workspace.failed → no pod → dead IDE/preview). The SA token is mounted
 * (automountServiceAccountToken), but nothing pointed kubectl at it. Build a
 * minimal in-cluster kubeconfig from the mounted SA so kubectl talks to the real
 * API server. tokenFile (not an embedded token) keeps the rotating token out of
 * the file and off the process args / error logs.
 *
 * Activates ONLY when genuinely in a pod (SA token present) and no explicit
 * KUBECONFIG is set, so local dev / CI / tests (which rely on ~/.kube/config or
 * mocks) are untouched.
 */
const SERVICE_ACCOUNT_DIR = '/var/run/secrets/kubernetes.io/serviceaccount';

function resolveInClusterKubeconfigArgs(): string[] {
  if (process.env.KUBECONFIG) {
    return [];
  }

  const host = process.env.KUBERNETES_SERVICE_HOST;
  const tokenFile = `${SERVICE_ACCOUNT_DIR}/token`;
  const caFile = `${SERVICE_ACCOUNT_DIR}/ca.crt`;

  if (!host || !existsSync(tokenFile) || !existsSync(caFile)) {
    return [];
  }

  const port = process.env.KUBERNETES_SERVICE_PORT_HTTPS || process.env.KUBERNETES_SERVICE_PORT || '443';
  const hostForUrl = host.includes(':') ? `[${host}]` : host; // bracket IPv6 literals

  const kubeconfig = {
    apiVersion: 'v1',
    kind: 'Config',
    clusters: [
      { name: 'in-cluster', cluster: { server: `https://${hostForUrl}:${port}`, 'certificate-authority': caFile } },
    ],
    users: [{ name: 'in-cluster', user: { tokenFile } }],
    contexts: [{ name: 'in-cluster', context: { cluster: 'in-cluster', user: 'in-cluster' } }],
    'current-context': 'in-cluster',
  };

  try {
    const dir = mkdtempSync(join(tmpdir(), 'vibecore-kubeconfig-'));
    const path = join(dir, 'config');
    writeFileSync(path, JSON.stringify(kubeconfig), { mode: 0o600 });

    return ['--kubeconfig', path];
  } catch {
    /*
     * If we can't materialize the kubeconfig, fall back to kubectl's own
     * resolution rather than crashing the client constructor.
     */
    return [];
  }
}

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

export type WorkspacePlan = 'free' | 'pro' | 'team' | 'enterprise';

/*
 * Platform-owned pod env names that user project env/secrets must never override.
 * Platform/agent-control env names user project env/secrets must never set. Beyond
 * the two the pod spec injects, the workspace-agent reads these resource-limit /
 * control vars and falls back to in-agent defaults when unset — so a user env var
 * would be the ONLY value, letting a tenant raise their own process/file/output
 * caps and timeouts (resource abuse). Reserve the agent-control namespace.
 */
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

  /*
   * The agent's bootstrap/runtime vars (set by the runtime image, not by the
   * manager). A tenant project env var of the same name would be injected into
   * the pod and override the image value: PORT/HOST would move the agent off
   * the port the Service/probes expect (provisioning bricked); NODE_ENV could
   * flip it out of production and downgrade requireProductionSecret's identity
   * guard; SHELL would hijack the interactive terminal's shell. Reserve them.
   */
  'PORT',
  'HOST',
  'SHELL',
  'NODE_ENV',

  /*
   * Platform-injected app context (see workspacePod). A tenant project var of the
   * same name would shadow the authoritative value the app's @e-code/sdk relies
   * on (PROJECT_ID) or let an app forge a wider-scoped storage token.
   */
  'PROJECT_ID',
  'OBJECT_STORAGE_API_URL',
  'OBJECT_STORAGE_ACCESS_TOKEN',
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
  /** App-facing object storage env injected into the pod (apiUrl + access token). */
  objectStorage?: { apiUrl: string; accessToken: string };

  /*
   * Replit-parity shared Nix store (candidate E). When set, the pre-built store
   * disk is mounted READ-ONLY at /nix from this ReadOnlyMany PVC — no download,
   * no compile: the runtime resolves a package's store path and links its bins
   * into a writable PATH dir (E-1 link-farm). KILL SWITCH: when unset, the pod
   * spec is byte-for-byte identical to the pre-Nix spec (no extra volume/mount),
   * so existing Node workspaces are untouched. The store is append-only and
   * pinned by generation in Helm values; evolving it = a new disk + re-point.
   */
  nixStorePvcName?: string;

  /*
   * D3 multi-zone (approved 2026-07-17): the store exists as an IDENTICAL zonal
   * clone in every active zone (same generation snapshot). The pod must be
   * pinned to the zone whose clone it mounts — a zonal PD can only attach in
   * its own zone, and without the pin the scheduler could place the pod in a
   * zone where the referenced PVC's disk does not exist (unschedulable pod).
   */
  nixStoreZone?: string;

  /*
   * Generation drift guard: `sha256:<64 hex>` of /nix/ecode/catalog.json for
   * the generation this pod expects. When set (with nixStorePvcName), an
   * initContainer verifies the mounted store's catalog hash BEFORE the
   * workspace starts — a clone carrying a different generation BLOCKS the pod
   * instead of silently serving drifted toolchains.
   */
  nixStoreGenerationHash?: string;
}

/* ---------------------------------------------------------------------------
 * D3 — multi-zone shared Nix store placement (approved 2026-07-17).
 *
 * The store is replicated as one IDENTICAL zonal pd clone per active zone
 * (same snapshot ⇒ same generationId/contentHash/signature). Since a PVC is
 * bound 1:1 to a zonal PV, the zone choice must happen at pod-creation time:
 * the caller picks a zone (topology-aware: the zone with live schedulable
 * sandbox capacity), mounts THAT zone's PVC and pins the pod there.
 * ------------------------------------------------------------------------- */

export interface NixStoreZonePvc {
  zone: string;
  pvcName: string;
}

/**
 * Parse the NIX_STORE_PVC_ZONES env format: `zone=pvcName[,zone=pvcName…]`,
 * e.g. `europe-west9-a=nix-store-v2-pvc,europe-west9-b=nix-store-v2-b-pvc`.
 * Order is the PREFERENCE order (first zone wins capacity ties). Malformed
 * entries are dropped rather than guessed at.
 */
export function parseNixStorePvcZones(raw: string | undefined): NixStoreZonePvc[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.indexOf('=');

      if (idx <= 0 || idx === entry.length - 1) {
        return undefined;
      }

      return { zone: entry.slice(0, idx).trim(), pvcName: entry.slice(idx + 1).trim() };
    })
    .filter((entry): entry is NixStoreZonePvc => Boolean(entry?.zone && entry?.pvcName));
}

/**
 * Pick the zone whose store clone a new pod should mount: the configured zone
 * with the most Ready, uncordoned nodes (any capacity signal beats none — a
 * cordoned/stocked-out zone counts 0 and loses). Ties resolve to CONFIGURED
 * ORDER (first = preferred, warm zone). With no usable signal at all (empty
 * node list, e.g. an RBAC failure upstream) it falls back to the first
 * configured zone — the pre-multi-zone behaviour, never a refusal.
 */
export function chooseNixStoreZone(
  zones: readonly NixStoreZonePvc[],
  nodes: readonly K8sObject[],
): NixStoreZonePvc | undefined {
  if (zones.length === 0) {
    return undefined;
  }

  const schedulable = new Map<string, number>();

  for (const node of nodes) {
    const raw = node as {
      metadata?: { labels?: Record<string, string> };
      spec?: { unschedulable?: boolean };
      status?: { conditions?: Array<{ type?: string; status?: string }> };
    };
    const zone = raw.metadata?.labels?.['topology.kubernetes.io/zone'];

    if (!zone || raw.spec?.unschedulable) {
      continue;
    }

    const ready = (raw.status?.conditions ?? []).some((c) => c.type === 'Ready' && c.status === 'True');

    if (!ready) {
      continue;
    }

    schedulable.set(zone, (schedulable.get(zone) ?? 0) + 1);
  }

  let best: NixStoreZonePvc | undefined;
  let bestCount = -1;

  for (const candidate of zones) {
    const count = schedulable.get(candidate.zone) ?? 0;

    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }

  return bestCount > 0 ? best : zones[0];
}

const NIX_GENERATION_HASH = /^sha256:[a-f0-9]{64}$/;

/**
 * Generation drift guard (D3: "une dérive bloque le pod"). Verifies the
 * mounted store's `/nix/ecode/catalog.json` — the ed25519-signed generation
 * catalog every clone carries — hashes to the expected value BEFORE the main
 * container starts. A clone restored from the wrong snapshot fails here and
 * the pod never runs with a drifted toolchain. Runs the pod's own image (it
 * is already pulled and provides sh + sha256sum).
 */
export function nixStoreGuardInitContainer(image: string, expectedCatalogHash: string) {
  if (!NIX_GENERATION_HASH.test(expectedCatalogHash)) {
    throw new Error(`nixStoreGenerationHash must be sha256:<64 hex>, got "${expectedCatalogHash}"`);
  }

  return {
    name: 'nix-store-guard',
    image,
    command: [
      'sh',
      '-c',
      'actual="sha256:$(sha256sum /nix/ecode/catalog.json | cut -c1-64)"; ' +
        'if [ "$actual" != "$NIX_STORE_EXPECTED_CATALOG_SHA256" ]; then ' +
        'echo "nix store generation drift: mounted $actual, expected $NIX_STORE_EXPECTED_CATALOG_SHA256 — refusing to start" >&2; exit 1; ' +
        'fi; echo "nix store generation verified ($actual)"',
    ],
    env: [{ name: 'NIX_STORE_EXPECTED_CATALOG_SHA256', value: expectedCatalogHash }],
    volumeMounts: [{ name: 'nix-store', mountPath: '/nix', readOnly: true }],
    resources: {
      requests: { cpu: '50m', memory: '32Mi' },
      limits: { cpu: '200m', memory: '64Mi' },
    },
    securityContext: {
      allowPrivilegeEscalation: false,
      privileged: false,
      runAsNonRoot: true,
      runAsUser: 1000,
      capabilities: { drop: ['ALL'] },
      seccompProfile: { type: 'RuntimeDefault' },
    },
  };
}

export interface WorkspaceResourceLimits {
  cpuMillicores?: number;
  ramMb?: number;
  storageGb?: number;
}

export interface K8sObject {
  apiVersion: string;
  kind: string;
  metadata: { name: string; namespace?: string; labels?: Record<string, string>; annotations?: Record<string, string> };
  spec?: Record<string, unknown>;
  data?: Record<string, string>;
  stringData?: Record<string, string>;
  type?: string;
  /**
   * Sous-ressource `status` renvoyée par l'API. `getResource` parse déjà le corps
   * complet, mais le type l'omettait — si bien qu'un appelant ne pouvait pas
   * OBSERVER l'aboutissement d'une opération (phase d'un `Backup` CNPG, par
   * exemple) et devait se contenter du fait que le CR ait été accepté. C'est la
   * différence entre « demandé » et « terminé » : sans ce champ, un backup ne
   * peut pas être *vérifié* (P0-V3-11, I-MIG-1).
   */
  status?: Record<string, unknown>;
}

export interface WorkspaceK8sClient {
  apply(object: K8sObject): Promise<K8sObject>;
  delete(kind: string, namespace: string, name: string): Promise<void>;
  get(kind: string, namespace: string, name: string): Promise<K8sObject | undefined>;
  getPod(namespace: string, name: string): Promise<K8sObject | undefined>;
  streamPodLogs(namespace: string, name: string): AsyncIterable<string>;
  scale(kind: string, namespace: string, name: string, replicas: number): Promise<void>;
  annotate(kind: string, namespace: string, name: string, key: string, value: string): Promise<void>;
  listByLabel(kind: string, namespace: string, labelSelector: string): Promise<K8sObject[]>;
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
  if (!production) {
    return;
  }

  // A digest-pinned image (repo@sha256:...) is always pinned — allow.
  if (image.includes('@')) {
    return;
  }

  /*
   * Determine the tag. The ':' that introduces a tag is the one AFTER the last
   * '/' (an earlier ':' is a registry port). A reference with NO such ':' has no
   * tag and docker defaults it to ':latest' — the old /(^|:)latest$/ check missed
   * this tag-less case, letting an unpinned image through in production.
   */
  const afterLastSlash = image.slice(image.lastIndexOf('/') + 1);
  const colon = afterLastSlash.lastIndexOf(':');
  const tag = colon >= 0 ? afterLastSlash.slice(colon + 1) : '';

  if (tag === '' || tag.toLowerCase() === 'latest') {
    throw Object.assign(new Error('Workspace images must be pinned in production'), {
      code: 'WORKSPACE_IMAGE_LATEST_FORBIDDEN',
    });
  }
}

export interface PlanResources {
  cpuRequest: string;
  memoryRequest: string;
  cpuLimit: string;
  memoryLimit: string;
  storageRequest: string;
}

/*
 * Built-in fallback table used when a plan carries no CUSTOM entitlement
 * (`resourceLimits`). These are the scheduler *requests* and *limits* the
 * per-workspace pod is created with. Requests drive node packing; limits let a
 * build burst. team/enterprise deliberately request only 500m (down from 750m/1
 * core) so mostly-idle workspaces pack far denser onto a sandbox node while the
 * 4-core limit still lets a build burst. free/pro already sit in the 250-500m
 * request / 1-2 core burst band, so they are left as-is.
 *
 * Operators can override any field per plan WITHOUT a code change via the
 * `WORKSPACE_PLAN_RESOURCES_JSON` env (wired through Helm on the
 * workspace-manager Deployment). Shape — a partial map, unknown plans/fields
 * ignored, each field validated and falling back to the default below on
 * garbage:
 *
 *   {"team":{"cpuRequest":"400m"},"enterprise":{"cpuRequest":"600m","cpuLimit":"4"}}
 *
 * Invariants enforced at parse time (see resolvePlanResourcesTable): a bad value
 * NEVER yields an invalid pod spec — request can never exceed limit, and limits
 * are clamped to the namespace LimitRange max, so a typo cannot brick admission.
 */
const PLAN_RESOURCE_DEFAULTS: Record<WorkspacePlan, PlanResources> = {
  free: { cpuRequest: '250m', memoryRequest: '512Mi', cpuLimit: '1', memoryLimit: '1Gi', storageRequest: '10Gi' },
  pro: { cpuRequest: '500m', memoryRequest: '1Gi', cpuLimit: '2', memoryLimit: '4Gi', storageRequest: '20Gi' },
  team: { cpuRequest: '500m', memoryRequest: '1.5Gi', cpuLimit: '4', memoryLimit: '8Gi', storageRequest: '50Gi' },
  enterprise: { cpuRequest: '500m', memoryRequest: '2Gi', cpuLimit: '4', memoryLimit: '8Gi', storageRequest: '100Gi' },
};

const PLAN_KEYS: WorkspacePlan[] = ['free', 'pro', 'team', 'enterprise'];

/** Parse a Kubernetes CPU quantity (`"250m"`, `"1"`, `"1.5"`) to millicores; undefined if malformed. */
function parseCpuMillicores(value: unknown): number | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  if (/^\d+m$/.test(trimmed)) {
    const n = Number(trimmed.slice(0, -1));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed) * 1000;
    return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
  }

  return undefined;
}

const MEMORY_SUFFIX_FACTORS: Record<string, number> = {
  '': 1,
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
};

/** Parse a Kubernetes memory/storage quantity (`"512Mi"`, `"1Gi"`, `"1.5Gi"`) to bytes; undefined if malformed. */
function parseMemoryBytes(value: unknown): number | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const match = value.trim().match(/^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|Pi|K|M|G|T|P)?$/);

  if (!match) {
    return undefined;
  }

  const num = Number(match[1]);
  const factor = MEMORY_SUFFIX_FACTORS[match[2] ?? ''];

  if (!Number.isFinite(num) || num <= 0 || factor === undefined) {
    return undefined;
  }

  return num * factor;
}

/*
 * Merge one plan's operator overrides onto its built-in defaults. Each field is
 * accepted only if it parses as a valid quantity, otherwise the default is kept
 * (per-field fallback). Limits are then clamped to the LimitRange max, and if a
 * resulting request would exceed its limit the whole request/limit pair reverts
 * to the (known-valid) defaults — so no override can ever produce request>limit
 * or a limit above namespace admission.
 */
function mergePlanResources(base: PlanResources, override: unknown): PlanResources {
  if (!override || typeof override !== 'object' || Array.isArray(override)) {
    return { ...base };
  }

  const o = override as Record<string, unknown>;

  const merged: PlanResources = {
    cpuRequest: parseCpuMillicores(o.cpuRequest) !== undefined ? String(o.cpuRequest).trim() : base.cpuRequest,
    cpuLimit: parseCpuMillicores(o.cpuLimit) !== undefined ? String(o.cpuLimit).trim() : base.cpuLimit,
    memoryRequest:
      parseMemoryBytes(o.memoryRequest) !== undefined ? String(o.memoryRequest).trim() : base.memoryRequest,
    memoryLimit: parseMemoryBytes(o.memoryLimit) !== undefined ? String(o.memoryLimit).trim() : base.memoryLimit,
    storageRequest:
      parseMemoryBytes(o.storageRequest) !== undefined ? String(o.storageRequest).trim() : base.storageRequest,
  };

  // Clamp limits to the namespace LimitRange max so an operator typo can never
  // push a Container above admission (which would strand the workspace FAILED).
  if ((parseCpuMillicores(merged.cpuLimit) ?? 0) > WORKSPACE_CONTAINER_MAX_CPU_MILLICORES) {
    merged.cpuLimit = formatCpuMillicores(WORKSPACE_CONTAINER_MAX_CPU_MILLICORES);
  }

  const maxRamBytes = WORKSPACE_CONTAINER_MAX_RAM_MB * 1024 * 1024;
  if ((parseMemoryBytes(merged.memoryLimit) ?? 0) > maxRamBytes) {
    merged.memoryLimit = formatMemoryMb(WORKSPACE_CONTAINER_MAX_RAM_MB);
  }

  // request must never exceed limit (an invalid pod spec fails provisioning
  // outright). On violation, revert both fields of the pair to the safe defaults.
  if ((parseCpuMillicores(merged.cpuRequest) ?? 0) > (parseCpuMillicores(merged.cpuLimit) ?? 0)) {
    merged.cpuRequest = base.cpuRequest;
    merged.cpuLimit = base.cpuLimit;
  }

  if ((parseMemoryBytes(merged.memoryRequest) ?? 0) > (parseMemoryBytes(merged.memoryLimit) ?? 0)) {
    merged.memoryRequest = base.memoryRequest;
    merged.memoryLimit = base.memoryLimit;
  }

  return merged;
}

/**
 * Build the per-plan fallback resource table, applying operator overrides from a
 * `WORKSPACE_PLAN_RESOURCES_JSON`-shaped string. Invalid JSON, missing keys, or
 * malformed values fall back to the built-in defaults per field — never throws.
 */
export function resolvePlanResourcesTable(raw?: string): Record<WorkspacePlan, PlanResources> {
  let overrides: Record<string, unknown> = {};

  if (raw && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        overrides = parsed as Record<string, unknown>;
      }
    } catch {
      // Invalid JSON → keep built-in defaults for every plan.
    }
  }

  const table = {} as Record<WorkspacePlan, PlanResources>;
  for (const plan of PLAN_KEYS) {
    table[plan] = mergePlanResources(PLAN_RESOURCE_DEFAULTS[plan], overrides[plan]);
  }

  return table;
}

let cachedPlanResources: Record<WorkspacePlan, PlanResources> | undefined;

/**
 * Memoized fallback table. Parsed once from `WORKSPACE_PLAN_RESOURCES_JSON` on
 * first use (deferred to call time so the LimitRange-max constants are already
 * initialized), then reused for the process lifetime.
 */
function getPlanResources(): Record<WorkspacePlan, PlanResources> {
  if (!cachedPlanResources) {
    cachedPlanResources = resolvePlanResourcesTable(process.env.WORKSPACE_PLAN_RESOURCES_JSON);
  }

  return cachedPlanResources;
}

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

  /*
   * D3 multi-zone: a pod mounting a zonal store clone must be pinned to that
   * clone's zone (the PV's disk only attaches there). Present ONLY when the
   * caller resolved a zone — otherwise the selector is byte-for-byte unchanged.
   */
  const nixZoneSelector: Record<string, string> =
    input.nixStorePvcName && input.nixStoreZone ? { 'topology.kubernetes.io/zone': input.nixStoreZone } : {};

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
            nodeSelector: { 'vibecore.ai/node-pool': 'sandbox', ...nixZoneSelector },
            tolerations: [
              { key: 'vibecore.ai/sandbox', operator: 'Equal', value: 'true', effect: 'NoSchedule' },
              { key: 'sandbox.gke.io/runtime', operator: 'Equal', value: 'gvisor', effect: 'NoSchedule' },
            ],
          }
        : Object.keys(nixZoneSelector).length > 0
          ? { nodeSelector: nixZoneSelector }
          : {}),
      // Generation drift guard (D3): verify the mounted clone's catalog hash
      // before the agent starts — a wrong-generation clone blocks the pod.
      ...(input.nixStorePvcName && input.nixStoreGenerationHash
        ? { initContainers: [nixStoreGuardInitContainer(input.image, input.nixStoreGenerationHash)] }
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
             * App-facing platform context: PROJECT_ID is always injected; the
             * object-storage API URL + access token are injected only when the
             * feature is active (the api passes `objectStorage`). Reserved below so
             * a tenant env var can't spoof them. The generated app's `@e-code/sdk`
             * reads these to talk to its own project bucket.
             */
            { name: 'PROJECT_ID', value: input.projectId },

            /*
             * Vite HMR behind the preview proxy: the dev server binds in-pod
             * localhost:5173 but the browser reaches the preview over the TLS
             * proxy, so Vite's HMR client must open its websocket against the
             * public host on 443/wss (else it builds `wss://localhost:undefined`
             * and HMR is dead for every proxied Vite project). The scaffolded
             * vite.config reads these; VITE_HMR_HOST is deliberately unset so the
             * client uses the page's own hostname (the per-project preview
             * domain). Harmless for non-Vite projects (unused env).
             */
            { name: 'VITE_HMR_CLIENT_PORT', value: '443' },
            { name: 'VITE_HMR_PROTOCOL', value: 'wss' },
            ...(input.objectStorage
              ? [
                  { name: 'OBJECT_STORAGE_API_URL', value: input.objectStorage.apiUrl },
                  { name: 'OBJECT_STORAGE_ACCESS_TOKEN', value: input.objectStorage.accessToken },
                ]
              : []),

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
          volumeMounts: [
            { name: 'workspace', mountPath: '/workspace' },
            // Kill switch: the /nix RO mount appears ONLY when a store PVC is set;
            // otherwise this array is byte-for-byte the original single mount.
            ...(input.nixStorePvcName ? [{ name: 'nix-store', mountPath: '/nix', readOnly: true }] : []),
          ],
          resources: {
            requests: { cpu: resources.cpuRequest, memory: resources.memoryRequest },
            limits: { cpu: resources.cpuLimit, memory: resources.memoryLimit },
          },

          /*
           * Readiness gates traffic (safe to flap); keep it responsive but allow
           * a 3s timeout so a momentarily busy agent isn't marked NotReady.
           */
          readinessProbe: {
            httpGet: { path: '/health', port: 8080 },
            // 1s sampling so the agent takes traffic ~1s after /health answers
            // (2s delay + 5s period made every cold open wait for the probe, not
            // the agent). failureThreshold keeps the same 15s tolerance window as
            // the previous 3×5s, so a momentarily busy agent still isn't flapped.
            initialDelaySeconds: 0,
            periodSeconds: 1,
            timeoutSeconds: 3,
            failureThreshold: 15,
          },

          /*
           * Liveness uses a TCP socket check, NOT httpGet /health. Verified live:
           * a heavy `npm install` (full React/Vite app) pegs the pod's CPU, and
           * under gVisor the agent's HTTP /health handler gets starved of CPU
           * scheduling for minutes — so an httpGet liveness failed even with a
           * 300s window, and the kubelet SIGTERM-restarted the pod mid-install
           * (node_modules left half-populated, dev server never started). A TCP
           * check only verifies the agent's port is still bound (kernel-level
           * accept), which the listening HTTP server satisfies throughout a busy
           * install — so a healthy-but-busy agent is no longer recycled, while a
           * genuinely dead agent (port closed) is still caught (~150s). Readiness
           * stays httpGet so traffic is only routed once /health truly answers.
           */
          livenessProbe: {
            tcpSocket: { port: 8080 },
            initialDelaySeconds: 10,
            periodSeconds: 15,
            timeoutSeconds: 5,
            failureThreshold: 10,
          },
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
      volumes: [
        { name: 'workspace', persistentVolumeClaim: { claimName: input.pvcName } },
        // Kill switch: matches the volumeMount above — present only when opted in.
        ...(input.nixStorePvcName
          ? [{ name: 'nix-store', persistentVolumeClaim: { claimName: input.nixStorePvcName, readOnly: true } }]
          : []),
      ],
    },
  };
}

/* ---------------------------------------------------------------------------
 * SERVER DEPLOYMENT runtime (Replit-parity "Autoscale / Reserved VM").
 *
 * A server deployment is a DURABLE workload (unlike the ephemeral workspace Pod):
 * a Deployment (restarts, replicas, rolling update) running the user's built
 * backend, fronted by a Service + an exact-host Ingress under the existing
 * `*.preview.e-code.ai` wildcard cert (so no new DNS/TLS is needed). The pod keeps
 * the same gVisor sandbox + hardened securityContext as the workspace pod, since it
 * runs untrusted user code. Env + per-env secrets (incl. the prod DATABASE_URL) are
 * injected the same way as the workspace pod (plain env + secretKeyRef).
 * ------------------------------------------------------------------------- */

export interface ServerRuntimeInput {
  /** Stable deployment id — names all resources `app-<deploymentId>`. */
  deploymentId: string;
  namespace: string;
  orgId?: string;
  projectId?: string;
  /** Runtime container image (platform-controlled; e.g. the workspace-agent image). */
  image: string;
  /** Container entrypoint override + args (e.g. ["sh","-c","npm start"]). */
  command?: string[];
  args?: string[];
  /** Port the app listens on (also injected as PORT). */
  port: number;
  replicas?: number;
  /** Public host, e.g. `d-<id>.preview.e-code.ai` (must be covered by tlsSecretName). */
  host: string;
  /** Existing TLS secret whose cert covers `host` (e.g. the preview wildcard). */
  tlsSecretName: string;
  /** Plain env vars. */
  env?: Record<string, string>;
  /** Secret holding env values (envName -> secretKey via secretEnv). */
  secretName?: string;
  secretEnv?: Record<string, string>;
  cpuRequest?: string;
  cpuLimit?: string;
  memoryRequest?: string;
  memoryLimit?: string;
  /** Readiness path on the app port (default '/'). */
  healthPath?: string;
  /** Disable gVisor scheduling (tests / non-sandbox clusters). */
  disableSandboxScheduling?: boolean;

  /*
   * Shared RO Nix store PVC (same kill switch as workspacePod): a published app
   * snapshotted from a Nix-enabled workspace needs the SAME /nix toolchain at
   * runtime (python, etc. live in the store, not in the image). Undefined ⇒ the
   * pod spec is byte-for-byte the pre-Nix shape (no volumes key at all).
   */
  nixStorePvcName?: string;

  /** D3 multi-zone: pin the app pod to the zone of the store clone it mounts. */
  nixStoreZone?: string;

  /** D3 drift guard: expected sha256 of /nix/ecode/catalog.json (blocks the pod on mismatch). */
  nixStoreGenerationHash?: string;
}

/** Stable resource name for a server deployment's Deployment/Service/Ingress. */
export function serverDeploymentName(deploymentId: string): string {
  return `app-${deploymentId}`;
}

function serverLabels(input: Pick<ServerRuntimeInput, 'deploymentId' | 'orgId' | 'projectId'>) {
  return {
    app: serverDeploymentName(input.deploymentId),
    'vibecore.ai/server-deploy': input.deploymentId,
    ...(input.orgId ? { 'vibecore.ai/org': input.orgId } : {}),
    ...(input.projectId ? { 'vibecore.ai/project': input.projectId } : {}),
  };
}

function serverEnvVars(input: ServerRuntimeInput) {
  const env = input.env ?? {};
  const secretEnv = input.secretEnv ?? {};

  return [
    { name: 'PORT', value: String(input.port) },
    /*
     * Replit-parity deployment marker (their REPLIT_DEPLOYMENT=1): every published
     * app can branch on "am I the deployed instance?" (analytics, config, CORS…).
     * Kept out of user control below — k8s keeps the LAST duplicate env entry, so
     * an appended user value named ECODE_DEPLOYMENT would otherwise win.
     */
    { name: 'ECODE_DEPLOYMENT', value: '1' },
    ...(input.projectId ? [{ name: 'PROJECT_ID', value: input.projectId }] : []),
    // Plain user env (reserved platform names stripped so a tenant can't spoof them).
    ...Object.entries(env)
      .filter(([name]) => !RESERVED_WORKSPACE_ENV.has(name) && name !== 'PORT' && name !== 'ECODE_DEPLOYMENT')
      .map(([name, value]) => ({ name, value })),
    // Secret-backed env (optional so a not-yet-synced key can't brick startup).
    ...(input.secretName
      ? Object.entries(secretEnv)
          .filter(([name]) => !RESERVED_WORKSPACE_ENV.has(name) && name !== 'ECODE_DEPLOYMENT')
          .map(([name, key]) => ({
            name,
            valueFrom: { secretKeyRef: { name: input.secretName as string, key, optional: true } },
          }))
      : []),
  ];
}

export function serverAppDeployment(input: ServerRuntimeInput): K8sObject {
  assertWorkspaceImageAllowed(input.image);

  const sandbox = !input.disableSandboxScheduling && process.env.WORKSPACE_DISABLE_SANDBOX_SCHEDULING !== '1';
  const selector = serverLabels(input);

  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: serverDeploymentName(input.deploymentId), namespace: input.namespace, labels: selector },
    spec: {
      replicas: input.replicas ?? 1,
      selector: { matchLabels: { app: selector.app } },
      // Zero-downtime rolling update (durable, unlike the workspace Pod).
      strategy: { type: 'RollingUpdate', rollingUpdate: { maxUnavailable: 0, maxSurge: 1 } },
      template: {
        metadata: { labels: selector },
        spec: {
          hostNetwork: false,
          hostPID: false,
          hostIPC: false,
          ...(sandbox
            ? {
                runtimeClassName: 'gvisor',
                nodeSelector: {
                  'vibecore.ai/node-pool': 'sandbox',
                  // D3 multi-zone: pin to the zone of the mounted store clone.
                  ...(input.nixStorePvcName && input.nixStoreZone
                    ? { 'topology.kubernetes.io/zone': input.nixStoreZone }
                    : {}),
                },
                tolerations: [
                  { key: 'vibecore.ai/sandbox', operator: 'Equal', value: 'true', effect: 'NoSchedule' },
                  { key: 'sandbox.gke.io/runtime', operator: 'Equal', value: 'gvisor', effect: 'NoSchedule' },
                ],
              }
            : input.nixStorePvcName && input.nixStoreZone
              ? { nodeSelector: { 'topology.kubernetes.io/zone': input.nixStoreZone } }
              : {}),
          // D3 drift guard: wrong-generation clone ⇒ init fails ⇒ pod blocked.
          ...(input.nixStorePvcName && input.nixStoreGenerationHash
            ? { initContainers: [nixStoreGuardInitContainer(input.image, input.nixStoreGenerationHash)] }
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
              name: 'app',
              image: input.image,
              ...(input.command ? { command: input.command } : {}),
              ...(input.args ? { args: input.args } : {}),
              ports: [{ containerPort: input.port, name: 'http' }],
              env: serverEnvVars(input),
              // Same kill switch as workspacePod: no nix PVC ⇒ no volumeMounts key at all.
              ...(input.nixStorePvcName
                ? { volumeMounts: [{ name: 'nix-store', mountPath: '/nix', readOnly: true }] }
                : {}),
              resources: {
                requests: { cpu: input.cpuRequest ?? '250m', memory: input.memoryRequest ?? '512Mi' },
                limits: { cpu: input.cpuLimit ?? '1', memory: input.memoryLimit ?? '1Gi' },
              },
              readinessProbe: {
                httpGet: { path: input.healthPath ?? '/', port: input.port },
                // With scale-to-zero the first visitor pays this probe's schedule on
                // every wake: 3s delay + 5s period measured 6-7s containerStart→Ready
                // in prod while the app itself answered in ~1s. 1s sampling marks the
                // pod Ready within ~1s of the app binding; failureThreshold keeps the
                // same 30s outage window as the previous 6×5s before flipping NotReady.
                initialDelaySeconds: 0,
                periodSeconds: 1,
                // Replit's published rule: the homepage must answer within 5s or the
                // publish fails — give the probe exactly that budget, no more.
                timeoutSeconds: 5,
                failureThreshold: 30,
              },
              // TCP liveness (a busy app under gVisor can starve an HTTP handler; the bound port still accepts).
              livenessProbe: {
                tcpSocket: { port: input.port },
                initialDelaySeconds: 15,
                periodSeconds: 15,
                timeoutSeconds: 5,
                failureThreshold: 10,
              },

              // Container-level hardening — REQUIRED, not just defence-in-depth: the
              // `workspaces` namespace enforces the `restricted` Pod Security Standard,
              // which rejects any pod whose container omits allowPrivilegeEscalation:false
              // or capabilities.drop:[ALL]. The pod-level securityContext above does NOT
              // satisfy these (they are container-scoped fields). Mirror the workspace
              // pod's container context so the server-app pod is admitted + runs untrusted
              // user code with the same sandboxed, unprivileged, no-capabilities profile.
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
          // Kill switch mirrors the volumeMounts above — absent unless opted in.
          ...(input.nixStorePvcName
            ? {
                volumes: [
                  { name: 'nix-store', persistentVolumeClaim: { claimName: input.nixStorePvcName, readOnly: true } },
                ],
              }
            : {}),
        },
      },
    },
  };
}

export function serverAppService(input: ServerRuntimeInput): K8sObject {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: serverDeploymentName(input.deploymentId),
      namespace: input.namespace,
      labels: serverLabels(input),
    },
    spec: {
      selector: { app: serverDeploymentName(input.deploymentId) },
      ports: [{ name: 'http', port: 80, targetPort: input.port }],
    },
  };
}

export function serverAppIngress(input: ServerRuntimeInput): K8sObject {
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: serverDeploymentName(input.deploymentId),
      namespace: input.namespace,
      labels: serverLabels(input),
      annotations: { 'nginx.ingress.kubernetes.io/ssl-redirect': 'true' },
    },
    spec: {
      ingressClassName: 'nginx',
      // Exact host beats the `*.preview.e-code.ai` wildcard ingress, reusing its cert.
      tls: [{ hosts: [input.host], secretName: input.tlsSecretName }],
      rules: [
        {
          host: input.host,
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: { service: { name: serverDeploymentName(input.deploymentId), port: { number: 80 } } },
              },
            ],
          },
        },
      ],
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
  const plan = getPlanResources()[input.plan];

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
  /*
   * Connection flags (e.g. --kubeconfig <in-cluster config>) prepended to every
   * kubectl call so it authenticates with the pod's service account instead of
   * defaulting to localhost:8080. Empty outside a pod (local dev / tests).
   */
  private readonly configArgs: string[];

  constructor(readonly kubectl = process.env.KUBECTL_BIN ?? 'kubectl') {
    this.configArgs = resolveInClusterKubeconfigArgs();
  }

  async apply(object: K8sObject) {
    const dir = await mkdtemp(join(tmpdir(), 'vibecore-k8s-'));
    const manifest = join(dir, 'object.json');

    try {
      await writeFile(manifest, JSON.stringify(object));
      await execFile(
        this.kubectl,
        [...this.configArgs, 'apply', '-f', manifest, `--request-timeout=${KUBECTL_REQUEST_TIMEOUT}`],
        {
          timeout: KUBECTL_TIMEOUT_MS,
        },
      );

      return object;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async delete(kind: string, namespace: string, name: string) {
    await execFile(
      this.kubectl,
      [
        ...this.configArgs,
        'delete',
        kind,
        name,
        '-n',
        namespace,
        '--ignore-not-found=true',
        `--request-timeout=${KUBECTL_REQUEST_TIMEOUT}`,
      ],
      { timeout: KUBECTL_TIMEOUT_MS },
    );
  }

  async getPod(namespace: string, name: string) {
    return this.getResource('pod', namespace, name);
  }

  /*
   * Generic single-resource read; returns undefined when the object is genuinely
   * absent. Used to make apply idempotent for immutable resources like PVCs that
   * must not be re-applied with a changed spec.
   */
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
      [
        ...this.configArgs,
        'get',
        kind,
        name,
        '-n',
        namespace,
        '-o',
        'json',
        `--request-timeout=${KUBECTL_REQUEST_TIMEOUT}`,
      ],
      { timeout: KUBECTL_TIMEOUT_MS },
    ).catch((error: any) => {
      const stderr = String(error?.stderr ?? '');

      if (error?.code === 1 && /\bNotFound\b|not found/i.test(stderr)) {
        return { stdout: '' };
      }

      throw error;
    });

    if (!stdout) {
      return undefined;
    }

    try {
      return JSON.parse(stdout) as K8sObject;
    } catch (parseError) {
      /*
       * Truncated/non-blank-but-malformed kubectl output → surface a labelled
       * error instead of a raw SyntaxError callers can't attribute.
       */
      throw Object.assign(new Error(`kubectl get ${kind}/${name} returned unparseable JSON`), {
        code: 'KUBECTL_BAD_JSON',
        cause: parseError,
      });
    }
  }

  async *streamPodLogs(namespace: string, name: string) {
    /*
     * Bump maxBuffer well above Node's 1MB default: 500 tail lines of a verbose
     * workspace can exceed 1MB, which would otherwise throw ENOBUFS and 500.
     */
    const { stdout } = await execFile(
      this.kubectl,
      [...this.configArgs, 'logs', name, '-n', namespace, '--tail=500', `--request-timeout=${KUBECTL_REQUEST_TIMEOUT}`],
      {
        maxBuffer: 16 * 1024 * 1024,
        timeout: KUBECTL_TIMEOUT_MS,
      },
    );

    for (const line of stdout.split('\n').filter(Boolean)) {
      yield line;
    }
  }

  /*
   * Scale a Deployment to `replicas`. Drives server-deploy scale-to-zero: an
   * idle app is scaled to 0 (no compute cost, replicas kept off) and woken back
   * to 1 on the next request. `--ignore-not-found` is not a kubectl scale flag,
   * so a genuinely-absent Deployment throws — callers that scale on the wake path
   * treat that as "deployment gone" and surface a clean error rather than a 502.
   */
  async scale(kind: string, namespace: string, name: string, replicas: number) {
    await execFile(
      this.kubectl,
      [
        ...this.configArgs,
        'scale',
        kind,
        name,
        '-n',
        namespace,
        `--replicas=${replicas}`,
        `--request-timeout=${KUBECTL_REQUEST_TIMEOUT}`,
      ],
      { timeout: KUBECTL_TIMEOUT_MS },
    );
  }

  /*
   * Set (or overwrite) a single annotation on a resource. Used to stamp a
   * server-deploy's last-request time so the idle controller can decide when to
   * scale it to zero. `--overwrite` makes repeated stamps idempotent.
   */
  async annotate(kind: string, namespace: string, name: string, key: string, value: string) {
    await execFile(
      this.kubectl,
      [
        ...this.configArgs,
        'annotate',
        kind,
        name,
        '-n',
        namespace,
        `${key}=${value}`,
        '--overwrite',
        `--request-timeout=${KUBECTL_REQUEST_TIMEOUT}`,
      ],
      { timeout: KUBECTL_TIMEOUT_MS },
    );
  }

  /*
   * List resources of a kind in a namespace filtered by a label selector.
   * Returns the raw items array (empty on none). Drives the idle sweep over
   * server-deploy Deployments (`vibecore.ai/server-deploy`).
   */
  async listByLabel(kind: string, namespace: string, labelSelector: string): Promise<K8sObject[]> {
    const { stdout } = await execFile(
      this.kubectl,
      [
        ...this.configArgs,
        'get',
        kind,
        '-n',
        namespace,
        '-l',
        labelSelector,
        '-o',
        'json',
        `--request-timeout=${KUBECTL_REQUEST_TIMEOUT}`,
      ],
      { timeout: KUBECTL_TIMEOUT_MS },
    );

    if (!stdout) {
      return [];
    }

    try {
      const parsed = JSON.parse(stdout) as { items?: K8sObject[] };
      return parsed.items ?? [];
    } catch (parseError) {
      throw Object.assign(new Error(`kubectl get ${kind} -l ${labelSelector} returned unparseable JSON`), {
        code: 'KUBECTL_BAD_JSON',
        cause: parseError,
      });
    }
  }
}

/**
 * Live cluster-capacity snapshot for the admin Infrastructure view. Runs a
 * handful of read-only `kubectl` commands (nodes, pods, `top`, and the
 * cluster-autoscaler status configmap) with the pod's in-cluster credentials,
 * then delegates the number-crunching to the pure `parseClusterCapacity`.
 *
 * `run` is injectable so the orchestration is unit-testable without a cluster;
 * production uses the real kubectl exec. `top` and the autoscaler configmap are
 * best-effort (metrics-server can briefly be unavailable) — the snapshot still
 * returns node/pod/request data with used metrics zeroed and autoscaling null.
 */
export interface ClusterCapacityOptions {
  nodePool: string;
  workspacesNamespace: string;
  orgLabelKey?: string;
  kubectl?: string;
  run?: (args: string[]) => Promise<string>;
}

export async function getClusterCapacity(options: ClusterCapacityOptions): Promise<ClusterCapacity> {
  const bin = options.kubectl ?? process.env.KUBECTL_BIN ?? 'kubectl';
  const configArgs = resolveInClusterKubeconfigArgs();

  const run =
    options.run ??
    (async (args: string[]) => {
      const { stdout } = await execFile(bin, [...configArgs, ...args, `--request-timeout=${KUBECTL_REQUEST_TIMEOUT}`], {
        timeout: KUBECTL_TIMEOUT_MS,
        maxBuffer: 64 * 1024 * 1024,
      });

      return stdout;
    });

  const [nodesRaw, podsRaw, topNodes, autoscalerStatus] = await Promise.all([
    run(['get', 'nodes', '-o', 'json']),
    run(['get', 'pods', '-A', '-o', 'json']),
    run(['top', 'nodes', '--no-headers']).catch(() => ''),
    run(['-n', 'kube-system', 'get', 'configmap', 'cluster-autoscaler-status', '-o', 'jsonpath={.data.status}']).catch(
      () => '',
    ),
  ]);

  const safeParse = (raw: string): { items?: unknown[] } => {
    try {
      return JSON.parse(raw || '{}');
    } catch {
      return {};
    }
  };

  return parseClusterCapacity({
    nodes: safeParse(nodesRaw) as Parameters<typeof parseClusterCapacity>[0]['nodes'],
    pods: safeParse(podsRaw) as Parameters<typeof parseClusterCapacity>[0]['pods'],
    topNodes,
    autoscalerStatus,
    nodePool: options.nodePool,
    workspacesNamespace: options.workspacesNamespace,
    orgLabelKey: options.orgLabelKey,
  });
}
