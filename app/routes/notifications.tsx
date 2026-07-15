import { formatDistanceToNow } from 'date-fns';
import {
  Bell,
  CircleCheck,
  Clock3,
  CreditCard,
  Mail,
  Megaphone,
  Rocket,
  ShieldAlert,
  Siren,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { useLoaderData, useRevalidator } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { AppShell, LinkButton } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import { Switch } from '~/components/ui/Switch';
import { apiRequest, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { classNames } from '~/utils/classNames';

export const meta: MetaFunction = () => [{ title: 'Notifications - E-Code' }];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

type NotificationCategory = {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tone: 'critical' | 'warning' | 'info' | 'success';
};

/*
 * The category rows mirror the backend's Notification.category values
 * (prisma: "security" | "billing" | "deployments" | "team" | "system") so the
 * grid only offers buckets producers actually emit into.
 */
const categories: NotificationCategory[] = [
  {
    key: 'security',
    title: 'Security events',
    description: 'MFA changes, API key rotation, suspicious session activity and access policy updates.',
    icon: ShieldAlert,
    tone: 'critical',
  },
  {
    key: 'billing',
    title: 'Billing alerts',
    description: 'Quota thresholds, failed payments, invoice availability and subscription changes.',
    icon: CreditCard,
    tone: 'warning',
  },
  {
    key: 'deployments',
    title: 'Deployment updates',
    description: 'Preview builds, production releases, rollbacks, domain checks and failed jobs.',
    icon: Rocket,
    tone: 'info',
  },
  {
    key: 'team',
    title: 'Team changes',
    description: 'Invitations, role updates, collaborator changes and owner-level membership events.',
    icon: Users,
    tone: 'success',
  },
  {
    key: 'system',
    title: 'System updates',
    description: 'Platform releases, maintenance windows and product announcements.',
    icon: Megaphone,
    tone: 'info',
  },
];

type NotificationChannel = {
  key: string;
  label: string;
  detail: string;
  icon: LucideIcon;
};

/*
 * Only channels with a real delivery path in the backend: the in-app feed
 * (Notification table + /user/notifications) and the transactional email
 * provider. Webhook/mobile delivery does not exist server-side yet, so the
 * grid deliberately does not offer them.
 */
const channels: NotificationChannel[] = [
  { key: 'email', label: 'Email', detail: 'Transactional email', icon: Mail },
  { key: 'inApp', label: 'In-app', detail: 'Workspace inbox', icon: Bell },
];

/* Security emails are mandatory; the API enforces the same invariant on PATCH. */
function isLockedCell(categoryKey: string, channelKey: string) {
  return categoryKey === 'security' && channelKey === 'email';
}

const SECURITY_EMAIL_LOCK_REASON = 'Security alerts are always emailed';

const policies = [
  { label: 'Critical', icon: Siren, detail: 'Security, billing failure and production outage events.' },
  { label: 'Action needed', icon: Clock3, detail: 'Reviews, approvals, quota limits and pending invitations.' },
  { label: 'Informational', icon: Megaphone, detail: 'Release notes, usage summaries and collaboration updates.' },
];

type NotificationMatrix = Record<string, Record<string, boolean>>;
type NotificationPreferences = { matrix: NotificationMatrix };

type SavedNotificationPreferences = {
  matrix?: Record<string, Record<string, boolean> | undefined>;

  /** Legacy pre-grid shape: independent per-category and per-channel toggles. */
  surfaces?: Record<string, boolean>;
  channels?: Record<string, boolean>;
};

/*
 * Notification preferences live in the opaque per-user `preferences` blob
 * (User.preferences JSON, shallow-merged server-side via PATCH
 * /user/preferences) as a category×channel matrix. Cells absent from the
 * saved blob default to enabled; legacy saves (separate surfaces/channels
 * toggles) seed a cell as on unless its category or channel was off. The
 * security×email cell is always on regardless of what was saved.
 */
function resolvePreferences(saved: SavedNotificationPreferences | undefined): NotificationPreferences {
  const matrix: NotificationMatrix = {};

  for (const category of categories) {
    const row: Record<string, boolean> = {};

    for (const channel of channels) {
      if (isLockedCell(category.key, channel.key)) {
        row[channel.key] = true;
        continue;
      }

      const savedCell = saved?.matrix?.[category.key]?.[channel.key];
      const legacyCell = saved?.surfaces?.[category.key] !== false && saved?.channels?.[channel.key] !== false;
      row[channel.key] = typeof savedCell === 'boolean' ? savedCell : legacyCell;
    }

    matrix[category.key] = row;
  }

  return { matrix };
}

type FeedNotification = {
  id: string;
  category: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
};

type NotificationFeed = { notifications: FeedNotification[]; unreadCount: number };

type NotificationMutationResponse = {
  ok?: boolean;
  unreadCount?: number;
};

const EMPTY_NOTIFICATION_FEED: NotificationFeed = { notifications: [], unreadCount: 0 };

function useRecoverableNotificationPost({
  endpoint,
  failureMessage,
  onSuccess,
}: {
  endpoint: string;
  failureMessage: string;
  onSuccess?: (response: NotificationMutationResponse) => void | Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const onSuccessRef = useRef(onSuccess);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  const run = useCallback(async () => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;
    setPending(true);
    setError(null);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => null)) as NotificationMutationResponse | null;

      if (!response.ok || payload?.ok !== true) {
        throw new Error('Notification mutation was not confirmed');
      }

      await onSuccessRef.current?.(payload);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError') {
        return;
      }

      setError(failureMessage);
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setPending(false);
      }
    }
  }, [endpoint, failureMessage]);

  return { error, pending, run };
}

