import { describe, expect, it } from 'vitest';

import {
  cpuToMillicores,
  memoryToBytes,
  parseTopNodes,
  parseAutoscalerStatus,
  parseClusterCapacity,
  evaluateCapacityAlerts,
  DEFAULT_CAPACITY_ALERT_THRESHOLDS,
  type ClusterCapacityInputs,
} from './cluster-capacity';

describe('quantity parsing', () => {
  it('parses CPU quantities to millicores', () => {
    expect(cpuToMillicores('3920m')).toBe(3920);
    expect(cpuToMillicores('4')).toBe(4000);
    expect(cpuToMillicores('250m')).toBe(250);
    expect(cpuToMillicores('227000000n')).toBe(227); // nanocores from metrics-server
    expect(cpuToMillicores(undefined)).toBe(0);
  });

  it('parses memory quantities to bytes', () => {
    expect(memoryToBytes('13591684Ki')).toBe(13591684 * 1024);
    expect(memoryToBytes('2048Mi')).toBe(2048 * 1024 ** 2);
    expect(memoryToBytes('512M')).toBe(512 * 1000 ** 2);
    expect(memoryToBytes('1073741824')).toBe(1073741824);
    expect(memoryToBytes(undefined)).toBe(0);
  });
});

describe('parseTopNodes', () => {
  it('parses `kubectl top nodes --no-headers` output', () => {
    const out = parseTopNodes('nodeA   227m   5%   2925Mi   22%\nnodeB   231m   5%   2224Mi   16%\n');
    expect(out.nodeA.cpuMillicores).toBe(227);
    expect(out.nodeB.memoryBytes).toBe(2224 * 1024 ** 2);
  });
});

const AUTOSCALER_STATUS = `autoscalerStatus: Running
nodeGroups:
- health:
    cloudProviderTarget: 1
    maxSize: 6
    minSize: 2
    nodeCounts:
      registered:
        ready: 1
    status: Healthy
  name: https://.../instanceGroups/gke-vibecore-prod-app-sandbox-gvisor-d2edf6d9-grp
- health:
    maxSize: 6
    minSize: 2
    nodeCounts:
      registered:
        ready: 1
    status: Healthy
  name: https://.../instanceGroups/gke-vibecore-prod-app-sandbox-gvisor-bd5d9a1e-grp
- health:
    maxSize: 3
    minSize: 1
    nodeCounts:
      registered:
        ready: 3
    status: Healthy
  name: https://.../instanceGroups/gke-vibecore-prod-app-default-pool-xyz-grp`;

describe('parseAutoscalerStatus', () => {
  it('aggregates min/max/current across a pool MIGs and ignores other pools', () => {
    const auto = parseAutoscalerStatus(AUTOSCALER_STATUS, 'sandbox-gvisor');
    expect(auto).toEqual({ nodePool: 'sandbox-gvisor', minNodes: 4, maxNodes: 12, currentNodes: 2, healthy: true });

    // default-pool is a different group, not counted for sandbox-gvisor
  });

  it('returns null when the pool is not present', () => {
    expect(parseAutoscalerStatus(AUTOSCALER_STATUS, 'nonexistent-pool')).toBeNull();
    expect(parseAutoscalerStatus('', 'sandbox-gvisor')).toBeNull();
  });
});

function node(name: string, pool: string, cpu: string, mem: string) {
  return {
    metadata: { name, labels: { 'cloud.google.com/gke-nodepool': pool } },
    status: { allocatable: { cpu, memory: mem } },
  };
}

function wsPod(name: string, nodeName: string, phase: string, orgId: string, cpuReq = '1') {
  return {
    metadata: { namespace: 'workspaces', labels: { 'vibecore.ai/org-id': orgId } },
    status: { phase },
    spec: { nodeName, containers: [{ resources: { requests: { cpu: cpuReq, memory: '2Gi' } } }] },
  };
}

