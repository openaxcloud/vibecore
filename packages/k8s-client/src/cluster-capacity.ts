/**
 * Cluster capacity snapshot for the admin "Infrastructure" view.
 *
 * The heavy lifting is PURE and unit-tested: given the raw stdout of a handful of
 * `kubectl` reads, `parseClusterCapacity` derives every number the admin sees —
 * running workspaces, pod count, CPU/RAM used vs reserved, node count vs the
 * autoscaling max, and the autoscaling state. The IO wrapper that actually runs
 * kubectl lives on the k8s client; this module never touches the network so it
 * stays trivially testable with fixture strings.
 *
 * All values are REAL (metrics-server + the cluster-autoscaler status configmap);
 * nothing here is mocked or estimated.
 */

/** Parse a Kubernetes CPU quantity into millicores. `"3920m"`→3920, `"4"`→4000. */
export function cpuToMillicores(quantity: string | undefined | null): number {
  if (!quantity) {
    return 0;
  }

  const value = quantity.trim();

  if (value.endsWith('m')) {
    return Math.round(Number(value.slice(0, -1)) || 0);
  }

  if (value.endsWith('n')) {
    // nanocores (metrics-server sometimes reports these)
    return Math.round((Number(value.slice(0, -1)) || 0) / 1_000_000);
  }

  return Math.round((Number(value) || 0) * 1000);
}

const MEMORY_UNIT_MULTIPLIERS: Record<string, number> = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  K: 1000,
  M: 1000 ** 2,
  G: 1000 ** 3,
  T: 1000 ** 4,
};

/** Parse a Kubernetes memory quantity into bytes. `"13591684Ki"`, `"2048Mi"`, `"512M"`, `"1073741824"`. */
export function memoryToBytes(quantity: string | undefined | null): number {
  if (!quantity) {
    return 0;
  }

  const value = quantity.trim();
  const match = value.match(/^(\d+(?:\.\d+)?)\s*([A-Za-z]+)?$/);

  if (!match) {
    return 0;
  }

  const amount = Number(match[1]) || 0;
  const unit = match[2];

  if (!unit) {
    return Math.round(amount);
  }

  return Math.round(amount * (MEMORY_UNIT_MULTIPLIERS[unit] ?? 1));
}

export interface NodeCapacity {
  name: string;
  nodePool: string;
  allocatableCpuMillicores: number;
  allocatableMemoryBytes: number;

  /** Sum of pod CPU requests scheduled on this node. */
  requestedCpuMillicores: number;
  requestedMemoryBytes: number;

  /** Live usage from metrics-server (0 when unavailable). */
  usedCpuMillicores: number;
  usedMemoryBytes: number;
}

export interface NodePoolAutoscaling {
  nodePool: string;
  minNodes: number;
  maxNodes: number;
  currentNodes: number;
  healthy: boolean;
}

export interface ClusterCapacity {
  /** Running workspace pods (phase Running) in the workspaces namespace. */
  runningWorkspaces: number;

  /** Total workspace pods regardless of phase. */
  totalWorkspacePods: number;

  /** Running workspace count grouped by org id label (desc). */
  workspacesByOrg: Array<{ orgId: string; count: number }>;
  nodes: NodeCapacity[];
  nodePool: {
    name: string;
    nodeCount: number;
    allocatableCpuMillicores: number;
    allocatableMemoryBytes: number;
    requestedCpuMillicores: number;
    requestedMemoryBytes: number;
    usedCpuMillicores: number;
    usedMemoryBytes: number;

    /** requested / allocatable, 0..1. The scheduling-pressure metric. */
    reservedCpuRatio: number;
    reservedMemoryRatio: number;
    usedCpuRatio: number;
  };
  autoscaling: NodePoolAutoscaling | null;
}

interface RawNode {
  metadata?: { name?: string; labels?: Record<string, string> };
  status?: { allocatable?: { cpu?: string; memory?: string } };
}

interface RawPod {
  metadata?: { namespace?: string; labels?: Record<string, string> };
  status?: { phase?: string };
  spec?: {
    nodeName?: string;
    containers?: Array<{ resources?: { requests?: { cpu?: string; memory?: string } } }>;
    initContainers?: Array<{ resources?: { requests?: { cpu?: string; memory?: string } } }>;
  };
}

/** Parse `kubectl top nodes --no-headers` → { nodeName: { cpuMillicores, memBytes } }. */
export function parseTopNodes(topStdout: string): Record<string, { cpuMillicores: number; memoryBytes: number }> {
  const out: Record<string, { cpuMillicores: number; memoryBytes: number }> = {};

  for (const line of topStdout.split('\n')) {
    const cols = line.trim().split(/\s+/);

    // NAME  CPU(cores)  CPU%  MEMORY(bytes)  MEMORY%
    if (cols.length >= 5 && cols[0]) {
      out[cols[0]] = { cpuMillicores: cpuToMillicores(cols[1]), memoryBytes: memoryToBytes(cols[3]) };
    }
  }

  return out;
}

