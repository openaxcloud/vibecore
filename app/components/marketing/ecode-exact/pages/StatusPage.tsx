import { Activity, ArrowRight, Bell, Bot, Boxes, LayoutDashboard, Rocket, Server, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { SiOpenai, SiPostgresql } from 'react-icons/si';
import { useFetcher } from 'react-router';

import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import Popover from '~/components/ui/Popover';
import {
  formatStatusDay,
  formatStatusHistoryTitle,
  formatStatusIncidentDuration,
  getMarketingExactStatusDesktopCopy,
  localizeStatusSubscriptionError,
  type StatusPrincipleId,
  type StatusServiceId,
} from '~/lib/i18n/catalogs/marketing-exact-status-desktop';

const PRODUCT = '/ecode-static/assets/product';
const HISTORY_DAYS = 7;

type StatusIncident = {
  /** UTC day the incident happened, YYYY-MM-DD. */
  date: string;
  severity: 'warning' | 'error';
  title: string;
  durationMinutes: number;
  href?: string;
};

type StatusIcon = LucideIcon | IconType;

/*
 * Static incident seed for the history section. Days without an entry render
 * the localized quiet row. Append a row here when an incident is resolved.
 */
const INCIDENT_HISTORY: StatusIncident[] = [];

const INCIDENT_SEVERITY_COLORS = new Map<StatusIncident['severity'], string>([
  ['warning', 'var(--status-warning-text)'],
  ['error', 'var(--status-error-text)'],
]);

const STATUS_SERVICE_ICONS: Record<StatusServiceId, StatusIcon> = {
  api: Server,
  workspaces: Boxes,
  deployments: Rocket,
  agent: Bot,
  dashboard: LayoutDashboard,
  database: SiPostgresql,
};

const STATUS_PRINCIPLE_ICONS: Record<StatusPrincipleId, StatusIcon> = {
  monitoring: Activity,
  transparency: Bell,
  resilience: ShieldCheck,
};

function lastStatusDaysUtc(language: string): Array<{ key: string; label: string }> {
  return Array.from({ length: HISTORY_DAYS }, (_, index) => {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - index);

    return { key: day.toISOString().slice(0, 10), label: formatStatusDay(day, language) };
  });
}

type StatusCopy = ReturnType<typeof getMarketingExactStatusDesktopCopy>['exactStatus'];

function SubscribeToUpdates({ copy, language }: { copy: StatusCopy['subscription']; language: string }) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const submitting = fetcher.state !== 'idle';
  const succeeded = fetcher.data?.ok === true;

  return (
    <Popover
      testId="popover-status-subscribe"
      side="bottom"
      contentClassName="w-80 p-4 text-left"
      trigger={
        <button
          type="button"
          className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-md px-5 py-2.5 text-[14px] font-medium min-h-[44px] border border-bolt-elements-borderColor text-bolt-elements-textPrimary bg-bolt-elements-background-depth-1 transition-colors hover:bg-bolt-elements-background-depth-3"
          data-testid="button-status-subscribe"
        >
          <Bell className="h-4 w-4" aria-hidden />
          {copy.trigger}
        </button>
      }
    >
      <h3 className="text-[14px] font-semibold text-bolt-elements-textPrimary">{copy.title}</h3>
      {succeeded ? (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--status-success-text)' }}>
          {copy.success}
        </p>
      ) : (
        <fetcher.Form method="post" action="/newsletter" className="mt-3">
          <input type="hidden" name="source" value="status" />
          <div className="flex flex-col gap-2">
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder={copy.emailPlaceholder}
              aria-label={copy.emailAria}
              disabled={submitting}
              className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-[16px] sm:text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary outline-none focus:border-bolt-elements-focus"
            />
            <input
              type="text"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="pointer-events-none absolute h-0 w-0 opacity-0"
            />
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-[40px] items-center justify-center rounded-md px-4 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: '#F26207' }}
            >
              {submitting ? copy.submitting : copy.submit}
            </button>
          </div>
          {fetcher.data && fetcher.data.ok === false ? (
            <p className="mt-2 text-[12px]" style={{ color: 'var(--status-error-text)' }}>
              {localizeStatusSubscriptionError(fetcher.data.error, language)}
            </p>
          ) : null}
        </fetcher.Form>
      )}
      <p className="mt-3 text-[12px] text-bolt-elements-textSecondary">{copy.channelNote}</p>
    </Popover>
  );
}

