import {
  ArrowRight,
  BadgeDollarSign,
  Briefcase,
  Building2,
  CalendarClock,
  Compass,
  Cpu,
  Globe,
  GraduationCap,
  HeartPulse,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Rocket,
  Send,
  ShieldCheck,
  Target,
  Users,
  Zap,
} from 'lucide-react';
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

const PRODUCT = '/ecode-static/assets/product';

export default function Careers() {
  // Each perk uses an icon that matches its title — white glyph on an orange chip.
  const perks = [
    {
      icon: Globe,
      title: 'Remote-First',
      description: 'Work from anywhere. We hire across time zones and trust you to do your best work wherever you are.',
    },
    {
      icon: HeartPulse,
      title: 'Health & Wellness',
      description: 'Comprehensive medical, dental and vision coverage, plus a monthly wellness stipend.',
    },
    {
      icon: BadgeDollarSign,
      title: 'Meaningful Equity',
      description: 'Every team member shares in the upside with a generous equity grant from day one.',
    },
    {
      icon: CalendarClock,
      title: 'Flexible Time Off',
      description: 'Unlimited PTO with a four-week minimum we actually encourage you to take.',
    },
    {
      icon: GraduationCap,
      title: 'Learning Budget',
      description: 'An annual budget for courses, conferences, books and anything that helps you grow.',
    },
    {
      icon: Cpu,
      title: 'Latest Tooling',
      description: 'Top-tier hardware and unlimited access to the AI tools we build and use every day.',
    },
  ];

  // Working principles — distinct concept icons, no repeated bare-orange Sparkles.
  const values = [
    {
      icon: Rocket,
      title: 'Ship to learn',
      description: 'We move fast, put real work in front of users, and let what we learn shape what we build next.',
    },
    {
      icon: Target,
      title: 'Default to ownership',
      description: 'Everyone owns outcomes end to end. Titles are loose, responsibility is real.',
    },
    {
      icon: Zap,
      title: 'Craft matters',
      description: 'We sweat the details because the people building software deserve tools that feel right.',
    },
    {
      icon: MessageSquare,
      title: 'Low ego, high candor',
      description: 'We give direct feedback, assume good intent, and care more about the work than being right.',
    },
  ];

  const openRoles = [
    {
      title: 'Senior Full-Stack Engineer',
      team: 'Engineering',
      location: 'Remote (Global)',
      type: 'Full-time',
    },
    {
      title: 'AI Platform Engineer',
      team: 'Engineering',
      location: 'Remote (Global)',
      type: 'Full-time',
    },
    {
      title: 'Infrastructure Engineer, Kubernetes',
      team: 'Engineering',
      location: 'Remote (Global)',
      type: 'Full-time',
    },
    {
      title: 'Product Designer',
      team: 'Design',
      location: 'Remote (US / EU)',
      type: 'Full-time',
    },
    {
      title: 'Developer Advocate',
      team: 'Go-to-Market',
      location: 'Remote (Global)',
      type: 'Full-time',
    },
    {
      title: 'Founding Account Executive',
      team: 'Go-to-Market',
      location: 'Remote (US)',
      type: 'Full-time',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-bolt-elements-background-depth-1" data-testid="page-careers">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
          <div className="container-responsive py-16 sm:py-20 lg:py-28">
            <div className="text-center max-w-3xl mx-auto">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#F26207] mb-6">
                <Briefcase className="h-6 w-6 text-white" />
              </span>
              <h1 className="mkt-h1 tracking-tight text-bolt-elements-textPrimary mb-6" data-testid="heading-careers">
                Build the future with us
              </h1>
              <p className="mkt-lead text-bolt-elements-textSecondary mb-8">
                We&apos;re a small, ambitious team making software creation as natural as describing an idea. Help us
                put an AI-native development platform in the hands of builders everywhere.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Badge variant="secondary" className="px-4 py-1.5 text-[13px]" style={{ color: '#F26207' }}>
                  {openRoles.length} open roles
                </Badge>
                <Badge variant="secondary" className="px-4 py-1.5 text-[13px]" style={{ color: '#F26207' }}>
                  Remote-first
                </Badge>
              </div>
            </div>
          </div>
        </section>

        {/* What you'll be part of — real product capture */}
        <section className="bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor">
          <div className="container-responsive py-14 sm:py-20">
            <div className="grid gap-10 lg:gap-14 lg:grid-cols-2 lg:items-center max-w-6xl mx-auto">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F26207]">
                    <LayoutDashboard className="h-4 w-4 text-white" />
                  </span>
                  <span className="mkt-small font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
                    What you&apos;ll build
                  </span>
                </div>
                <h2 className="mkt-h2 text-bolt-elements-textPrimary mb-4">A platform builders use every day</h2>
                <p className="mkt-body text-bolt-elements-textSecondary mb-4">
                  E-Code pairs an autonomous coding agent with a complete cloud workspace — editor, terminal, live
                  preview, Git, and one-click deploy — so anyone can go from a prompt to a running app in the browser.
                </p>
                <p className="mkt-body text-bolt-elements-textSecondary">
                  You&apos;ll work on the product surfaces our users touch every day, from the agent and IDE to the
                  dashboard that ties their projects together. It&apos;s real software, shipped to real people, fast.
                </p>
              </div>

              {/* Real local product capture, framed */}
              <figure className="group relative">
                <div className="absolute -inset-2 bg-gradient-to-r from-[#F26207]/20 to-[#F99D25]/20 blur-2xl rounded-2xl pointer-events-none" />
                <div className="relative rounded-xl overflow-hidden ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-3 shadow-2xl">
                  <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#F26207]/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#F99D25]/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-bolt-elements-textTertiary/40" />
                    <span className="ml-2 mkt-small text-bolt-elements-textSecondary font-medium truncate">
                      E-Code Dashboard
                    </span>
                  </div>
                  <img
                    src={`${PRODUCT}/dashboard.png`}
                    alt="The E-Code dashboard showing a builder's projects, recent activity and deployments"
                    width={1440}
                    height={900}
                    loading="lazy"
                    className="block w-full h-auto"
                    data-testid="img-careers-dashboard"
                  />
                </div>
                <figcaption className="mt-3 flex items-start gap-2 mkt-small text-bolt-elements-textSecondary px-1">
                  <Compass className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#F26207] flex-shrink-0 mt-0.5" />
                  <span>The E-Code dashboard: where every project, deploy and teammate comes together.</span>
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* Perks & Benefits */}
        <section className="border-b border-bolt-elements-borderColor">
          <div className="container-responsive py-14 sm:py-20">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="mkt-h2 text-bolt-elements-textPrimary mb-3">Why you&apos;ll love it here</h2>
              <p className="mkt-body text-bolt-elements-textSecondary">
                The support and flexibility to do the best work of your career.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
              {perks.map((perk) => {
                const Icon = perk.icon;
                return (
                  <Card key={perk.title} className="bg-bolt-elements-background-depth-2 h-full">
                    <CardHeader>
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg mb-3 bg-[#F26207]">
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <CardTitle className="text-bolt-elements-textPrimary">{perk.title}</CardTitle>
                      <CardDescription className="text-bolt-elements-textSecondary">{perk.description}</CardDescription>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Open Roles */}
        <section className="bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor">
          <div className="container-responsive py-14 sm:py-20">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="mkt-h2 text-bolt-elements-textPrimary mb-3">Open roles</h2>
              <p className="mkt-body text-bolt-elements-textSecondary">
                Don&apos;t see the perfect fit? We&apos;re always glad to meet great people — reach out anyway.
              </p>
            </div>

            <div className="grid gap-4 max-w-4xl mx-auto">
              {openRoles.map((role) => (
                <Card key={role.title} className="bg-bolt-elements-background-depth-1">
                  <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6">
                    <div>
                      <h3 className="mkt-h3 text-bolt-elements-textPrimary mb-1">{role.title}</h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mkt-small text-bolt-elements-textSecondary">
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="h-4 w-4 text-[#F26207]" />
                          {role.team}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-4 w-4 text-[#F26207]" />
                          {role.location}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Briefcase className="h-4 w-4 text-[#F26207]" />
                          {role.type}
                        </span>
                      </div>
                    </div>
                    <a
                      href="/contact"
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md text-white font-medium hover:opacity-90 min-h-[44px] whitespace-nowrap transition-opacity"
                      style={{ backgroundColor: '#F26207' }}
                      data-testid={`link-apply-${role.title.toLowerCase().replace(/[^a-z]+/g, '-')}`}
                    >
                      Apply
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* How we work / Values */}
        <section className="border-b border-bolt-elements-borderColor">
          <div className="container-responsive py-14 sm:py-20">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="mkt-h2 text-bolt-elements-textPrimary mb-3">How we work</h2>
              <p className="mkt-body text-bolt-elements-textSecondary">
                A few principles that shape how we collaborate, make decisions, and treat each other.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 max-w-4xl mx-auto">
              {values.map((value) => {
                const Icon = value.icon;
                return (
                  <div key={value.title} className="flex gap-4">
                    <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-[#F26207]">
                      <Icon className="h-5 w-5 text-white" />
                    </span>
                    <div>
                      <h3 className="mkt-h3 text-bolt-elements-textPrimary mb-1.5">{value.title}</h3>
                      <p className="mkt-body text-bolt-elements-textSecondary">{value.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Equal Opportunity */}
        <section className="bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor">
          <div className="container-responsive py-14 sm:py-20">
            <div className="max-w-4xl mx-auto">
              <Card className="bg-bolt-elements-background-depth-1">
                <CardHeader>
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg mb-3 bg-[#F26207]">
                    <ShieldCheck className="h-5 w-5 text-white" />
                  </div>
                  <CardTitle className="text-bolt-elements-textPrimary">
                    An inclusive place to do your best work
                  </CardTitle>
                  <CardDescription className="text-bolt-elements-textSecondary">
                    Great products are built by teams with different backgrounds, perspectives and lived experiences.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="mkt-body text-bolt-elements-textSecondary">
                    E-Code is an equal-opportunity employer. We welcome applicants of every race, gender, age, religion,
                    identity, ability and experience, and we&apos;re committed to a hiring process that is fair,
                    accessible and free of bias.
                  </p>
                  <p className="mkt-body text-bolt-elements-textSecondary">
                    Need an accommodation during the interview process? Let us know on your application and we&apos;ll
                    make it happen — no questions asked.
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
                  <Send className="h-6 w-6 text-white" />
                </span>
                <h2 className="mkt-h2 text-bolt-elements-textPrimary mb-4">Let&apos;s talk</h2>
                <p className="mkt-lead text-bolt-elements-textSecondary mb-8">
                  Tell us what you&apos;re great at and where you want to grow. We read every message and reply to every
                  candidate.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <a
                    href="/contact"
                    className="inline-flex items-center justify-center gap-2 rounded-md px-6 py-3 text-[15px] font-medium text-white min-h-[44px] w-full sm:w-auto transition-opacity hover:opacity-90"
                    style={{ backgroundColor: '#F26207' }}
                    data-testid="link-careers-contact"
                  >
                    Get in touch
                    <ArrowRight className="h-4 w-4" />
                  </a>
                  <a
                    href="/signup"
                    className="inline-flex items-center justify-center gap-2 rounded-md px-6 py-3 text-[15px] font-medium min-h-[44px] w-full sm:w-auto border border-bolt-elements-borderColor text-bolt-elements-textPrimary bg-bolt-elements-background-depth-1 transition-colors hover:bg-bolt-elements-background-depth-3"
                    data-testid="link-careers-signup"
                  >
                    <Building2 className="h-4 w-4 text-[#F26207]" />
                    Try the product
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
