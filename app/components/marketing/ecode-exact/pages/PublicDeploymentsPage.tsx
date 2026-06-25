/* eslint-disable @typescript-eslint/naming-convention */
import { Cloud, CheckCircle2, Database, Lock, Rocket, Server, Shield, Sparkles, Terminal } from 'lucide-react';
import { lazy, Suspense } from 'react';
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

const heroHighlights = [
  {
    icon: Rocket,
    title: 'Push once, deploy everywhere',
    description: 'Ship from the editor to production with a single click. No YAML, no guesswork.',
  },
  {
    icon: Sparkles,
    title: 'AI-assisted workflows',
    description: 'Guardrails, previews, and automated rollbacks ensure every release is safe.',
  },
  {
    icon: Shield,
    title: 'Enterprise ready',
    description: 'SSO, audit logs, and compliance controls built directly into the pipeline.',
  },
] as const;

const deploymentModes = [
  {
    icon: Cloud,
    label: 'Autoscale Apps',
    description: 'Elastic runtimes that scale from zero to planet-wide traffic in seconds.',
    metrics: ['0 to 100 replicas', 'Edge-cache acceleration', 'Pay per request'],
  },
  {
    icon: Server,
    label: 'Reserved VMs',
    description: 'Dedicated compute with persistent storage for long-running workers and APIs.',
    metrics: ['Persistent volumes', 'Private networking', 'Performance isolation'],
  },
  {
    icon: Terminal,
    label: 'Static Sites',
    description: 'Ultra-fast hosting for front-ends with automatic builds and global CDN.',
    metrics: ['Atomic deploys', 'Instant cache invalidation', 'Custom domains'],
  },
] as const;

/*
 * Capability highlights — honest, defensible statements rather than fabricated
 * metrics. Pre-launch we do not have an SLA, an edge network or deploy counts to
 * cite, so these describe what publishing actually does today.
 */
const reliabilityHighlights = [
  { value: 'Seconds', label: 'Build to live URL' },
  { value: 'HTTPS', label: 'Managed TLS on every deploy' },
  { value: '1-click', label: 'Publish from the editor' },
  { value: 'Live', label: 'Build logs & status' },
] as const;

export default function PublicDeploymentsPage() {
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
              Deploy from idea to internet in one click
            </Badge>
            <h1 className="mkt-h1 font-semibold tracking-tight text-foreground">
              Launch production-grade apps straight from your workspace
            </h1>
            <p className="mt-6 max-w-2xl mkt-lead text-muted-foreground">
              E-Code Deployments pairs the simplicity of an in-browser IDE with the rigor of a global cloud platform.
              Ship instantly, observe everything, and meet enterprise requirements without bolting together tools.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/contact-sales">
                <Button
                  size="lg"
                  className="bg-[var(--ecode-accent)] text-white hover:bg-[var(--ecode-accent-hover)]"
                  data-testid="button-contact-sales"
                >
                  Talk to an expert
                </Button>
              </Link>
              <Link href="/docs/deployments">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-[var(--ecode-border)] text-foreground hover:bg-[var(--ecode-surface-hover)]"
                  data-testid="button-explore-docs"
                >
                  Explore deployment docs
                </Button>
              </Link>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              {heroHighlights.map(({ icon: Icon, title, description }) => (
                <Card key={title} className="border-[var(--ecode-border)] bg-background/60 backdrop-blur">
                  <CardHeader className="pb-2">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ecode-accent)]/10 text-[var(--ecode-accent)]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <CardTitle className="mkt-h3 font-semibold">{title}</CardTitle>
                  </CardHeader>
                  <CardContent className="mkt-body text-muted-foreground">{description}</CardContent>
                </Card>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="rounded-3xl border border-[var(--ecode-border)] bg-gradient-to-br from-[var(--ecode-accent)]/10 to-transparent p-4 shadow-2xl backdrop-blur">
              <div className="space-y-4 rounded-2xl border border-[var(--ecode-border)] bg-[var(--ecode-surface-secondary)] p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Deployment</p>
                    <p className="text-[15px] font-semibold">marketing-site@main</p>
                  </div>
                  <Badge className="border-[var(--ecode-accent)]/30 bg-[var(--ecode-accent)]/15 text-[var(--ecode-accent)]">
                    Live
                  </Badge>
                </div>
                <div className="grid gap-4 rounded-xl border border-[var(--ecode-border)] bg-background/40 p-4">
                  <div className="flex items-center justify-between text-[13px] text-muted-foreground">
                    <span>Requests / min</span>
                    <span className="font-medium text-foreground">4.2k</span>
                  </div>
                  <div className="h-16 rounded-lg bg-gradient-to-r from-[var(--ecode-accent)]/60 via-[var(--ecode-secondary-accent)]/40 to-transparent" />
                  <div className="flex items-center justify-between text-[13px] text-muted-foreground">
                    <span>Latency p95</span>
                    <span className="font-medium text-foreground">112 ms</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--ecode-border)]">
                    <div className="h-full w-3/5 rounded-full bg-[var(--ecode-accent)]" />
                  </div>
                </div>
                <div className="grid gap-3 text-[13px] text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[var(--ecode-accent)]" /> Autoscale
                    </span>
                    <span>Enabled</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-[var(--ecode-accent)]" /> TLS
                    </span>
                    <span>Issued</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-[var(--ecode-secondary-accent)]" /> Backups
                    </span>
                    <span>Nightly</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-12 left-10 hidden w-48 rounded-2xl border border-[var(--ecode-border)] bg-[var(--ecode-surface-secondary)] p-4 text-[13px] text-foreground shadow-xl lg:block">
              <p className="font-semibold">Production is live</p>
              <p className="mt-2 text-muted-foreground">
                Autoscaling ready • SSL issued • Requests streaming in real time
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Deployment modes */}
      <section className="px-6 py-24 lg:px-10">
        <div className="mx-auto max-w-6xl text-center">
          <h2 className="mkt-h2 font-semibold tracking-tight">
            Built for teams that refuse to compromise on speed or reliability
          </h2>
          <p className="mt-4 mkt-body text-muted-foreground">
            The exact workflows you saw inside the workspace deployment tab—now available to every project in your
            organization with a consistent, secure experience.
          </p>
        </div>
        <div className="mx-auto mt-16 grid max-w-6xl gap-8 lg:grid-cols-3">
          {deploymentModes.map(({ icon: Icon, label, description, metrics }) => (
            <Card key={label} className="h-full border-[var(--ecode-border)]">
              <CardHeader>
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--ecode-accent)]/10 text-[var(--ecode-accent)]">
                  <Icon className="h-6 w-6" />
                </div>
                <CardTitle className="mkt-h3 font-semibold">{label}</CardTitle>
                <p className="text-muted-foreground">{description}</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-[13px] text-muted-foreground">
                  {metrics.map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[var(--ecode-accent)]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Reliability strip */}
      <section className="border-y border-[var(--ecode-border)] bg-[var(--ecode-surface)]/40 px-6 py-24 lg:px-10">
        <div className="mx-auto max-w-6xl text-center">
          <h2 className="mkt-h2 font-semibold tracking-tight">What you actually get when you press publish</h2>
          <p className="mt-4 mkt-body text-muted-foreground">
            Each deployment inherits the same automation and observability the E-Code team relies on for its own
            production services.
          </p>
        </div>
        <div className="mx-auto mt-12 grid max-w-4xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {reliabilityHighlights.map(({ value, label }) => (
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
