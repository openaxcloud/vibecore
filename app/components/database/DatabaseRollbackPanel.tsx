import { useEffect, useMemo, useState } from 'react';
import { useFetcher } from 'react-router';

/*
 * Replit-parity database point-in-time rollback — dormant UI shell (Phase-1).
 *
 * Renders the project "Database" panel: managed-DB status, plan retention
 * window, recovery points, and a point-in-time restore form. The backend 404s
 * (FEATURE_NOT_ENABLED) until DB_ROLLBACK_ENABLED is on, so this component
 * renders NOTHING while the feature is dormant — zero runtime/UX impact until
 * the provisioning + WAL-restore executor (Phase-2) ships. Mount with a
 * projectId; it self-hides when the feature is off.
 */

interface Entitlement {
  allowed: boolean;
  retentionDays: number;
}

interface DatabaseInstance {
  id: string;
  status: string;
  engine: string;
  sizeBytes: number;
  retentionDays: number;
  pitrEnabled: boolean;
}

interface Snapshot {
  id: string;
  kind: string;
  label?: string;
  sizeBytes: number;
  createdAt: string;
}

interface Restore {
  id: string;
  status: string;
  targetTimestamp?: string;
  createdAt: string;
}

interface PanelData {
  ok: boolean;
  enabled?: boolean;
  entitlement?: Entitlement;
  instance?: DatabaseInstance | null;
  snapshots?: Snapshot[];
  restores?: Restore[];
}

/**
 * The shell stays dormant (renders nothing) until the feature endpoint returns a
 * successful, enabled payload. Pure so it's unit-testable without React. A
 * missing payload, an `ok: false` (e.g. the 404 FEATURE_NOT_ENABLED passthrough),
 * or an explicit `enabled: false` all keep it hidden.
 */
export function isDatabasePanelDormant(data: PanelData | undefined): boolean {
  return !data || data.ok === false || data.enabled === false;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const exp = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));

  return `${(bytes / 1024 ** exp).toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
}

export function DatabaseRollbackPanel({ projectId }: { projectId: string }) {
  const loadFetcher = useFetcher<PanelData>();
  const restoreFetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [target, setTarget] = useState('');

  const loadUrl = `/api/projects/${encodeURIComponent(projectId)}/database`;

  useEffect(() => {
    if (loadFetcher.state === 'idle' && !loadFetcher.data) {
      loadFetcher.load(loadUrl);
    }
  }, [loadFetcher, loadUrl]);

  // Refresh after a restore is requested so the new PENDING row appears.
  const restoreOk = restoreFetcher.state === 'idle' && restoreFetcher.data?.ok;

  useEffect(() => {
    if (restoreOk) {
      loadFetcher.load(loadUrl);
    }
  }, [restoreOk, loadFetcher, loadUrl]);

  const data = loadFetcher.data;
  const dormant = useMemo(() => isDatabasePanelDormant(data), [data]);

  // Feature off / not provisioned → render nothing (dormant).
  if (dormant) {
    return null;
  }

  const entitlement = data?.entitlement ?? { allowed: false, retentionDays: 0 };
  const instance = data?.instance ?? null;
  const snapshots = data?.snapshots ?? [];
  const restores = data?.restores ?? [];

  const submitRestore = () => {
    if (!target) {
      return;
    }

    restoreFetcher.submit(
      { targetTimestamp: new Date(target).toISOString() },
      { method: 'post', action: loadUrl, encType: 'application/json' },
    );
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-bolt-elements-textPrimary">Database</h3>
          <p className="text-sm text-bolt-elements-textSecondary">
            {entitlement.allowed
              ? `Point-in-time rollback up to ${entitlement.retentionDays} days (your plan).`
              : 'Point-in-time rollback is available on the Pro plan.'}
          </p>
        </div>
        {instance ? (
          <span className="rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-xs text-bolt-elements-textSecondary">
            {instance.status} · {formatBytes(instance.sizeBytes)}
          </span>
        ) : null}
      </div>

      {entitlement.allowed ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="db-restore-target" className="text-sm font-medium text-bolt-elements-textPrimary">
            Restore to a point in time
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="db-restore-target"
              type="datetime-local"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1 text-sm text-bolt-elements-textPrimary"
            />
            <button
              type="button"
              onClick={submitRestore}
              disabled={!target || restoreFetcher.state !== 'idle'}
              className="rounded-md bg-bolt-elements-button-primary-background px-3 py-1 text-sm text-bolt-elements-button-primary-text disabled:opacity-50"
            >
              {restoreFetcher.state === 'idle' ? 'Restore' : 'Requesting…'}
            </button>
          </div>
          {restoreFetcher.data?.error ? (
            <p className="text-sm text-bolt-elements-icon-error">{restoreFetcher.data.error}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-medium text-bolt-elements-textPrimary">Recovery points</h4>
        {snapshots.length === 0 ? (
          <p className="text-sm text-bolt-elements-textSecondary">No snapshots yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {snapshots.map((snapshot) => (
              <li key={snapshot.id} className="flex justify-between text-sm text-bolt-elements-textSecondary">
                <span>
                  {snapshot.label ?? snapshot.kind} · {formatBytes(snapshot.sizeBytes)}
                </span>
                <span>{new Date(snapshot.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {restores.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-medium text-bolt-elements-textPrimary">Restores</h4>
          <ul className="flex flex-col gap-1">
            {restores.map((restore) => (
              <li key={restore.id} className="flex justify-between text-sm text-bolt-elements-textSecondary">
                <span>{restore.status}</span>
                <span>{new Date(restore.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default DatabaseRollbackPanel;
