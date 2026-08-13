import { useMemo, useState } from 'react';
import { Button } from '~/components/ui/Button';
import type { TeamAccessLogData } from '~/lib/team-access-log.server';

/*
 * F17: Team access log panel. Shared by the team overview and team settings
 * routes. Presentational only — the data (and the CSV/JSON export served over
 * the session cookie) comes from `loadTeamAccessLog`. Styling is token-only
 * (bolt-elements-* theme tokens + the `--vc-ide-accent-action` accent), no
 * violet, no window.confirm; the table scrolls horizontally on narrow screens.
 */

function formatTimestamp(value?: string) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function TeamAccessLogPanel({ teamId, basePath, entries, listError, forbidden }: TeamAccessLogData) {
  const [selectedAction, setSelectedAction] = useState('');

  /*
   * Distinct action names drive a client-side action filter over the already
   * loaded page — one API round-trip, common "show me only member.* events"
   * narrowing without a new endpoint (mirrors the D4 audit-log filter).
   */
  const actions = useMemo(
    () => Array.from(new Set(entries.map((row) => row.action).filter(Boolean))).sort() as string[],
    [entries],
  );

  const visibleEntries = useMemo(
    () => (selectedAction ? entries.filter((row) => (row.action ?? '') === selectedAction) : entries),
    [entries, selectedAction],
  );

  return (
    <div className="flex flex-col gap-6">
      {forbidden ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--vc-ide-accent-error)]/40 px-3 py-2 text-sm text-[var(--vc-ide-accent-error)]"
        >
          You do not have permission to export this team&apos;s access log. Ask a team admin for the audit:export
          permission.
        </p>
      ) : null}
      {listError ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--vc-ide-accent-error)]/40 px-3 py-2 text-sm text-[var(--vc-ide-accent-error)]"
        >
          The team access log is temporarily unavailable. Please try again in a moment.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">Export</h2>
          <p className="mt-1 text-xs text-bolt-elements-textSecondary">
            Download this team&apos;s access log. The export is generated server-side over your session.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button _asChild variant="primary" size="sm">
            <a href={`${basePath}?export=csv`} download data-testid="team-access-log-export-csv">
              <span className="i-ph:file-csv mr-1.5" aria-hidden />
              Export CSV
            </a>
          </Button>
          <Button _asChild variant="outline" size="sm">
            <a href={`${basePath}?export=json`} download data-testid="team-access-log-export-json">
              <span className="i-ph:file-text mr-1.5" aria-hidden />
              Export JSON
            </a>
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">Access events</h2>
          {actions.length > 0 ? (
            <label className="ml-auto flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
              Action
              <select
                className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1 text-xs outline-none focus:border-[var(--vc-ide-accent-action)]"
                value={selectedAction}
                onChange={(event) => setSelectedAction(event.currentTarget.value)}
                data-testid="team-access-log-action-filter"
              >
                <option value="">All actions</option>
                {actions.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {visibleEntries.length === 0 ? (
          <p className="rounded-md border border-bolt-elements-borderColor px-3 py-4 text-sm text-bolt-elements-textSecondary">
            {entries.length === 0
              ? 'No access events recorded yet for this team.'
              : 'No access events match the selected action.'}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-bolt-elements-borderColor">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary">
                <tr>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Actor</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Target</th>
                  <th className="px-3 py-2 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.map((row, index) => (
                  <tr
                    key={`${row.createdAt ?? ''}-${row.action ?? ''}-${index}`}
                    className="border-t border-bolt-elements-borderColor align-top"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-bolt-elements-textSecondary">
                      {formatTimestamp(row.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-bolt-elements-textSecondary">{row.actorUserId ?? '—'}</td>
                    <td className="px-3 py-2 font-medium text-bolt-elements-textPrimary">{row.action ?? '—'}</td>
                    <td className="px-3 py-2 text-bolt-elements-textSecondary">
                      {row.resourceType ? (
                        <span>
                          {row.resourceType}
                          {row.resourceId ? <span className="opacity-70"> · {row.resourceId}</span> : null}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-bolt-elements-textSecondary">
                      {row.ipAddress ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-bolt-elements-textSecondary">
        Team <span className="font-mono">{teamId}</span>
      </p>
    </div>
  );
}
