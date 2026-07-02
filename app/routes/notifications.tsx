import { formatDistanceToNow } from 'date-fns';
import {
  Bell,
  CircleCheck,
  Clock3,
  CreditCard,
  Mail,
  Megaphone,
  MessageSquare,
  RadioTower,
  Rocket,
  ShieldAlert,
  Siren,
  Smartphone,
  Users,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useFetcher, useLoaderData, useNavigation } from 'react-router';
import { AppShell, LinkButton } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import { apiRequest, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { classNames } from '~/utils/classNames';

export const meta: MetaFunction = () => [{ title: 'Notifications - E-Code' }];

type NotificationSurface = {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tone: 'critical' | 'warning' | 'info' | 'success';
  delivery: string;
  owner: string;
};

const surfaces: NotificationSurface[] = [
  {
    key: 'security',
    title: 'Security events',
    description: 'MFA changes, API key rotation, suspicious session activity and access policy updates.',
    icon: ShieldAlert,
    tone: 'critical',
    delivery: 'Immediate',
    owner: 'Security admins',
  },
  {
    key: 'billing',
    title: 'Billing alerts',
    description: 'Quota thresholds, failed payments, invoice availability and subscription changes.',
    icon: CreditCard,
    tone: 'warning',
    delivery: 'Immediate',
    owner: 'Billing admins',
  },
  {
    key: 'deployments',
    title: 'Deployment updates',
    description: 'Preview builds, production releases, rollbacks, domain checks and failed jobs.',
    icon: Rocket,
    tone: 'info',
    delivery: 'Real time',
    owner: 'Project collaborators',
  },
  {
    key: 'team',
    title: 'Team changes',
    description: 'Invitations, role updates, collaborator changes and owner-level membership events.',
    icon: Users,
    tone: 'success',
    delivery: 'Digest + critical',
    owner: 'Organization owners',
  },
];

type NotificationChannel = {
  key: string;
  label: string;
  detail: string;
  icon: LucideIcon;
  status: string;
};

const channels: NotificationChannel[] = [
  { key: 'email', label: 'Email', detail: 'Transactional provider', icon: Mail, status: 'Required for production' },
  { key: 'inApp', label: 'In-app', detail: 'Workspace inbox', icon: Bell, status: 'Enabled' },
  { key: 'webhook', label: 'Webhook', detail: 'Audit and incident routing', icon: Webhook, status: 'Enterprise' },
  { key: 'mobile', label: 'Mobile', detail: 'Desktop/mobile bridge', icon: Smartphone, status: 'Optional' },
];

const policies = [
  { label: 'Critical', icon: Siren, detail: 'Security, billing failure and production outage events.' },
  { label: 'Action needed', icon: Clock3, detail: 'Reviews, approvals, quota limits and pending invitations.' },
  { label: 'Informational', icon: Megaphone, detail: 'Release notes, usage summaries and collaboration updates.' },
];

type NotificationPreferences = {
  surfaces: Record<string, boolean>;
  channels: Record<string, boolean>;
};

/*
 * Notification preferences live in the opaque per-user `preferences` blob
 * (User.preferences JSON, shallow-merged server-side via PATCH
 * /user/preferences). Surfaces and channels not present in the saved blob
 * default to enabled so a fresh account opts into everything until it
 * explicitly turns something off.
 */
function resolvePreferences(saved: Partial<NotificationPreferences> | undefined): NotificationPreferences {
  const savedSurfaces = saved?.surfaces ?? {};
  const savedChannels = saved?.channels ?? {};

  return {
    surfaces: Object.fromEntries(surfaces.map((surface) => [surface.key, savedSurfaces[surface.key] !== false])),
    channels: Object.fromEntries(channels.map((channel) => [channel.key, savedChannels[channel.key] !== false])),
  };
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

export async function loader({ request }: EnterpriseLoaderArgs) {
  /*
   * Preferences and the real per-user feed load together. The feed is fetched
   * best-effort so a transient feed error never blanks the whole preferences
   * page — the preferences call already redirects on 401 for us.
   */
  const [data, feed] = await Promise.all([
    apiRequest<{ preferences?: { notifications?: Partial<NotificationPreferences> } }>(request, '/user/preferences'),
    apiRequest<NotificationFeed>(request, '/user/notifications').catch(
      () => ({ notifications: [], unreadCount: 0 }) as NotificationFeed,
    ),
  ]);

  return { preferences: resolvePreferences(data.preferences?.notifications), feed };
}

export async function action({ request }: EnterpriseActionArgs) {
  const form = await request.formData();

  // Unchecked checkboxes are omitted from the form body, so absence === off.
  const notifications: NotificationPreferences = {
    surfaces: Object.fromEntries(surfaces.map((surface) => [surface.key, form.get(`surface.${surface.key}`) === 'on'])),
    channels: Object.fromEntries(channels.map((channel) => [channel.key, form.get(`channel.${channel.key}`) === 'on'])),
  };

  await apiRequest(request, '/user/preferences', {
    method: 'PATCH',
    body: JSON.stringify({ preferences: { notifications } }),
  });

  return { status: 'Notification preferences saved.', preferences: notifications };
}

export default function NotificationsPage() {
  const { preferences, feed } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const saving = navigation.state === 'submitting';

  const actionData = useActionData<typeof action>() as
    | { status?: string; preferences?: NotificationPreferences }
    | undefined;

  // After a save, render the freshly-submitted state so toggles stay in sync.
  const current = actionData?.preferences ?? preferences;

  const enabledSurfaces = Object.values(current.surfaces).filter(Boolean).length;
  const enabledChannels = Object.values(current.channels).filter(Boolean).length;

  return (
    <AppShell
      title="Notifications"
      description="Control high-signal product, billing, deployment and security notifications across your workspace."
      actions={<LinkButton to="/security-settings">Security rules</LinkButton>}
    >
      <NotificationFeedSection feed={feed} />

      <Form method="post" className="space-y-6">
        {actionData?.status ? (
          <p className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-sm text-bolt-elements-textSecondary">
            {actionData.status}
          </p>
        ) : null}

        <section className="overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
          <div className="border-b border-bolt-elements-borderColor p-5 sm:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-bolt-elements-textTertiary">
                  Delivery command center
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-normal">Enterprise notification coverage</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-bolt-elements-textSecondary">
                  Priority routing keeps operational events visible without turning the workspace into a noisy feed.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Metric value={`${enabledSurfaces}/${surfaces.length}`} label="Surfaces on" />
                <Metric value={`${enabledChannels}/${channels.length}`} label="Channels on" />
                <Metric value={String(policies.length)} label="Priorities" />
              </div>
            </div>
          </div>
          <div className="grid gap-px bg-bolt-elements-borderColor md:grid-cols-2 xl:grid-cols-4">
            {surfaces.map((surface) => (
              <NotificationSurfaceCard key={surface.key} surface={surface} enabled={current.surfaces[surface.key]} />
            ))}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-normal">Delivery channels</h2>
                <p className="mt-1 text-sm text-bolt-elements-textSecondary">
                  Each channel is explicit, auditable and ready for production configuration.
                </p>
              </div>
              <RadioTower className="h-5 w-5 text-bolt-elements-textTertiary" aria-hidden />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {channels.map((channel) => {
                const Icon = channel.icon;

                return (
                  <label
                    key={channel.key}
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{channel.label}</h3>
                        <span className="rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-[11px] text-bolt-elements-textTertiary">
                          {channel.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-bolt-elements-textSecondary">{channel.detail}</p>
                    </div>
                    <input
                      type="checkbox"
                      name={`channel.${channel.key}`}
                      defaultChecked={current.channels[channel.key]}
                      className="vc-auth-checkbox mt-1 h-4 w-4 shrink-0 rounded"
                    />
                  </label>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-normal">Priority model</h2>
                <p className="mt-1 text-sm text-bolt-elements-textSecondary">Clear escalation paths for every event.</p>
              </div>
              <CircleCheck className="h-5 w-5 text-bolt-elements-textTertiary" aria-hidden />
            </div>
            <div className="space-y-3">
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

        <div className="flex justify-end">
          <Button type="submit" disabled={saving} aria-busy={saving}>
            {saving ? 'Saving…' : 'Save preferences'}
          </Button>
        </div>
      </Form>
    </AppShell>
  );
}

const categoryTone: Record<string, NotificationSurface['tone']> = {
  security: 'critical',
  billing: 'warning',
  deployments: 'info',
  team: 'success',
  system: 'info',
};

function toneClasses(tone: NotificationSurface['tone']) {
  return classNames(
    tone === 'critical' && 'border-red-500/35 bg-red-500/10 text-red-400',
    tone === 'warning' && 'border-amber-500/35 bg-amber-500/10 text-amber-400',
    tone === 'info' && 'border-blue-500/35 bg-blue-500/10 text-blue-400',
    tone === 'success' && 'border-emerald-500/35 bg-emerald-500/10 text-emerald-400',
  );
}

function NotificationFeedSection({ feed }: { feed: NotificationFeed }) {
  const markAllFetcher = useFetcher();
  const { notifications, unreadCount } = feed;
  const markingAll = markAllFetcher.state !== 'idle';

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
          <markAllFetcher.Form method="post" action="/api/notifications/read-all">
            <Button type="submit" variant="secondary" disabled={markingAll} aria-busy={markingAll}>
              {markingAll ? 'Marking…' : 'Mark all as read'}
            </Button>
          </markAllFetcher.Form>
        ) : null}
      </div>

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
            <NotificationRow key={notification.id} notification={notification} />
          ))}
        </ul>
      )}
    </section>
  );
}

