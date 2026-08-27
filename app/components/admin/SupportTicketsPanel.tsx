import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher, useRevalidator, useSearchParams } from 'react-router';

import { RelativeTime } from '~/components/ui/RelativeTime';
import {
  adminSupportTicketActionFeedback,
  adminSupportTicketStatusLabel,
  formatAdminSupportTicketsDateTime,
  formatAdminSupportTicketsDueDelta,
  formatAdminSupportTicketsPlural,
  getAdminSupportTicketsCopy,
  interpolateAdminSupportTicketsCopy,
  type AdminSupportTicketsCopy,
} from '~/lib/i18n/catalogs/admin-support-tickets';

export type AdminSupportTicket = {
  id: string;
  organizationId?: string;
  userId?: string;
  subject?: string;
  status?: string;
  createdAt?: string;
  assigneeUserId?: string;
  planKey?: string;
  firstResponseAt?: string;
  firstResponseDueAt?: string;
};

export type AdminTicketAssignee = { id: string; name?: string; email?: string };

const TICKET_STATUSES = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'] as const;

type TicketStatus = (typeof TICKET_STATUSES)[number];
type TicketSort = 'subject' | 'status' | 'created' | 'due';

const DEFAULT_SORT: TicketSort = 'due';
const DEFAULT_DIR = 'asc';
const SLA_WARNING_WINDOW_MS = 60 * 60 * 1000;

type SlaState = 'responded' | 'ok' | 'warning' | 'overdue' | 'unknown';
type FetcherData = { ok?: boolean; message?: string; error?: string };

const INPUT_CLASS =
  'mt-1 min-h-11 w-full min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive disabled:cursor-not-allowed disabled:opacity-60';

function isTicketSort(value: string | null): value is TicketSort {
  return value === 'subject' || value === 'status' || value === 'created' || value === 'due';
}

function normalizeTicketStatus(value?: string): TicketStatus {
  const normalized = value?.trim().toUpperCase();

  return TICKET_STATUSES.find((status) => status === normalized) ?? 'PENDING';
}

function ticketSlaState(ticket: AdminSupportTicket, nowMs: number): SlaState {
  if (ticket.firstResponseAt) {
    return 'responded';
  }

  const dueMs = ticket.firstResponseDueAt ? new Date(ticket.firstResponseDueAt).getTime() : NaN;

  if (Number.isNaN(dueMs)) {
    return 'unknown';
  }

  if (nowMs > dueMs) {
    return 'overdue';
  }

  return dueMs - nowMs <= SLA_WARNING_WINDOW_MS ? 'warning' : 'ok';
}

function SlaCell({
  ticket,
  nowMs,
  language,
  copy,
}: {
  ticket: AdminSupportTicket;
  nowMs: number;
  language: string;
  copy: AdminSupportTicketsCopy;
}) {
  const state = ticketSlaState(ticket, nowMs);

  if (state === 'unknown') {
    return (
      <span className="text-xs text-bolt-elements-textTertiary" title={copy['adminSupportTickets.sla.unavailable']}>
        <span className="sr-only">{copy['adminSupportTickets.sla.unavailable']}</span>—
      </span>
    );
  }

  if (state === 'responded') {
    return (
      <span className="break-words text-xs text-[var(--status-success-text)] [overflow-wrap:anywhere]">
        {copy['adminSupportTickets.sla.responded']}{' '}
        {ticket.firstResponseAt ? <RelativeTime value={ticket.firstResponseAt} className="text-inherit" /> : null}
      </span>
    );
  }

  const dueMs = new Date(ticket.firstResponseDueAt!).getTime();

  const className =
    state === 'overdue'
      ? 'text-xs font-medium text-[var(--status-error-text)]'
      : state === 'warning'
        ? 'text-xs font-medium text-[var(--status-warning-text)]'
        : 'text-xs text-bolt-elements-textSecondary';

  return (
    <span className={`min-w-0 break-words [overflow-wrap:anywhere] ${className}`} suppressHydrationWarning>
      {state === 'overdue' ? copy['adminSupportTickets.sla.overdue'] : copy['adminSupportTickets.sla.due']} ·{' '}
      <time dateTime={new Date(dueMs).toISOString()} title={formatAdminSupportTicketsDateTime(dueMs, language)}>
        {formatAdminSupportTicketsDueDelta(dueMs, nowMs, language)}
      </time>
      {ticket.planKey ? (
        <span className="ml-1 text-bolt-elements-textTertiary">
          (
          {interpolateAdminSupportTicketsCopy(copy['adminSupportTickets.sla.plan'], {
            plan: ticket.planKey,
          })}
          )
        </span>
      ) : null}
    </span>
  );
}

