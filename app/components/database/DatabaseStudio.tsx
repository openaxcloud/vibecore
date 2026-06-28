import { Play, Table2, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useFetcher } from 'react-router';
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

  // Always expose the native connection even if the list is empty.
  return conns.length ? conns : [{ key: 'DATABASE_URL', label: 'Database (DATABASE_URL)' }];
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

export function DatabaseStudio({ projectId }: { projectId: string }) {
  const base = `/api/projects/${encodeURIComponent(projectId)}/ide-panel/database`;
  const connFetcher = useFetcher();
  const schemaFetcher = useFetcher();
  const queryFetcher = useFetcher<{ ok?: boolean } & QueryResult>();

  const [connectionKey, setConnectionKey] = useState('');
  const [sql, setSql] = useState('SELECT 1;');

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

  const runQuery = (queryText: string) => {
    if (!queryText.trim() || !connectionKey) {
      return;
    }

    queryFetcher.submit({ intent: 'query', connectionKey, query: queryText }, { method: 'post', action: base });
  };

  const result = queryFetcher.data ? normalizeRows(queryFetcher.data) : null;
  const queryError = queryFetcher.data?.error;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Connection (Dev/Prod/external) selector */}
      <div className="flex items-center gap-2">
        <label className="text-[12px] text-bolt-elements-textSecondary">Connection</label>
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
          Refresh schema
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Table browser */}
        <aside className="min-h-0 overflow-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2">
          <div className="mb-2 flex items-center gap-1.5 px-1 text-[12px] font-medium text-bolt-elements-textSecondary">
            <Table2 className="h-3.5 w-3.5" aria-hidden /> Tables
          </div>
          {tables.length === 0 ? (
            <p className="px-1 text-[12px] text-bolt-elements-textTertiary">
              {loadingSchema ? 'Loading schema…' : 'No tables found for this connection.'}
            </p>
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
              aria-label="SQL query"
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
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--ecode-accent,#F26207)] px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                <Play className="h-3.5 w-3.5" aria-hidden />
                {running ? 'Running…' : 'Run'}
              </button>
              <span className="text-[11px] text-bolt-elements-textTertiary">⌘/Ctrl + Enter</span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
            {queryError ? (
              <p className="p-3 font-mono text-[12px] text-red-500">{queryError}</p>
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
                          {cell === null || cell === undefined ? '∅' : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="p-3 text-[12px] text-bolt-elements-textTertiary">
                {result ? 'Query returned no rows.' : 'Run a query or pick a table to see results.'}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
