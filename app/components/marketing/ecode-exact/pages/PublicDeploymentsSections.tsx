/* eslint-disable @typescript-eslint/naming-convention */
/*
 * Below-the-fold sections for the public /marketing/deployments page.
 *
 * Split out of PublicDeploymentsPage so it can be React.lazy()-loaded: the hero
 * and the first capability grid paint immediately while this heavier, mostly
 * decorative markup (observability panel, workflow, assurance grid, FAQ + CTA)
 * is code-split into a separate chunk and streamed in just after first paint.
 *
 * Theme: E-Code orange (--ecode-accent #F26207 / --ecode-secondary-accent),
 * dark bolt-elements surfaces, IBM Plex via the global marketing scope. No
 * fabricated metrics — copy stays honest (no SLA %, no deploy counts).
 */
import {
  Activity,
  ArrowRight,
  BarChart3,
  CloudLightning,
  Cpu,
  Database,
  GitBranch,
  Globe2,
  LineChart,
  Lock,
  Monitor,
  Settings,
  Shield,
  Timer,
} from 'lucide-react';
import { memo } from 'react';
import { SiGithub, SiGitlab, SiSlack, SiPagerduty } from 'react-icons/si';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Link,
} from '~/components/marketing/ecode-exact/EcodeExactUi';

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
] as const;

const observabilityHighlights = [
  {
    icon: LineChart,
    title: 'Production control room',
    description: 'Unified view of CPU, memory, and request health paired with AI insights for anomalies.',
  },
  {
    icon: Globe2,
    title: 'Global audience intelligence',
    description: 'Know where requests originate and how traffic flows with real-time geography overlays.',
  },
  {
    icon: Settings,
    title: 'Operational actions',
    description: 'Pause, scale, manage domains, and update SSL without leaving the workspace tab.',
  },
] as const;

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
    title: 'Continuous observability',
    description: 'Streaming logs, structured metrics, and proactive alerts across every environment.',
  },
] as const;

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
] as const;