export default function StatusPage() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingExactStatusDesktopCopy(language).exactStatus;
  const services = copy.services.items.map((service) => ({ ...service, icon: STATUS_SERVICE_ICONS[service.id] }));

  const principles = copy.reliability.items.map((principle) => ({
    ...principle,
    icon: STATUS_PRINCIPLE_ICONS[principle.id],
  }));

  return (
    <div className="min-h-screen flex flex-col bg-bolt-elements-background-depth-1" data-testid="page-status">
      <PublicNavbar />

      <main className="flex-1">
        <section className="bg-bolt-elements-background-depth-1">
          <div className="container-responsive py-16 sm:py-24">
            <div className="text-center max-w-3xl mx-auto">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#F26207] mb-5">
                <Activity className="h-6 w-6 text-white" aria-hidden />
              </span>
              <h1 className="mkt-h1 font-bold text-bolt-elements-textPrimary mb-4" data-testid="heading-status">
                {copy.hero.title}
              </h1>
              <p className="mkt-lead text-bolt-elements-textSecondary mb-8 leading-relaxed">{copy.hero.description}</p>

              <div className="inline-flex max-w-full items-center justify-center gap-3 rounded-xl ring-1 ring-[#F26207]/30 bg-[#F26207]/10 px-4 sm:px-6 py-4">
                <span className="relative flex h-3 w-3 flex-shrink-0" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F26207] opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-[#F26207]" />
                </span>
                <span className="text-[15px] font-semibold text-bolt-elements-textPrimary">
                  {copy.hero.operational}
                </span>
              </div>

              <div className="mt-5 flex justify-center">
                <SubscribeToUpdates copy={copy.subscription} language={language} />
              </div>
            </div>
          </div>
        </section>

        <section className="bg-bolt-elements-background-depth-2 border-y border-bolt-elements-borderColor">
          <div className="container-responsive py-16 sm:py-24">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="mkt-h2 font-bold text-bolt-elements-textPrimary mb-4">{copy.services.title}</h2>
              <p className="mkt-body text-bolt-elements-textSecondary leading-relaxed">{copy.services.description}</p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
              {services.map((service) => {
                const Icon = service.icon;

                return (
                  <Card
                    key={service.id}
                    className="bg-bolt-elements-background-depth-1 border-bolt-elements-borderColor"
                  >
                    <CardContent className="p-6">
                      <div className="flex flex-col items-start gap-4">
                        <div className="flex min-w-0 gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F26207]/10 ring-1 ring-[#F26207]/20 flex-shrink-0">
                            <Icon className="h-5 w-5 text-[var(--ecode-accent-text)]" aria-hidden />
                          </span>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-bolt-elements-textPrimary">{service.name}</h3>
                            <p className="mkt-small text-bolt-elements-textSecondary leading-relaxed mt-0.5">
                              {service.description}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="secondary"
                          className="border-[#F26207]/30 bg-[#F26207]/10 text-[var(--ecode-accent-text)]"
                        >
                          {copy.services.operational}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-bolt-elements-background-depth-1">
          <div className="container-responsive py-16 sm:py-24">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="mkt-h2 font-bold text-bolt-elements-textPrimary mb-4">
                {formatStatusHistoryTitle(HISTORY_DAYS, language)}
              </h2>
              <p className="mkt-body text-bolt-elements-textSecondary leading-relaxed">{copy.history.description}</p>
            </div>

            <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
              {lastStatusDaysUtc(language).map((day) => {
                const incident = INCIDENT_HISTORY.find((entry) => entry.date === day.key);
                const severityColor = incident ? INCIDENT_SEVERITY_COLORS.get(incident.severity) : undefined;

                return (
                  <div
                    key={day.key}
                    className="flex items-start sm:items-center gap-3 sm:gap-4 border-b border-bolt-elements-borderColor px-4 py-3 last:border-b-0"
                  >
                    <span
                      className="w-24 shrink-0 text-[13px] text-bolt-elements-textPrimary"
                      style={{ fontFamily: 'var(--vc-font-code)' }}
                    >
                      {day.label}
                    </span>
                    {incident && severityColor ? (
                      <span className="flex min-w-0 flex-wrap items-center gap-2 text-[13px]">
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{
                            color: severityColor,
                            background: `color-mix(in srgb, ${severityColor} 12%, transparent)`,
                          }}
                        >
                          {copy.history.severity[incident.severity]}
                        </span>
                        <span className="text-bolt-elements-textPrimary">{incident.title}</span>
                        <span className="text-bolt-elements-textSecondary">
                          · {formatStatusIncidentDuration(incident.durationMinutes, language)}
                        </span>
                        {incident.href ? (
                          <a href={incident.href} className="underline" style={{ color: severityColor }}>
                            {copy.history.details}
                          </a>
                        ) : null}
                      </span>
                    ) : (
                      <span className="min-w-0 text-[13px] text-bolt-elements-textSecondary">{copy.history.empty}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-bolt-elements-background-depth-1">
          <div className="container-responsive py-16 sm:py-24">
            <div className="grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
              <div>
                <Badge
                  variant="secondary"
                  className="mb-5 border-[#F26207]/30 bg-[#F26207]/10 text-[var(--ecode-accent-text)]"
                >
                  {copy.reliability.badge}
                </Badge>
                <h2 className="mkt-h2 font-bold text-bolt-elements-textPrimary mb-6">{copy.reliability.title}</h2>
                <div className="space-y-6">
                  {principles.map((principle) => {
                    const Icon = principle.icon;

                    return (
                      <div key={principle.id} className="flex gap-4">
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F26207]/10 ring-1 ring-[#F26207]/20 flex-shrink-0">
                          <Icon className="h-5 w-5 text-[var(--ecode-accent-text)]" aria-hidden />
                        </span>
                        <div>
                          <h3 className="font-semibold text-bolt-elements-textPrimary mb-1">{principle.title}</h3>
                          <p className="mkt-body text-bolt-elements-textSecondary leading-relaxed">
                            {principle.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="relative">
                <div className="absolute -inset-2 bg-gradient-to-r from-[#F26207]/20 to-[#F99D25]/20 blur-2xl rounded-2xl pointer-events-none" />
                <figure className="relative overflow-hidden rounded-2xl ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-2xl">
                  <img
                    src={`${PRODUCT}/dashboard.png`}
                    alt={copy.reliability.imageAlt}
                    className="w-full h-auto"
                    loading="lazy"
                  />
                </figure>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-bolt-elements-background-depth-2 border-y border-bolt-elements-borderColor">
          <div className="container-responsive py-12">
            <div className="max-w-4xl mx-auto">
              <Card className="bg-bolt-elements-background-depth-1 border-bolt-elements-borderColor">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F26207]/10 ring-1 ring-[#F26207]/20 flex-shrink-0">
                      <SiOpenai className="h-5 w-5 text-[var(--ecode-accent-text)]" aria-hidden />
                    </span>
                    <div>
                      <CardTitle className="text-bolt-elements-textPrimary">{copy.providers.title}</CardTitle>
                      <CardDescription className="text-bolt-elements-textSecondary">
                        {copy.providers.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="mkt-body text-bolt-elements-textSecondary leading-relaxed">{copy.providers.body}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="bg-bolt-elements-background-depth-1">
          <div className="container-responsive py-16 sm:py-24">
            <div className="relative overflow-hidden rounded-2xl ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-6 py-12 sm:px-12 sm:py-16">
              <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[#F26207]/15 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-[#F99D25]/10 blur-3xl pointer-events-none" />
              <div className="relative text-center max-w-2xl mx-auto">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#F26207] mb-5">
                  <Rocket className="h-6 w-6 text-white" aria-hidden />
                </span>
                <h2 className="mkt-h2 font-bold text-bolt-elements-textPrimary mb-4">{copy.cta.title}</h2>
                <p className="mkt-lead text-bolt-elements-textSecondary mb-8 leading-relaxed">{copy.cta.description}</p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <a
                    href="/signup"
                    className="inline-flex items-center justify-center gap-2 rounded-md px-6 py-3 text-[15px] font-medium text-white min-h-[44px] w-full sm:w-auto transition-opacity hover:opacity-90"
                    style={{ backgroundColor: '#F26207' }}
                    data-testid="button-status-cta"
                  >
                    {copy.cta.primary}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </a>
                  <a
                    href="/dashboard"
                    className="inline-flex items-center justify-center rounded-md px-6 py-3 text-[15px] font-medium min-h-[44px] w-full sm:w-auto border border-bolt-elements-borderColor text-bolt-elements-textPrimary bg-bolt-elements-background-depth-1 transition-colors hover:bg-bolt-elements-background-depth-3"
                    data-testid="button-status-cta-secondary"
                  >
                    {copy.cta.secondary}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
