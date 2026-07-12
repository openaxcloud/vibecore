import { ChevronRight, RefreshCw, Table2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useFetcher } from 'react-router';
import { DatabaseSettings } from './DatabaseSettings';
import { DatabaseStudio } from './DatabaseStudio';
import { classNames } from '~/utils/classNames';

/*
 * DatabaseWorkbench — the full Replit-parity Database panel shell, composing the
 * real building blocks (DatabaseStudio = My Data, DatabaseSettings = Settings) on
 * the live API (`…/ide-panel/database` list/schema, form-encoded query POST).
 * Structure: root "All Databases" usage cards (Dev/Prod) → a database view with
 * breadcrumb + Dev/Prod selector + 3 tabs (Overview / My Data / Settings). Zero
 * mock: usage/quota/connection-string render only when the API reports them.
 */

type Tab = 'overview' | 'mydata' | 'settings';

type DbEnv = { name: string; key: string; usedBytes?: number; quotaBytes?: number; status?: string };

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function container(data: unknown): Record<string, unknown> {
  const root = (data && typeof data === 'object' ? (data as Record<string, unknown>) : {}) as Record<string, unknown>;

  return (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
}

function readEnvironments(data: unknown): DbEnv[] {
  const c = container(data);
  const raw = asArray(c.environments ?? c.databases ?? c.connections);
  const envs: DbEnv[] = [];

  for (const d of raw) {
    const o = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
    const key = String(o.key ?? o.connectionKey ?? o.id ?? o.name ?? '');

    if (!key) {
      continue;
    }

    const env: DbEnv = { key, name: String(o.name ?? o.label ?? o.displayName ?? key) };

    if (typeof o.usedBytes === 'number') {
      env.usedBytes = o.usedBytes;
    } else if (typeof o.sizeBytes === 'number') {
      env.usedBytes = o.sizeBytes;
    }

    if (typeof o.quotaBytes === 'number') {
      env.quotaBytes = o.quotaBytes;
    }

    if (o.status) {
      env.status = String(o.status);
    }

    envs.push(env);
  }

  /*
   * HONEST empty state. Previously this fabricated a fake
   * [{ key: 'DATABASE_URL', name: 'Production Database' }] card when the project had
   * NO real database — so the panel showed "Production Database — Connected" with an
   * SQL editor for a project with zero databases (data.environments/connections all
   * empty). A user would write SQL against a database that does not exist. Return the
   * real (possibly empty) list so the panel reflects THIS project's actual databases
   * and the "Add your first database" create path shows instead.
   */
  return envs;
}

function formatBytes(bytes?: number): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    return null;
  }

  const mb = bytes / (1024 * 1024);

  return mb < 1024 ? `${mb < 10 ? mb.toFixed(2) : Math.round(mb)}MB` : `${(mb / 1024).toFixed(2)}GB`;
}

function readConnectionString(data: unknown, key: string): string | undefined {
  const c = container(data);
  const envVars = asArray(c.envVars ?? c.secrets) as Array<Record<string, unknown>>;

  const hit = envVars.find(
    (e) => String(e.key ?? e.name ?? '') === key || String(e.key ?? e.name ?? '') === 'DATABASE_URL',
  );

  return hit && typeof hit.value === 'string' ? hit.value : undefined;
}

function UsageCard({ env, onOpen }: { env: DbEnv; onOpen: () => void }) {
  const used = formatBytes(env.usedBytes);
  const quota = formatBytes(env.quotaBytes);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center justify-between gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 text-left hover:border-bolt-elements-item-contentAccent"
    >
      <div>
        <div className="text-[14px] font-medium text-bolt-elements-textPrimary">{env.name}</div>
        <div className="mt-1 text-[12px] text-bolt-elements-textSecondary">
          {used ? `${used}${quota ? ` / ${quota}` : ''}` : (env.status ?? 'Connected')}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-bolt-elements-textTertiary" aria-hidden />
    </button>
  );
}

