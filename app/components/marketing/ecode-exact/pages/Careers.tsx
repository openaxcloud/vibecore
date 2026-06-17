import {
  Briefcase,
  Heart,
  Globe,
  Sparkles,
  Rocket,
  Users,
  GraduationCap,
  Coffee,
  MapPin,
  ArrowRight,
} from 'lucide-react';
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

export default function Careers() {
  const perks = [
    {
      icon: Globe,
      title: 'Remote-First',
      description: 'Work from anywhere. We hire across time zones and trust you to do your best work wherever you are.',
    },
    {
      icon: Heart,
      title: 'Health & Wellness',
      description: 'Comprehensive medical, dental and vision coverage, plus a monthly wellness stipend.',
    },
    {
      icon: Sparkles,
      title: 'Meaningful Equity',
      description: 'Every team member shares in the upside with a generous equity grant from day one.',
    },
    {
      icon: Coffee,
      title: 'Flexible Time Off',
      description: 'Unlimited PTO with a four-week minimum we actually encourage you to take.',
    },
    {
      icon: GraduationCap,
      title: 'Learning Budget',
      description: 'An annual budget for courses, conferences, books and anything that helps you grow.',
    },
    {
      icon: Rocket,
      title: 'Latest Tooling',
      description: 'Top-tier hardware and unlimited access to the AI tools we build and use every day.',
    },
  ];

  const values = [
    {
      title: 'Ship to learn',
      description: 'We move fast, put real work in front of users, and let what we learn shape what we build next.',
    },
    {
      title: 'Default to ownership',
      description: 'Everyone owns outcomes end to end. Titles are loose, responsibility is real.',
    },
    {
      title: 'Craft matters',
      description: 'We sweat the details because the people building software deserve tools that feel right.',
    },
    {
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
    <div className="min-h-screen flex flex-col" data-testid="page-careers">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <Briefcase className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
              <h1 className="text-4xl font-bold mb-4" data-testid="heading-careers">
                Build the future with us
              </h1>
              <p className="text-[15px] text-muted-foreground mb-8">
                We&apos;re a small, ambitious team making software creation as natural as describing an idea. Help us
                put an AI-native development platform in the hands of millions of builders.
              </p>
              <Badge variant="secondary" className="text-[15px] px-4 py-2">
                {openRoles.length} open roles
              </Badge>
            </div>
          </div>
        </section>

        {/* Perks & Benefits */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-12">Why you&apos;ll love it here</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {perks.map((perk) => {
                const Icon = perk.icon;
                return (
                  <Card key={perk.title}>
                    <CardContent className="pt-6 text-center">
                      <Icon className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
                      <h3 className="font-semibold mb-2">{perk.title}</h3>
                      <p className="text-[13px] text-muted-foreground">{perk.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Open Roles */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-4">Open roles</h2>
            <p className="text-[15px] text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
              Don&apos;t see the perfect fit? We&apos;re always glad to meet great people — reach out anyway.
            </p>

            <div className="grid gap-4 max-w-4xl mx-auto">
              {openRoles.map((role) => (
                <Card key={role.title}>
                  <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6">
                    <div>
                      <h3 className="font-semibold mb-1">{role.title}</h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {role.team}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          {role.location}
                        </span>
                        <span>{role.type}</span>
                      </div>
                    </div>
                    <a
                      href="/contact"
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md text-primary-foreground hover:opacity-90 min-h-[44px] whitespace-nowrap"
                      style={{ backgroundColor: 'var(--ecode-accent)' }}
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

        {/* Culture / Values */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-4">How we work</h2>
              <p className="text-[15px] text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
                A few principles that shape how we collaborate, make decisions, and treat each other.
              </p>

              <div className="grid md:grid-cols-2 gap-8">
                {values.map((value) => (
                  <div key={value.title} className="flex gap-4">
                    <Sparkles className="h-6 w-6 flex-shrink-0 mt-1" style={{ color: 'var(--ecode-accent)' }} />
                    <div>
                      <h3 className="font-semibold mb-2">{value.title}</h3>
                      <p className="text-muted-foreground">{value.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Equal Opportunity */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="max-w-4xl mx-auto">
              <Card>
                <CardHeader>
                  <CardTitle>An inclusive place to do your best work</CardTitle>
                  <CardDescription>
                    Great products are built by teams with different backgrounds, perspectives and lived experiences.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    VibeCore is an equal-opportunity employer. We welcome applicants of every race, gender, age,
                    religion, identity, ability and experience, and we&apos;re committed to a hiring process that is
                    fair, accessible and free of bias.
                  </p>
                  <p className="text-muted-foreground">
                    Need an accommodation during the interview process? Let us know on your application and we&apos;ll
                    make it happen — no questions asked.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="py-responsive">
          <div className="container-responsive text-center">
            <h2 className="text-3xl font-bold mb-4">Let&apos;s talk</h2>
            <p className="text-[15px] text-muted-foreground mb-8 max-w-2xl mx-auto">
              Tell us what you&apos;re great at and where you want to grow. We read every message and reply to every
              candidate.
            </p>
            <a
              href="/contact"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md text-primary-foreground hover:opacity-90 min-h-[44px]"
              style={{ backgroundColor: 'var(--ecode-accent)' }}
              data-testid="link-careers-contact"
            >
              Get in touch
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