function SupportTicketsLoading({ copy }: { copy: AdminSupportTicketsCopy }) {
  return (
    <section
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={copy['adminSupportTickets.loading']}
      className="min-w-0 overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm sm:p-5"
    >
      <span className="sr-only">{copy['adminSupportTickets.loading']}</span>
      <div className="animate-pulse space-y-3 motion-reduce:animate-none" aria-hidden="true">
        <div className="h-4 w-2/5 max-w-48 rounded bg-bolt-elements-background-depth-3" />
        <div className="h-12 w-full rounded bg-bolt-elements-background-depth-3" />
        <div className="h-12 w-11/12 rounded bg-bolt-elements-background-depth-3" />
        <div className="h-12 w-4/5 rounded bg-bolt-elements-background-depth-3" />
      </div>
    </section>
  );
}

function SupportTicketsLoadError({
  copy,
  retrying,
  onRetry,
}: {
  copy: AdminSupportTicketsCopy;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <section
      role="alert"
      aria-live="assertive"
      className="flex min-w-0 flex-col gap-4 rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="min-w-0">
        <h3 className="break-words text-sm font-semibold text-bolt-elements-textPrimary [overflow-wrap:anywhere]">
          {copy['adminSupportTickets.error.title']}
        </h3>
        <p className="mt-1 max-w-2xl break-words text-sm leading-6 text-bolt-elements-textSecondary [overflow-wrap:anywhere]">
          {copy['adminSupportTickets.error.description']}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        aria-busy={retrying}
        className="inline-flex min-h-11 w-full shrink-0 items-center justify-center whitespace-normal rounded-md border border-[var(--status-error-border)] bg-bolt-elements-background-depth-1 px-4 py-2 text-center text-sm font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive disabled:cursor-wait disabled:opacity-60 sm:w-auto"
      >
        {retrying ? copy['adminSupportTickets.error.retrying'] : copy['adminSupportTickets.error.retry']}
      </button>
    </section>
  );
}

function SupportTicketsEmpty({ copy }: { copy: AdminSupportTicketsCopy }) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 text-center shadow-sm sm:p-6"
    >
      <h3 className="break-words text-sm font-semibold text-bolt-elements-textPrimary [overflow-wrap:anywhere]">
        {copy['adminSupportTickets.empty.title']}
      </h3>
      <p className="mx-auto mt-1 max-w-xl break-words text-sm leading-6 text-bolt-elements-textSecondary [overflow-wrap:anywhere]">
        {copy['adminSupportTickets.empty.description']}
      </p>
    </section>
  );
}

