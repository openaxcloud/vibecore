/**
 * Admin Infrastructure / Capacity panel. Renders the live cluster snapshot from
 * `GET /admin/capacity` (real kubectl + metrics-server data, no mock): running
 * workspaces, pod count, CPU/RAM used vs reserved, node count vs the autoscaling
 * max, autoscaling state, idle-stopped workspaces, and top orgs — plus a banner
 * when capacity approaches the ceiling.
 */
import { useMemo } from 'react';

interface NodePoolSummary {
  name: string;
  nodeCount: number;
  allocatableCpuMillicores: number;
  allocatableMemoryBytes: number;
  requestedCpuMillicores: number;
  requestedMemoryBytes: number;
  usedCpuMillicores: number;
  usedMemoryBytes: number;
  reservedCpuRatio: number;
  reservedMemoryRatio: number;
  usedCpuRatio: number;
}

interface Autoscaling {
  nodePool: string;
  minNodes: number;
  maxNodes: number;
  currentNodes: number;
  healthy: boolean;
}

interface Capacity {
  runningWorkspaces: number;
  totalWorkspacePods: number;
  workspacesByOrg: Array<{ orgId: string; count: number }>;
  nodePool: NodePoolSummary;
  autoscaling: Autoscaling | null;
}

interface CapacityAlert {
  level: 'warning' | 'critical';
  kind: string;
  message: string;
}

export interface InfrastructurePayload {
  available?: boolean;
  capacity?: Capacity | null;
  idleStopped?: number;
  thresholds?: { nodePctOfMax: number; reservedCpuRatio: number };
  alerts?: CapacityAlert[];
  generatedAt?: string;
}

function pct(ratio: number): string {
  return `${Math.round((ratio || 0) * 100)}%`;
}

function millicoresToCores(m: number): string {
  return (m / 1000).toFixed(1);
}

function bytesToGiB(b: number): string {
  return (b / 1024 ** 3).toFixed(1);
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.4px] text-bolt-elements-textTertiary">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-bolt-elements-textPrimary">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-bolt-elements-textSecondary">{sub}</p> : null}
    </div>
  );
}

function Meter({ label, ratio, detail }: { label: string; ratio: number; detail: string }) {
  const clamped = Math.max(0, Math.min(1, ratio || 0));

  const tone = clamped >= 0.85 ? 'bg-red-500' : clamped >= 0.7 ? 'bg-amber-500' : 'bg-bolt-elements-item-contentAccent';

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-bolt-elements-textPrimary">{label}</p>
        <p className="text-sm tabular-nums text-bolt-elements-textSecondary">{pct(clamped)}</p>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-bolt-elements-background-depth-3">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${clamped * 100}%` }} />
      </div>
      <p className="mt-1 text-xs text-bolt-elements-textTertiary">{detail}</p>
    </div>
  );
}

export function InfrastructurePanel({ payload }: { payload: InfrastructurePayload }) {
  const capacity = payload.capacity ?? null;
  const alerts = payload.alerts ?? [];

  const nodeUsage = useMemo(() => {
    const auto = capacity?.autoscaling;

    return auto && auto.maxNodes > 0 ? auto.currentNodes / auto.maxNodes : 0;
  }, [capacity]);

  if (payload.available === false || !capacity) {
    return (
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-6">
        <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Infrastructure</h2>
        <p className="mt-2 text-sm text-bolt-elements-textSecondary">
          Live capacity metrics are momentarily unavailable (the workspace-manager or metrics-server did not respond).
          This view is read-only and refreshes on reload.
        </p>
      </div>
    );
  }

  const pool = capacity.nodePool;
  const auto = capacity.autoscaling;

  return (
    <div className="grid gap-6">
      {alerts.length > 0 ? (
        <div className="grid gap-2">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 text-sm ${
                alert.level === 'critical'
                  ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              }`}
            >
              <span className="font-semibold">{alert.level === 'critical' ? 'Critical' : 'Warning'}:</span>{' '}
              {alert.message}
            </div>
          ))}
        </div>
      ) : null}

      <div>
        <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Infrastructure &amp; capacity</h2>
        <p className="mt-1 text-sm text-bolt-elements-textSecondary">
          Live cluster state for the <span className="font-mono">{pool.name}</span> workspace pool. Autoscaling is
          automatic between min and max; the only manual step is raising the max when the pool stays near the ceiling.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        <Stat
          label="Running workspaces"
          value={String(capacity.runningWorkspaces)}
          sub={`${capacity.totalWorkspacePods} pods total`}
        />
        <Stat label="Idle-stopped" value={String(payload.idleStopped ?? 0)} sub="reclaimed by GC" />
        <Stat
          label="Nodes"
          value={auto ? `${auto.currentNodes} / ${auto.maxNodes}` : String(pool.nodeCount)}
          sub={auto ? `min ${auto.minNodes} · max ${auto.maxNodes}` : 'autoscaling n/a'}
        />
        <Stat
          label="Autoscaling"
          value={auto ? (auto.healthy ? 'Healthy' : 'Degraded') : '—'}
          sub={auto ? 'automatic scale up/down' : undefined}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Meter
          label="CPU reserved (requests)"
          ratio={pool.reservedCpuRatio}
          detail={`${millicoresToCores(pool.requestedCpuMillicores)} / ${millicoresToCores(pool.allocatableCpuMillicores)} cores`}
        />
        <Meter
          label="CPU used (live)"
          ratio={pool.usedCpuRatio}
          detail={`${millicoresToCores(pool.usedCpuMillicores)} / ${millicoresToCores(pool.allocatableCpuMillicores)} cores`}
        />
        <Meter
          label="Memory reserved"
          ratio={pool.reservedMemoryRatio}
          detail={`${bytesToGiB(pool.requestedMemoryBytes)} / ${bytesToGiB(pool.allocatableMemoryBytes)} GiB`}
        />
        <Meter
          label="Nodes vs max"
          ratio={nodeUsage}
          detail={auto ? `${auto.currentNodes} of ${auto.maxNodes} nodes` : 'n/a'}
        />
      </div>

      {capacity.workspacesByOrg.length > 0 ? (
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
          <p className="text-sm font-medium text-bolt-elements-textPrimary">Running workspaces by org</p>
          <div className="mt-3 grid gap-1.5">
            {capacity.workspacesByOrg.slice(0, 8).map((row) => (
              <div key={row.orgId} className="flex items-center justify-between text-sm">
                <span className="truncate font-mono text-xs text-bolt-elements-textSecondary">{row.orgId}</span>
                <span className="tabular-nums text-bolt-elements-textPrimary">{row.count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {payload.generatedAt ? (
        <p className="text-xs text-bolt-elements-textTertiary">Snapshot at {payload.generatedAt}</p>
      ) : null}
    </div>
  );
}
