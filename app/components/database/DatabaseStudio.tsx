import { Check, Copy, Play, Table2, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { QueryHistoryControl } from './QueryHistoryControl';
import { clearQueryHistory, readQueryHistory, recordQueryHistory, removeQueryHistory } from './query-history';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { EmptyState } from '~/components/ui/EmptyState';
import Popover from '~/components/ui/Popover';
import { formatDatabaseStudioCopy, getDatabaseStudioCopy } from '~/lib/i18n/catalogs/database-studio';
import { classNames } from '~/utils/classNames';

/*
 * DatabaseStudio — the "My Data" surface of the Replit-parity Database panel,
 * wired to the REAL infra routes via the IDE database panel proxy:
 *   GET  /api/projects/:id/ide-panel/database              → connections
 *   GET  /api/projects/:id/ide-panel/database?schemaKey=K  → schema (tables/cols)
 *   POST /api/projects/:id/ide-panel/database {intent:query, connectionKey, query}
 * Native DB (key=DATABASE_URL) and external (Supabase/Neon) connections use the
 * same API. Zero mock. Rendering is defensive about the exact payload shape so it
 * survives backend field naming differences.
 */

type Conn = { key: string; label: string };

type QueryResult = { columns?: string[]; rows?: Array<Record<string, unknown> | unknown[]>; error?: string };

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Pull a connections list out of the (envelope-wrapped) panel payload, tolerant of shapes. */
function readConnections(data: unknown): Conn[] {
  const root = (data && typeof data === 'object' ? (data as Record<string, unknown>) : {}) as Record<string, unknown>;
  const container = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
  const raw = asArray(container.databases ?? container.connections);

  const conns = raw
    .map((d) => {
      const o = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
      const key = String(o.key ?? o.connectionKey ?? o.id ?? o.name ?? '');
      const label = String(o.label ?? o.name ?? o.displayName ?? key);

      return key ? { key, label } : null;
    })
    .filter((c): c is Conn => Boolean(c));

  /*
   * Return the REAL connections only. This used to fabricate a default
   * [{ key: 'DATABASE_URL' }] when empty ("always expose the native connection"),
   * so the SQL editor offered a connection — and ran queries — against a
   * DATABASE_URL that may not exist (same false-state class as the fake
   * "Production Database" card). The My Data tab is only reachable from a real
   * database now, so an empty list means "no connection" and must render as such.
   */
  return conns;
}

function readTables(data: unknown): Array<{ name: string; columns: string[] }> {
  const root = (data && typeof data === 'object' ? (data as Record<string, unknown>) : {}) as Record<string, unknown>;
  const container = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;

  const schema = (container.schema && typeof container.schema === 'object' ? container.schema : container) as Record<
    string,
    unknown
  >;

  const tables = asArray(schema.tables ?? container.tables);

  return tables
    .map((t) => {
      const o = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
      const name = String(o.name ?? o.table ?? '');

      const columns = asArray(o.columns).map((c) =>
        typeof c === 'string' ? c : String((c as Record<string, unknown>)?.name ?? ''),
      );

      return name ? { name, columns: columns.filter(Boolean) } : null;
    })
    .filter((t): t is { name: string; columns: string[] } => Boolean(t));
}

/*
 * Pragmatic destructive-statement detector: strip string literals ('…' with ''
 * escapes), quoted identifiers ("…"), and comments (`--`, C-style) BEFORE testing for
 * destructive keywords, so `SELECT 'DROP TABLE'` or a `-- delete later` comment
 * does not prompt. Known limits: dollar-quoted strings ($$…$$), backslash
 * escapes, and dialect-specific quoting are NOT stripped — a destructive word
 * inside those can still over-prompt, which fails safe (extra confirmation).
 */
const DESTRUCTIVE_SQL_KEYWORDS = /\b(DROP|DELETE|TRUNCATE|ALTER|UPDATE)\b/i;

function isDestructiveSql(query: string): boolean {
  const stripped = query
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');

  return DESTRUCTIVE_SQL_KEYWORDS.test(stripped);
}

/*
 * Escape a cell value for SQL literals. This is the user's own database (they
 * already have full SQL access via the runner), so this is about CORRECTNESS
 * (quotes/null/numbers), not a security boundary.
 */
function sqlLit(v: unknown): string {
  if (v === null || v === undefined || v === '∅') {
    return 'NULL';
  }

  if (typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }

  return `'${String(v).replace(/'/g, "''")}'`;
}

/*
 * Serialize a result grid to RFC-4180 CSV (quote fields with comma/quote/newline;
 * escape quotes by doubling). BigInts/objects fall back to String()/JSON.
 */
function toCsv(columns: string[], rows: unknown[][]): string {
  const cell = (value: unknown): string => {
    if (value == null) {
      return '';
    }

    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);

    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  return [columns.map(cell).join(','), ...rows.map((row) => row.map(cell).join(','))].join('\n');
}

function downloadCsv(columns: string[], rows: unknown[][]): void {
  const blob = new Blob([toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'query-result.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

function normalizeRows(result: QueryResult): { columns: string[]; rows: unknown[][] } {
  const rows = result.rows ?? [];

  if (!rows.length) {
    return { columns: result.columns ?? [], rows: [] };
  }

  const first = rows[0];

  if (Array.isArray(first)) {
    return { columns: result.columns ?? first.map((_, i) => `col_${i + 1}`), rows: rows as unknown[][] };
  }

  const columns = result.columns ?? Object.keys(first as Record<string, unknown>);

  return { columns, rows: (rows as Array<Record<string, unknown>>).map((r) => columns.map((c) => r[c])) };
}

/*
 * G15 — full-value popover for truncated result cells.
 * The results <td> clips at max-w-[280px] via `truncate`; at the table's 12px mono
 * type (~7.5px/char) minus the px-3 padding that is roughly 35 characters, so only
 * values longer than this threshold — the ones actually being cut off — get the
 * click-to-expand affordance. NULL/empty cells keep their plain rendering.
 */
const CELL_TRUNCATION_THRESHOLD = 35;

function CopyCellValueButton({ value }: { value: string }) {
  const { i18n } = useTranslation();
  const copy = getDatabaseStudioCopy(i18n.resolvedLanguage ?? i18n.language);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }

    const timer = window.setTimeout(() => setCopied(false), 1500);

    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          ?.writeText(value)
          .then(() => setCopied(true))
          .catch(() => {});
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 py-1 text-[11px] text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
    >
      {copied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
      {copied ? copy['databaseStudio.copied'] : copy['databaseStudio.copy']}
    </button>
  );
}

/** Read-mode cell value: plain text, or a popover exposing the full value when truncated. */
function CellValue({ value }: { value: string }) {
  const { i18n } = useTranslation();
  const copy = getDatabaseStudioCopy(i18n.resolvedLanguage ?? i18n.language);

  if (value.length <= CELL_TRUNCATION_THRESHOLD) {
    return <>{value}</>;
  }

  return (
    <Popover
      side="bottom"
      align="start"
      testId="db-cell-full-value"
      contentClassName="w-[420px]"
      trigger={
        <button
          type="button"
          title={copy['databaseStudio.showFullValue']}
          className="block w-full cursor-pointer truncate text-left underline decoration-dotted underline-offset-2 hover:text-bolt-elements-textPrimary"
        >
          {value}
        </button>
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-bolt-elements-textTertiary">
            {copy['databaseStudio.fullValue']}
          </span>
          <CopyCellValueButton value={value} />
        </div>
        <pre
          className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-bolt-elements-background-depth-1 p-2 text-[12px] leading-relaxed text-bolt-elements-textPrimary"
          style={{ fontFamily: 'var(--vc-font-code)' }}
        >
          {value}
        </pre>
      </div>
    </Popover>
  );
}

export function DatabaseStudio({ projectId }: { projectId: string }) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getDatabaseStudioCopy(language);

  const text = (template: string, values: Readonly<Record<string, string | number>> = {}) =>
    formatDatabaseStudioCopy(template, values);

  const base = `/api/projects/${encodeURIComponent(projectId)}/ide-panel/database`;
  const connFetcher = useFetcher();
  const schemaFetcher = useFetcher();

  /*
   * The ide-panel proxy returns { ok, result: { columns, rows, rowCount }, error? }
   * (the query result is NESTED under `result`, not spread flat).
   */
  const queryFetcher = useFetcher<{ ok?: boolean; result?: QueryResult; error?: string }>();

  const [connectionKey, setConnectionKey] = useState('');
  const [sql, setSql] = useState('SELECT 1;');

  /*
   * G14: per-project MRU of successfully executed statements. Loaded
   * post-hydration (SSR renders an empty history, avoiding a mismatch);
   * the statement is only recorded once its round-trip comes back clean.
   */
  const [history, setHistory] = useState<string[]>([]);
  const pendingHistoryRef = useRef<string | null>(null);

  useEffect(() => {
    setHistory(readQueryHistory(projectId));
  }, [projectId]);

  // Table currently browsed (set on a table click) — enables row edit/insert against it.
  const [selectedTable, setSelectedTable] = useState('');
  const [editMode, setEditMode] = useState(false);

  // Destructive statement awaiting user confirmation (null = no dialog).
  const [pendingSql, setPendingSql] = useState<string | null>(null);

  useEffect(() => {
    if (connFetcher.state === 'idle' && !connFetcher.data) {
      connFetcher.load(base);
    }
  }, [connFetcher, base]);

  const connections = useMemo(() => readConnections(connFetcher.data), [connFetcher.data]);

  useEffect(() => {
    if (!connectionKey && connections.length) {
      setConnectionKey(connections[0].key);
    }
  }, [connections, connectionKey]);

  const tables = useMemo(() => readTables(schemaFetcher.data), [schemaFetcher.data]);
  const loadingSchema = schemaFetcher.state !== 'idle';

  // Connection/schema fetch failure surfaced by the ide-panel proxy envelope ({ ok, error }).
  const schemaError =
    schemaFetcher.data && typeof schemaFetcher.data === 'object'
      ? ((schemaFetcher.data as { error?: unknown }).error as string | undefined)
      : undefined;
  const visibleSchemaError =
    schemaError && language.toLowerCase().startsWith('fr') ? copy['databaseStudio.safeConnectionError'] : schemaError;

  const running = queryFetcher.state !== 'idle';

  const loadSchema = (key: string) => {
    if (key) {
      schemaFetcher.load(`${base}?schemaKey=${encodeURIComponent(key)}`);
    }
  };

  useEffect(() => {
    if (connectionKey) {
      schemaFetcher.load(`${base}?schemaKey=${encodeURIComponent(connectionKey)}`);
    }
  }, [connectionKey, base, schemaFetcher]);

  /*
   * The connections payload only carries { key, label } (see readConnections) —
   * there is no environment field. "Production" is therefore inferred from the
   * active connection's key/label matching /prod/i (catches "Prod",
   * "production-db"; may also catch e.g. "products" — accepted limitation).
   */
  const activeConnection = connections.find((c) => c.key === connectionKey);

  const isProductionConnection = Boolean(
    activeConnection && /prod/i.test(`${activeConnection.key} ${activeConnection.label}`),
  );

  const executeQuery = (queryText: string) => {
    // G14: remember the statement so the history effect records it on success.
    pendingHistoryRef.current = queryText;
    queryFetcher.submit({ intent: 'query', connectionKey, query: queryText }, { method: 'post', action: base });
  };

  /*
   * All run entry points (Run button, ⌘+Enter, table browse, cell edits) funnel
   * through here; destructive statements are held for confirmation first.
   */
  const runQuery = (queryText: string) => {
    if (!queryText.trim() || !connectionKey) {
      return;
    }

    if (isDestructiveSql(queryText)) {
      setPendingSql(queryText);
      return;
    }

    executeQuery(queryText);
  };

  // G14: record the pending statement into the history once it executed successfully.
  useEffect(() => {
    const executed = pendingHistoryRef.current;

    if (queryFetcher.state !== 'idle' || !queryFetcher.data || !executed) {
      return;
    }

    pendingHistoryRef.current = null;

    if (!(queryFetcher.data.error ?? queryFetcher.data.result?.error)) {
      setHistory(recordQueryHistory(projectId, executed));
    }
  }, [queryFetcher.state, queryFetcher.data, projectId]);

  const result = queryFetcher.data?.result ? normalizeRows(queryFetcher.data.result) : null;
  const queryError = queryFetcher.data?.error ?? queryFetcher.data?.result?.error;

  const visibleQueryError =
    queryError && language.toLowerCase().startsWith('fr') ? copy['databaseStudio.safeQueryError'] : queryError;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Connection (Dev/Prod/external) selector */}
      <div className="flex items-center gap-2">
        <label className="text-[12px] text-bolt-elements-textSecondary">{copy['databaseStudio.connection']}</label>
        <select
          value={connectionKey}
          onChange={(e) => setConnectionKey(e.target.value)}
          className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1 text-[13px]"
        >
          {connections.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => loadSchema(connectionKey)}
          disabled={loadingSchema}
          className="inline-flex items-center gap-1 rounded-md border border-bolt-elements-borderColor px-2 py-1 text-[12px] text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-60"
        >
          <RefreshCw className={classNames('h-3.5 w-3.5', loadingSchema && 'animate-spin')} aria-hidden />
          {copy['databaseStudio.refreshSchema']}
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Table browser */}
        <aside className="min-h-0 overflow-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2">
          <div className="mb-2 flex items-center gap-1.5 px-1 text-[12px] font-medium text-bolt-elements-textSecondary">
            <Table2 className="h-3.5 w-3.5" aria-hidden /> {copy['databaseStudio.tables']}
          </div>
          {tables.length === 0 ? (
            visibleSchemaError && !loadingSchema ? (
              <div className="px-1 py-2" role="alert">
                <p className="text-[12px] font-medium text-[var(--status-error-text)]">
                  {copy['databaseStudio.connectionFailed']}
                </p>
                <p className="mt-1 break-words text-[12px] text-[var(--status-error-text)]">{visibleSchemaError}</p>
              </div>
            ) : loadingSchema ? (
              <EmptyState variant="compact" icon="i-ph:circle-notch" title={copy['databaseStudio.loadingSchema']} />
            ) : (
              <EmptyState
                variant="compact"
                icon={Table2}
                title={copy['databaseStudio.noTables']}
                description={copy['databaseStudio.noTablesDescription']}
                actionLabel={copy['databaseStudio.refreshSchema']}
                onAction={() => loadSchema(connectionKey)}
              />
            )
          ) : (
            <ul className="flex flex-col">
              {tables.map((t) => (
                <li key={t.name}>
                  <button
                    type="button"
                    title={t.columns.join(', ')}
                    onClick={() => {
                      const q = `SELECT * FROM ${t.name} LIMIT 100;`;
                      setSql(q);
                      setSelectedTable(t.name);
                      runQuery(q);
                    }}
                    className="w-full truncate rounded px-2 py-1 text-left font-mono text-[12px] text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
                  >
                    {t.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* SQL runner + results */}
        <section className="flex min-h-0 flex-col gap-2">
          <div className="flex flex-col gap-2">
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              spellCheck={false}
              rows={4}
              aria-label={copy['databaseStudio.sqlQuery']}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  runQuery(sql);
                }
              }}
              className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1.5 font-mono text-[12px] outline-none focus:border-bolt-elements-focus"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => runQuery(sql)}
                disabled={running || !connectionKey}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--vc-ide-accent-action)] px-3 py-1.5 text-[13px] font-medium text-[var(--vc-ide-on-accent-action)] hover:opacity-90 disabled:opacity-60"
              >
                <Play className="h-3.5 w-3.5" aria-hidden />
                {running ? copy['databaseStudio.running'] : copy['databaseStudio.run']}
              </button>
              <span className="text-[11px] text-bolt-elements-textTertiary">{copy['databaseStudio.shortcut']}</span>
              {isProductionConnection ? (
                <span
                  className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium"
                  style={{
                    color: 'var(--status-error-text)',
                    background: 'color-mix(in srgb, var(--vc-ide-accent-error) 12%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--vc-ide-accent-error) 40%, transparent)',
                  }}
                  title={copy['databaseStudio.productionTitle']}
                >
                  {copy['databaseStudio.production']}
                </span>
              ) : null}
              <QueryHistoryControl
                entries={history}
                onPick={setSql}
                onRemove={(statement) => setHistory(removeQueryHistory(projectId, statement))}
                onClear={() => setHistory(clearQueryHistory(projectId))}
              />

              {result && result.rows.length ? (
                <button
                  type="button"
                  onClick={() => downloadCsv(result.columns, result.rows)}
                  className="rounded-md border border-bolt-elements-borderColor px-2.5 py-1 text-[12px] text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
                >
                  {copy['databaseStudio.exportCsv']}
                </button>
              ) : null}
              {selectedTable ? (
                <>
                  <span className="mx-1 h-4 w-px bg-bolt-elements-borderColor" aria-hidden />
                  <button
                    type="button"
                    onClick={() => {
                      const cols = tables.find((t) => t.name === selectedTable)?.columns ?? result?.columns ?? [];

                      setSql(
                        `INSERT INTO ${selectedTable} (${cols.join(', ')})\nVALUES (${cols.map(() => "''").join(', ')});`,
                      );
                    }}
                    className="rounded-md border border-bolt-elements-borderColor px-2.5 py-1 text-[12px] text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
                  >
                    {copy['databaseStudio.insertRow']}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditMode((v) => !v)}
                    aria-pressed={editMode}
                    className={classNames(
                      'rounded-md border px-2.5 py-1 text-[12px]',
                      editMode
                        ? 'border-[var(--vc-ide-accent-action)] text-[var(--vc-ide-accent-action)]'
                        : 'border-bolt-elements-borderColor text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                    )}
                  >
                    {editMode ? copy['databaseStudio.editing'] : copy['databaseStudio.edit']}
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
            {visibleQueryError ? (
              <div className="p-3" role="alert">
                <p className="text-[12px] font-medium text-[var(--status-error-text)]">
                  {copy['databaseStudio.queryFailed']}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[12px] text-[var(--status-error-text)]">
                  {visibleQueryError}
                </p>
              </div>
            ) : result && result.rows.length ? (
              <table className="w-full border-collapse text-left font-mono text-[12px]">
                <thead className="sticky top-0 bg-bolt-elements-background-depth-3">
                  <tr>
                    {result.columns.map((c) => (
                      <th key={c} className="border-b border-bolt-elements-borderColor px-3 py-1.5 font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="border-b border-bolt-elements-borderColor last:border-b-0">
                      {row.map((cell, j) => (
                        <td key={j} className="max-w-[280px] truncate px-3 py-1.5 text-bolt-elements-textSecondary">
                          {editMode && selectedTable ? (
                            <input
                              defaultValue={cell === null || cell === undefined ? '' : String(cell)}
                              onBlur={(e) => {
                                const next = e.currentTarget.value;
                                const orig = cell === null || cell === undefined ? '' : String(cell);

                                if (next === orig) {
                                  return;
                                }

                                const where = result.columns.map((c, k) => `${c} = ${sqlLit(row[k])}`).join(' AND ');
                                runQuery(
                                  `UPDATE ${selectedTable} SET ${result.columns[j]} = ${sqlLit(next)} WHERE ${where};`,
                                );
                              }}
                              className="w-full bg-bolt-elements-background-depth-1 px-1 text-bolt-elements-textPrimary outline-none focus:ring-1 focus:ring-[var(--vc-ide-accent-action)]"
                            />
                          ) : cell === null || cell === undefined ? (
                            '∅'
                          ) : (
                            <CellValue value={String(cell)} />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : running ? (
              <EmptyState
                variant="compact"
                icon="i-ph:circle-notch"
                title={copy['databaseStudio.runningQuery']}
                className="m-3"
              />
            ) : result ? (
              <EmptyState
                variant="compact"
                icon="i-ph:rows"
                title={copy['databaseStudio.noRows']}
                description={copy['databaseStudio.noRowsDescription']}
                className="m-3"
              />
            ) : (
              <EmptyState
                variant="compact"
                icon="i-ph:table"
                title={copy['databaseStudio.noResults']}
                description={copy['databaseStudio.noResultsDescription']}
                className="m-3"
              />
            )}
          </div>
        </section>
      </div>

      {/*
       * Destructive-statement gate. Radix's Description renders a <p>, so the
       * echo uses block-level <span>s (valid inside <p>) instead of <pre>/<div>.
       */}
      <ConfirmationDialog
        isOpen={pendingSql !== null}
        onClose={() => setPendingSql(null)}
        onConfirm={() => {
          if (pendingSql) {
            executeQuery(pendingSql);
          }

          setPendingSql(null);
        }}
        title={copy['databaseStudio.destructive.title']}
        variant="destructive"
        confirmLabel={copy['databaseStudio.destructive.confirm']}
        description={
          <span className="flex flex-col gap-2">
            <span className="block text-[13px]">
              {isProductionConnection
                ? copy['databaseStudio.destructive.productionDescription']
                : copy['databaseStudio.destructive.description']}
            </span>
            <span className="block max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-2 font-mono text-[12px] text-bolt-elements-textPrimary">
              {pendingSql}
            </span>
            {activeConnection ? (
              <span className="block text-[11px] text-bolt-elements-textTertiary">
                {text(copy['databaseStudio.destructive.connection'], { connection: activeConnection.label })}
              </span>
            ) : null}
          </span>
        }
      />
    </div>
  );
}
