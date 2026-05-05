import type { MetaFunction } from '@remix-run/cloudflare';
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
import { AppShell, LinkButton } from '~/components/dashboard/SaaSLayout';
import { classNames } from '~/utils/classNames';

export const meta: MetaFunction = () => [{ title: 'Notifications - VibeCore' }];

type NotificationSurface = {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: 'critical' | 'warning' | 'info' | 'success';
  delivery: string;
  owner: string;
};

const surfaces: NotificationSurface[] = [
  {
    title: 'Security events',
    description: 'MFA changes, API key rotation, suspicious session activity and access policy updates.',
    icon: ShieldAlert,
    tone: 'critical',
    delivery: 'Immediate',
    owner: 'Security admins',
  },
  {
    title: 'Billing alerts',
    description: 'Quota thresholds, failed payments, invoice availability and subscription changes.',
    icon: CreditCard,
    tone: 'warning',
    delivery: 'Immediate',
    owner: 'Billing admins',
  },
  {
    title: 'Deployment updates',
    description: 'Preview builds, production releases, rollbacks, domain checks and failed jobs.',
    icon: Rocket,
    tone: 'info',
    delivery: 'Real time',
    owner: 'Project collaborators',
  },
  {
    title: 'Team changes',
    description: 'Invitations, role updates, collaborator changes and owner-level membership events.',
    icon: Users,
    tone: 'success',
    delivery: 'Digest + critical',
    owner: 'Organization owners',
  },
];

const channels = [
  { label: 'Email', detail: 'Transactional provider', icon: Mail, status: 'Required for production' },
  { label: 'In-app', detail: 'Workspace inbox', icon: Bell, status: 'Enabled' },
  { label: 'Webhook', detail: 'Audit and incident routing', icon: Webhook, status: 'Enterprise' },
  { label: 'Mobile', detail: 'Desktop/mobile bridge', icon: Smartphone, status: 'Optional' },
];

const policies = [
  { label: 'Critical', icon: Siren, detail: 'Security, billing failure and production outage events.' },
  { label: 'Action needed', icon: Clock3, detail: 'Reviews, approvals, quota limits and pending invitations.' },
  { label: 'Informational', icon: Megaphone, detail: 'Release notes, usage summaries and collaboration updates.' },
];

export default function NotificationsPage() {
  return (
    <AppShell
      title="Notifications"
      description="Control high-signal product, billing, deployment and security notifications across your workspace."
      actions={
        <>
          <LinkButton to="/settings/notifications" variant="outline">
            User preferences
          </LinkButton>
          <LinkButton to="/security-settings">Security rules</LinkButton>
        </>
      }
    >
      <div className="space-y-6">
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
                <Metric value="4" label="Surfaces" />
                <Metric value="3" label="Priorities" />
                <Metric value="24/7" label="Routing" />
              </div>
            </div>
          </div>
          <div className="grid gap-px bg-bolt-elements-borderColor md:grid-cols-2 xl:grid-cols-4">
            {surfaces.map((surface) => (
              <NotificationSurfaceCard key={surface.title} surface={surface} />
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
                  <div
                    key={channel.label}
                    className="flex items-start gap-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{channel.label}</h3>
                        <span className="rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-[11px] text-bolt-elements-textTertiary">
                          {channel.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-bolt-elements-textSecondary">{channel.detail}</p>
                    </div>
                  </div>
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
      </div>
    </AppShell>
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

function NotificationSurfaceCard({ surface }: { surface: NotificationSurface }) {
  const Icon = surface.icon;

  return (
    <article className="bg-bolt-elements-background-depth-2 p-4">
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
        <span className="rounded-full border border-bolt-elements-borderColor px-2 py-1 text-[11px] font-medium text-bolt-elements-textTertiary">
          {surface.delivery}
        </span>
      </div>
      <h3 className="text-sm font-semibold">{surface.title}</h3>
      <p className="mt-2 min-h-16 text-sm leading-6 text-bolt-elements-textSecondary">{surface.description}</p>
      <div className="mt-4 flex items-center gap-2 border-t border-bolt-elements-borderColor pt-3 text-xs text-bolt-elements-textTertiary">
        <MessageSquare className="h-3.5 w-3.5" aria-hidden />
        {surface.owner}
      </div>
    </article>
  );
}
