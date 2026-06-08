/* eslint-disable @typescript-eslint/naming-convention */
import { Rocket, Users, Trophy, CheckCircle2, Zap, Star, Briefcase, Sparkles } from 'lucide-react';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import { Link, Button, Badge, Card, CardContent } from '~/components/marketing/ecode-exact/EcodeExactUi';

const highlights = [
  {
    icon: Rocket,
    title: 'Launch in minutes',
    description: 'Post opportunities with rich briefs, timelines, and payout milestones in a single flow.',
  },
  {
    icon: Users,
    title: 'Verified experts',
    description: 'Match with vetted builders across AI, full-stack, data, and design disciplines.',
  },
  {
    icon: Trophy,
    title: 'Performance driven',
    description: 'Track submissions, reviews, and payouts with transparent progress dashboards.',
  },
];

const categories = [
  'AI & Agentic apps',
  'Full-stack products',
  'Dev tool integrations',
  'Platform migrations',
  'Education content',
  'Design systems',
];

const workflow = [
  {
    step: '01',
    title: 'Create a bounty',
    copy: 'Define the scope, attach requirements, and choose automated review criteria or manual approvals.',
  },
  {
    step: '02',
    title: 'Recruit the right talent',
    copy: 'Invite your community or open it to the global E-Code developer marketplace with skill filters and NDA gating.',
  },
  {
    step: '03',
    title: 'Review & ship',
    copy: 'Collaborate inside live sandboxes, request revisions, and release staged payouts when quality bars are met.',
  },
];

const testimonials = [
  {
    quote:
      'E-Code bounties helped us ship a production-ready AI onboarding flow in under two weeks. The collaboration tools kept everyone aligned.',
    name: 'Maya Patel',
    role: 'Head of Product, Lumen Labs',
  },
  {
    quote:
      'We unlocked a global pool of specialists. Payment automation and review checklists meant zero back-and-forth with finance.',
    name: 'Diego Alvarez',
    role: 'Engineering Manager, Horizon DAO',
  },
];

