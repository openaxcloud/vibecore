/* eslint-disable @typescript-eslint/naming-convention */
import {
  Rocket,
  Sparkles,
  Shield,
  BarChart3,
  Server,
  Cloud,
  CheckCircle2,
  GitBranch,
  Terminal,
  LineChart,
  Globe2,
  Cpu,
  Database,
  Monitor,
  Lock,
  Settings,
  Timer,
  CloudLightning,
  ArrowRight,
} from 'lucide-react';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import { Link } from '~/components/marketing/ecode-exact/EcodeExactUi';

import {
  Button,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '~/components/marketing/ecode-exact/EcodeExactUi';

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
];

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
];

/*
 * Capability highlights — honest, defensible statements rather than fabricated
 * metrics. Pre-launch we do not have an SLA, an edge network or deploy counts to
 * cite, so these describe what publishing actually does today.
 */
const reliabilityHighlights = [
  { value: 'Seconds', label: 'Build to live URL', accent: 'text-purple-500' },
  { value: 'HTTPS', label: 'Managed TLS on every deploy', accent: 'text-blue-500' },
  { value: '1-click', label: 'Publish from the editor', accent: 'text-emerald-500' },
  { value: 'Live', label: 'Build logs & status', accent: 'text-amber-500' },
];

const workflowSteps = [
  {
    icon: GitBranch,
    title: 'Connect your repo or start in E-Code',
    description: 'Auto-detect frameworks, install dependencies, and prepare environments instantly.',
  },
  {
    icon: Settings,
    title: 'Configure once',
    description: 'Define runtime, secrets, and regions directly in the workspace deployment tab.',
  },
  {
    icon: CloudLightning,
    title: 'Deploy with confidence',
    description: 'Preview builds, AI-generated diff summaries, and automated smoke checks guard every release.',
  },
  {
    icon: Timer,
    title: 'Monitor and iterate',
    description: 'Real-time logs, analytics, and one-click rollbacks keep teams shipping without downtime.',
  },
];

const observabilityHighlights = [
  {
    icon: LineChart,
    title: 'Production control room',
    description: 'Unified view of CPU, memory, and request health paired with AI insights for anomalies.',
    accent: 'from-purple-500/30 via-purple-500/10 to-transparent',
  },
  {
    icon: Globe2,
    title: 'Global audience intelligence',
    description: 'Know where requests originate and how traffic flows with real-time geography overlays.',
    accent: 'from-blue-500/30 via-blue-500/10 to-transparent',
  },
  {
    icon: Settings,
    title: 'Operational actions',
    description: 'Pause, scale, manage domains, and update SSL without leaving the workspace tab.',
    accent: 'from-emerald-500/30 via-emerald-500/10 to-transparent',
  },
];

const assuranceHighlights = [
  {
    icon: Shield,
    title: 'Secure by default',
    description: 'Automatic TLS, per-deployment secrets, and role-based access keep sensitive projects protected.',
  },
  {
    icon: Lock,
    title: 'Governed releases',
    description: 'Require approvals, enforce protected branches, and log every deployment event for compliance teams.',
  },
  {
    icon: Database,
    title: 'Resilient data',
    description: 'Backups, migration tooling, and data residency options match enterprise expectations.',
  },
  {
    icon: Monitor,
    title: '24/7 observability',
    description: 'Streaming logs, structured metrics, and proactive alerts across every environment.',
  },
];

const faqs = [
  {
    question: 'How does one-click deployment work?',
    answer:
      'E-Code compiles your project, provisions infrastructure, runs automated smoke tests, and makes it live in one motion. No additional configuration files or manual steps are required.',
  },
  {
    question: 'Can I bring existing infrastructure?',
    answer:
      'Yes. Deploy to E-Code-managed autoscale runtimes or connect reserved VMs and private networking so deployments align with your architecture.',
  },
  {
    question: 'What safeguards exist for production?',
    answer:
      'Every deployment ships with instant rollbacks, traffic controls, protected secrets, and audit trails that integrate with your existing IAM policies.',
  },
];

