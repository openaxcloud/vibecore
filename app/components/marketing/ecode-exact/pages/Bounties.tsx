/* eslint-disable @typescript-eslint/naming-convention */
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardList,
  GitPullRequest,
  Globe2,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Rocket,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import type { AriaAttributes, ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { SiNodedotjs, SiOpenai, SiPython, SiReact, SiSupabase, SiTypescript } from 'react-icons/si';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import { Badge, Button, Link } from '~/components/marketing/ecode-exact/EcodeExactUi';
import {
  getMarketingExactPartnersBountiesCopy,
  type BountyHighlightId,
  type BountyPipelineId,
  type BountyStackId,
  type BountyWorkflowId,
} from '~/lib/i18n/catalogs/marketing-exact-partners-bounties';

type BountyIcon = ComponentType<{ className?: string; 'aria-hidden'?: AriaAttributes['aria-hidden'] }>;

const HIGHLIGHT_ICONS: Record<BountyHighlightId, BountyIcon> = {
  scope: ClipboardList,
  builders: Users,
  review: GitPullRequest,
};

const PIPELINE_ICONS: Record<BountyPipelineId, BountyIcon> = {
  templates: Boxes,
  sandboxes: ShieldCheck,
  acceptance: ListChecks,
};

const WORKFLOW_ICONS: Record<BountyWorkflowId, BountyIcon> = {
  create: ClipboardList,
  recruit: Megaphone,
  ship: Rocket,
};

const STACK_ICONS: Record<BountyStackId, BountyIcon> = {
  react: SiReact,
  typescript: SiTypescript,
  node: SiNodedotjs,
  python: SiPython,
  agents: SiOpenai,
  supabase: SiSupabase,
};

export default function MarketingBounties() {
  const { i18n } = useTranslation();
  const copy = getMarketingExactPartnersBountiesCopy(i18n.resolvedLanguage ?? i18n.language).exactBounties;
  const highlights = copy.highlights.items.map((item) => ({ ...item, icon: HIGHLIGHT_ICONS[item.id] }));
  const pipeline = copy.managed.pipeline.map((item) => ({ ...item, icon: PIPELINE_ICONS[item.id] }));
  const workflow = copy.managed.workflow.map((item) => ({ ...item, icon: WORKFLOW_ICONS[item.id] }));
  const stacks = copy.categories.stacks.map((item) => ({ ...item, icon: STACK_ICONS[item.id] }));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNavbar />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-transparent px-4 py-16 sm:py-20 md:py-24">
          <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-[#F26207]/10 blur-3xl" />
          <div className="relative mx-auto flex max-w-6xl flex-col gap-12 lg:flex-row lg:items-center">
            <div className="flex-1 space-y-6">
              <Badge variant="secondary" className="text-[11px] sm:text-[13px]">
                <Trophy className="mr-1 h-3 w-3 text-[var(--ecode-accent-text)]" />
                {copy.hero.badge}
              </Badge>
              <h1 className="mkt-h1 font-bold tracking-tight">
                {copy.hero.titleBefore} <span className="text-[var(--ecode-accent-text)]">{copy.hero.titleAccent}</span>
              </h1>
              <p className="mkt-lead max-w-2xl text-muted-foreground">{copy.hero.description}</p>
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                <Link href="/register">
                  <Button size="lg" className="min-h-[44px] w-full sm:w-auto">
                    {copy.hero.primary}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/contact-sales">
                  <Button size="lg" variant="outline" className="min-h-[44px] w-full sm:w-auto">
                    {copy.hero.secondary}
                  </Button>
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px] text-muted-foreground">
                {copy.hero.points.map((point) => (
                  <div key={point} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[var(--ecode-accent-text)]" />
                    {point}
                  </div>
                ))}
              </div>
            </div>

            {/* Real product capture: the IDE where bounty work happens */}
            <figure className="group relative flex-1">
              <div className="pointer-events-none absolute -inset-2 rounded-2xl bg-gradient-to-r from-[#F26207]/20 to-[#F99D25]/20 blur-2xl" />
              <div className="relative overflow-hidden rounded-xl bg-bolt-elements-background-depth-2 shadow-2xl ring-1 ring-bolt-elements-borderColor">
                <div className="flex items-center gap-2 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-2.5 sm:px-4">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#F26207]/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#F99D25]/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
                  <span className="ml-2 truncate text-[11px] font-medium text-muted-foreground sm:text-[13px]">
                    {copy.hero.windowLabel}
                  </span>
                </div>
                <img
                  src="/ecode-static/assets/product/ide.png"
                  alt={copy.hero.imageAlt}
                  width={1440}
                  height={900}
                  loading="lazy"
                  className="block h-auto w-full"
                  data-testid="img-bounties-ide"
                />
              </div>
              <figcaption className="mkt-small mt-3 flex items-start gap-2 px-1 text-muted-foreground">
                <LayoutDashboard className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[var(--ecode-accent-text)] sm:h-4 sm:w-4" />
                <span>{copy.hero.imageCaption}</span>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* Highlights */}
        <section className="mx-auto max-w-6xl space-y-10 px-4 py-16 sm:py-20">
          <div className="space-y-4 text-center">
            <h2 className="mkt-h2 font-bold">{copy.highlights.title}</h2>
            <p className="mkt-lead mx-auto max-w-2xl text-muted-foreground">{copy.highlights.description}</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {highlights.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="space-y-3 rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-bolt-elements-background-depth-3 text-[var(--ecode-accent-text)] ring-1 ring-[#F26207]/30">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mkt-h3 font-semibold">{title}</h3>
                <p className="mkt-body leading-relaxed text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Managed pipeline + workflow */}
        <section className="bg-bolt-elements-background-depth-2/40 py-16 sm:py-20">
          <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 lg:flex-row">
            <div className="flex-1 space-y-5">
              <Badge variant="secondary" className="text-[11px] sm:text-[13px]">
                <Sparkles className="mr-1 h-3 w-3 text-[var(--ecode-accent-text)]" />
                {copy.managed.badge}
              </Badge>
              <h2 className="mkt-h2 font-bold">{copy.managed.title}</h2>
              <p className="mkt-lead text-muted-foreground">{copy.managed.description}</p>
              <ul className="mkt-body space-y-4 leading-relaxed text-muted-foreground">
                {pipeline.map(({ id, icon: Icon, title, description }) => (
                  <li key={id} className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-bolt-elements-background-depth-3 text-[var(--ecode-accent-text)] ring-1 ring-[#F26207]/30">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block font-semibold text-foreground">{title}</span>
                      {description}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex-1 space-y-6">
              {workflow.map(({ id, icon: Icon, title, description }, index) => (
                <div
                  key={id}
                  className="relative overflow-hidden rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6 shadow-sm"
                >
                  <div className="pointer-events-none absolute -right-10 top-1/2 h-32 w-32 -translate-y-1/2 rounded-full bg-[#F26207]/10" />
                  <div className="relative flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#F26207] text-white shadow-sm">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-[13px] font-semibold text-[var(--ecode-accent-text)]">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <h3 className="mkt-h3 relative mt-3 font-semibold">{title}</h3>
                  <p className="mkt-body relative mt-2 leading-relaxed text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Categories + stacks */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div className="space-y-6">
              <Badge variant="secondary" className="text-[11px] sm:text-[13px]">
                <Globe2 className="mr-1 h-3 w-3 text-[var(--ecode-accent-text)]" />
                {copy.categories.badge}
              </Badge>
              <h2 className="mkt-h2 font-bold">{copy.categories.title}</h2>
              <p className="mkt-lead text-muted-foreground">{copy.categories.description}</p>
              <div className="flex flex-wrap gap-2">
                {copy.categories.items.map((category) => (
                  <Badge key={category} variant="outline" className="rounded-full border-dashed">
                    {category}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                {stacks.map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="inline-flex items-center gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-[13px] font-medium text-foreground"
                  >
                    <Icon className="h-4 w-4 text-[var(--ecode-accent-text)]" aria-hidden />
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Real product capture: the dashboard where projects & rewards are managed */}
            <figure className="group relative">
              <div className="pointer-events-none absolute -inset-2 rounded-2xl bg-gradient-to-l from-[#F26207]/15 to-[#F99D25]/15 blur-2xl" />
              <div className="relative overflow-hidden rounded-xl bg-bolt-elements-background-depth-2 shadow-2xl ring-1 ring-bolt-elements-borderColor">
                <div className="flex items-center gap-2 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-2.5 sm:px-4">
                  <Wallet className="h-3.5 w-3.5 text-[var(--ecode-accent-text)]" />
                  <span className="truncate text-[11px] font-medium text-muted-foreground sm:text-[13px]">
                    {copy.categories.windowLabel}
                  </span>
                </div>
                <img
                  src="/ecode-static/assets/product/dashboard.png"
                  alt={copy.categories.imageAlt}
                  width={1440}
                  height={900}
                  loading="lazy"
                  className="block h-auto w-full"
                  data-testid="img-bounties-dashboard"
                />
              </div>
              <figcaption className="mkt-small mt-3 flex items-start gap-2 px-1 text-muted-foreground">
                <LayoutDashboard className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[var(--ecode-accent-text)] sm:h-4 sm:w-4" />
                <span>{copy.categories.imageCaption}</span>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* CTA banner */}
        <section className="px-4 pb-16 sm:pb-20">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-[#F26207] to-[#F99D25] px-6 py-14 text-center text-white shadow-xl sm:px-12">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_#ffffff33,_transparent_60%)]" />
            <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-5">
              <Rocket className="h-10 w-10" />
              <h2 className="mkt-h2 font-bold">{copy.cta.title}</h2>
              <p className="mkt-lead text-white/90">{copy.cta.description}</p>
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                <Link href="/register">
                  <Button
                    size="lg"
                    className="min-h-[44px] w-full bg-white text-[var(--ecode-accent-text-on-light)] hover:bg-white/90 sm:w-auto"
                  >
                    {copy.cta.primary}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/dashboard">
                  <Button
                    size="lg"
                    variant="outline"
                    className="min-h-[44px] w-full border-white/50 bg-transparent text-white hover:bg-white/10 sm:w-auto"
                  >
                    {copy.cta.secondary}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
