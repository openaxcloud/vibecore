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
import { useTranslation } from 'react-i18next';
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
import { getPublicDeploymentsCopy } from '~/lib/i18n/catalogs/public-deployments';

const WORKFLOW_ICONS = [GitBranch, Settings, CloudLightning, Timer] as const;
const OBSERVABILITY_ICONS = [LineChart, Globe2, Settings] as const;
const ASSURANCE_ICONS = [Shield, Lock, Database, Monitor] as const;
const DEPLOYMENT_TARGET_ID = 'workspace-deployment';
const PRIMARY_DOMAIN = 'app.e-code.ai';
const STAGING_DOMAIN = 'staging.e-code.ai';
const PREVIEW_DOMAIN = 'preview.e-code.ai';
const CURRENT_VERSION = 'v2.18.0';
const PREVIOUS_VERSION = 'v2.17.1';
const SLACK_BRAND = 'Slack';
const PAGERDUTY_BRAND = 'PagerDuty';
const SSO_LABEL = 'SSO';

function PublicDeploymentsSectionsImpl() {
  const { i18n } = useTranslation();
  const copy = getPublicDeploymentsCopy(i18n.resolvedLanguage ?? i18n.language).sections;

  return (
    <>
      {/* Observability */}
      <section className="border-t border-[var(--ecode-border)] bg-[var(--ecode-surface)]/40 px-6 py-24 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-16 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{copy.observabilityTitle}</h2>
              <p className="mt-4 text-[15px] text-muted-foreground">{copy.observabilityDescription}</p>
              <div className="mt-10 space-y-6">
                {OBSERVABILITY_ICONS.map((Icon, index) => {
                  const highlight = copy.observabilityHighlights[index];

                  if (!highlight) {
                    return null;
                  }

                  return (
                    <div
                      key={highlight.title}
                      className="flex flex-col gap-6 rounded-2xl border border-[var(--ecode-border)] bg-background p-6 shadow-sm lg:flex-row"
                    >
                      <div className="flex-1">
                        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--ecode-accent)]/10 text-[var(--ecode-accent)]">
                          <Icon className="h-6 w-6" />
                        </div>
                        <h3 className="text-xl font-semibold">{highlight.title}</h3>
                        <p className="mt-2 text-muted-foreground">{highlight.description}</p>
                      </div>
                      <div className="flex flex-1 flex-col justify-between rounded-xl border border-[var(--ecode-border)] bg-gradient-to-br from-[var(--ecode-accent)]/15 via-[var(--ecode-accent)]/5 to-transparent p-5 text-[13px] text-muted-foreground">
                        <p className="text-foreground/80">{copy.liveMetricsDescription}</p>
                        <div className="mt-6 grid gap-3 text-[11px] uppercase tracking-wide text-foreground/60">
                          <div className="flex items-center justify-between">
                            <span>{copy.logs}</span>
                            <span className="text-foreground/80">{copy.realTimeStreaming}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1.5">{copy.alerts}</span>
                            <span className="inline-flex items-center gap-2 text-foreground/80">
                              <SiSlack className="h-3.5 w-3.5" aria-hidden /> {SLACK_BRAND}
                              <SiPagerduty className="h-3.5 w-3.5" aria-hidden /> {PAGERDUTY_BRAND}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>{copy.export}</span>
                            <span className="text-foreground/80">{copy.webhookAndApi}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col gap-6">
              <Card className="border-[var(--ecode-accent)]/40 bg-[var(--ecode-accent)]/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-[var(--ecode-accent)]">
                    <LineChart className="h-5 w-5" /> {copy.performanceTitle}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-[13px] text-muted-foreground">
                  {copy.performanceParagraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </CardContent>
              </Card>
              <Card className="border-[var(--ecode-border)]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cpu className="h-5 w-5 text-[var(--ecode-accent)]" /> {copy.scalingTitle}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-[13px] text-muted-foreground">
                  {copy.scalingParagraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </CardContent>
              </Card>
              <Card className="border-[var(--ecode-border)]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-[var(--ecode-accent)]" /> {copy.leadershipTitle}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-[13px] text-muted-foreground">
                  {copy.leadershipParagraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
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
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{copy.workflowTitle}</h2>
            <p className="mt-4 text-[15px] text-muted-foreground">{copy.workflowDescription}</p>
          </div>
          <div className="mt-16 grid gap-8 md:grid-cols-2 xl:grid-cols-4">
            {WORKFLOW_ICONS.map((Icon, index) => {
              const step = copy.workflowSteps[index];

              if (!step) {
                return null;
              }

              return (
                <Card key={step.title} className="h-full border-[var(--ecode-border)]">
                  <CardHeader>
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--ecode-accent)]/10 text-[var(--ecode-accent)]">
                      <Icon className="h-6 w-6" />
                    </div>
                    <CardTitle className="text-xl">{step.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-[13px] text-muted-foreground">{step.description}</CardContent>
                </Card>
              );
            })}
          </div>
          <div className="mt-16 overflow-hidden rounded-3xl border border-[var(--ecode-border)] bg-background p-8">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{copy.deploymentTargets}</p>
                  <p className="text-[15px] font-semibold">{DEPLOYMENT_TARGET_ID}</p>
                </div>
                <Badge variant="outline" className="border-[var(--ecode-accent)]/40 text-[var(--ecode-accent)]">
                  {copy.autoscale}
                </Badge>
              </div>
              <div className="grid gap-3 text-[13px] text-muted-foreground">
                <div className="flex items-center justify-between rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)]/60 p-4">
                  <div>
                    <p className="font-medium text-foreground">{copy.primary}</p>
                    <p>{PRIMARY_DOMAIN}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wide text-foreground/70">{copy.status}</p>
                    <p className="font-medium text-[var(--ecode-accent)]">{copy.connected}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)]/40 p-4">
                  <div>
                    <p className="font-medium text-foreground">{copy.staging}</p>
                    <p>{STAGING_DOMAIN}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wide text-foreground/70">{copy.status}</p>
                    <p className="font-medium text-[var(--ecode-secondary-accent)]">{copy.pendingDns}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)]/20 p-4">
                  <div>
                    <p className="font-medium text-foreground">{copy.preview}</p>
                    <p>{PREVIEW_DOMAIN}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wide text-foreground/70">{copy.status}</p>
                    <p className="font-medium text-muted-foreground">{copy.generating}</p>
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
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{copy.assuranceTitle}</h2>
              <p className="mt-4 text-[15px] text-muted-foreground">{copy.assuranceDescription}</p>
              <div className="mt-10 grid gap-6 sm:grid-cols-2">
                {ASSURANCE_ICONS.map((Icon, index) => {
                  const highlight = copy.assuranceHighlights[index];

                  if (!highlight) {
                    return null;
                  }

                  return (
                    <Card key={highlight.title} className="h-full border-[var(--ecode-border)]">
                      <CardHeader>
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ecode-accent)]/10 text-[var(--ecode-accent)]">
                          <Icon className="h-5 w-5" />
                        </div>
                        <CardTitle className="text-[15px]">{highlight.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-[13px] text-muted-foreground">{highlight.description}</CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col gap-6">
              <div className="space-y-4 overflow-hidden rounded-3xl border border-[var(--ecode-border)] bg-background p-8 shadow-lg">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold">{copy.releaseTimeline}</p>
                  <Badge className="bg-[var(--ecode-accent)]/10 text-[var(--ecode-accent)]">{copy.protected}</Badge>
                </div>
                <div className="space-y-4 text-[13px] text-muted-foreground">
                  <div className="flex items-center justify-between rounded-2xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)]/60 p-4">
                    <div>
                      <p className="font-medium text-foreground">{CURRENT_VERSION}</p>
                      <p>{copy.rolledOut}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-wide text-foreground/70">{copy.approval}</p>
                      <p className="font-medium text-[var(--ecode-accent)]">{copy.complete}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)]/40 p-4">
                    <div>
                      <p className="font-medium text-foreground">{PREVIOUS_VERSION}</p>
                      <p>{copy.canaryActive}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-wide text-foreground/70">{copy.rollback}</p>
                      <p className="font-medium text-[var(--ecode-secondary-accent)]">{copy.available}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)]/20 p-4">
                    <div>
                      <p className="font-medium text-foreground">{copy.audit}</p>
                      <p className="inline-flex items-center gap-1.5">
                        {copy.signedVia} <SiGithub className="h-3.5 w-3.5" aria-hidden /> /{' '}
                        <SiGitlab className="h-3.5 w-3.5" aria-hidden /> {SSO_LABEL}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-wide text-foreground/70">{copy.event}</p>
                      <p className="font-medium text-[var(--ecode-accent)]">{copy.logged}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)]/60 p-6 text-[13px] text-muted-foreground">
                <p className="inline-flex items-center gap-2 font-semibold text-foreground">
                  <Activity className="h-4 w-4 text-[var(--ecode-accent)]" /> {copy.pipelineTitle}
                </p>
                <p className="mt-3">{copy.pipelineDescription}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ + final CTA */}
      <section className="border-t border-[var(--ecode-border)] bg-[var(--ecode-surface)]/40 px-6 py-24 lg:px-10">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{copy.faqTitle}</h2>
          <p className="mt-4 text-[15px] text-muted-foreground">{copy.faqDescription}</p>
        </div>
        <div className="mx-auto mt-12 max-w-3xl space-y-6">
          {copy.faqs.map(({ question, answer }) => (
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
          <h3 className="text-2xl font-semibold">{copy.ctaTitle}</h3>
          <p className="text-muted-foreground">{copy.ctaDescription}</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/contact-sales">
              <Button size="lg" className="bg-[var(--vc-action-primary-strong)] text-white hover:brightness-90">
                {copy.bookConsultation}
              </Button>
            </Link>
            {/* /docs/deployments/api n'existe pas (splat 404) — /docs est le hub docs réel. */}
            <Link href="/docs">
              <Button size="lg" variant="outline" className="border-[var(--ecode-border)]">
                {copy.reviewApiIntegrations}
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
