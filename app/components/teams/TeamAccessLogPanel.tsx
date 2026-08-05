import { Component, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useRevalidator } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { Button } from '~/components/ui/Button';
import {
  formatTeamAccessLogCopy,
  formatTeamAccessLogCount,
  formatTeamAccessLogDateTime,
  getTeamAccessLogCopy,
  resolveTeamAccessLogLanguage,
  type TeamAccessLogCopy,
  type TeamAccessLogLanguage,
} from '~/lib/i18n/catalogs/team-access-log';
import type { TeamAccessLogData, TeamAccessLogRow } from '~/lib/team-access-log.server';

/*
 * F17: Team access log panel. Shared by the team overview and team settings
 * routes. The data and same-origin CSV/JSON exports come from
 * `loadTeamAccessLog`; actor IDs, actions, resource IDs, IPs and all other
 * audit values are intentionally rendered verbatim.
 */

const MISSING_VALUE = '—';
const EXPORT_PERMISSION = 'audit:export';

function auditValue(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : MISSING_VALUE;
}

function isTeamAccessLogRow(value: unknown): value is TeamAccessLogRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const row = value as Record<string, unknown>;

  return ['createdAt', 'organizationId', 'actorUserId', 'action', 'resourceType', 'resourceId', 'ipAddress'].every(
    (key) => row[key] === undefined || typeof row[key] === 'string',
  );
}

function targetValue(row: TeamAccessLogRow): string {
  const parts = [row.resourceType, row.resourceId].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );

  return parts.length > 0 ? parts.join(' · ') : MISSING_VALUE;
}

function AuditTime({ value, language }: { value?: string; language: TeamAccessLogLanguage }) {
  const formatted = formatTeamAccessLogDateTime(value, language);

  return value ? <time dateTime={value}>{formatted}</time> : formatted;
}

function MobileField({
  label,
  children,
  technical = false,
}: {
  label: string;
  children: ReactNode;
  technical?: boolean;
}) {
  return (
    <div className="min-w-0 py-1">
      <dt className="break-words text-xs text-bolt-elements-textTertiary">{label}</dt>
      <dd
        className={`mt-1 min-w-0 break-all text-sm text-bolt-elements-textPrimary ${
          technical ? 'font-mono text-xs' : 'font-medium'
        }`}
        dir={technical ? 'ltr' : undefined}
      >
        {children}
      </dd>
    </div>
  );
}

