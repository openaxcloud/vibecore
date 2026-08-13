import { Database as DatabaseIcon, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { useFetcher } from 'react-router';
import { DatabaseRollbackPanel } from './DatabaseRollbackPanel';
import { SupabaseConnection } from '~/components/chat/SupabaseConnection';
import { classNames } from '~/utils/classNames';

/*
 * Database panel — structured per the Replit "Database" spec (All Databases ·
 * Refresh header, Development / Production database cards with usage, Billing
 * Period, Hours of Compute Used) in the E-Code orange theme, plus our extra:
 * point-in-time rollback (DatabaseRollbackPanel).
 *
 * IMPORTANT — real data only. The web proxy `/api/projects/:id/database` is the
 * single source of truth. Today it returns one managed instance (status/engine/
 * sizeBytes/PITR). The dev/prod split, storage quota, billing period and compute
 * hours are surfaced ONLY when the backend exposes them (the managed CloudNativePG
 * service the platform team is building) — we never fabricate usage numbers. The
 * table browser + SQL editor + migrations land on top of that same API next.
 */

interface DbInstance {
  id: string;
  status: string;
  engine: string;
  sizeBytes: number;
  retentionDays: number;
  pitrEnabled: boolean;
}

interface DatabasePanelData {
  ok?: boolean;
  enabled?: boolean;
  instance?: DbInstance | null;

  /** Optional richer fields — rendered only when the managed-DB API provides them. */
  environments?: Array<{ name: string; usedBytes: number; quotaBytes?: number; status?: string }>;
  billing?: { renewsAt?: string; cadence?: string };
  computeHours?: number;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 MB';
  }

  const mb = bytes / (1024 * 1024);

  if (mb < 1024) {
    return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  }

  return `${(mb / 1024).toFixed(2)} GB`;
}

function UsageCard({
  name,
  usedBytes,
  quotaBytes,
  status,
}: {
  name: string;
  usedBytes: number;
  quotaBytes?: number;
  status?: string;
}) {
  const pct = quotaBytes && quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : undefined;

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-medium text-bolt-elements-textPrimary">{name}</span>
        {status ? <span className="text-[12px] text-bolt-elements-textTertiary">{status}</span> : null}
      </div>
      <div className="mt-2 text-[13px] text-bolt-elements-textSecondary">
        {formatBytes(usedBytes)}
        {quotaBytes && quotaBytes > 0 ? (
          <span className="text-bolt-elements-textTertiary"> / {formatBytes(quotaBytes)}</span>
        ) : null}
      </div>
      {pct !== undefined ? (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bolt-elements-background-depth-3">
          <div className="h-full rounded-full bg-[var(--ecode-accent,#F26207)]" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

export function DatabasePanel({ projectId }: { projectId: string }) {
  const fetcher = useFetcher<DatabasePanelData>();
  const loadUrl = `/api/projects/${encodeURIComponent(projectId)}/database`;
  const loading = fetcher.state !== 'idle';

  useEffect(() => {
    if (fetcher.state === 'idle' && !fetcher.data) {
      fetcher.load(loadUrl);
    }
  }, [fetcher, loadUrl]);

  const data = fetcher.data;

  const enabled = Boolean(
    data?.ok !== false && data?.enabled !== false && (data?.instance || data?.environments?.length),
  );

  /*
   * Real environments when the managed-DB API provides them; otherwise derive a
   * single "Production" card from the one instance the current API returns.
   */
  const environments =
    data?.environments && data.environments.length > 0
      ? data.environments
      : data?.instance
        ? [{ name: 'Production Database', usedBytes: data.instance.sizeBytes, status: data.instance.status }]
        : [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DatabaseIcon className="h-4 w-4 text-bolt-elements-textTertiary" aria-hidden />
          <h2 className="text-[14px] font-medium text-bolt-elements-textPrimary">Databases</h2>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/usage"
            className="rounded-md border border-bolt-elements-borderColor px-2.5 py-1 text-[13px] text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
          >
            All Databases
          </a>
          <button
            type="button"
            onClick={() => fetcher.load(loadUrl)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-2.5 py-1 text-[13px] text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-60"
          >
            <RefreshCw className={classNames('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden />
            Refresh
          </button>
        </div>
      </header>

      {/*
       * Connect an external database (Supabase) to THIS project — the Replit
       * "Connect external database" entry point. Reuses the existing
       * SupabaseConnection flow (per-project selection keyed by chatId, connection
       * string + SQL); the token now resolves from the encrypted UserConnection so
       * the connection follows the user across devices. Independent of the managed
       * Postgres instance below, so it always renders.
       */}
      <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-[14px] font-medium text-bolt-elements-textPrimary">Connect external database</h3>
            <p className="mt-1 text-[12px] text-bolt-elements-textSecondary">
              Link a Supabase project to this app — its connection string and SQL run against the database you select.
            </p>
          </div>
          <div className="shrink-0">
            <SupabaseConnection triggerVariant="bar" />
          </div>
        </div>
      </section>

      {loading && !data ? (
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-10 text-center">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin text-bolt-elements-textTertiary" aria-hidden />
          <p className="mt-3 text-sm text-bolt-elements-textSecondary">Loading databases…</p>
        </div>
      ) : !enabled ? (
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-10 text-center">
          <DatabaseIcon className="mx-auto h-7 w-7 text-bolt-elements-textTertiary" aria-hidden />
          <p className="mt-3 text-sm font-medium text-bolt-elements-textPrimary">No database yet</p>
          <p className="mt-1 text-xs text-bolt-elements-textSecondary">
            Attach a managed Postgres database to give this project persistent storage.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {environments.map((env) => (
              <UsageCard
                key={env.name}
                name={env.name}
                usedBytes={env.usedBytes}
                quotaBytes={env.quotaBytes}
                status={env.status}
              />
            ))}
          </div>

          {data?.billing?.renewsAt || typeof data?.computeHours === 'number' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {data?.billing?.renewsAt ? (
                <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
                  <span className="text-[13px] text-bolt-elements-textSecondary">Billing Period</span>
                  <p className="mt-1 text-[14px] text-bolt-elements-textPrimary">
                    {data.billing.cadence ?? 'Renews'} · {data.billing.renewsAt}
                  </p>
                </div>
              ) : null}
              {typeof data?.computeHours === 'number' ? (
                <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
                  <span className="text-[13px] text-bolt-elements-textSecondary">Hours of Compute Used</span>
                  <p className="mt-1 text-[14px] text-bolt-elements-textPrimary">{data.computeHours} hours</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-[12px] text-bolt-elements-textTertiary">
              Storage quota, billing period and compute hours appear here once the managed database service reports
              them. Table browser, SQL editor and migrations are coming on the same connection.
            </p>
          )}

          {/* Our extra beyond Replit: point-in-time rollback / snapshots. */}
          <DatabaseRollbackPanel projectId={projectId} />
        </>
      )}
    </div>
  );
}