export function DatabaseWorkbench({ projectId }: { projectId: string }) {
  const base = `/api/projects/${encodeURIComponent(projectId)}/ide-panel/database`;
  const fetcher = useFetcher();
  const provisionFetcher = useFetcher<{ ok?: boolean; instance?: unknown; error?: string }>();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    if (fetcher.state === 'idle' && !fetcher.data) {
      fetcher.load(base);
    }
  }, [fetcher, base]);

  // After a successful managed provision, reload the panel so the new DB shows.
  useEffect(() => {
    if (provisionFetcher.state === 'idle' && provisionFetcher.data?.ok) {
      fetcher.load(base);
    }
  }, [provisionFetcher.state, provisionFetcher.data, fetcher, base]);

  const provisioning = provisionFetcher.state !== 'idle';

  const environments = useMemo(() => readEnvironments(fetcher.data), [fetcher.data]);
  const active = environments.find((e) => e.key === openKey) ?? null;
  const loading = fetcher.state !== 'idle';

  // Root view — Dev/Prod usage cards.
  if (!active) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <header className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-bolt-elements-textPrimary">All Databases</h2>
          <button
            type="button"
            onClick={() => fetcher.load(base)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-2.5 py-1 text-[13px] text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-60"
          >
            <RefreshCw className={classNames('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden />
            Refresh
          </button>
        </header>
        <div className="grid gap-3 sm:grid-cols-2">
          {environments.map((env) => (
            <UsageCard
              key={env.key}
              env={env}
              onOpen={() => {
                setOpenKey(env.key);
                setTab('overview');
              }}
            />
          ))}
        </div>

        {environments.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-bolt-elements-borderColor p-4">
            <div>
              <p className="text-[13px] font-medium text-bolt-elements-textPrimary">No database yet</p>
              <p className="text-[12px] text-bolt-elements-textSecondary">
                Provision a managed Postgres database for this project — schema browser, SQL editor and backups run
                against it.
              </p>
            </div>
            <button
              type="button"
              disabled={provisioning}
              onClick={() => provisionFetcher.submit({ intent: 'provision' }, { method: 'post', action: base })}
              className="inline-flex items-center gap-1.5 rounded-md bg-bolt-elements-button-primary-background px-3 py-1.5 text-[13px] font-medium text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover disabled:opacity-60"
            >
              {provisioning ? 'Creating database…' : 'Create database'}
            </button>
            {provisionFetcher.data?.error ? (
              <p className="text-[12px] text-red-500">{provisionFetcher.data.error}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  // Database view — breadcrumb + Dev/Prod selector + 3 tabs.
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'mydata', label: 'My Data' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-bolt-elements-borderColor px-4 py-2 text-[13px]">
        <button
          type="button"
          onClick={() => setOpenKey(null)}
          className="text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
        >
          All Databases
        </button>
        <ChevronRight className="h-3.5 w-3.5 text-bolt-elements-textTertiary" aria-hidden />
        <select
          value={active.key}
          onChange={(e) => setOpenKey(e.target.value)}
          className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1 text-[13px] font-medium text-bolt-elements-textPrimary"
        >
          {environments.map((env) => (
            <option key={env.key} value={env.key}>
              {env.name}
            </option>
          ))}
        </select>
      </div>

      <nav
        className="flex items-center gap-1 border-b border-bolt-elements-borderColor px-3"
        role="tablist"
        aria-label="Database views"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={classNames(
              'border-b-2 px-3 py-2 text-[13px] font-medium',
              tab === t.id
                ? 'border-[var(--ecode-accent,#F26207)] text-bolt-elements-textPrimary'
                : 'border-transparent text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'overview' ? (
          <OverviewTab base={base} connectionKey={active.key} onPickTable={() => setTab('mydata')} />
        ) : null}
        {tab === 'mydata' ? <DatabaseStudio projectId={projectId} /> : null}
        {tab === 'settings' ? (
          <DatabaseSettings
            name={active.name}
            active
            connectionString={readConnectionString(fetcher.data, active.key)}
            storageUsedBytes={active.usedBytes}
            storageQuotaBytes={active.quotaBytes}
            projectId={projectId}
          />
        ) : null}
      </div>
    </div>
  );
}

/* Overview — "Tables" cards (name + row count) from the connection schema. */
function OverviewTab({
  base,
  connectionKey,
  onPickTable,
}: {
  base: string;
  connectionKey: string;
  onPickTable: () => void;
}) {
  const fetcher = useFetcher();

  useEffect(() => {
    fetcher.load(`${base}?schemaKey=${encodeURIComponent(connectionKey)}`);
  }, [connectionKey]);

  const tables = useMemo(() => {
    const c = container(fetcher.data);
    const schema = (c.schema && typeof c.schema === 'object' ? c.schema : c) as Record<string, unknown>;

    return asArray(schema.tables ?? c.tables).map((t) => {
      const o = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;

      return { name: String(o.name ?? o.table ?? ''), rows: typeof o.rowCount === 'number' ? o.rowCount : undefined };
    });
  }, [fetcher.data]);

  return (
    <div className="flex flex-col gap-3 p-4">
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-bolt-elements-textPrimary">
        <Table2 className="h-4 w-4" aria-hidden /> Tables
      </h3>
      {tables.length === 0 ? (
        <p className="text-[12px] text-bolt-elements-textTertiary">
          {fetcher.state !== 'idle' ? 'Loading schema…' : 'No tables yet.'}
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {tables.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={onPickTable}
              className="flex items-center justify-between gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-left hover:border-bolt-elements-item-contentAccent"
            >
              <span className="truncate font-mono text-[13px] text-bolt-elements-textPrimary">{t.name}</span>
              <span className="shrink-0 text-[12px] text-bolt-elements-textTertiary">
                {typeof t.rows === 'number' ? `${t.rows} rows` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