/**
 * Parse the GKE `cluster-autoscaler-status` configmap `status` field (YAML text)
 * for the node group whose name contains `nodePool`. GKE reports one entry per
 * zonal MIG; we aggregate min/max/current across the pool's MIGs.
 */
export function parseAutoscalerStatus(statusText: string, nodePool: string): NodePoolAutoscaling | null {
  if (!statusText || !nodePool) {
    return null;
  }

  let min = 0;
  let max = 0;
  let current = 0;
  let matched = false;
  let healthy = true;

  // Split into per-group blocks on the `name:` line that identifies each MIG.
  const groups = statusText.split(/\n\s*-\s*health:/).slice(1);

  for (const block of groups) {
    const nameMatch = block.match(/name:\s*(\S+)/);

    if (!nameMatch || !nameMatch[1].includes(nodePool)) {
      continue;
    }

    matched = true;

    const minMatch = block.match(/minSize:\s*(\d+)/);
    const maxMatch = block.match(/maxSize:\s*(\d+)/);
    const readyMatch = block.match(/ready:\s*(\d+)/);
    const statusMatch = block.match(/status:\s*(\w+)/);

    min += minMatch ? Number(minMatch[1]) : 0;
    max += maxMatch ? Number(maxMatch[1]) : 0;
    current += readyMatch ? Number(readyMatch[1]) : 0;

    if (statusMatch && statusMatch[1] !== 'Healthy') {
      healthy = false;
    }
  }

  if (!matched) {
    return null;
  }

  return { nodePool, minNodes: min, maxNodes: max, currentNodes: current, healthy };
}

function sumRequests(pod: RawPod): { cpu: number; memory: number } {
  const containers = [...(pod.spec?.containers ?? []), ...(pod.spec?.initContainers ?? [])];

  let cpu = 0;
  let memory = 0;

  for (const container of containers) {
    cpu += cpuToMillicores(container.resources?.requests?.cpu);
    memory += memoryToBytes(container.resources?.requests?.memory);
  }

  return { cpu, memory };
}

export interface ClusterCapacityInputs {
  /** `kubectl get nodes -o json` (parsed) */
  nodes: { items?: RawNode[] };

  /** `kubectl get pods -A -o json` (parsed) */
  pods: { items?: RawPod[] };

  /** `kubectl top nodes --no-headers` stdout */
  topNodes: string;

  /** `kubectl -n kube-system get configmap cluster-autoscaler-status -o jsonpath='{.data.status}'` */
  autoscalerStatus: string;

  /** The gke node-pool label value to scope to, e.g. `sandbox-gvisor`. */
  nodePool: string;

  /** The workspaces namespace, e.g. `workspaces`. */
  workspacesNamespace: string;

  /** Pod label key carrying the org id, e.g. `vibecore.ai/org-id`. */
  orgLabelKey?: string;
}

const NODE_POOL_LABEL = 'cloud.google.com/gke-nodepool';

