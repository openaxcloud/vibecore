import { useMemo, useState } from 'react';
import { useFetcher, useSearchParams } from 'react-router';
import { RelativeTime } from '~/components/ui/RelativeTime';

/*
 * Admin support-tickets panel (design handoff E27): ticket table with a
 * "First response due" SLA column (warning when due within 1h, error when
 * overdue), a platform-admin assignee select, and sortable headers (due asc by
 * default) following the UsersPanel sortable-header idiom.
 *
 * Data comes from GET /admin/support-tickets, which enriches every ticket with
 * `firstResponseDueAt` (createdAt + the org plan's SLA target) and ships the
 * platform-admin `assignees` list. Mutations post back to the admin route
 * action ('support-respond' / 'support-assign' intents), which performs the
 * password step-up before calling the API.
 */

export type AdminSupportTicket = {
  id: string;
  organizationId?: string;
  userId?: string;
  subject?: string;
  status?: string;
  createdAt?: string;
  assigneeUserId?: string;
  planKey?: string;

  /** ISO stamp of the first admin response; set = SLA met. */
  firstResponseAt?: string;

  /** Server-derived first-response deadline (createdAt + plan SLA target). */
  firstResponseDueAt?: string;
};

export type AdminTicketAssignee = { id: string; name?: string; email?: string };

const TICKET_STATUSES = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'] as const;

type TicketSort = 'subject' | 'status' | 'created' | 'due';

const DEFAULT_SORT: TicketSort = 'due';
const DEFAULT_DIR = 'asc';

/** Threshold under which an unanswered ticket flips from ok to warning. */
const SLA_WARNING_WINDOW_MS = 60 * 60 * 1000;

type SlaState = 'responded' | 'ok' | 'warning' | 'overdue' | 'unknown';

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

const dueRelativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'always' });

/** "in 42 minutes" / "3 hours ago" — formatRelativeTime degrades future dates to absolute, so keep a local one. */
function formatDueDelta(dueMs: number, nowMs: number): string {
  const deltaMs = dueMs - nowMs;
  const absMs = Math.abs(deltaMs);

  if (absMs < 60_000) {
    return dueRelativeFormatter.format(Math.sign(deltaMs) || 1, 'minute');
  }

  if (absMs < 60 * 60_000) {
    return dueRelativeFormatter.format(Math.round(deltaMs / 60_000), 'minute');
  }

  if (absMs < 24 * 60 * 60_000) {
    return dueRelativeFormatter.format(Math.round(deltaMs / (60 * 60_000)), 'hour');
  }

  return dueRelativeFormatter.format(Math.round(deltaMs / (24 * 60 * 60_000)), 'day');
}

const INPUT_CLASS =
  'mt-1 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive';

/*
 * SLA cell. Warning/overdue colors are the shared status tokens per the accent
 * policy (docs/DESIGN_ACCENTS.md) — never hard-coded.
 */