function AccessLogEntries({
  entries,
  copy,
  language,
}: {
  entries: TeamAccessLogRow[];
  copy: TeamAccessLogCopy;
  language: TeamAccessLogLanguage;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-md border border-bolt-elements-borderColor lg:block">
        <table className="w-full min-w-[720px] text-left text-xs">
          <caption className="sr-only">{copy['teamAccessLog.events.title']}</caption>
          <thead className="bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary">
            <tr>
              <th className="px-3 py-2 font-medium">{copy['teamAccessLog.column.time']}</th>
              <th className="px-3 py-2 font-medium">{copy['teamAccessLog.column.actor']}</th>
              <th className="px-3 py-2 font-medium">{copy['teamAccessLog.column.action']}</th>
              <th className="px-3 py-2 font-medium">{copy['teamAccessLog.column.target']}</th>
              <th className="px-3 py-2 font-medium">{copy['teamAccessLog.column.ip']}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((row, index) => (
              <tr
                key={`${row.createdAt ?? ''}-${row.action ?? ''}-${row.resourceId ?? ''}-${index}`}
                className="border-t border-bolt-elements-borderColor align-top"
              >
                <td className="whitespace-nowrap px-3 py-2 text-bolt-elements-textSecondary">
                  <AuditTime value={row.createdAt} language={language} />
                </td>
                <td className="max-w-48 break-all px-3 py-2 font-mono text-bolt-elements-textSecondary" dir="ltr">
                  {auditValue(row.actorUserId)}
                </td>
                <td
                  className="max-w-56 break-all px-3 py-2 font-mono font-medium text-bolt-elements-textPrimary"
                  dir="ltr"
                >
                  {auditValue(row.action)}
                </td>
                <td className="max-w-64 break-all px-3 py-2 font-mono text-bolt-elements-textSecondary" dir="ltr">
                  {targetValue(row)}
                </td>
                <td className="max-w-48 break-all px-3 py-2 font-mono text-bolt-elements-textSecondary" dir="ltr">
                  {auditValue(row.ipAddress)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid min-w-0 gap-3 lg:hidden" aria-label={copy['teamAccessLog.events.title']}>
        {entries.map((row, index) => (
          <li
            key={`${row.createdAt ?? ''}-${row.action ?? ''}-${row.resourceId ?? ''}-${index}`}
            className="min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 sm:p-4"
          >
            <dl className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <MobileField label={copy['teamAccessLog.column.time']}>
                <AuditTime value={row.createdAt} language={language} />
              </MobileField>
              <MobileField label={copy['teamAccessLog.column.actor']} technical>
                {auditValue(row.actorUserId)}
              </MobileField>
              <MobileField label={copy['teamAccessLog.column.action']} technical>
                {auditValue(row.action)}
              </MobileField>
              <MobileField label={copy['teamAccessLog.column.target']} technical>
                {targetValue(row)}
              </MobileField>
              <MobileField label={copy['teamAccessLog.column.ip']} technical>
                {auditValue(row.ipAddress)}
              </MobileField>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="min-w-0 rounded-md border border-bolt-elements-borderColor px-4 py-5 sm:px-5">
      <h3 className="break-words text-sm font-semibold text-bolt-elements-textPrimary">{title}</h3>
      <p className="mt-1 break-words text-sm leading-6 text-bolt-elements-textSecondary">{description}</p>
    </div>
  );
}

class TeamAccessLogRenderBoundary extends Component<
  { copy: TeamAccessLogCopy; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) {
      return this.props.children;
    }

    return (
      <section
        role="alert"
        aria-live="assertive"
        className="min-w-0 rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-4"
      >
        <h2 className="break-words text-sm font-semibold text-bolt-elements-textPrimary">
          {this.props.copy['teamAccessLog.renderError.title']}
        </h2>
        <p className="mt-1 break-words text-sm leading-6 text-bolt-elements-textSecondary">
          {this.props.copy['teamAccessLog.renderError.description']}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4 !h-auto min-h-[44px] max-w-full !whitespace-normal break-words py-2 text-center leading-tight"
          onClick={() => this.setState({ failed: false })}
        >
          {this.props.copy['teamAccessLog.renderError.retry']}
        </Button>
      </section>
    );
  }
}

function ExportActions({
  basePath,
  forbidden,
  copy,
}: {
  basePath: string;
  forbidden: boolean;
  copy: TeamAccessLogCopy;
}) {
  const className =
    '!h-auto min-h-[44px] w-full max-w-full !whitespace-normal break-words py-2 text-center leading-tight sm:w-auto';

  if (forbidden) {
    return (
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
        <Button disabled variant="primary" size="sm" className={className} data-testid="team-access-log-export-csv">
          <span className="i-ph:file-csv mr-1.5 shrink-0" aria-hidden />
          {copy['teamAccessLog.export.csv']}
        </Button>
        <Button disabled variant="outline" size="sm" className={className} data-testid="team-access-log-export-json">
          <span className="i-ph:file-text mr-1.5 shrink-0" aria-hidden />
          {copy['teamAccessLog.export.json']}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
      <Button _asChild variant="primary" size="sm" className={className}>
        <a href={`${basePath}?export=csv`} download data-testid="team-access-log-export-csv">
          <span className="i-ph:file-csv mr-1.5 shrink-0" aria-hidden />
          {copy['teamAccessLog.export.csv']}
        </a>
      </Button>
      <Button _asChild variant="outline" size="sm" className={className}>
        <a href={`${basePath}?export=json`} download data-testid="team-access-log-export-json">
          <span className="i-ph:file-text mr-1.5 shrink-0" aria-hidden />
          {copy['teamAccessLog.export.json']}
        </a>
      </Button>
    </div>
  );
}

function TeamAccessLogPanelContent({
  data: { teamId, basePath, entries, listError, forbidden },
  copy,
  language,
}: {
  data: TeamAccessLogData;
  copy: TeamAccessLogCopy;
  language: TeamAccessLogLanguage;
}) {
  const [selectedAction, setSelectedAction] = useState('');
  const revalidator = useRevalidator();
  const loading = revalidator.state !== 'idle';

  const { safeEntries, upstreamShapeError } = useMemo(() => {
    const rawEntries: unknown = entries;
    const entryList: unknown[] = Array.isArray(rawEntries) ? rawEntries : [];
    const validEntries = entryList.filter(isTeamAccessLogRow);

    return {
      safeEntries: validEntries,
      upstreamShapeError: !Array.isArray(rawEntries) || validEntries.length !== entryList.length,
    };
  }, [entries]);

  const hasListError = listError || upstreamShapeError;

  const actions = useMemo(
    () =>
      Array.from(
        new Set(
          safeEntries
            .map((row) => row?.action)
            .filter((action): action is string => typeof action === 'string' && action.length > 0),
        ),
      ).sort(),
    [safeEntries],
  );

  const visibleEntries = useMemo(
    () => (selectedAction ? safeEntries.filter((row) => (row.action ?? '') === selectedAction) : safeEntries),
    [safeEntries, selectedAction],
  );

  const panelLabel = formatTeamAccessLogCopy(copy['teamAccessLog.panel.ariaLabel'], { team: teamId });

  return (
    <section className="flex min-w-0 flex-col gap-6 overflow-x-hidden" aria-label={panelLabel}>
      {forbidden ? (
        <AsyncPanelError
          title={copy['teamAccessLog.permission.title']}
          description={formatTeamAccessLogCopy(copy['teamAccessLog.permission.description'], {
            permission: EXPORT_PERMISSION,
          })}
          tone="warning"
          compact
        />
      ) : null}

      <section className="min-w-0" aria-labelledby="team-access-log-export-title">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2
              id="team-access-log-export-title"
              className="break-words text-sm font-semibold text-bolt-elements-textPrimary"
            >
              {copy['teamAccessLog.export.title']}
            </h2>
            <p className="mt-1 max-w-2xl break-words text-xs leading-5 text-bolt-elements-textSecondary">
              {copy['teamAccessLog.export.description']}
            </p>
          </div>
          <ExportActions basePath={basePath} forbidden={forbidden} copy={copy} />
        </div>
      </section>

      <section className="min-w-0" aria-labelledby="team-access-log-events-title">
        <div className="mb-3 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-baseline gap-2">
            <h2
              id="team-access-log-events-title"
              className="break-words text-sm font-semibold text-bolt-elements-textPrimary"
            >
              {copy['teamAccessLog.events.title']}
            </h2>
            {!loading && !hasListError && visibleEntries.length > 0 ? (
              <span className="text-xs tabular-nums text-bolt-elements-textTertiary" aria-live="polite">
                {formatTeamAccessLogCount(visibleEntries.length, language)}
              </span>
            ) : null}
          </div>
          {!hasListError && actions.length > 0 ? (
            <label className="flex min-w-0 flex-col gap-1.5 text-xs text-bolt-elements-textSecondary sm:flex-row sm:items-center sm:gap-2">
              <span>{copy['teamAccessLog.filter.label']}</span>
              <select
                className="min-h-[44px] w-full min-w-0 max-w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary outline-none focus:border-[var(--vc-ide-accent-action)] focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:max-w-72"
                value={selectedAction}
                onChange={(event) => setSelectedAction(event.currentTarget.value)}
                disabled={loading}
                data-testid="team-access-log-action-filter"
                aria-controls="team-access-log-results"
              >
                <option value="">{copy['teamAccessLog.filter.all']}</option>
                {actions.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div id="team-access-log-results" className="min-w-0" aria-busy={loading}>
          {loading ? (
            <AsyncPanelSkeleton label={copy['teamAccessLog.loading']} rows={4} compact />
          ) : hasListError ? (
            <AsyncPanelError
              title={copy['teamAccessLog.listError.title']}
              description={copy['teamAccessLog.listError.description']}
              retryLabel={copy['teamAccessLog.listError.retry']}
              onRetry={() => revalidator.revalidate()}
              compact
            />
          ) : visibleEntries.length === 0 ? (
            <EmptyState
              title={
                safeEntries.length === 0 ? copy['teamAccessLog.empty.title'] : copy['teamAccessLog.noMatches.title']
              }
              description={
                safeEntries.length === 0
                  ? copy['teamAccessLog.empty.description']
                  : copy['teamAccessLog.noMatches.description']
              }
            />
          ) : (
            <AccessLogEntries entries={visibleEntries} copy={copy} language={language} />
          )}
        </div>
      </section>

      <p className="min-w-0 break-words text-xs text-bolt-elements-textSecondary">
        {copy['teamAccessLog.team.label']}{' '}
        <code className="break-all font-mono" dir="ltr">
          {teamId}
        </code>
      </p>
    </section>
  );
}

export function TeamAccessLogPanel(data: TeamAccessLogData) {
  const { i18n } = useTranslation();
  const language = resolveTeamAccessLogLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getTeamAccessLogCopy(language);

  return (
    <TeamAccessLogRenderBoundary copy={copy}>
      <TeamAccessLogPanelContent data={data} copy={copy} language={language} />
    </TeamAccessLogRenderBoundary>
  );
}