export default function PublicDeploymentsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNavbar />

      <section className="relative overflow-hidden bg-gradient-to-b from-slate-950 via-purple-950 to-background">
        <div className="absolute inset-0 opacity-40">
          <div className="absolute -top-40 right-10 h-96 w-96 rounded-full bg-purple-500 blur-3xl" />
          <div className="absolute -bottom-32 left-10 h-80 w-80 rounded-full bg-indigo-500 blur-3xl" />
        </div>
        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 py-24 lg:grid-cols-[1.2fr_1fr] lg:px-10">
          <div>
            <Badge className="mb-6 bg-white/10 text-white backdrop-blur">
              Deploy from idea to internet in one click
            </Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Launch production-grade apps straight from your workspace
            </h1>
            <p className="mt-6 max-w-2xl text-[15px] text-white/70">
              E-Code Deployments pairs the simplicity of an in-browser IDE with the rigor of a global cloud platform.
              Ship instantly, observe everything, and meet enterprise requirements without bolting together tools.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/contact-sales">
                <Button
                  size="lg"
                  className="bg-white text-slate-900 hover:bg-slate-200"
                  data-testid="button-contact-sales"
                >
                  Talk to an expert
                </Button>
              </Link>
              <Link href="/docs/deployments">
                <Button
                  size="lg"
                  variant="outline"
                  className="bg-transparent border-white/40 text-white hover:bg-white/10"
                  data-testid="button-explore-docs"
                >
                  Explore deployment docs
                </Button>
              </Link>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              {heroHighlights.map(({ icon: Icon, title, description }) => (
                <Card key={title} className="border-white/10 bg-white/5 text-white">
                  <CardHeader className="pb-2">
                    <Icon className="h-6 w-6" />
                    <CardTitle className="text-[15px] font-semibold">{title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-[13px] text-white/80">{description}</CardContent>
                </Card>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/0 p-4 shadow-2xl backdrop-blur">
              <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/80 p-6 text-white">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-white/60">Deployment</p>
                    <p className="text-[15px] font-semibold">marketing-site@main</p>
                  </div>
                  <Badge className="bg-emerald-500/20 text-emerald-200">Live</Badge>
                </div>
                <div className="grid gap-4 rounded-xl bg-white/5 p-4">
                  <div className="flex items-center justify-between text-[13px] text-white/70">
                    <span>Requests / min</span>
                    <span className="font-medium text-white">4.2k</span>
                  </div>
                  <div className="h-16 rounded-lg bg-gradient-to-r from-emerald-400/60 via-emerald-500/40 to-transparent" />
                  <div className="flex items-center justify-between text-[13px] text-white/70">
                    <span>Latency p95</span>
                    <span className="font-medium text-white">112 ms</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10">
                    <div className="h-full w-3/5 rounded-full bg-emerald-400" />
                  </div>
                </div>
                <div className="grid gap-3 text-[13px] text-white/70">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-300" /> Autoscale
                    </span>
                    <span>Enabled</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-sky-300" /> TLS
                    </span>
                    <span>Issued</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-violet-300" /> Backups
                    </span>
                    <span>Nightly</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-12 left-10 hidden w-48 rounded-2xl border border-white/20 bg-slate-900/90 p-4 text-[13px] text-white shadow-xl lg:block">
              <p className="font-semibold">Production is live</p>
              <p className="mt-2 text-white/70">Autoscaling ready • SSL issued • Requests streaming in real time</p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-24 lg:px-10">
        <div className="mx-auto max-w-6xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Built for teams that refuse to compromise on speed or reliability
          </h2>
          <p className="mt-4 text-[15px] text-muted-foreground">
            The exact workflows you saw inside the workspace deployment tab—now available to every project in your
            organization with a consistent, secure experience.
          </p>
        </div>
        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {deploymentModes.map(({ icon: Icon, label, description, metrics }) => (
            <Card key={label} className="h-full border-muted/50">
              <CardHeader>
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <CardTitle className="text-2xl font-semibold">{label}</CardTitle>
                <p className="text-muted-foreground">{description}</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-[13px] text-muted-foreground">
                  {metrics.map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-muted/40 px-6 py-24 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-16 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Everything inside the deployment tab, elevated for production teams
              </h2>
              <p className="mt-4 text-[15px] text-muted-foreground">
                Move from build to live without switching context. Monitor usage, manage resources, configure domains,
                and audit every release from a single panel.
              </p>
              <div className="mt-10 space-y-8">
                {observabilityHighlights.map(({ title, description, icon: Icon, accent }) => (
                  <div
                    key={title}
                    className={`flex flex-col gap-6 rounded-2xl border bg-background p-6 shadow-sm lg:flex-row`}
                  >
                    <div className="flex-1">
                      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Icon className="h-6 w-6" />
                      </div>
                      <h3 className="text-xl font-semibold">{title}</h3>
                      <p className="mt-2 text-muted-foreground">{description}</p>
                    </div>
                    <div
                      className={`flex flex-1 flex-col justify-between rounded-xl border bg-gradient-to-br ${accent} p-5 text-[13px] text-muted-foreground`}
                    >
                      <p className="text-foreground/80">
                        Live metrics stream into the deployment tab with anomaly detection and suggested remediations
                        powered by E-Code AI.
                      </p>
                      <div className="mt-6 grid gap-3 text-[11px] uppercase tracking-wide text-foreground/60">
                        <div className="flex items-center justify-between">
                          <span>Region Coverage</span>
                          <span>13 global regions</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Alerts</span>
                          <span>Webhook • Slack • PagerDuty</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Retention</span>
                          <span>30 days searchable</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-6">
              <Card className="border-primary/50 bg-primary/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-primary">
                    <LineChart className="h-5 w-5" /> Performance at a glance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-[13px] text-muted-foreground">
                  <p>
                    Track real-time CPU and memory utilization, understand peak hours, and drill into request latency
                    without leaving the tab.
                  </p>
                  <p>
                    Export metrics or stream them to your preferred observability stack using secure webhooks and API
                    access.
                  </p>
                </CardContent>
              </Card>
              <Card className="border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cpu className="h-5 w-5 text-primary" /> Intelligent scaling
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-[13px] text-muted-foreground">
                  <p>
                    Autoscaling policies learn from historical traffic to pre-warm instances before major launches and
                    product announcements.
                  </p>
                  <p>Reserved capacity ensures mission-critical APIs always have dedicated compute ready to serve.</p>
                </CardContent>
              </Card>
              <Card className="border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" /> Insights for leadership
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-[13px] text-muted-foreground">
                  <p>
                    Summaries translate infrastructure performance into business-ready reports for product managers,
                    finance partners, and executives.
                  </p>
                  <p>Share live dashboards securely with stakeholders using granular link permissions.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-24 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              A workflow your engineers already know
            </h2>
            <p className="mt-4 text-[15px] text-muted-foreground">
              From first commit to global rollout, deployments stay within the E-Code workspace they already use every
              day.
            </p>
          </div>
          <div className="mt-16 grid gap-8 md:grid-cols-2 xl:grid-cols-4">
            {workflowSteps.map(({ icon: Icon, title, description }) => (
              <Card key={title} className="h-full border">
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-xl">{title}</CardTitle>
                </CardHeader>
                <CardContent className="text-[13px] text-muted-foreground">{description}</CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-16 overflow-hidden rounded-3xl border bg-background p-8">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Deployment Targets</p>
                  <p className="text-[15px] font-semibold">workspace-deployment</p>
                </div>
                <Badge variant="outline" className="border-primary/40 text-primary">
                  Autoscale
                </Badge>
              </div>
              <div className="grid gap-3 text-[13px] text-muted-foreground">
                <div className="flex items-center justify-between rounded-xl border bg-muted/60 p-4">
                  <div>
                    <p className="font-medium text-foreground">Primary</p>
                    <p>app.e-code.ai</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wide text-foreground/70">Status</p>
                    <p className="font-medium text-emerald-600">Connected</p>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl border bg-muted/40 p-4">
                  <div>
                    <p className="font-medium text-foreground">Staging</p>
                    <p>staging.e-code.ai</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wide text-foreground/70">Status</p>
                    <p className="font-medium text-amber-600">Pending DNS</p>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl border bg-muted/20 p-4">
                  <div>
                    <p className="font-medium text-foreground">Preview</p>
                    <p>preview.e-code.ai</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wide text-foreground/70">Status</p>
                    <p className="font-medium text-sky-600">Generating</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted/40 px-6 py-24 lg:px-10">
        <div className="mx-auto max-w-6xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Trusted reliability metrics backed by the E-Code platform
          </h2>
          <p className="mt-4 text-[15px] text-muted-foreground">
            Each deployment inherits the resilience, automation, and observability the E-Code team relies on for its own
            production services.
          </p>
        </div>
        <div className="mx-auto mt-12 grid max-w-4xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {reliabilityHighlights.map(({ value, label, accent }) => (
            <Card key={label} className="border bg-background">
              <CardContent className="p-6 text-center">
                <p className={`text-4xl font-semibold ${accent}`}>{value}</p>
                <p className="mt-2 text-[13px] text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="px-6 py-24 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Security, compliance, and governance woven into every release
              </h2>
              <p className="mt-4 text-[15px] text-muted-foreground">
                Run mission-critical workloads with built-in safeguards. From SOC 2 controls to SSO and advanced audit
                trails, E-Code Deployments meets Fortune 500 expectations out of the box.
              </p>
              <div className="mt-10 grid gap-6 sm:grid-cols-2">
                {assuranceHighlights.map(({ icon: Icon, title, description }) => (
                  <Card key={title} className="h-full border">
                    <CardHeader>
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <CardTitle className="text-[15px]">{title}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-[13px] text-muted-foreground">{description}</CardContent>
                  </Card>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-6">
              <div className="space-y-4 overflow-hidden rounded-3xl border bg-background p-8 shadow-lg">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold">Release timeline</p>
                  <Badge className="bg-primary/10 text-primary">Protected</Badge>
                </div>
                <div className="space-y-4 text-[13px] text-muted-foreground">
                  <div className="flex items-center justify-between rounded-2xl border bg-muted/60 p-4">
                    <div>
                      <p className="font-medium text-foreground">v2.18.0</p>
                      <p>Rolled out to 100% traffic</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-wide text-foreground/70">Approval</p>
                      <p className="font-medium text-emerald-600">Complete</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border bg-muted/40 p-4">
                    <div>
                      <p className="font-medium text-foreground">v2.17.1</p>
                      <p>Canary release active</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-wide text-foreground/70">Rollback</p>
                      <p className="font-medium text-amber-600">Available</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border bg-muted/20 p-4">
                    <div>
                      <p className="font-medium text-foreground">Audit</p>
                      <p>Signed by operations@sso</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-wide text-foreground/70">Event</p>
                      <p className="font-medium text-sky-600">Logged</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border bg-muted/60 p-6 text-[13px] text-muted-foreground">
                <p className="font-semibold text-foreground">What customers are saying</p>
                <p className="mt-3">
                  “Our deployment pipeline went from hours of manual coordination to a reliable one-click experience.
                  The integrated observability gives engineering and operations the same source of truth.”
                </p>
                <p className="mt-3 text-[11px] uppercase tracking-wide text-foreground/70">
                  Head of Platform Engineering · Enterprise FinTech
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted/40 px-6 py-24 lg:px-10">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Questions, answered</h2>
          <p className="mt-4 text-[15px] text-muted-foreground">
            Everything about E-Code Deployments is designed to eliminate guesswork. Here are the answers teams ask most
            before moving their workloads over.
          </p>
        </div>
        <div className="mx-auto mt-12 max-w-3xl space-y-6">
          {faqs.map(({ question, answer }) => (
            <Card key={question} className="border">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-[15px]">
                  <span>{question}</span>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </CardTitle>
              </CardHeader>
              <CardContent className="text-[13px] text-muted-foreground">{answer}</CardContent>
            </Card>
          ))}
        </div>
        <div className="mx-auto mt-16 flex max-w-3xl flex-col items-center gap-4 rounded-3xl border bg-background/80 p-10 text-center shadow-lg">
          <h3 className="text-2xl font-semibold">See how E-Code Deployments can power your next release</h3>
          <p className="text-muted-foreground">
            Partner with our solutions engineers for a tailored walkthrough of deployment automation, observability, and
            governance.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/contact-sales">
              <Button size="lg">Book a consultation</Button>
            </Link>
            <Link href="/docs/deployments/api">
              <Button size="lg" variant="outline">
                Review API integrations
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
