import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { formatAbsoluteTime } from '~/lib/format-relative';
import {
  databaseRollbackStatusLabel,
  databaseSnapshotKindLabel,
  formatDatabaseBytes,
  formatDatabaseRetention,
  formatDatabaseRollbackCopy,
  getDatabaseRollbackCopy,
  resolveDatabaseRollbackLanguage,
} from '~/lib/i18n/catalogs/database-rollback';

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

/**
 * Edge detector for "a restore/provision/snapshot just succeeded". The refresh
 * effect must fire exactly once per successful intent, not on every render.
 *
 * `restoreOk` is `true` for the whole span between a successful submission
 * settling and the next submission starting. Reloading the list fetcher inside
 * that span (which itself churns object references / `.data`) would re-run the
 * effect forever. So we only reload on the rising edge: `restoreOk` was false
 * (or unseen) on the previous run and is true now. The caller threads the
 * previous value through a ref; `false` resets it so the *next* success fires
 * again. Pure, so the loop-prevention logic is unit-testable without React.
 */
export function shouldRefreshAfterRestore(prevRestoreOk: boolean, restoreOk: boolean): boolean {
  return restoreOk && !prevRestoreOk;
}

export function DatabaseRollbackPanel({ projectId }: { projectId: string }) {
  const { i18n } = useTranslation();
  const language = resolveDatabaseRollbackLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getDatabaseRollbackCopy(language);
  const loadFetcher = useFetcher<PanelData>();
  const restoreFetcher = useFetcher<{ ok: boolean; error?: string; code?: string }>();
  const [target, setTarget] = useState('');
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);

  const loadUrl = `/api/projects/${encodeURIComponent(projectId)}/database`;
  const loadedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (loadedUrlRef.current === loadUrl) {
      return;
    }

    loadedUrlRef.current = loadUrl;
    loadFetcher.load(loadUrl);
  }, [loadUrl]);

  /*
   * Refresh after a restore is requested so the new PENDING row appears.
   * `restoreOk` stays true for the whole span after a successful submission, so
   * reload only on the rising edge — otherwise `loadFetcher.load()` churns the
   * fetcher reference / `.data` and re-fires the effect into an infinite loop.
   */
  const restoreOk = Boolean(restoreFetcher.state === 'idle' && restoreFetcher.data?.ok);
  const prevRestoreOkRef = useRef(false);

  useEffect(() => {
    if (shouldRefreshAfterRestore(prevRestoreOkRef.current, restoreOk)) {
      loadFetcher.load(loadUrl);
    }

    prevRestoreOkRef.current = restoreOk;
  }, [restoreOk, loadFetcher, loadUrl]);

  const data = loadFetcher.data;
  const dormant = useMemo(() => isDatabasePanelDormant(data), [data]);

  if (!data && loadFetcher.state !== 'idle') {
    return (
      <div
        className="min-h-32 animate-pulse rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
        role="status"
        aria-label={copy['databaseRollback.loading']}
      >
        <div className="h-5 w-32 rounded bg-bolt-elements-background-depth-3" />
        <div className="mt-3 h-4 w-full max-w-md rounded bg-bolt-elements-background-depth-3" />
      </div>
    );
  }

  // Feature off / not provisioned → render nothing (dormant).
  if (dormant) {
    return null;
  }

  const entitlement = data?.entitlement ?? { allowed: false, retentionDays: 0 };
  const instance = data?.instance ?? null;
  const snapshots = data?.snapshots ?? [];
  const restores = data?.restores ?? [];

  const submitIntent = (payload: Record<string, string>) => {
    restoreFetcher.submit(payload, { method: 'post', action: loadUrl, encType: 'application/json' });
  };

  const confirmRestore = () => {
    setRestoreConfirmOpen(false);

    if (!target) {
      return;
    }

    submitIntent({ intent: 'restore', targetTimestamp: new Date(target).toISOString() });
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-bolt-elements-textPrimary">{copy['databaseRollback.title']}</h3>
          <p className="text-sm text-bolt-elements-textSecondary">
            {entitlement.allowed
              ? formatDatabaseRetention(entitlement.retentionDays, language)
              : copy['databaseRollback.entitlement.pro']}
          </p>
        </div>
        {instance ? (
          <span className="max-w-full break-words rounded-full border border-bolt-elements-borderColor px-2 py-1 text-xs text-bolt-elements-textSecondary">
            {databaseRollbackStatusLabel(instance.status, language)} ·{' '}
            {formatDatabaseBytes(instance.sizeBytes, language)}
          </span>
        ) : null}
      </div>

      {!instance ? (
        <button
          type="button"
          onClick={() => submitIntent({ intent: 'provision' })}
          disabled={restoreFetcher.state !== 'idle'}
          className="min-h-11 self-start rounded-md bg-bolt-elements-button-primary-background px-3 py-2 text-sm text-bolt-elements-button-primary-text disabled:opacity-50"
          aria-busy={restoreFetcher.state !== 'idle'}
        >
          {restoreFetcher.state === 'idle'
            ? copy['databaseRollback.action.setup']
            : copy['databaseRollback.action.settingUp']}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => submitIntent({ intent: 'snapshot' })}
          disabled={restoreFetcher.state !== 'idle'}
          className="min-h-11 self-start rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm text-bolt-elements-textPrimary disabled:opacity-50"
          aria-busy={restoreFetcher.state !== 'idle'}
        >
          {restoreFetcher.state === 'idle'
            ? copy['databaseRollback.action.snapshot']
            : copy['databaseRollback.action.working']}
        </button>
      )}

      {entitlement.allowed && instance ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="db-restore-target" className="text-sm font-medium text-bolt-elements-textPrimary">
            {copy['databaseRollback.restore.label']}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="db-restore-target"
              type="datetime-local"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              className="min-h-11 min-w-0 flex-1 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-2 text-sm text-bolt-elements-textPrimary"
            />
            <button
              type="button"
              onClick={() => setRestoreConfirmOpen(true)}
              disabled={!target || restoreFetcher.state !== 'idle'}
              className="min-h-11 rounded-md bg-bolt-elements-button-primary-background px-3 py-2 text-sm text-bolt-elements-button-primary-text disabled:opacity-50"
              aria-busy={restoreFetcher.state !== 'idle'}
            >
              {restoreFetcher.state === 'idle'
                ? copy['databaseRollback.restore.action']
                : copy['databaseRollback.restore.requesting']}
            </button>
          </div>
          {restoreFetcher.data?.error ? (
            <p className="text-sm text-bolt-elements-icon-error" role="alert">
              {copy['databaseRollback.restore.error']}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-medium text-bolt-elements-textPrimary">
          {copy['databaseRollback.snapshots.title']}
        </h4>
        {snapshots.length === 0 ? (
          <p className="text-sm text-bolt-elements-textSecondary">{copy['databaseRollback.snapshots.empty']}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {snapshots.map((snapshot) => (
              <li
                key={snapshot.id}
                className="flex min-w-0 flex-wrap justify-between gap-2 text-sm text-bolt-elements-textSecondary"
              >
                <span className="min-w-0 break-words">
                  {snapshot.label ?? databaseSnapshotKindLabel(snapshot.kind, language)} ·{' '}
                  {formatDatabaseBytes(snapshot.sizeBytes, language)}
                </span>
                <span>{formatAbsoluteTime(snapshot.createdAt, language)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {restores.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-medium text-bolt-elements-textPrimary">
            {copy['databaseRollback.restores.title']}
          </h4>
          <ul className="flex flex-col gap-1">
            {restores.map((restore) => (
              <li
                key={restore.id}
                className="flex min-w-0 flex-wrap justify-between gap-2 text-sm text-bolt-elements-textSecondary"
              >
                <span>{databaseRollbackStatusLabel(restore.status, language)}</span>
                <span>{formatAbsoluteTime(restore.createdAt, language)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ConfirmationDialog
        isOpen={restoreConfirmOpen}
        title={copy['databaseRollback.dialog.title']}
        description={
          target
            ? formatDatabaseRollbackCopy(copy['databaseRollback.dialog.description'], {
                date: formatAbsoluteTime(new Date(target), language),
              })
            : copy['databaseRollback.dialog.targetRequired']
        }
        confirmLabel={copy['databaseRollback.dialog.confirm']}
        cancelLabel={copy['databaseRollback.dialog.cancel']}
        variant="destructive"
        onConfirm={confirmRestore}
        onClose={() => setRestoreConfirmOpen(false)}
      />
    </div>
  );
}

export default DatabaseRollbackPanel;
