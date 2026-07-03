import { Activity, ShieldCheck, Bell, Boxes, Rocket, Bot, LayoutDashboard, Server, ArrowRight } from 'lucide-react';
import { SiPostgresql, SiOpenai } from 'react-icons/si';
import { useFetcher } from 'react-router';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import { Badge } from '~/components/marketing/ecode-exact/EcodeExactUi';
import Popover from '~/components/ui/Popover';

const PRODUCT = '/ecode-static/assets/product';

type StatusIncident = {
  /** UTC day the incident happened, YYYY-MM-DD. */
  date: string;
  severity: 'warning' | 'error';
  title: string;
  durationMinutes: number;
  href?: string;
};

/*
 * Static incident seed for the history section. Days without an entry render
 * the quiet "No incidents reported" row. Append a row here when an incident is
 * resolved (this page has no incident backend yet — the seed IS the record; an
 * empty list truthfully means no incidents in the window).
 */
const incidentHistory: StatusIncident[] = [];

const INCIDENT_SEVERITY_STYLES: Record<StatusIncident['severity'], { label: string; color: string }> = {
  warning: { label: 'Degraded', color: 'var(--status-warning-text)' },
  error: { label: 'Outage', color: 'var(--status-error-text)' },
};

const historyDayFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  timeZone: 'UTC',
});

function lastSevenDaysUtc(): Array<{ key: string; label: string }> {
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - index);

    return { key: day.toISOString().slice(0, 10), label: historyDayFormatter.format(day) };
  });
}

function formatIncidentDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

/*
 * Incident-update opt-in for the status page. Reuses the /newsletter route
 * action (honeypot + rate-limited API proxy) with source="status" so the
 * subscription records where it came from. Email is the only real update
 * channel today — no RSS feed or webhook endpoint exists, so none is offered.
 */
function SubscribeToUpdates() {
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
          className="inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-[14px] font-medium min-h-[44px] border border-bolt-elements-borderColor text-bolt-elements-textPrimary bg-bolt-elements-background-depth-1 transition-colors hover:bg-bolt-elements-background-depth-3"
          data-testid="button-status-subscribe"
        >
          <Bell className="h-4 w-4" aria-hidden />
          Subscribe to updates
        </button>
      }
    >
      <h3 className="text-[14px] font-semibold text-bolt-elements-textPrimary">Get incident updates by email</h3>
      {succeeded ? (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--status-success-text)' }}>
          You&apos;re subscribed — incident updates will land in your inbox.
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
              placeholder="you@company.com"
              aria-label="Email address"
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
              {submitting ? 'Subscribing…' : 'Subscribe'}
            </button>
          </div>
          {fetcher.data && fetcher.data.ok === false ? (
            <p className="mt-2 text-[12px]" style={{ color: 'var(--status-error-text)' }}>
              {fetcher.data.error ?? 'Subscription failed. Please try again.'}
            </p>
          ) : null}
        </fetcher.Form>
      )}
      <p className="mt-3 text-[12px] text-bolt-elements-textSecondary">
        Email is the only update channel for now — RSS and webhooks aren&apos;t available yet.
      </p>
    </Popover>
  );
}