export async function loader({ request }: EnterpriseLoaderArgs) {
  /*
   * Preferences and the real per-user feed load together. The feed is fetched
   * best-effort so a transient feed error never blanks the whole preferences
   * page — the preferences call already redirects on 401 for us.
   */
  const [data, feedResult] = await Promise.all([
    apiRequest<{ preferences?: { notifications?: SavedNotificationPreferences } }>(request, '/user/preferences'),
    apiRequest<NotificationFeed>(request, '/user/notifications').then(
      (feed) => ({ feed, unavailable: false as const }),
      () => ({ feed: EMPTY_NOTIFICATION_FEED, unavailable: true as const }),
    ),
  ]);

  return {
    preferences: resolvePreferences(data.preferences?.notifications),
    feed: feedResult.feed,
    feedUnavailable: feedResult.unavailable,
  };
}

export async function action({ request }: EnterpriseActionArgs) {
  const form = await request.formData();

  // Unchecked cells are omitted from the form body, so absence === off.
  const matrix: NotificationMatrix = Object.fromEntries(
    categories.map((category) => [
      category.key,
      Object.fromEntries(
        channels.map((channel) => [
          channel.key,
          isLockedCell(category.key, channel.key) || form.get(`cell.${category.key}.${channel.key}`) === 'on',
        ]),
      ),
    ]),
  );

  try {
    await apiRequest(request, '/user/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ preferences: { notifications: { matrix } } }),
    });
  } catch (error) {
    // Let auth redirects (login / MFA) propagate; report anything else so the grid can revert.
    if (error instanceof Response && error.status >= 300 && error.status < 400) {
      throw error;
    }

    return { ok: false as const, error: 'Could not save notification preferences.' };
  }

  return { ok: true as const, preferences: { matrix } };
}

