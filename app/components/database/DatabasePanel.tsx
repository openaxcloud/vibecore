import { Database as DatabaseIcon, RefreshCw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { DatabaseRollbackPanel } from './DatabaseRollbackPanel';
import { SupabaseConnection } from '~/components/chat/SupabaseConnection';
import { formatDatabaseSettingsBytes } from '~/lib/i18n/catalogs/database-studio';
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

export function formatDatabasePanelBytes(bytes: number, language: string): string {
  const safeBytes = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;

  return formatDatabaseSettingsBytes(safeBytes, language)!;
}

function UsageCard({
  name,
  usedBytes,
  quotaBytes,
  status,
  language,
  statusLabel,
}: {
  name: string;
  usedBytes: number;
  quotaBytes?: number;
  status?: string;
  language: string;
  statusLabel?: string;
}) {
  const pct = quotaBytes && quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : undefined;

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-medium text-bolt-elements-textPrimary">{name}</span>
        {status ? <span className="text-[12px] text-bolt-elements-textTertiary">{statusLabel}</span> : null}
      </div>
      <div className="mt-2 text-[13px] text-bolt-elements-textSecondary">
        {formatDatabasePanelBytes(usedBytes, language)}
        {quotaBytes && quotaBytes > 0 ? (
          <span className="text-bolt-elements-textTertiary">
            {' / '}
            {formatDatabasePanelBytes(quotaBytes, language)}
          </span>
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
  const { t, i18n } = useTranslation();
  const fetcher = useFetcher<DatabasePanelData>();
  const loadUrl = `/api/projects/${encodeURIComponent(projectId)}/database`;
  const loading = fetcher.state !== 'idle';
  const loadedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (loadedUrlRef.current === loadUrl) {
      return;
    }

    loadedUrlRef.current = loadUrl;
    fetcher.load(loadUrl);
  }, [loadUrl]);

  const data = fetcher.data;
  const language = i18n.resolvedLanguage?.startsWith('fr') ? 'fr-FR' : 'en-GB';
  const failed = data?.ok === false || (loadedUrlRef.current === loadUrl && fetcher.state === 'idle' && !data);

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
        ? [
            {
              name: t('idePanels.database.production'),
              usedBytes: data.instance.sizeBytes,
              status: data.instance.status,
            },
          ]
        : [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DatabaseIcon className="h-4 w-4 text-bolt-elements-textTertiary" aria-hidden />
          <h2 className="text-[14px] font-medium text-bolt-elements-textPrimary">{t('idePanels.database.title')}</h2>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/usage"
            className="rounded-md border border-bolt-elements-borderColor px-2.5 py-1 text-[13px] text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
          >
            {t('idePanels.database.all')}
          </a>
          <button
            type="button"
            onClick={() => fetcher.load(loadUrl)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-2.5 py-1 text-[13px] text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-60"
          >
            <RefreshCw className={classNames('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden />
            {loading ? t('idePanels.database.refreshing') : t('idePanels.database.refresh')}
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
            <h3 className="text-[14px] font-medium text-bolt-elements-textPrimary">
              {t('idePanels.database.externalTitle')}
            </h3>
            <p className="mt-1 text-[12px] text-bolt-elements-textSecondary">{t('idePanels.database.externalBody')}</p>
          </div>
          <div className="shrink-0">
            <SupabaseConnection triggerVariant="bar" />
          </div>
        </div>
      </section>

      {loading && !data ? (
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-10 text-center">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin text-bolt-elements-textTertiary" aria-hidden />
          <p className="mt-3 text-sm text-bolt-elements-textSecondary">{t('idePanels.database.loading')}</p>
        </div>
      ) : failed ? (
        <div
          className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-10 text-center"
          role="alert"
        >
          <DatabaseIcon className="mx-auto h-7 w-7 text-bolt-elements-icon-error" aria-hidden />
          <p className="mt-3 text-sm font-medium text-bolt-elements-textPrimary">
            {t('idePanels.database.loadErrorTitle')}
          </p>
          <p className="mt-1 text-xs text-bolt-elements-textSecondary">{t('idePanels.database.loadErrorBody')}</p>
          <button
            type="button"
            onClick={() => fetcher.load(loadUrl)}
            className="mt-4 min-h-11 rounded-md border border-bolt-elements-borderColor px-3 py-2 text-[13px] text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)]"
          >
            {t('idePanels.database.refresh')}
          </button>
        </div>
      ) : !enabled ? (
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-10 text-center">
          <DatabaseIcon className="mx-auto h-7 w-7 text-bolt-elements-textTertiary" aria-hidden />
          <p className="mt-3 text-sm font-medium text-bolt-elements-textPrimary">
            {t('idePanels.database.emptyTitle')}
          </p>
          <p className="mt-1 text-xs text-bolt-elements-textSecondary">{t('idePanels.database.emptyBody')}</p>
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
                statusLabel={databaseStatus(env.status, t)}
                language={language}
              />
            ))}
          </div>

          {data?.billing?.renewsAt || typeof data?.computeHours === 'number' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {data?.billing?.renewsAt ? (
                <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
                  <span className="text-[13px] text-bolt-elements-textSecondary">
                    {t('idePanels.database.billingPeriod')}
                  </span>
                  <p className="mt-1 text-[14px] text-bolt-elements-textPrimary">
                    {billingCadence(data.billing.cadence, t)} · {formatBillingDate(data.billing.renewsAt, language)}
                  </p>
                </div>
              ) : null}
              {typeof data?.computeHours === 'number' ? (
                <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
                  <span className="text-[13px] text-bolt-elements-textSecondary">
                    {t('idePanels.database.computeHours')}
                  </span>
                  <p className="mt-1 text-[14px] text-bolt-elements-textPrimary">
                    {t('idePanels.database.hours', { count: data.computeHours })}
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-[12px] text-bolt-elements-textTertiary">{t('idePanels.database.metricsPending')}</p>
          )}

          {/* Our extra beyond Replit: point-in-time rollback / snapshots. */}
          <DatabaseRollbackPanel projectId={projectId} />
        </>
      )}
    </div>
  );
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

function databaseStatus(status: string | undefined, t: Translate): string | undefined {
  if (!status) {
    return undefined;
  }

  const keyByStatus: Record<string, string> = {
    READY: 'idePanels.database.statusReady',
    RUNNING: 'idePanels.database.statusRunning',
    PROVISIONING: 'idePanels.database.statusProvisioning',
    PENDING: 'idePanels.database.statusPending',
    FAILED: 'idePanels.database.statusFailed',
    ERROR: 'idePanels.database.statusFailed',
    STOPPED: 'idePanels.database.statusStopped',
  };

  return t(keyByStatus[status.toUpperCase()] ?? 'idePanels.common.unavailable');
}

function billingCadence(cadence: string | undefined, t: Translate): string {
  const keyByCadence: Record<string, string> = {
    month: 'idePanels.database.renewsMonthly',
    monthly: 'idePanels.database.renewsMonthly',
    year: 'idePanels.database.renewsYearly',
    yearly: 'idePanels.database.renewsYearly',
    annual: 'idePanels.database.renewsYearly',
  };

  return t(keyByCadence[cadence?.toLowerCase() ?? ''] ?? 'idePanels.database.renews');
}

function formatBillingDate(value: string, language: string): string {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(date);
}
