/* eslint-disable @typescript-eslint/naming-convention */
import { Cloud, CheckCircle2, Database, Lock, Rocket, Server, Shield, Sparkles, Terminal } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Link,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import { getPublicDeploymentsCopy } from '~/lib/i18n/catalogs/public-deployments';

/*
 * PERF: the heavier, mostly-decorative below-the-fold markup (observability
 * panel, workflow, governance, FAQ + CTA) lives in a separate module that is
 * code-split via React.lazy. The hero and first capability grid ship in the
 * initial chunk; the rest streams in just after first paint instead of
 * blocking the whole page on one large synchronous component.
 */
const PublicDeploymentsSections = lazy(
  () => import('~/components/marketing/ecode-exact/pages/PublicDeploymentsSections'),
);

const HERO_HIGHLIGHT_ICONS = [Rocket, Sparkles, Shield] as const;
const DEPLOYMENT_MODE_ICONS = [Cloud, Server, Terminal] as const;
const DEMO_DEPLOYMENT_ID = 'marketing-site@main';
const DEMO_REQUEST_RATE = '4.2k';
const DEMO_LATENCY = '112 ms';

export default function PublicDeploymentsPage() {
  const { i18n } = useTranslation();
  const copy = getPublicDeploymentsCopy(i18n.resolvedLanguage ?? i18n.language);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNavbar />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[var(--ecode-border)] bg-[var(--ecode-surface)]">
        <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden>
          <div className="absolute -top-40 right-10 h-96 w-96 rounded-full bg-[var(--ecode-accent)]/25 blur-3xl" />
          <div className="absolute -bottom-32 left-10 h-80 w-80 rounded-full bg-[var(--ecode-secondary-accent)]/20 blur-3xl" />
        </div>
        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 py-24 lg:grid-cols-[1.2fr_1fr] lg:px-10">
          <div>
            <Badge className="mb-6 border-[var(--ecode-accent)]/30 bg-[var(--ecode-accent)]/10 text-[var(--ecode-accent)]">
              {copy.page.heroBadge}
            </Badge>
            <h1 className="mkt-h1 font-semibold tracking-tight text-foreground">{copy.page.heroTitle}</h1>
            <p className="mt-6 max-w-2xl mkt-lead text-muted-foreground">{copy.page.heroDescription}</p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/contact-sales">
                <Button
                  size="lg"
                  className="bg-[var(--vc-action-primary-strong)] text-white hover:brightness-90"
                  data-testid="button-contact-sales"
                >
                  {copy.page.talkToExpert}
                </Button>
              </Link>
              <Link href="/docs/deployments">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-[var(--ecode-border)] text-foreground hover:bg-[var(--ecode-surface-hover)]"
                  data-testid="button-explore-docs"
                >
                  {copy.page.exploreDocs}
                </Button>
              </Link>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              {HERO_HIGHLIGHT_ICONS.map((Icon, index) => {
                const highlight = copy.page.heroHighlights[index];

                if (!highlight) {
                  return null;
                }

                return (
                  <Card key={highlight.title} className="border-[var(--ecode-border)] bg-background/60 backdrop-blur">
                    <CardHeader className="pb-2">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ecode-accent)]/10 text-[var(--ecode-accent)]">
                        <Icon className="h-5 w-5" />
                      </span>
                      <CardTitle className="mkt-h3 font-semibold">{highlight.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="mkt-body text-muted-foreground">{highlight.description}</CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
          <div className="relative">
            <div className="rounded-3xl border border-[var(--ecode-border)] bg-gradient-to-br from-[var(--ecode-accent)]/10 to-transparent p-4 shadow-2xl backdrop-blur">
              <div className="space-y-4 rounded-2xl border border-[var(--ecode-border)] bg-[var(--ecode-surface-secondary)] p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {copy.page.demo.deployment}
                    </p>
                    <p className="text-[15px] font-semibold">{DEMO_DEPLOYMENT_ID}</p>
                  </div>
                  <Badge className="border-[var(--ecode-accent)]/30 bg-[var(--ecode-accent)]/15 text-[var(--ecode-accent)]">
                    {copy.page.demo.live}
                  </Badge>
                </div>
                <div className="grid gap-4 rounded-xl border border-[var(--ecode-border)] bg-background/40 p-4">
                  <div className="flex items-center justify-between text-[13px] text-muted-foreground">
                    <span>{copy.page.demo.requestsPerMinute}</span>
                    <span className="font-medium text-foreground">{DEMO_REQUEST_RATE}</span>
                  </div>
                  <div className="h-16 rounded-lg bg-gradient-to-r from-[var(--ecode-accent)]/60 via-[var(--ecode-secondary-accent)]/40 to-transparent" />
                  <div className="flex items-center justify-between text-[13px] text-muted-foreground">
                    <span>{copy.page.demo.latencyP95}</span>
                    <span className="font-medium text-foreground">{DEMO_LATENCY}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--ecode-border)]">
                    <div className="h-full w-3/5 rounded-full bg-[var(--ecode-accent)]" />
                  </div>
                </div>
                <div className="grid gap-3 text-[13px] text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[var(--ecode-accent)]" /> {copy.page.demo.autoscale}
                    </span>
                    <span>{copy.page.demo.enabled}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-[var(--ecode-accent)]" /> {copy.page.demo.tls}
                    </span>
                    <span>{copy.page.demo.issued}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-[var(--ecode-secondary-accent)]" /> {copy.page.demo.backups}
                    </span>
                    <span>{copy.page.demo.nightly}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-12 left-10 hidden w-48 rounded-2xl border border-[var(--ecode-border)] bg-[var(--ecode-surface-secondary)] p-4 text-[13px] text-foreground shadow-xl lg:block">
              <p className="font-semibold">{copy.page.demo.productionLive}</p>
              <p className="mt-2 text-muted-foreground">{copy.page.demo.productionDetail}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Deployment modes */}
      <section className="px-6 py-24 lg:px-10">
        <div className="mx-auto max-w-6xl text-center">
          <h2 className="mkt-h2 font-semibold tracking-tight">{copy.page.modesTitle}</h2>
          <p className="mt-4 mkt-body text-muted-foreground">{copy.page.modesDescription}</p>
        </div>
        <div className="mx-auto mt-16 grid max-w-6xl gap-8 lg:grid-cols-3">
          {DEPLOYMENT_MODE_ICONS.map((Icon, index) => {
            const mode = copy.page.modes[index];

            if (!mode) {
              return null;
            }

            return (
              <Card key={mode.label} className="h-full border-[var(--ecode-border)]">
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--ecode-accent)]/10 text-[var(--ecode-accent)]">
                    <Icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="mkt-h3 font-semibold">{mode.label}</CardTitle>
                  <p className="text-muted-foreground">{mode.description}</p>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-[13px] text-muted-foreground">
                    {mode.metrics.map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-[var(--ecode-accent)]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Reliability strip */}
      <section className="border-y border-[var(--ecode-border)] bg-[var(--ecode-surface)]/40 px-6 py-24 lg:px-10">
        <div className="mx-auto max-w-6xl text-center">
          <h2 className="mkt-h2 font-semibold tracking-tight">{copy.page.reliabilityTitle}</h2>
          <p className="mt-4 mkt-body text-muted-foreground">{copy.page.reliabilityDescription}</p>
        </div>
        <div className="mx-auto mt-12 grid max-w-4xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {copy.page.reliabilityHighlights.map(({ value, label }) => (
            <Card key={label} className="border-[var(--ecode-border)] bg-background">
              <CardContent className="p-6 text-center">
                <p className="text-4xl font-semibold text-[var(--ecode-accent)]">{value}</p>
                <p className="mt-2 mkt-small text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Suspense fallback={<div className="h-24" aria-hidden />}>
        <PublicDeploymentsSections />
      </Suspense>

      <PublicFooter />
    </div>
  );
}