function SlaCell({ ticket, nowMs }: { ticket: AdminSupportTicket; nowMs: number }) {
  const state = ticketSlaState(ticket, nowMs);

  if (state === 'unknown') {
    return <span className="text-xs text-bolt-elements-textTertiary">—</span>;
  }

  if (state === 'responded') {
    return (
      <span className="text-xs text-[var(--status-success-text)]">
        Responded{' '}
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

  // suppressHydrationWarning: the label depends on "now", which legitimately differs between server render and hydration.
  return (
    <span className={className} suppressHydrationWarning>
      {state === 'overdue' ? 'Overdue ' : 'Due '}
      <time dateTime={new Date(dueMs).toISOString()} title={new Date(dueMs).toLocaleString('en-US')}>
        {formatDueDelta(dueMs, nowMs)}
      </time>
      {ticket.planKey ? <span className="ml-1 text-bolt-elements-textTertiary">({ticket.planKey} SLA)</span> : null}
    </span>
  );
}

export function SupportTicketsPanel({ payload }: { payload: Record<string, unknown> }) {
  const tickets = (Array.isArray(payload.tickets) ? payload.tickets : []) as AdminSupportTicket[];
  const assignees = (Array.isArray(payload.assignees) ? payload.assignees : []) as AdminTicketAssignee[];
  const [password, setPassword] = useState('');

  /*
   * One "now" per mount keeps every row's SLA state consistent; a revalidation
   * (after respond/assign) remounts the loader data anyway.
   */
  const [nowMs] = useState(() => Date.now());

  // Same searchParams-backed sort/dir idiom as the UsersPanel, sorted client-side (the list endpoint is unpaginated).
  const [searchParams, setSearchParams] = useSearchParams();
  const sort = (searchParams.get('sort') as TicketSort) || DEFAULT_SORT;
  const dir = searchParams.get('dir') === 'desc' ? 'desc' : DEFAULT_DIR;

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

    const key = (ticket: AdminSupportTicket): string | number => {
      switch (sort) {
        case 'subject':
          return (ticket.subject ?? '').toLowerCase();
        case 'status':
          return ticket.status ?? '';
        case 'created':
          return new Date(ticket.createdAt ?? 0).getTime() || 0;
        case 'due':
        default: {
          // Answered tickets sink below open ones; unknown due dates last.
          if (ticket.firstResponseAt) {
            return Number.MAX_SAFE_INTEGER - 1;
          }

          const due = new Date(ticket.firstResponseDueAt ?? NaN).getTime();

          return Number.isNaN(due) ? Number.MAX_SAFE_INTEGER : due;
        }
      }
    };

    return [...tickets].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);

      return (ka < kb ? -1 : ka > kb ? 1 : 0) * factor;
    });
  }, [tickets, sort, dir]);

  const sortableHeader = (label: string, column: TicketSort) => (
    <th
      className="px-4 py-3 font-medium"
      aria-sort={sort === column ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => setSort(column)}
        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-bolt-elements-textPrimary"
      >
        {label}
        {sort === column ? <span aria-hidden>{dir === 'asc' ? '▲' : '▼'}</span> : null}
      </button>
    </th>
  );

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Confirm changes with your password</h3>
        <p className="mt-1 text-xs text-bolt-elements-textSecondary">
          Responding to or assigning a ticket is step-up protected. Enter your password once, then act on tickets below.
          It is sent only with the action and never stored.
        </p>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          placeholder="Your password"
          data-testid="admin-reauth-password"
          className="mt-3 w-full max-w-sm rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive"
        />
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 text-sm text-bolt-elements-textSecondary shadow-sm">
          No support tickets found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-bolt-elements-borderColor text-left text-xs uppercase tracking-wide text-bolt-elements-textSecondary">
                {sortableHeader('Subject', 'subject')}
                {sortableHeader('Status', 'status')}
                {sortableHeader('Created', 'created')}
                {sortableHeader('First response due', 'due')}
                <th className="px-4 py-3 font-medium">Assignee</th>
                <th className="px-4 py-3 font-medium">Actions</th>
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
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SupportTicketRow({
  ticket,
  assignees,
  password,
  nowMs,
}: {
  ticket: AdminSupportTicket;
  assignees: AdminTicketAssignee[];
  password: string;
  nowMs: number;
}) {
  const assignFetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const respondFetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const [respondOpen, setRespondOpen] = useState(false);
  const [status, setStatus] = useState<string>(ticket.status ?? 'PENDING');
  const [response, setResponse] = useState('');

  const assigning = assignFetcher.state !== 'idle';
  const responding = respondFetcher.state !== 'idle';

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
    setResponse('');
  };

  const statusTone =
    ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'
      ? 'border-green-500/30 text-green-600 dark:text-green-400'
      : ticket.status === 'OPEN'
        ? 'border-red-500/30 text-red-600 dark:text-red-400'
        : 'border-bolt-elements-borderColor text-bolt-elements-textSecondary';

  const feedback = (data?: { message?: string; error?: string }) =>
    data?.message || data?.error ? (
      <p
        className={`mt-1 text-xs font-medium ${
          data.error ? 'text-[var(--status-error-text)]' : 'text-[var(--status-success-text)]'
        }`}
      >
        {data.error ?? data.message}
      </p>
    ) : null;

  return (
    <>
      <tr className="border-b border-bolt-elements-borderColor last:border-b-0 align-top">
        <td className="px-4 py-3">
          <p className="font-medium text-bolt-elements-textPrimary">{ticket.subject ?? ticket.id}</p>
          <p className="mt-0.5 text-xs text-bolt-elements-textSecondary">
            {[
              ticket.organizationId ? `org ${ticket.organizationId}` : null,
              ticket.userId ? `user ${ticket.userId}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || ticket.id}
          </p>
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone}`}
          >
            {String(ticket.status ?? 'unknown').toLowerCase()}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-bolt-elements-textSecondary">
          {ticket.createdAt ? <RelativeTime value={ticket.createdAt} /> : '—'}
        </td>
        <td className="px-4 py-3">
          <SlaCell ticket={ticket} nowMs={nowMs} />
        </td>
        <td className="px-4 py-3">
          <select
            value={ticket.assigneeUserId ?? ''}
            onChange={(event) => assign(event.target.value)}
            disabled={assigning || !password}
            aria-label={`Assignee for ticket ${ticket.subject ?? ticket.id}`}
            data-testid={`ticket-assignee-${ticket.id}`}
            className="w-full max-w-[180px] rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1.5 text-xs text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Unassigned</option>
            {assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.name || assignee.email || assignee.id}
              </option>
            ))}
          </select>
          {feedback(assignFetcher.data)}
        </td>
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={() => setRespondOpen((open) => !open)}
            aria-expanded={respondOpen}
            data-testid={`ticket-respond-toggle-${ticket.id}`}
            className="inline-flex items-center rounded-md border border-bolt-elements-borderColor px-2.5 py-1 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3"
          >
            {respondOpen ? 'Close' : 'Respond'}
          </button>
        </td>
      </tr>
      {respondOpen ? (
        <tr className="border-b border-bolt-elements-borderColor last:border-b-0 bg-bolt-elements-background-depth-1/50">
          <td colSpan={6} className="px-4 py-3">
            <div className="grid gap-3 sm:max-w-2xl">
              <label className="block text-xs text-bolt-elements-textSecondary sm:max-w-xs">
                New status
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  data-testid={`ticket-status-${ticket.id}`}
                  className={INPUT_CLASS}
                >
                  {TICKET_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs text-bolt-elements-textSecondary">
                Response
                <textarea
                  value={response}
                  onChange={(event) => setResponse(event.target.value)}
                  rows={3}
                  placeholder="Write your response to the customer…"
                  data-testid={`ticket-response-${ticket.id}`}
                  className={INPUT_CLASS}
                />
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={responding || !password || !response.trim()}
                  onClick={respond}
                  data-testid={`ticket-respond-${ticket.id}`}
                  className="inline-flex h-8 items-center justify-center rounded-md bg-[var(--vc-ide-accent-action)] px-3 text-xs font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {responding ? 'Sending…' : 'Send response'}
                </button>
                {!password ? (
                  <span className="text-xs text-bolt-elements-textTertiary">Enter your password above first.</span>
                ) : null}
                {feedback(respondFetcher.data)}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
