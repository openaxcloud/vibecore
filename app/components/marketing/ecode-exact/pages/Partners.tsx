import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Building2,
  CheckCircle2,
  FileSignature,
  GraduationCap,
  Handshake,
  LifeBuoy,
  Megaphone,
  Plug,
  Rocket,
  TrendingUp,
} from 'lucide-react';
import {
  SiAnthropic,
  SiGithub,
  SiGitlab,
  SiNotion,
  SiOpenai,
  SiPostgresql,
  SiSlack,
  SiStripe,
  SiSupabase,
  SiVercel,
} from 'react-icons/si';
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
  Link,
} from '~/components/marketing/ecode-exact/EcodeExactUi';

const PRODUCT = '/ecode-static/assets/product';

export default function Partners() {
  const programs = [
    {
      icon: Plug,
      name: 'Technology Partners',
      description:
        'Integrate your platform, API, or developer tool with E-Code and reach teams building production apps with AI.',
      points: [
        'Co-built integrations & MCP connectors',
        'Listing in the E-Code connector catalog',
        'Joint launch & technical support',
      ],
    },
    {
      icon: Briefcase,
      name: 'Solutions Partners',
      description:
        'Consultancies and SIs delivering E-Code to enterprise customers, from migration to managed delivery.',
      points: [
        'Implementation enablement & certification',
        'Deal registration & revenue share',
        'Dedicated partner success manager',
      ],
    },
    {
      icon: Building2,
      name: 'Agency Partners',
      description:
        'Digital agencies and studios shipping client apps faster by building on E-Code as your delivery platform.',
      points: ['Agency dashboard & pooled seats', 'Co-marketing & referral rewards', 'Priority access to new features'],
    },
  ];

  const benefits = [
    {
      icon: TrendingUp,
      title: 'Grow Revenue',
      description: 'Earn referral commissions and revenue share on every customer you bring to E-Code.',
    },
    {
      icon: Megaphone,
      title: 'Go To Market Together',
      description: 'Co-marketing, case studies, and joint launches that put your brand in front of our audience.',
    },
    {
      icon: GraduationCap,
      title: 'Enablement & Training',
      description: 'Partner certification, technical workshops, and early access to product roadmaps.',
    },
    {
      icon: LifeBuoy,
      title: 'Dedicated Support',
      description: 'A named partner manager and a private support channel for your team and customers.',
    },
  ];

  /*
   * Real platforms E-Code connects to today via OAuth integrations and MCP
   * connectors — the surfaces technology partners build on.
   */
  const integrations = [
    { icon: SiGithub, label: 'GitHub' },
    { icon: SiGitlab, label: 'GitLab' },
    { icon: SiSlack, label: 'Slack' },
    { icon: SiOpenai, label: 'OpenAI' },
    { icon: SiAnthropic, label: 'Anthropic' },
    { icon: SiSupabase, label: 'Supabase' },
    { icon: SiPostgresql, label: 'Postgres' },
    { icon: SiVercel, label: 'Vercel' },
    { icon: SiStripe, label: 'Stripe' },
    { icon: SiNotion, label: 'Notion' },
  ];

  const steps = [
    { icon: FileSignature, title: 'Apply', description: 'Tell us about your business and the customers you serve.' },
    {
      icon: GraduationCap,
      title: 'Onboard',
      description: 'Complete enablement and get certified on the E-Code platform.',
    },
    {
      icon: Rocket,
      title: 'Launch',
      description: 'Go to market together with co-branded campaigns and joint sales.',
    },
    {
      icon: TrendingUp,
      title: 'Grow',
      description: 'Scale your practice with revenue share, referrals, and roadmap access.',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col overflow-x-clip" data-testid="page-partners">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="max-w-xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--ecode-border)] bg-surface-solid px-3 py-1 text-[13px] font-medium text-muted-foreground">
                  <Handshake className="h-4 w-4" style={{ color: 'var(--ecode-accent)' }} />
                  Partner Program
                </span>
                <h1 className="mt-5 mkt-h1 font-bold tracking-tight" data-testid="heading-partners">
                  Partner with E-Code
                </h1>
                <p className="mt-4 mkt-lead text-muted-foreground">
                  Build, sell, and deliver alongside the AI development platform teams use to ship production apps. Join
                  a program designed to grow your business.
                </p>
                <div className="mt-7 flex flex-col sm:flex-row gap-3">
                  <Link
                    to="/contact-sales"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md text-white font-medium hover:brightness-110 transition-all min-h-[44px]"
                    style={{ backgroundColor: 'var(--ecode-accent)' }}
                    data-testid="button-partners-hero-apply"
                  >
                    Become a Partner
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    to="/signup"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md border border-[var(--ecode-border)] bg-surface-solid text-foreground font-medium hover:bg-surface-hover-solid transition-all min-h-[44px]"
                    data-testid="button-partners-hero-signup"
                  >
                    Get started free
                  </Link>
                </div>
                <div className="mt-6">
                  <Badge variant="secondary" className="text-[13px] px-3 py-1">
                    Now accepting partner applications
                  </Badge>
                </div>
              </div>

              {/* Real product capture */}
              <div className="relative">
                <figure className="relative overflow-hidden rounded-xl border border-white/10 bg-slate-950 shadow-2xl">
                  <div className="flex items-center gap-2 border-b border-white/10 bg-slate-950/80 px-4 py-3">
                    <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                    <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                    <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                    <span className="ml-3 inline-flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1 text-[11px] font-medium text-white/60">
                      <Building2 className="h-3 w-3 text-[#F26207]" />
                      app.e-code.ai
                    </span>
                  </div>
                  <img
                    src={`${PRODUCT}/dashboard.png`}
                    alt="The E-Code workspace dashboard partners use to manage projects, seats, and deployments"
                    className="block w-full h-auto"
                    loading="eager"
                  />
                  <figcaption className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-2 text-[11px] text-white">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 backdrop-blur">
                      <BadgeCheck className="h-3.5 w-3.5 text-[#F99D25]" />
                      Real product, captured live
                    </span>
                  </figcaption>
                </figure>
                <div className="absolute -z-10 -top-10 -right-10 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
                <div className="absolute -z-10 -bottom-10 -left-10 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
              </div>
            </div>
          </div>
        </section>

        {/* Partner Programs */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="mkt-h2 font-bold text-center mb-4">Partner Programs</h2>
            <p className="mkt-body text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
              Whatever you build or whoever you serve, there is an E-Code program built for you.
            </p>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {programs.map((program) => {
                const Icon = program.icon;
                return (
                  <Card key={program.name} className="flex flex-col">
                    <CardHeader>
                      <span
                        className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg text-white"
                        style={{ backgroundColor: 'var(--ecode-accent)' }}
                      >
                        <Icon className="h-6 w-6" />
                      </span>
                      <CardTitle>{program.name}</CardTitle>
                      <CardDescription>{program.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto">
                      <ul className="space-y-2">
                        {program.points.map((point) => (
                          <li key={point} className="flex gap-2 mkt-small text-muted-foreground">
                            <CheckCircle2
                              className="h-4 w-4 flex-shrink-0 mt-0.5"
                              style={{ color: 'var(--ecode-accent)' }}
                            />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Integrations — real platforms partners build on */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <h2 className="mkt-h2 font-bold text-center mb-4">Build on a Connected Platform</h2>
            <p className="mkt-body text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
              E-Code already connects to the tools your customers rely on — through OAuth integrations and MCP
              connectors. Technology partners plug straight into these surfaces.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 max-w-4xl mx-auto">
              {integrations.map((integration) => {
                const Icon = integration.icon;
                return (
                  <div
                    key={integration.label}
                    className="flex flex-col items-center justify-center gap-2 rounded-lg border border-[var(--ecode-border)] bg-surface-solid px-4 py-5 text-center"
                  >
                    <Icon className="h-7 w-7 text-foreground" aria-hidden />
                    <span className="mkt-small font-medium text-muted-foreground">{integration.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="mkt-h2 font-bold text-center mb-12">Why Partner With Us</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {benefits.map((benefit) => {
                const Icon = benefit.icon;
                return (
                  <Card key={benefit.title}>
                    <CardContent className="pt-6 text-center">
                      <span
                        className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl text-white"
                        style={{ backgroundColor: 'var(--ecode-accent)' }}
                      >
                        <Icon className="h-6 w-6" />
                      </span>
                      <h3 className="mkt-h3 font-semibold mb-2">{benefit.title}</h3>
                      <p className="mkt-small text-muted-foreground">{benefit.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <h2 className="mkt-h2 font-bold text-center mb-12">How It Works</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-5xl mx-auto">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={step.title} className="text-center">
                    <div className="relative mx-auto mb-4 h-14 w-14">
                      <span
                        className="flex h-14 w-14 items-center justify-center rounded-full text-white"
                        style={{ backgroundColor: 'var(--ecode-accent)' }}
                      >
                        <Icon className="h-6 w-6" />
                      </span>
                      <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--ecode-border)] bg-surface-solid text-[12px] font-bold text-foreground">
                        {index + 1}
                      </span>
                    </div>
                    <h3 className="mkt-h3 font-semibold mb-2">{step.title}</h3>
                    <p className="mkt-small text-muted-foreground">{step.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="relative overflow-hidden rounded-2xl border border-[var(--ecode-border)] bg-gradient-to-br from-background to-muted px-6 py-14 text-center md:px-12">
              <div
                className="absolute -z-10 -top-16 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full blur-3xl"
                style={{ backgroundColor: 'color-mix(in srgb, var(--ecode-accent) 18%, transparent)' }}
              />
              <h2 className="mkt-h2 font-bold mb-4">Ready to build together?</h2>
              <p className="mkt-body text-muted-foreground mb-8 max-w-2xl mx-auto">
                Tell us about your business and our partnerships team will help you find the right program and get
                started.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/contact-sales"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md text-white font-medium hover:brightness-110 transition-all min-h-[44px]"
                  style={{ backgroundColor: 'var(--ecode-accent)' }}
                  data-testid="button-partners-contact-sales"
                >
                  Become a Partner
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/signup"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md border border-[var(--ecode-border)] bg-surface-solid text-foreground font-medium hover:bg-surface-hover-solid transition-all min-h-[44px]"
                  data-testid="button-partners-signup"
                >
                  Get started free
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
