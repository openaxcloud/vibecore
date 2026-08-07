/**
 * Admin Infrastructure / Capacity panel. Renders the live cluster snapshot from
 * `GET /admin/capacity` (real kubectl + metrics-server data, no mock): running
 * workspaces, pod count, CPU/RAM used vs reserved, node count vs the autoscaling
 * max, autoscaling state, idle-stopped workspaces, and top orgs — plus a banner
 * when capacity approaches the ceiling.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatAdminInfrastructureCopy,
  formatAdminInfrastructureNumber,
  formatAdminInfrastructurePlural,
  getAdminInfrastructureCopy,
  resolveAdminInfrastructureLanguage,
  type AdminInfrastructureCopy,
} from '~/lib/i18n/catalogs/admin-infrastructure';
import { formatUserAreaDateTime } from '~/lib/i18n/user-area-locale';

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

function pct(ratio: number, language?: string | null): string {
  return formatAdminInfrastructureNumber(Math.round((ratio || 0) * 100), language);
}

function millicoresToCores(m: number, language?: string | null): string {
  return formatAdminInfrastructureNumber(m / 1000, language, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function bytesToGiB(b: number, language?: string | null): string {
  return formatAdminInfrastructureNumber(b / 1024 ** 3, language, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
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

function Meter({
  label,
  ratio,
  detail,
  progressLabel,
}: {
  label: string;
  ratio: number;
  detail: string;
  progressLabel: string;
}) {
  const clamped = Math.max(0, Math.min(1, ratio || 0));

  const tone = clamped >= 0.85 ? 'bg-red-500' : clamped >= 0.7 ? 'bg-amber-500' : 'bg-bolt-elements-item-contentAccent';

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="min-w-0 break-words text-sm font-medium text-bolt-elements-textPrimary">{label}</p>
        <p className="shrink-0 text-sm tabular-nums text-bolt-elements-textSecondary">{progressLabel}</p>
      </div>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-bolt-elements-background-depth-3"
        role="progressbar"
        aria-label={progressLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped * 100)}
      >
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${clamped * 100}%` }} />
      </div>
      <p className="mt-1 text-xs text-bolt-elements-textTertiary">{detail}</p>
    </div>
  );
}

function capacityAlertMessage(
  alert: CapacityAlert,
  capacity: Capacity,
  language: string,
  copy: AdminInfrastructureCopy,
): string {
  if (alert.kind === 'node-count' && capacity.autoscaling) {
    const autoscaling = capacity.autoscaling;

    const key =
      alert.level === 'critical' ? 'adminInfrastructure.alert.nodeCritical' : 'adminInfrastructure.alert.nodeWarning';

    return formatAdminInfrastructureCopy(copy[key], {
      pool: autoscaling.nodePool,
      current: formatAdminInfrastructureNumber(autoscaling.currentNodes, language),
      max: formatAdminInfrastructureNumber(autoscaling.maxNodes, language),
      percent: pct(autoscaling.currentNodes / autoscaling.maxNodes, language),
    });
  }

  if (alert.kind === 'reserved-cpu') {
    return formatAdminInfrastructureCopy(copy['adminInfrastructure.alert.cpu'], {
      pool: capacity.nodePool.name,
      percent: pct(capacity.nodePool.reservedCpuRatio, language),
    });
  }

  return copy['adminInfrastructure.alert.fallback'];
}

export function InfrastructurePanel({ payload }: { payload: InfrastructurePayload }) {
  const { i18n } = useTranslation();
  const language = resolveAdminInfrastructureLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getAdminInfrastructureCopy(language);
  const capacity = payload.capacity ?? null;
  const alerts = payload.alerts ?? [];

  const nodeUsage = useMemo(() => {
    const auto = capacity?.autoscaling;

    return auto && auto.maxNodes > 0 ? auto.currentNodes / auto.maxNodes : 0;
  }, [capacity]);

  if (payload.available === false || !capacity) {
    return (
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-6">
        <h2 className="break-words text-lg font-semibold text-bolt-elements-textPrimary">
          {copy['adminInfrastructure.unavailable.title']}
        </h2>
        <p className="mt-2 break-words text-sm text-bolt-elements-textSecondary">
          {copy['adminInfrastructure.unavailable.description']}
        </p>
      </div>
    );
  }

  const pool = capacity.nodePool;
  const auto = capacity.autoscaling;

  return (
    <div className="grid min-w-0 gap-6 overflow-x-hidden">
      {alerts.length > 0 ? (
        <div className="grid gap-2">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={`break-words rounded-lg border p-3 text-sm ${
                alert.level === 'critical'
                  ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              }`}
            >
              <span className="font-semibold">
                {alert.level === 'critical'
                  ? copy['adminInfrastructure.alert.critical']
                  : copy['adminInfrastructure.alert.warning']}
                {language === 'fr' ? ' :' : ':'}
              </span>{' '}
              {capacityAlertMessage(alert, capacity, language, copy)}
            </div>
          ))}
        </div>
      ) : null}

      <div>
        <h2 className="break-words text-lg font-semibold text-bolt-elements-textPrimary">
          {copy['adminInfrastructure.page.title']}
        </h2>
        <p className="mt-1 break-words text-sm text-bolt-elements-textSecondary">
          {formatAdminInfrastructureCopy(copy['adminInfrastructure.page.description'], { pool: pool.name })}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={copy['adminInfrastructure.stat.runningWorkspaces']}
          value={formatAdminInfrastructureNumber(capacity.runningWorkspaces, language)}
          sub={formatAdminInfrastructurePlural(language, capacity.totalWorkspacePods, {
            one: copy['adminInfrastructure.stat.pods_one'],
            other: copy['adminInfrastructure.stat.pods_other'],
          })}
        />
        <Stat
          label={copy['adminInfrastructure.stat.idleStopped']}
          value={formatAdminInfrastructureNumber(payload.idleStopped ?? 0, language)}
          sub={copy['adminInfrastructure.stat.reclaimed']}
        />
        <Stat
          label={copy['adminInfrastructure.stat.nodes']}
          value={
            auto
              ? `${formatAdminInfrastructureNumber(auto.currentNodes, language)} / ${formatAdminInfrastructureNumber(auto.maxNodes, language)}`
              : formatAdminInfrastructureNumber(pool.nodeCount, language)
          }
          sub={
            auto
              ? formatAdminInfrastructureCopy(copy['adminInfrastructure.stat.minMax'], {
                  min: formatAdminInfrastructureNumber(auto.minNodes, language),
                  max: formatAdminInfrastructureNumber(auto.maxNodes, language),
                })
              : copy['adminInfrastructure.stat.autoscalingUnavailable']
          }
        />
        <Stat
          label={copy['adminInfrastructure.stat.autoscaling']}
          value={
            auto
              ? auto.healthy
                ? copy['adminInfrastructure.stat.healthy']
                : copy['adminInfrastructure.stat.degraded']
              : '—'
          }
          sub={auto ? copy['adminInfrastructure.stat.automaticScaling'] : undefined}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Meter
          label={copy['adminInfrastructure.meter.cpuReserved']}
          ratio={pool.reservedCpuRatio}
          detail={formatAdminInfrastructureCopy(copy['adminInfrastructure.meter.cores'], {
            used: millicoresToCores(pool.requestedCpuMillicores, language),
            total: millicoresToCores(pool.allocatableCpuMillicores, language),
          })}
          progressLabel={formatAdminInfrastructureCopy(copy['adminInfrastructure.meter.progress'], {
            label: copy['adminInfrastructure.meter.cpuReserved'],
            percent: pct(pool.reservedCpuRatio, language),
          })}
        />
        <Meter
          label={copy['adminInfrastructure.meter.cpuUsed']}
          ratio={pool.usedCpuRatio}
          detail={formatAdminInfrastructureCopy(copy['adminInfrastructure.meter.cores'], {
            used: millicoresToCores(pool.usedCpuMillicores, language),
            total: millicoresToCores(pool.allocatableCpuMillicores, language),
          })}
          progressLabel={formatAdminInfrastructureCopy(copy['adminInfrastructure.meter.progress'], {
            label: copy['adminInfrastructure.meter.cpuUsed'],
            percent: pct(pool.usedCpuRatio, language),
          })}
        />
        <Meter
          label={copy['adminInfrastructure.meter.memoryReserved']}
          ratio={pool.reservedMemoryRatio}
          detail={formatAdminInfrastructureCopy(copy['adminInfrastructure.meter.memory'], {
            used: bytesToGiB(pool.requestedMemoryBytes, language),
            total: bytesToGiB(pool.allocatableMemoryBytes, language),
          })}
          progressLabel={formatAdminInfrastructureCopy(copy['adminInfrastructure.meter.progress'], {
            label: copy['adminInfrastructure.meter.memoryReserved'],
            percent: pct(pool.reservedMemoryRatio, language),
          })}
        />
        <Meter
          label={copy['adminInfrastructure.meter.nodesMaximum']}
          ratio={nodeUsage}
          detail={
            auto
              ? formatAdminInfrastructureCopy(copy['adminInfrastructure.meter.nodes'], {
                  current: formatAdminInfrastructureNumber(auto.currentNodes, language),
                  max: formatAdminInfrastructureNumber(auto.maxNodes, language),
                })
              : copy['adminInfrastructure.meter.unavailable']
          }
          progressLabel={formatAdminInfrastructureCopy(copy['adminInfrastructure.meter.progress'], {
            label: copy['adminInfrastructure.meter.nodesMaximum'],
            percent: pct(nodeUsage, language),
          })}
        />
      </div>

      {capacity.workspacesByOrg.length > 0 ? (
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
          <p className="break-words text-sm font-medium text-bolt-elements-textPrimary">
            {copy['adminInfrastructure.organizations.title']}
          </p>
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
        <p className="break-words text-xs text-bolt-elements-textTertiary">
          {formatAdminInfrastructureCopy(copy['adminInfrastructure.snapshot'], {
            date:
              formatUserAreaDateTime(payload.generatedAt, undefined, language) ??
              copy['adminInfrastructure.dateUnavailable'],
          })}
        </p>
      ) : null}
    </div>
  );
}