function NotificationRow({ notification }: { notification: FeedNotification }) {
  const readFetcher = useFetcher();
  const tone = categoryTone[notification.category] ?? 'info';

  // Optimistically reflect an in-flight mark-read so the row updates instantly.
  const isRead = notification.read || readFetcher.state !== 'idle';

  return (
    <li
      className={classNames(
        'flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between',
        isRead ? 'bg-bolt-elements-background-depth-2' : 'bg-bolt-elements-background-depth-1',
      )}
    >
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
              <span className="h-2 w-2 shrink-0 rounded-full bg-bolt-elements-item-contentAccent" aria-label="Unread" />
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
      {!isRead ? (
        <readFetcher.Form
          method="post"
          action={`/api/notifications/${encodeURIComponent(notification.id)}/read`}
          className="shrink-0"
        >
          <Button type="submit" variant="secondary" disabled={readFetcher.state !== 'idle'}>
            Mark read
          </Button>
        </readFetcher.Form>
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

function NotificationSurfaceCard({ surface, enabled }: { surface: NotificationSurface; enabled: boolean }) {
  const Icon = surface.icon;

  return (
    <label className="flex cursor-pointer flex-col bg-bolt-elements-background-depth-2 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <span
          className={classNames(
            'flex h-11 w-11 items-center justify-center rounded-md border',
            surface.tone === 'critical' && 'border-red-500/35 bg-red-500/10 text-red-400',
            surface.tone === 'warning' && 'border-amber-500/35 bg-amber-500/10 text-amber-400',
            surface.tone === 'info' && 'border-blue-500/35 bg-blue-500/10 text-blue-400',
            surface.tone === 'success' && 'border-emerald-500/35 bg-emerald-500/10 text-emerald-400',
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <input
          type="checkbox"
          name={`surface.${surface.key}`}
          defaultChecked={enabled}
          aria-label={`Enable ${surface.title} notifications`}
          className="vc-auth-checkbox mt-1 h-4 w-4 shrink-0 rounded"
        />
      </div>
      <h3 className="text-sm font-semibold">{surface.title}</h3>
      <p className="mt-2 min-h-16 text-sm leading-6 text-bolt-elements-textSecondary">{surface.description}</p>
      <div className="mt-4 flex items-center gap-2 border-t border-bolt-elements-borderColor pt-3 text-xs text-bolt-elements-textTertiary">
        <MessageSquare className="h-3.5 w-3.5" aria-hidden />
        {surface.owner}
      </div>
    </label>
  );
}