export function SupportTicketsPanel({
  payload,
  loading = false,
}: {
  payload: Record<string, unknown>;
  loading?: boolean;
}) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const copy = getAdminSupportTicketsCopy(language);
  const revalidator = useRevalidator();
  const [password, setPassword] = useState('');
  const [nowMs] = useState(() => Date.now());
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSort = searchParams.get('sort');
  const sort = isTicketSort(requestedSort) ? requestedSort : DEFAULT_SORT;
  const dir = searchParams.get('dir') === 'desc' ? 'desc' : DEFAULT_DIR;

  const hasTicketPayload = Array.isArray(payload.tickets);
  const loadFailed = payload.supportTicketsLoadError === true || !hasTicketPayload;
  const tickets = (hasTicketPayload ? payload.tickets : []) as AdminSupportTicket[];
  const assignees = (Array.isArray(payload.assignees) ? payload.assignees : []) as AdminTicketAssignee[];

  const setSort = (column: TicketSort) => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        const nextDir = sort === column && dir === 'asc' ? 'desc' : 'asc';

        next.set('sort', column);
        next.set('dir', nextDir);

        return next;
      },
      { replace: true },
    );
  };

  const sorted = useMemo(() => {
    const factor = dir === 'asc' ? 1 : -1;
    const locale = language.toLowerCase().startsWith('fr') ? 'fr-FR' : 'en-US';

    const key = (ticket: AdminSupportTicket): string | number => {
      switch (sort) {
        case 'subject':
          return ticket.subject ?? '';
        case 'status':
          return ticket.status ?? '';
        case 'created':
          return new Date(ticket.createdAt ?? 0).getTime() || 0;
        case 'due':
        default: {
          if (ticket.firstResponseAt) {
            return Number.MAX_SAFE_INTEGER - 1;
          }

          const due = new Date(ticket.firstResponseDueAt ?? NaN).getTime();

          return Number.isNaN(due) ? Number.MAX_SAFE_INTEGER : due;
        }
      }
    };

    return [...tickets].sort((left, right) => {
      const leftKey = key(left);
      const rightKey = key(right);

      if (typeof leftKey === 'string' && typeof rightKey === 'string') {
        return leftKey.localeCompare(rightKey, locale, { sensitivity: 'base' }) * factor;
      }

      return ((leftKey as number) - (rightKey as number)) * factor;
    });
  }, [dir, language, sort, tickets]);

  const sortableHeader = (label: string, column: TicketSort) => (
    <th
      className="px-4 py-3 align-bottom font-medium whitespace-normal"
      aria-sort={sort === column ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => setSort(column)}
        aria-label={interpolateAdminSupportTicketsCopy(copy['adminSupportTickets.sortBy'], { column: label })}
        className="inline-flex min-h-11 max-w-full items-center gap-1 rounded-sm text-left uppercase tracking-wide whitespace-normal hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive"
      >
        <span className="break-words [overflow-wrap:anywhere]">{label}</span>
        {sort === column ? <span aria-hidden="true">{dir === 'asc' ? '▲' : '▼'}</span> : null}
      </button>
    </th>
  );

  if (loading) {
    return <SupportTicketsLoading copy={copy} />;
  }

  if (loadFailed) {
    return (
      <SupportTicketsLoadError
        copy={copy}
        retrying={revalidator.state !== 'idle'}
        onRetry={() => revalidator.revalidate()}
      />
    );
  }

  if (sorted.length === 0) {
    return <SupportTicketsEmpty copy={copy} />;
  }

  const countLabel = formatAdminSupportTicketsPlural(sorted.length, language, {
    one: copy['adminSupportTickets.count_one'],
    other: copy['adminSupportTickets.count_other'],
  });

  return (
    <div className="grid min-w-0 max-w-full gap-4">
      <p
        className="break-words text-sm font-medium text-bolt-elements-textSecondary [overflow-wrap:anywhere]"
        role="status"
      >
        {countLabel}
      </p>

      <section
        className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm"
        aria-labelledby="admin-support-reauth-heading"
      >
        <h3 id="admin-support-reauth-heading" className="text-sm font-semibold text-bolt-elements-textPrimary">
          {copy['adminSupportTickets.reauth.title']}
        </h3>
        <p className="mt-1 max-w-3xl break-words text-xs leading-5 text-bolt-elements-textSecondary [overflow-wrap:anywhere]">
          {copy['adminSupportTickets.reauth.description']}
        </p>
        <label
          htmlFor="admin-support-reauth-password"
          className="mt-3 block max-w-sm text-xs font-medium text-bolt-elements-textSecondary"
        >
          {copy['adminSupportTickets.reauth.passwordLabel']}
          <input
            id="admin-support-reauth-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder={copy['adminSupportTickets.reauth.passwordPlaceholder']}
            data-testid="admin-reauth-password"
            className={INPUT_CLASS}
          />
        </label>
      </section>

      <div
        className="min-w-0 max-w-full overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive"
        role="region"
        aria-label={copy['adminSupportTickets.table.scrollLabel']}
        tabIndex={0}
      >
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <caption className="sr-only">{copy['adminSupportTickets.table.caption']}</caption>
          <thead>
            <tr className="border-b border-bolt-elements-borderColor text-left text-xs uppercase tracking-wide text-bolt-elements-textSecondary">
              {sortableHeader(copy['adminSupportTickets.column.subject'], 'subject')}
              {sortableHeader(copy['adminSupportTickets.column.status'], 'status')}
              {sortableHeader(copy['adminSupportTickets.column.created'], 'created')}
              {sortableHeader(copy['adminSupportTickets.column.due'], 'due')}
              <th className="px-4 py-3 font-medium whitespace-normal">{copy['adminSupportTickets.column.assignee']}</th>
              <th className="px-4 py-3 font-medium whitespace-normal">{copy['adminSupportTickets.column.actions']}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((ticket) => (
              <SupportTicketRow
                key={ticket.id}
                ticket={ticket}
                assignees={assignees}
                password={password}
                nowMs={nowMs}
                language={language}
                copy={copy}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActionFeedback({
  data,
  operation,
  language,
}: {
  data: unknown;
  operation: 'assignment' | 'response';
  language: string;
}) {
  const feedback = adminSupportTicketActionFeedback(data, operation, language);

  if (!feedback) {
    return null;
  }

  return (
    <p
      className={`mt-1.5 break-words text-xs font-medium [overflow-wrap:anywhere] ${
        feedback.tone === 'error' ? 'text-[var(--status-error-text)]' : 'text-[var(--status-success-text)]'
      }`}
      role={feedback.tone === 'error' ? 'alert' : 'status'}
      aria-live={feedback.tone === 'error' ? 'assertive' : 'polite'}
    >
      {feedback.message}
    </p>
  );
}

function SupportTicketRow({
  ticket,
  assignees,
  password,
  nowMs,
  language,
  copy,
}: {
  ticket: AdminSupportTicket;
  assignees: AdminTicketAssignee[];
  password: string;
  nowMs: number;
  language: string;
  copy: AdminSupportTicketsCopy;
}) {
  const assignFetcher = useFetcher<FetcherData>();
  const respondFetcher = useFetcher<FetcherData>();
  const [respondOpen, setRespondOpen] = useState(false);
  const [status, setStatus] = useState<TicketStatus>(() => normalizeTicketStatus(ticket.status));
  const [response, setResponse] = useState('');
  const assigning = assignFetcher.state !== 'idle';
  const responding = respondFetcher.state !== 'idle';

  useEffect(() => {
    if (respondFetcher.state === 'idle' && respondFetcher.data?.ok === true) {
      setResponse('');
    }
  }, [respondFetcher.data?.ok, respondFetcher.state]);

  const assign = (assigneeUserId: string) => {
    assignFetcher.submit(
      { intent: 'support-assign', ticketId: ticket.id, assigneeUserId, password },
      { method: 'post' },
    );
  };

  const respond = () => {
    respondFetcher.submit(
      { intent: 'support-respond', ticketId: ticket.id, status, response, password },
      { method: 'post' },
    );
  };

  const normalizedStatus = ticket.status?.trim().toUpperCase();

  const statusTone =
    normalizedStatus === 'RESOLVED' || normalizedStatus === 'CLOSED'
      ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
      : normalizedStatus === 'OPEN'
        ? 'border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-text)]'
        : normalizedStatus === 'PENDING'
          ? 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
          : 'border-bolt-elements-borderColor text-bolt-elements-textSecondary';

  const subject = ticket.subject ?? ticket.id;
  const responseRegionId = `ticket-response-form-${ticket.id}`;

  return (
    <>
      <tr className="border-b border-bolt-elements-borderColor last:border-b-0 align-top">
        <td className="min-w-0 px-4 py-3">
          <p className="break-words font-medium text-bolt-elements-textPrimary [overflow-wrap:anywhere]">{subject}</p>
          <p className="mt-0.5 break-all text-xs text-bolt-elements-textSecondary">
            {[
              ticket.organizationId
                ? interpolateAdminSupportTicketsCopy(copy['adminSupportTickets.organizationIdentifier'], {
                    id: ticket.organizationId,
                  })
                : null,
              ticket.userId
                ? interpolateAdminSupportTicketsCopy(copy['adminSupportTickets.userIdentifier'], {
                    id: ticket.userId,
                  })
                : null,
            ]
              .filter(Boolean)
              .join(' · ') || ticket.id}
          </p>
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-normal ${statusTone}`}
          >
            <span className="break-words [overflow-wrap:anywhere]">
              {adminSupportTicketStatusLabel(ticket.status, language)}
            </span>
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-bolt-elements-textSecondary">
          {ticket.createdAt ? (
            <RelativeTime value={ticket.createdAt} />
          ) : (
            <span title={copy['adminSupportTickets.dateUnavailable']}>
              <span className="sr-only">{copy['adminSupportTickets.dateUnavailable']}</span>—
            </span>
          )}
        </td>
        <td className="min-w-0 px-4 py-3">
          <SlaCell ticket={ticket} nowMs={nowMs} language={language} copy={copy} />
        </td>
        <td className="min-w-0 px-4 py-3">
          <select
            value={ticket.assigneeUserId ?? ''}
            onChange={(event) => assign(event.target.value)}
            disabled={assigning || !password}
            aria-busy={assigning}
            aria-label={interpolateAdminSupportTicketsCopy(copy['adminSupportTickets.assigneeFor'], { subject })}
            data-testid={`ticket-assignee-${ticket.id}`}
            className="min-h-11 w-full min-w-0 max-w-[200px] rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1.5 text-xs text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">{copy['adminSupportTickets.assignee.unassigned']}</option>
            {assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.name || assignee.email || assignee.id}
              </option>
            ))}
          </select>
          {assigning ? (
            <p className="mt-1.5 text-xs text-bolt-elements-textTertiary" role="status" aria-live="polite">
              {copy['adminSupportTickets.assignee.assigning']}
            </p>
          ) : (
            <ActionFeedback data={assignFetcher.data} operation="assignment" language={language} />
          )}
        </td>
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={() => setRespondOpen((open) => !open)}
            aria-expanded={respondOpen}
            aria-controls={responseRegionId}
            data-testid={`ticket-respond-toggle-${ticket.id}`}
            className="inline-flex min-h-11 max-w-full items-center rounded-md border border-bolt-elements-borderColor px-3 py-2 text-xs font-medium text-bolt-elements-textPrimary whitespace-normal transition-colors hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive"
          >
            <span className="break-words [overflow-wrap:anywhere]">
              {respondOpen ? copy['adminSupportTickets.action.close'] : copy['adminSupportTickets.action.respond']}
            </span>
          </button>
        </td>
      </tr>
      {respondOpen ? (
        <tr
          id={responseRegionId}
          className="border-b border-bolt-elements-borderColor last:border-b-0 bg-bolt-elements-background-depth-1/50"
        >
          <td colSpan={6} className="px-4 py-3">
            <div className="grid min-w-0 gap-3 sm:max-w-2xl">
              <label className="block min-w-0 text-xs text-bolt-elements-textSecondary sm:max-w-xs">
                {copy['adminSupportTickets.form.newStatus']}
                <select
                  value={status}
                  onChange={(event) => setStatus(normalizeTicketStatus(event.target.value))}
                  disabled={responding}
                  data-testid={`ticket-status-${ticket.id}`}
                  className={INPUT_CLASS}
                >
                  {TICKET_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {adminSupportTicketStatusLabel(value, language)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block min-w-0 text-xs text-bolt-elements-textSecondary">
                {copy['adminSupportTickets.form.response']}
                <textarea
                  value={response}
                  onChange={(event) => setResponse(event.target.value)}
                  rows={3}
                  disabled={responding}
                  placeholder={copy['adminSupportTickets.form.responsePlaceholder']}
                  data-testid={`ticket-response-${ticket.id}`}
                  className={INPUT_CLASS}
                />
              </label>

              <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <button
                  type="button"
                  disabled={responding || !password || !response.trim()}
                  aria-busy={responding}
                  onClick={respond}
                  data-testid={`ticket-respond-${ticket.id}`}
                  className="inline-flex min-h-11 w-full items-center justify-center whitespace-normal rounded-md bg-bolt-elements-button-primary-background px-3 py-2 text-center text-xs font-medium text-bolt-elements-button-primary-text transition-colors hover:bg-bolt-elements-button-primary-backgroundHover focus:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {responding
                    ? copy['adminSupportTickets.form.sending']
                    : copy['adminSupportTickets.form.sendResponse']}
                </button>
                {!password ? (
                  <span className="break-words text-xs text-bolt-elements-textTertiary [overflow-wrap:anywhere]">
                    {copy['adminSupportTickets.form.passwordFirst']}
                  </span>
                ) : null}
                {!responding ? (
                  <ActionFeedback data={respondFetcher.data} operation="response" language={language} />
                ) : null}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