/** Derive the full capacity snapshot from raw kubectl reads. Pure. */
export function parseClusterCapacity(input: ClusterCapacityInputs): ClusterCapacity {
  const orgLabelKey = input.orgLabelKey ?? 'vibecore.ai/org-id';
  const top = parseTopNodes(input.topNodes);

  // Nodes scoped to the target pool.
  const poolNodes: NodeCapacity[] = (input.nodes.items ?? [])
    .filter((node) => node.metadata?.labels?.[NODE_POOL_LABEL] === input.nodePool)
    .map((node) => {
      const name = node.metadata?.name ?? '';

      return {
        name,
        nodePool: input.nodePool,
        allocatableCpuMillicores: cpuToMillicores(node.status?.allocatable?.cpu),
        allocatableMemoryBytes: memoryToBytes(node.status?.allocatable?.memory),
        requestedCpuMillicores: 0,
        requestedMemoryBytes: 0,
        usedCpuMillicores: top[name]?.cpuMillicores ?? 0,
        usedMemoryBytes: top[name]?.memoryBytes ?? 0,
      };
    });

  const nodeByName = new Map(poolNodes.map((node) => [node.name, node]));

  // Sum pod requests onto their node + count workspaces.
  let runningWorkspaces = 0;
  let totalWorkspacePods = 0;

  const orgCounts = new Map<string, number>();

  for (const pod of input.pods.items ?? []) {
    const node = pod.spec?.nodeName ? nodeByName.get(pod.spec.nodeName) : undefined;

    if (node) {
      const { cpu, memory } = sumRequests(pod);
      node.requestedCpuMillicores += cpu;
      node.requestedMemoryBytes += memory;
    }

    if (pod.metadata?.namespace === input.workspacesNamespace) {
      totalWorkspacePods += 1;

      if (pod.status?.phase === 'Running') {
        runningWorkspaces += 1;

        const orgId = pod.metadata?.labels?.[orgLabelKey];

        if (orgId) {
          orgCounts.set(orgId, (orgCounts.get(orgId) ?? 0) + 1);
        }
      }
    }
  }

  const agg = poolNodes.reduce(
    (acc, node) => ({
      allocCpu: acc.allocCpu + node.allocatableCpuMillicores,
      allocMem: acc.allocMem + node.allocatableMemoryBytes,
      reqCpu: acc.reqCpu + node.requestedCpuMillicores,
      reqMem: acc.reqMem + node.requestedMemoryBytes,
      usedCpu: acc.usedCpu + node.usedCpuMillicores,
      usedMem: acc.usedMem + node.usedMemoryBytes,
    }),
    { allocCpu: 0, allocMem: 0, reqCpu: 0, reqMem: 0, usedCpu: 0, usedMem: 0 },
  );

  const ratio = (num: number, den: number) => (den > 0 ? num / den : 0);

  return {
    runningWorkspaces,
    totalWorkspacePods,
    workspacesByOrg: [...orgCounts.entries()]
      .map(([orgId, count]) => ({ orgId, count }))
      .sort((a, b) => b.count - a.count),
    nodes: poolNodes,
    nodePool: {
      name: input.nodePool,
      nodeCount: poolNodes.length,
      allocatableCpuMillicores: agg.allocCpu,
      allocatableMemoryBytes: agg.allocMem,
      requestedCpuMillicores: agg.reqCpu,
      requestedMemoryBytes: agg.reqMem,
      usedCpuMillicores: agg.usedCpu,
      usedMemoryBytes: agg.usedMem,
      reservedCpuRatio: ratio(agg.reqCpu, agg.allocCpu),
      reservedMemoryRatio: ratio(agg.reqMem, agg.allocMem),
      usedCpuRatio: ratio(agg.usedCpu, agg.allocCpu),
    },
    autoscaling: parseAutoscalerStatus(input.autoscalerStatus, input.nodePool),
  };
}

export interface CapacityAlertThresholds {
  /** Alert when currentNodes / maxNodes ≥ this (0..1). Default 0.8. */
  nodePctOfMax: number;

  /** Alert when reserved CPU ratio ≥ this (0..1). Default 0.85. */
  reservedCpuRatio: number;
}

export const DEFAULT_CAPACITY_ALERT_THRESHOLDS: CapacityAlertThresholds = {
  nodePctOfMax: 0.8,
  reservedCpuRatio: 0.85,
};

export interface CapacityAlert {
  level: 'warning' | 'critical';
  kind: 'node-count' | 'reserved-cpu';
  message: string;
}

/**
 * Derive capacity alerts. Warns as the pool approaches its autoscaling ceiling
 * (nothing left to scale into) or its reserved-CPU pressure ceiling. Pure.
 */
export function evaluateCapacityAlerts(
  capacity: ClusterCapacity,
  thresholds: CapacityAlertThresholds = DEFAULT_CAPACITY_ALERT_THRESHOLDS,
): CapacityAlert[] {
  const alerts: CapacityAlert[] = [];
  const auto = capacity.autoscaling;

  if (auto && auto.maxNodes > 0) {
    const pct = auto.currentNodes / auto.maxNodes;

    if (pct >= thresholds.nodePctOfMax) {
      alerts.push({
        level: pct >= 1 ? 'critical' : 'warning',
        kind: 'node-count',
        message:
          `Node pool "${auto.nodePool}" is at ${auto.currentNodes}/${auto.maxNodes} nodes ` +
          `(${Math.round(pct * 100)}% of the autoscaling max). ` +
          (pct >= 1
            ? 'The pool cannot scale further — raise the max node count.'
            : 'Approaching the ceiling — consider raising the max node count.'),
      });
    }
  }

  const reserved = capacity.nodePool.reservedCpuRatio;

  if (reserved >= thresholds.reservedCpuRatio) {
    alerts.push({
      level: reserved >= 0.95 ? 'critical' : 'warning',
      kind: 'reserved-cpu',
      message:
        `Reserved CPU on "${capacity.nodePool.name}" is ${Math.round(reserved * 100)}% of allocatable — ` +
        'new workspaces may fail to schedule. Free idle workspaces or raise the autoscaling max.',
    });
  }

  return alerts;
}