export default function StatusPage() {
  const components = [
    {
      icon: Server,
      brand: false,
      name: 'API',
      description: 'REST endpoints powering projects, builds and account operations.',
    },
    {
      icon: Boxes,
      brand: false,
      name: 'Workspaces',
      description: 'Cloud development environments, runtimes and live previews.',
    },
    {
      icon: Rocket,
      brand: false,
      name: 'Deployments',
      description: 'Build pipelines and hosting for shipped applications.',
    },
    {
      icon: Bot,
      brand: false,
      name: 'AI Agent',
      description: 'Code generation and autonomous assistance across providers.',
    },
    {
      icon: LayoutDashboard,
      brand: false,
      name: 'Dashboard',
      description: 'The web console for projects, settings and team management.',
    },
    {
      icon: SiPostgresql,
      brand: true,
      name: 'Database',
      description: 'Managed Postgres and persistent storage for your apps.',
    },
  ];

  const principles = [
    {
      icon: Activity,
      title: 'Continuous monitoring',
      description:
        'Every core service — API, workspaces, deployments and the AI agent — is monitored around the clock so issues surface fast.',
    },
    {
      icon: Bell,
      title: 'Transparent incident updates',
      description:
        'When something goes wrong, we post what happened, what we are doing, and when it is resolved — no vague status pages.',
    },
    {
      icon: ShieldCheck,
      title: 'Built for resilience',
      description:
        'Workspaces, builds and storage run on managed Kubernetes with automatic recovery, so a single failure does not take you down.',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-bolt-elements-background-depth-1" data-testid="page-status">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="bg-bolt-elements-background-depth-1">
          <div className="container-responsive py-16 sm:py-24">
            <div className="text-center max-w-3xl mx-auto">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#F26207] mb-5">
                <Activity className="h-6 w-6 text-white" />
              </span>
              <h1 className="mkt-h1 font-bold text-bolt-elements-textPrimary mb-4" data-testid="heading-status">
                Platform status
              </h1>
              <p className="mkt-lead text-bolt-elements-textSecondary mb-8 leading-relaxed">
                A live look at the services behind E-Code and how we keep you informed when something needs attention.
              </p>

              <div className="inline-flex items-center justify-center gap-3 rounded-xl ring-1 ring-[#F26207]/30 bg-[#F26207]/10 px-6 py-4">
                <span className="relative flex h-3 w-3 flex-shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F26207] opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-[#F26207]" />
                </span>
                <span className="text-[15px] font-semibold text-bolt-elements-textPrimary">
                  All systems operational
                </span>
              </div>

              <div className="mt-5 flex justify-center">
                <SubscribeToUpdates />
              </div>
            </div>
          </div>
        </section>

        {/* Components */}
        <section className="bg-bolt-elements-background-depth-2 border-y border-bolt-elements-borderColor">
          <div className="container-responsive py-16 sm:py-24">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="mkt-h2 font-bold text-bolt-elements-textPrimary mb-4">Core services</h2>
              <p className="mkt-body text-bolt-elements-textSecondary leading-relaxed">
                The building blocks that run every project on E-Code.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
              {components.map((component) => {
                const Icon = component.icon;
                return (
                  <Card
                    key={component.name}
                    className="bg-bolt-elements-background-depth-1 border-bolt-elements-borderColor"
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F26207]/10 ring-1 ring-[#F26207]/20 flex-shrink-0">
                            <Icon className="h-5 w-5 text-[#F26207]" />
                          </span>
                          <div>
                            <h3 className="font-semibold text-bolt-elements-textPrimary">{component.name}</h3>
                            <p className="mkt-small text-bolt-elements-textSecondary leading-relaxed mt-0.5">
                              {component.description}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="secondary"
                          className="flex-shrink-0 border-[#F26207]/30 bg-[#F26207]/10 text-[#F26207]"
                        >
                          Operational
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Incident history */}
        <section className="bg-bolt-elements-background-depth-1">
          <div className="container-responsive py-16 sm:py-24">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="mkt-h2 font-bold text-bolt-elements-textPrimary mb-4">Incident history (last 7 days)</h2>
              <p className="mkt-body text-bolt-elements-textSecondary leading-relaxed">
                A day-by-day record of platform incidents, most recent first.
              </p>
            </div>

            <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
              {lastSevenDaysUtc().map((day) => {
                const incident = incidentHistory.find((entry) => entry.date === day.key);
                const severity = incident ? INCIDENT_SEVERITY_STYLES[incident.severity] : null;

                return (
                  <div
                    key={day.key}
                    className="flex items-center gap-4 border-b border-bolt-elements-borderColor px-4 py-3 last:border-b-0"
                  >
                    <span
                      className="w-20 shrink-0 text-[13px] text-bolt-elements-textPrimary"
                      style={{ fontFamily: 'var(--vc-font-code)' }}
                    >
                      {day.label}
                    </span>
                    {incident && severity ? (
                      <span className="flex min-w-0 flex-wrap items-center gap-2 text-[13px]">
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{
                            color: severity.color,
                            background: `color-mix(in srgb, ${severity.color} 12%, transparent)`,
                          }}
                        >
                          {severity.label}
                        </span>
                        <span className="text-bolt-elements-textPrimary">{incident.title}</span>
                        <span className="text-bolt-elements-textSecondary">
                          · {formatIncidentDuration(incident.durationMinutes)}
                        </span>
                        {incident.href ? (
                          <a href={incident.href} className="underline" style={{ color: severity.color }}>
                            Details
                          </a>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-[13px] text-bolt-elements-textSecondary">No incidents reported</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* How we handle reliability */}
        <section className="bg-bolt-elements-background-depth-1">
          <div className="container-responsive py-16 sm:py-24">
            <div className="grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
              <div>
                <Badge variant="secondary" className="mb-5 border-[#F26207]/30 bg-[#F26207]/10 text-[#F26207]">
                  Reliability
                </Badge>
                <h2 className="mkt-h2 font-bold text-bolt-elements-textPrimary mb-6">How we keep E-Code running</h2>
                <div className="space-y-6">
                  {principles.map((principle) => {
                    const Icon = principle.icon;
                    return (
                      <div key={principle.title} className="flex gap-4">
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F26207]/10 ring-1 ring-[#F26207]/20 flex-shrink-0">
                          <Icon className="h-5 w-5 text-[#F26207]" />
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
                    alt="The E-Code dashboard, where you manage projects and monitor running workspaces"
                    className="w-full h-auto"
                    loading="lazy"
                  />
                </figure>
              </div>
            </div>
          </div>
        </section>

        {/* AI provider note */}
        <section className="bg-bolt-elements-background-depth-2 border-y border-bolt-elements-borderColor">
          <div className="container-responsive py-12">
            <div className="max-w-4xl mx-auto">
              <Card className="bg-bolt-elements-background-depth-1 border-bolt-elements-borderColor">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F26207]/10 ring-1 ring-[#F26207]/20 flex-shrink-0">
                      <SiOpenai className="h-5 w-5 text-[#F26207]" />
                    </span>
                    <div>
                      <CardTitle className="text-bolt-elements-textPrimary">AI model providers</CardTitle>
                      <CardDescription className="text-bolt-elements-textSecondary">
                        The agent routes across multiple model providers.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="mkt-body text-bolt-elements-textSecondary leading-relaxed">
                    Code generation depends on upstream AI providers such as OpenAI and Anthropic. When a provider
                    degrades, the agent can fall back to an available model so you can keep working — and we report any
                    provider-side disruption here.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Closing CTA banner */}
        <section className="bg-bolt-elements-background-depth-1">
          <div className="container-responsive py-16 sm:py-24">
            <div className="relative overflow-hidden rounded-2xl ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-6 py-12 sm:px-12 sm:py-16">
              <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[#F26207]/15 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-[#F99D25]/10 blur-3xl pointer-events-none" />
              <div className="relative text-center max-w-2xl mx-auto">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#F26207] mb-5">
                  <Rocket className="h-6 w-6 text-white" />
                </span>
                <h2 className="mkt-h2 font-bold text-bolt-elements-textPrimary mb-4">
                  Build on a platform that stays up
                </h2>
                <p className="mkt-lead text-bolt-elements-textSecondary mb-8 leading-relaxed">
                  Spin up a workspace, ship a deployment, and let the agent do the heavy lifting. Your next app is one
                  prompt away.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <a
                    href="/signup"
                    className="inline-flex items-center justify-center gap-2 rounded-md px-6 py-3 text-[15px] font-medium text-white min-h-[44px] w-full sm:w-auto transition-opacity hover:opacity-90"
                    style={{ backgroundColor: '#F26207' }}
                    data-testid="button-status-cta"
                  >
                    Get started for free
                    <ArrowRight className="h-4 w-4" />
                  </a>
                  <a
                    href="/dashboard"
                    className="inline-flex items-center justify-center rounded-md px-6 py-3 text-[15px] font-medium min-h-[44px] w-full sm:w-auto border border-bolt-elements-borderColor text-bolt-elements-textPrimary bg-bolt-elements-background-depth-1 transition-colors hover:bg-bolt-elements-background-depth-3"
                    data-testid="button-status-cta-secondary"
                  >
                    Open dashboard
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