describe('parseClusterCapacity', () => {
  const input: ClusterCapacityInputs = {
    nodes: {
      items: [
        node('n1', 'sandbox-gvisor', '3920m', '13591684Ki'),
        node('n2', 'sandbox-gvisor', '3920m', '13591684Ki'),
        node('other', 'default-pool', '2', '4Gi'),
      ],
    },
    pods: {
      items: [
        wsPod('ws-a', 'n1', 'Running', 'org1'),
        wsPod('ws-b', 'n1', 'Running', 'org1'),
        wsPod('ws-c', 'n2', 'Running', 'org2'),
        wsPod('ws-pending', '', 'Pending', 'org2'),
        {
          metadata: { namespace: 'kube-system' },
          status: { phase: 'Running' },
          spec: { nodeName: 'n1', containers: [{ resources: { requests: { cpu: '100m', memory: '128Mi' } } }] },
        },
      ],
    },
    topNodes: 'n1   400m   10%   3000Mi   22%\nn2   200m   5%   2000Mi   15%\n',
    autoscalerStatus: AUTOSCALER_STATUS,
    nodePool: 'sandbox-gvisor',
    workspacesNamespace: 'workspaces',
  };

  it('derives running workspaces, per-org counts, and pool aggregates', () => {
    const cap = parseClusterCapacity(input);

    expect(cap.runningWorkspaces).toBe(3);
    expect(cap.totalWorkspacePods).toBe(4); // 3 running + 1 pending
    expect(cap.workspacesByOrg).toEqual([
      { orgId: 'org1', count: 2 },
      { orgId: 'org2', count: 1 },
    ]);

    expect(cap.nodePool.nodeCount).toBe(2); // only the gvisor pool
    expect(cap.nodePool.allocatableCpuMillicores).toBe(7840);

    // n1: 2 ws (1000m each) + 100m kube-system = 2100m; n2: 1 ws = 1000m → 3100m reserved
    expect(cap.nodePool.requestedCpuMillicores).toBe(3100);
    expect(cap.nodePool.usedCpuMillicores).toBe(600); // 400 + 200 from top
    expect(cap.nodePool.reservedCpuRatio).toBeCloseTo(3100 / 7840, 5);
  });

  it('excludes nodes/pods from other pools and namespaces', () => {
    const cap = parseClusterCapacity(input);
    expect(cap.nodes.every((n) => n.nodePool === 'sandbox-gvisor')).toBe(true);
  });
});

describe('evaluateCapacityAlerts', () => {
  function capacityWith(overrides: { current: number; max: number; reservedRatio: number }) {
    return {
      runningWorkspaces: 0,
      totalWorkspacePods: 0,
      workspacesByOrg: [],
      nodes: [],
      nodePool: {
        name: 'sandbox-gvisor',
        nodeCount: overrides.current,
        allocatableCpuMillicores: 1000,
        allocatableMemoryBytes: 0,
        requestedCpuMillicores: Math.round(overrides.reservedRatio * 1000),
        requestedMemoryBytes: 0,
        usedCpuMillicores: 0,
        usedMemoryBytes: 0,
        reservedCpuRatio: overrides.reservedRatio,
        reservedMemoryRatio: 0,
        usedCpuRatio: 0,
      },
      autoscaling: {
        nodePool: 'sandbox-gvisor',
        minNodes: 2,
        maxNodes: overrides.max,
        currentNodes: overrides.current,
        healthy: true,
      },
    };
  }

  it('is quiet well below the thresholds', () => {
    expect(evaluateCapacityAlerts(capacityWith({ current: 2, max: 6, reservedRatio: 0.4 }))).toEqual([]);
  });

  it('warns at ≥80% of max nodes and ≥85% reserved CPU', () => {
    const alerts = evaluateCapacityAlerts(capacityWith({ current: 5, max: 6, reservedRatio: 0.9 }));
    expect(alerts.map((a) => a.kind).sort()).toEqual(['node-count', 'reserved-cpu']);
    expect(alerts.every((a) => a.level === 'warning')).toBe(true);
  });

  it('escalates to critical at the ceiling', () => {
    const alerts = evaluateCapacityAlerts(capacityWith({ current: 6, max: 6, reservedRatio: 0.96 }));
    expect(alerts.find((a) => a.kind === 'node-count')?.level).toBe('critical');
    expect(alerts.find((a) => a.kind === 'reserved-cpu')?.level).toBe('critical');
  });

  it('honours custom thresholds', () => {
    const cap = capacityWith({ current: 3, max: 6, reservedRatio: 0.5 });
    expect(evaluateCapacityAlerts(cap, { nodePctOfMax: 0.4, reservedCpuRatio: 0.4 }).length).toBe(2);
    expect(evaluateCapacityAlerts(cap, DEFAULT_CAPACITY_ALERT_THRESHOLDS)).toEqual([]);
  });
});