function PublicDeploymentsSectionsImpl() {
  return (
    <>
      {/* Observability */}
      <section className="border-t border-[var(--ecode-border)] bg-[var(--ecode-surface)]/40 px-6 py-24 lg:px-10">
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
              <div className="mt-10 space-y-6">
                {observabilityHighlights.map(({ title, description, icon: Icon }) => (
                  <div
                    key={title}
                    className="flex flex-col gap-6 rounded-2xl border border-[var(--ecode-border)] bg-background p-6 shadow-sm lg:flex-row"
                  >
                    <div className="flex-1">
                      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--ecode-accent)]/10 text-[var(--ecode-accent)]">
                        <Icon className="h-6 w-6" />
                      </div>
                      <h3 className="text-xl font-semibold">{title}</h3>
                      <p className="mt-2 text-muted-foreground">{description}</p>
                    </div>
                    <div className="flex flex-1 flex-col justify-between rounded-xl border border-[var(--ecode-border)] bg-gradient-to-br from-[var(--ecode-accent)]/15 via-[var(--ecode-accent)]/5 to-transparent p-5 text-[13px] text-muted-foreground">
                      <p className="text-foreground/80">
                        Live metrics stream into the deployment tab with anomaly detection and suggested remediations
                        powered by E-Code AI.
                      </p>
                      <div className="mt-6 grid gap-3 text-[11px] uppercase tracking-wide text-foreground/60">
                        <div className="flex items-center justify-between">
                          <span>Logs</span>
                          <span className="text-foreground/80">Real-time streaming</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5">Alerts</span>
                          <span className="inline-flex items-center gap-2 text-foreground/80">
                            <SiSlack className="h-3.5 w-3.5" aria-hidden /> Slack
                            <SiPagerduty className="h-3.5 w-3.5" aria-hidden /> PagerDuty
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Export</span>
                          <span className="text-foreground/80">Webhook &amp; API</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-6">
              <Card className="border-[var(--ecode-accent)]/40 bg-[var(--ecode-accent)]/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-[var(--ecode-accent)]">
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
              <Card className="border-[var(--ecode-border)]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cpu className="h-5 w-5 text-[var(--ecode-accent)]" /> Intelligent scaling
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
              <Card className="border-[var(--ecode-border)]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-[var(--ecode-accent)]" /> Insights for leadership
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

      {/* Workflow */}
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
              <Card key={title} className="h-full border-[var(--ecode-border)]">
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--ecode-accent)]/10 text-[var(--ecode-accent)]">
                    <Icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-xl">{title}</CardTitle>
                </CardHeader>
                <CardContent className="text-[13px] text-muted-foreground">{description}</CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-16 overflow-hidden rounded-3xl border border-[var(--ecode-border)] bg-background p-8">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Deployment Targets</p>
                  <p className="text-[15px] font-semibold">workspace-deployment</p>
                </div>
                <Badge variant="outline" className="border-[var(--ecode-accent)]/40 text-[var(--ecode-accent)]">
                  Autoscale
                </Badge>
              </div>
              <div className="grid gap-3 text-[13px] text-muted-foreground">
                <div className="flex items-center justify-between rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)]/60 p-4">
                  <div>
                    <p className="font-medium text-foreground">Primary</p>
                    <p>app.e-code.ai</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wide text-foreground/70">Status</p>
                    <p className="font-medium text-[var(--ecode-accent)]">Connected</p>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)]/40 p-4">
                  <div>
                    <p className="font-medium text-foreground">Staging</p>
                    <p>staging.e-code.ai</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wide text-foreground/70">Status</p>
                    <p className="font-medium text-[var(--ecode-secondary-accent)]">Pending DNS</p>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)]/20 p-4">
                  <div>
                    <p className="font-medium text-foreground">Preview</p>
                    <p>preview.e-code.ai</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wide text-foreground/70">Status</p>
                    <p className="font-medium text-muted-foreground">Generating</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Assurance / governance */}
      <section className="px-6 py-24 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Security, compliance, and governance woven into every release
              </h2>
              <p className="mt-4 text-[15px] text-muted-foreground">
                Run mission-critical workloads with built-in safeguards. Per-deployment secrets, role-based access,
                protected branches, and audit logs give compliance teams the controls they expect.
              </p>
              <div className="mt-10 grid gap-6 sm:grid-cols-2">
                {assuranceHighlights.map(({ icon: Icon, title, description }) => (
                  <Card key={title} className="h-full border-[var(--ecode-border)]">
                    <CardHeader>
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ecode-accent)]/10 text-[var(--ecode-accent)]">
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
              <div className="space-y-4 overflow-hidden rounded-3xl border border-[var(--ecode-border)] bg-background p-8 shadow-lg">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold">Release timeline</p>
                  <Badge className="bg-[var(--ecode-accent)]/10 text-[var(--ecode-accent)]">Protected</Badge>
                </div>
                <div className="space-y-4 text-[13px] text-muted-foreground">
                  <div className="flex items-center justify-between rounded-2xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)]/60 p-4">
                    <div>
                      <p className="font-medium text-foreground">v2.18.0</p>
                      <p>Rolled out to 100% traffic</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-wide text-foreground/70">Approval</p>
                      <p className="font-medium text-[var(--ecode-accent)]">Complete</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)]/40 p-4">
                    <div>
                      <p className="font-medium text-foreground">v2.17.1</p>
                      <p>Canary release active</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-wide text-foreground/70">Rollback</p>
                      <p className="font-medium text-[var(--ecode-secondary-accent)]">Available</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)]/20 p-4">
                    <div>
                      <p className="font-medium text-foreground">Audit</p>
                      <p className="inline-flex items-center gap-1.5">
                        Signed via <SiGithub className="h-3.5 w-3.5" aria-hidden /> /{' '}
                        <SiGitlab className="h-3.5 w-3.5" aria-hidden /> SSO
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-wide text-foreground/70">Event</p>
                      <p className="font-medium text-[var(--ecode-accent)]">Logged</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)]/60 p-6 text-[13px] text-muted-foreground">
                <p className="inline-flex items-center gap-2 font-semibold text-foreground">
                  <Activity className="h-4 w-4 text-[var(--ecode-accent)]" /> Built on the same pipeline as E-Code
                </p>
                <p className="mt-3">
                  Every customer deployment runs through the identical build, smoke-test, and rollback path E-Code uses
                  to ship its own platform — so the workflow you publish with is the one we trust in production.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ + final CTA */}
      <section className="border-t border-[var(--ecode-border)] bg-[var(--ecode-surface)]/40 px-6 py-24 lg:px-10">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Questions, answered</h2>
          <p className="mt-4 text-[15px] text-muted-foreground">
            Everything about E-Code Deployments is designed to eliminate guesswork. Here are the answers teams ask most
            before moving their workloads over.
          </p>
        </div>
        <div className="mx-auto mt-12 max-w-3xl space-y-6">
          {faqs.map(({ question, answer }) => (
            <Card key={question} className="border-[var(--ecode-border)]">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-[15px]">
                  <span>{question}</span>
                  <ArrowRight className="h-5 w-5 text-[var(--ecode-accent)]" />
                </CardTitle>
              </CardHeader>
              <CardContent className="text-[13px] text-muted-foreground">{answer}</CardContent>
            </Card>
          ))}
        </div>
        <div className="mx-auto mt-16 flex max-w-3xl flex-col items-center gap-4 rounded-3xl border border-[var(--ecode-border)] bg-background/80 p-10 text-center shadow-lg">
          <h3 className="text-2xl font-semibold">See how E-Code Deployments can power your next release</h3>
          <p className="text-muted-foreground">
            Partner with our solutions engineers for a tailored walkthrough of deployment automation, observability, and
            governance.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/contact-sales">
              <Button size="lg" className="bg-[var(--ecode-accent)] text-white hover:bg-[var(--ecode-accent-hover)]">
                Book a consultation
              </Button>
            </Link>
            <Link href="/docs/deployments/api">
              <Button size="lg" variant="outline" className="border-[var(--ecode-border)]">
                Review API integrations
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

const PublicDeploymentsSections = memo(PublicDeploymentsSectionsImpl);
export default PublicDeploymentsSections;