export default function NotificationsPage() {
  const { preferences, feed, feedUnavailable } = useLoaderData<typeof loader>();

  return (
    <AppShell
      title="Notifications"
      description="Control high-signal product, billing, deployment and security notifications across your workspace."
      actions={<LinkButton to="/security-settings">Security rules</LinkButton>}
    >
      <NotificationFeedSection feed={feed} unavailable={feedUnavailable} />
      <div className="space-y-6">
        <PreferencesMatrixSection initial={preferences} />

        <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-normal">Priority model</h2>
              <p className="mt-1 text-sm text-bolt-elements-textSecondary">Clear escalation paths for every event.</p>
            </div>
            <CircleCheck className="h-5 w-5 text-bolt-elements-textTertiary" aria-hidden />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {policies.map((policy) => {
              const Icon = policy.icon;

              return (
                <div key={policy.label} className="flex gap-3 rounded-md bg-bolt-elements-background-depth-1 p-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-bolt-elements-textSecondary" aria-hidden />
                  <div>
                    <h3 className="text-sm font-semibold">{policy.label}</h3>
                    <p className="mt-1 text-xs leading-5 text-bolt-elements-textSecondary">{policy.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

export function PreferencesMatrixSection({ initial }: { initial: NotificationPreferences }) {
  const [matrix, setMatrix] = useState(initial.matrix);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Last server-confirmed state, so a failed save can revert optimistic toggles.
  const committed = useRef(initial.matrix);
  const lastAttempted = useRef<NotificationMatrix | null>(null);
  const saveController = useRef<AbortController | null>(null);

  const submitMatrix = useCallback(async (next: NotificationMatrix) => {
    saveController.current?.abort();

    const controller = new AbortController();
    saveController.current = controller;
    lastAttempted.current = next;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/user/preferences', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ preferences: { notifications: { matrix: next } } }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error('Notification preferences were not persisted');
      }

      if (saveController.current === controller) {
        committed.current = next;
        lastAttempted.current = null;
      }
    } catch (requestError) {
      if (requestError instanceof Error && requestError.name === 'AbortError') {
        return;
      }

      if (saveController.current === controller) {
        setMatrix(committed.current);
        setError('Could not save notification preferences.');
      }
    } finally {
      if (saveController.current === controller) {
        saveController.current = null;
        setSaving(false);
      }
    }
  }, []);

  useEffect(
    () => () => {
      saveController.current?.abort();
    },
    [],
  );

  const setCell = (categoryKey: string, channelKey: string, enabled: boolean) => {
    if (isLockedCell(categoryKey, channelKey)) {
      return;
    }

    const next = { ...matrix, [categoryKey]: { ...matrix[categoryKey], [channelKey]: enabled } };
    setMatrix(next);
    setError(null);

    /*
     * Optimistic save-on-change: submit the full grid (last submission wins on
     * rapid toggles) and revert to the last confirmed state on error.
     */
    void submitMatrix(next);
  };

  const retryLastSave = () => {
    const attempted = lastAttempted.current;

    if (!attempted) {
      return;
    }

    setMatrix(attempted);
    setError(null);
    void submitMatrix(attempted);
  };

  const totalCells = categories.length * channels.length;

  const enabledCells = categories.reduce(
    (count, category) => count + channels.filter((channel) => matrix[category.key]?.[channel.key]).length,
    0,
  );

  return (
    <section className="overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
      <div className="border-b border-bolt-elements-borderColor p-5 sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-bolt-elements-textTertiary">
              Delivery command center
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-normal">Notification preferences</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-bolt-elements-textSecondary">
              Choose how each event category reaches you. Changes save automatically.
              <span aria-live="polite" className="ml-2 text-bolt-elements-textTertiary">
                {saving ? 'Saving…' : ''}
              </span>
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric value={`${enabledCells}/${totalCells}`} label="Cells on" />
            <Metric value={String(channels.length)} label="Channels" />
            <Metric value={String(policies.length)} label="Priorities" />
          </div>
        </div>
      </div>

      {error ? (
        <AsyncPanelError
          compact
          title="Preferences were not saved"
          description={`${error} Your previous settings remain active.`}
          onRetry={retryLastSave}
          retrying={saving}
          className="mx-5 mt-4 sm:mx-6"
        />
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-bolt-elements-borderColor">
              <th
                scope="col"
                className="p-4 text-left text-xs font-semibold uppercase tracking-normal text-bolt-elements-textTertiary sm:pl-6"
              >
                Category
              </th>
              {channels.map((channel) => {
                const Icon = channel.icon;

                return (
                  <th scope="col" key={channel.key} className="w-32 p-4 text-center align-top">
                    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-bolt-elements-textTertiary">
                      <Icon className="h-4 w-4" aria-hidden />
                      {channel.label}
                    </span>
                    <span className="mt-1 block text-[11px] font-normal normal-case text-bolt-elements-textTertiary">
                      {channel.detail}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-bolt-elements-borderColor">
            {categories.map((category) => {
              const Icon = category.icon;

              return (
                <tr key={category.key}>
                  <th scope="row" className="p-4 text-left font-normal sm:pl-6">
                    <span className="flex items-start gap-3">
                      <span
                        className={classNames(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
                          toneClasses(category.tone),
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{category.title}</span>
                        <span className="mt-1 block max-w-xl text-sm leading-6 text-bolt-elements-textSecondary">
                          {category.description}
                        </span>
                      </span>
                    </span>
                  </th>
                  {channels.map((channel) => {
                    const locked = isLockedCell(category.key, channel.key);
                    const checked = locked || Boolean(matrix[category.key]?.[channel.key]);

                    return (
                      <td key={channel.key} className="p-4 text-center align-middle">
                        <span className="inline-flex" title={locked ? SECURITY_EMAIL_LOCK_REASON : undefined}>
                          <Switch
                            checked={checked}
                            disabled={locked || undefined}
                            aria-label={`${category.title} via ${channel.label}${locked ? ` (${SECURITY_EMAIL_LOCK_REASON.toLowerCase()})` : ''}`}
                            onCheckedChange={(value) => setCell(category.key, channel.key, value)}
                          />
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t border-bolt-elements-borderColor px-5 py-3 text-xs text-bolt-elements-textTertiary sm:px-6">
        {SECURITY_EMAIL_LOCK_REASON} and cannot be turned off.
      </p>
    </section>
  );
}

const categoryTone: Record<string, NotificationCategory['tone']> = {
  security: 'critical',
  billing: 'warning',
  deployments: 'info',
  team: 'success',
  system: 'info',
};

function toneClasses(tone: NotificationCategory['tone']) {
  return classNames(
    tone === 'critical' &&
      'border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-text)]',
    tone === 'warning' &&
      'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]',
    tone === 'info' && 'border-blue-500/35 bg-blue-500/10 text-blue-400',
    tone === 'success' && 'border-emerald-500/35 bg-emerald-500/10 text-emerald-400',
  );
}

export function NotificationFeedSection({ feed, unavailable }: { feed: NotificationFeed; unavailable: boolean }) {
  const revalidator = useRevalidator();
  const [currentFeed, setCurrentFeed] = useState(feed);
  const { notifications, unreadCount } = currentFeed;
  const retrying = revalidator.state !== 'idle';

  const markAll = useRecoverableNotificationPost({
    endpoint: '/api/notifications/read-all',
    failureMessage: 'E-Code could not confirm that every notification was marked as read.',
    onSuccess: (response) => {
      setCurrentFeed((current) => ({
        notifications: current.notifications.map((notification) => ({
          ...notification,
          read: true,
          readAt: notification.readAt ?? new Date().toISOString(),
        })),
        unreadCount: response.unreadCount ?? 0,
      }));
    },
  });

  useEffect(() => {
    setCurrentFeed(feed);
  }, [feed]);

  const confirmNotificationRead = useCallback((notificationId: string, nextUnreadCount?: number) => {
    setCurrentFeed((current) => ({
      notifications: current.notifications.map((notification) =>
        notification.id === notificationId
          ? { ...notification, read: true, readAt: notification.readAt ?? new Date().toISOString() }
          : notification,
      ),
      unreadCount: nextUnreadCount ?? Math.max(0, current.unreadCount - 1),
    }));
  }, []);

  if (unavailable) {
    return retrying ? (
      <AsyncPanelSkeleton label="Loading notification inbox" rows={3} className="mb-6" />
    ) : (
      <AsyncPanelError
        title="Notification inbox could not load"
        description="Notification preferences remain available, and no inbox item was changed. Try loading the inbox again."
        onRetry={revalidator.revalidate}
        className="mb-6"
      />
    );
  }

  return (
    <section className="mb-6 overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-bolt-elements-borderColor p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
            <Bell className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold tracking-normal">
              Inbox
              {unreadCount > 0 ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-bolt-elements-item-contentAccent px-1.5 py-0.5 text-[11px] font-semibold text-bolt-elements-textPrimary">
                  {unreadCount}
                </span>
              ) : null}
            </h2>
            <p className="mt-0.5 text-sm text-bolt-elements-textSecondary">
              {unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up.'}
            </p>
          </div>
        </div>
        {unreadCount > 0 ? (
          <Button
            type="button"
            variant="secondary"
            disabled={markAll.pending}
            aria-busy={markAll.pending}
            className="min-h-[44px]"
            onClick={() => void markAll.run()}
          >
            {markAll.pending ? 'Marking…' : 'Mark all as read'}
          </Button>
        ) : null}
      </div>

      {markAll.error ? (
        <div className="border-b border-bolt-elements-borderColor p-4 sm:px-6">
          <AsyncPanelError
            compact
            title="Notifications were not marked as read"
            description={`${markAll.error} Try again before relying on the unread count.`}
            onRetry={() => void markAll.run()}
            retrying={markAll.pending}
          />
        </div>
      ) : null}

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center">
          <Bell className="h-8 w-8 text-bolt-elements-textTertiary" aria-hidden />
          <p className="text-sm font-medium">No notifications yet</p>
          <p className="text-sm text-bolt-elements-textSecondary">
            Security, billing and deployment events will appear here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-bolt-elements-borderColor">
          {notifications.map((notification) => (
            <NotificationRow key={notification.id} notification={notification} onRead={confirmNotificationRead} />
          ))}
        </ul>
      )}
    </section>
  );
}

function NotificationRow({
  notification,
  onRead,
}: {
  notification: FeedNotification;
  onRead: (notificationId: string, unreadCount?: number) => void;
}) {
  const [confirmedRead, setConfirmedRead] = useState(notification.read);
  const tone = categoryTone[notification.category] ?? 'info';

  const markRead = useRecoverableNotificationPost({
    endpoint: `/api/notifications/${encodeURIComponent(notification.id)}/read`,
    failureMessage: 'E-Code could not confirm that this notification was marked as read.',
    onSuccess: (response) => {
      setConfirmedRead(true);
      onRead(notification.id, response.unreadCount);
    },
  });

  useEffect(() => {
    setConfirmedRead(notification.read);
  }, [notification.read]);

  // Optimistically reflect an in-flight mark-read so the row updates instantly.
  const isRead = confirmedRead || markRead.pending;

  return (
    <li
      aria-busy={markRead.pending || undefined}
      className={classNames(
        'p-4',
        isRead ? 'bg-bolt-elements-background-depth-2' : 'bg-bolt-elements-background-depth-1',
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={classNames(
              'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
              toneClasses(tone),
            )}
          >
            <Bell className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={classNames('text-sm', isRead ? 'font-medium' : 'font-semibold')}>{notification.title}</h3>
              {!isRead ? (
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-bolt-elements-item-contentAccent"
                  aria-label="Unread"
                />
              ) : null}
            </div>
            {notification.body ? (
              <p className="mt-1 text-sm leading-6 text-bolt-elements-textSecondary">{notification.body}</p>
            ) : null}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-bolt-elements-textTertiary">
              <time dateTime={notification.createdAt}>
                {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
              </time>
              {notification.linkUrl ? (
                <>
                  <span aria-hidden>·</span>
                  <a className="text-bolt-elements-item-contentAccent hover:underline" href={notification.linkUrl}>
                    View
                  </a>
                </>
              ) : null}
            </div>
          </div>
        </div>
        {!isRead && !markRead.error ? (
          <Button
            type="button"
            variant="secondary"
            disabled={markRead.pending}
            className="min-h-[44px] shrink-0"
            onClick={() => void markRead.run()}
          >
            Mark read
          </Button>
        ) : null}
      </div>
      {markRead.error ? (
        <AsyncPanelError
          compact
          title="Notification was not marked as read"
          description={`${markRead.error} Try the request again.`}
          onRetry={() => void markRead.run()}
          retrying={markRead.pending}
          className="mt-3"
        />
      ) : null}
    </li>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-20 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2">
      <div className="text-sm font-semibold">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-normal text-bolt-elements-textTertiary">{label}</div>
    </div>
  );
}