export default function MarketingBounties() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNavbar />

      <main>
        <section className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-blue-600 text-white">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top,_#ffffff55,_transparent_60%)]" />
          <div className="relative mx-auto flex max-w-6xl flex-col gap-12 px-4 py-24 lg:flex-row lg:items-center">
            <div className="flex-1 space-y-6">
              <Badge className="bg-white/10 text-white hover:bg-white/20">Developer marketplace</Badge>
              <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-6xl">
                Ship features faster with outcome-based bounties
              </h1>
              <p className="max-w-2xl text-[15px] text-white/80 md:text-xl">
                Publish challenges, collaborate with expert builders, and pay on delivery. E-Code handles recruiting,
                secure review environments, and automated payouts.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href="/register">
                  <Button size="lg" className="bg-white text-purple-700 hover:bg-white/90">
                    Launch your first bounty
                  </Button>
                </Link>
                <Link href="/contact-sales">
                  <Button
                    size="lg"
                    variant="outline"
                    className="bg-transparent border-white/40 text-white hover:bg-white/10"
                  >
                    Talk to our team
                  </Button>
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-6 text-[13px] text-white/70">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Global payouts managed
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Review sandboxes included
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  SOC 2 aligned processes
                </div>
              </div>
            </div>
            <Card className="flex-1 border-white/20 bg-white/10 backdrop-blur">
              <CardContent className="space-y-6 p-8 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] uppercase tracking-wide text-white/70">Active bounties</p>
                    <p className="text-4xl font-bold">324</p>
                  </div>
                  <Trophy className="h-12 w-12 text-yellow-300" />
                </div>
                <div className="grid grid-cols-2 gap-6 text-[13px]">
                  <div>
                    <p className="text-white/70">Avg. payout</p>
                    <p className="text-2xl font-semibold">$3.4k</p>
                  </div>
                  <div>
                    <p className="text-white/70">Time to hire</p>
                    <p className="text-2xl font-semibold">48 hrs</p>
                  </div>
                  <div>
                    <p className="text-white/70">Enterprise teams</p>
                    <p className="text-2xl font-semibold">180+</p>
                  </div>
                  <div>
                    <p className="text-white/70">Completed builds</p>
                    <p className="text-2xl font-semibold">5.2k</p>
                  </div>
                </div>
                <div className="rounded-lg bg-black/20 p-4 text-[13px] leading-relaxed">
                  "We cut our feature backlog in half. The managed review workflow keeps velocity high without
                  sacrificing quality."
                  <div className="mt-3 font-semibold">— Anna Larson, CTO @ Circuit Labs</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mx-auto max-w-6xl space-y-12 px-4 py-20">
          <div className="space-y-4 text-center">
            <h2 className="text-3xl font-bold md:text-4xl">Designed for product and platform teams</h2>
            <p className="text-[15px] text-muted-foreground">
              Empower internal teams with curated external talent while maintaining governance, security, and
              predictable delivery.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {highlights.map(({ icon: Icon, title, description }) => (
              <div key={title} className="space-y-3 rounded-2xl border bg-card/80 p-6 shadow-sm">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-950/50 dark:text-purple-300">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold">{title}</h3>
                <p className="text-[13px] text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-muted/30 py-20">
          <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 lg:flex-row">
            <div className="flex-1 space-y-4">
              <Badge
                variant="secondary"
                className="bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-200"
              >
                Trusted workflow
              </Badge>
              <h2 className="text-3xl font-bold md:text-4xl">A managed pipeline from idea to payout</h2>
              <p className="text-[15px] text-muted-foreground">
                Every bounty includes secure workspaces, automated review flows, and programmable payouts. Keep
                stakeholders aligned with audit trails and status snapshots.
              </p>
              <ul className="space-y-3 text-[13px] leading-relaxed text-muted-foreground">
                <li className="flex items-start gap-3">
                  <Sparkles className="mt-1 h-5 w-5 text-purple-500" />
                  Ready-to-use templates for AI features, integrations, and growth experiments.
                </li>
                <li className="flex items-start gap-3">
                  <Briefcase className="mt-1 h-5 w-5 text-purple-500" />
                  Built-in NDAs, contributor licensing, and compliance-friendly reporting.
                </li>
                <li className="flex items-start gap-3">
                  <Zap className="mt-1 h-5 w-5 text-purple-500" />
                  Automatic quality checks with preview deployments and teammate sign-off gates.
                </li>
              </ul>
            </div>
            <div className="flex-1 space-y-6">
              {workflow.map(({ step, title, copy }) => (
                <div key={step} className="relative overflow-hidden rounded-2xl border bg-background p-6 shadow-sm">
                  <div className="absolute -right-10 top-1/2 h-32 w-32 -translate-y-1/2 rounded-full bg-purple-500/10" />
                  <div className="text-[13px] font-semibold text-purple-500">{step}</div>
                  <h3 className="mt-2 text-xl font-semibold">{title}</h3>
                  <p className="mt-3 text-[13px] text-muted-foreground">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-6">
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                High-signal contributors
              </Badge>
              <h2 className="text-3xl font-bold md:text-4xl">Curate bounties across every product surface</h2>
              <p className="text-[15px] text-muted-foreground">
                Filter by stack, experience level, location, or community reputation. Our matching engine surfaces the
                best builders for your scope.
              </p>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <Badge key={category} variant="outline" className="rounded-full border-dashed">
                    {category}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="space-y-6">
              {testimonials.map(({ quote, name, role }) => (
                <div key={name} className="rounded-2xl border bg-card p-6 shadow-sm">
                  <Star className="h-6 w-6 text-yellow-500" />
                  <p className="mt-4 text-base leading-relaxed text-muted-foreground">“{quote}”</p>
                  <div className="mt-4 text-[13px] font-semibold text-foreground">{name}</div>
                  <div className="text-[13px] text-muted-foreground">{role}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-foreground py-20 text-background">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 text-center">
            <h2 className="text-3xl font-bold md:text-4xl">Ready to supercharge your roadmap?</h2>
            <p className="text-[15px] text-background/80 md:text-xl">
              Spin up a bounty, invite your team, and start reviewing submissions in minutes.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/register">
                <Button size="lg" variant="secondary" className="bg-background text-foreground hover:bg-background/90">
                  Create an account
                </Button>
              </Link>
              <Link href="/contact-sales">
                <Button
                  size="lg"
                  variant="outline"
                  className="bg-transparent border-white text-white hover:bg-white/10"
                >
                  Book a demo
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
