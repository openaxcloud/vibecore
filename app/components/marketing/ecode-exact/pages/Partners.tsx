import { Handshake, Boxes, Briefcase, Building2, Rocket, Users, TrendingUp, BookOpen, CheckCircle } from 'lucide-react';
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

export default function Partners() {
  const programs = [
    {
      icon: Boxes,
      name: 'Technology Partners',
      description:
        'Integrate your platform, API, or developer tool with E-Code and reach teams building production apps with AI.',
      points: [
        'Co-built integrations & MCP connectors',
        'Listing in the E-Code marketplace',
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
      icon: Rocket,
      title: 'Go To Market Together',
      description: 'Co-marketing, case studies, and joint launches that put your brand in front of our audience.',
    },
    {
      icon: BookOpen,
      title: 'Enablement & Training',
      description: 'Partner certification, technical workshops, and early access to product roadmaps.',
    },
    {
      icon: Users,
      title: 'Dedicated Support',
      description: 'A named partner manager and a private support channel for your team and customers.',
    },
  ];

  const steps = [
    { title: 'Apply', description: 'Tell us about your business and the customers you serve.' },
    { title: 'Onboard', description: 'Complete enablement and get certified on the E-Code platform.' },
    { title: 'Launch', description: 'Go to market together with co-branded campaigns and joint sales.' },
    { title: 'Grow', description: 'Scale your practice with revenue share, referrals, and roadmap access.' },
  ];

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-partners">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <Handshake className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
              <h1 className="text-4xl font-bold mb-4" data-testid="heading-partners">
                Partner with E-Code
              </h1>
              <p className="text-[15px] text-muted-foreground mb-8">
                Build, sell, and deliver alongside the AI development platform teams use to ship production apps. Join a
                program designed to grow your business.
              </p>
              <Badge variant="secondary" className="text-[15px] px-4 py-2">
                Now accepting partner applications
              </Badge>
            </div>
          </div>
        </section>

        {/* Partner Programs */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-4">Partner Programs</h2>
            <p className="text-[15px] text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
              Whatever you build or who you serve, there is a E-Code program built for you.
            </p>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {programs.map((program) => {
                const Icon = program.icon;
                return (
                  <Card key={program.name} className="flex flex-col">
                    <CardHeader>
                      <Icon className="h-10 w-10 mb-3" style={{ color: 'var(--ecode-accent)' }} />
                      <CardTitle>{program.name}</CardTitle>
                      <CardDescription>{program.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto">
                      <ul className="space-y-2">
                        {program.points.map((point) => (
                          <li key={point} className="flex gap-2 text-[13px] text-muted-foreground">
                            <CheckCircle
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

        {/* Benefits */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-12">Why Partner With Us</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {benefits.map((benefit) => {
                const Icon = benefit.icon;
                return (
                  <Card key={benefit.title}>
                    <CardContent className="pt-6 text-center">
                      <Icon className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
                      <h3 className="font-semibold mb-2">{benefit.title}</h3>
                      <p className="text-[13px] text-muted-foreground">{benefit.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-5xl mx-auto">
              {steps.map((step, index) => (
                <div key={step.title} className="text-center">
                  <div
                    className="h-12 w-12 mx-auto mb-4 rounded-full flex items-center justify-center text-lg font-bold text-white"
                    style={{ backgroundColor: 'var(--ecode-accent)' }}
                  >
                    {index + 1}
                  </div>
                  <h3 className="font-semibold mb-2">{step.title}</h3>
                  <p className="text-[13px] text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to build together?</h2>
            <p className="text-[15px] text-muted-foreground mb-8 max-w-2xl mx-auto">
              Tell us about your business and our partnerships team will help you find the right program and get
              started.
            </p>
            <button
              className="px-6 py-3 rounded-md text-white hover:opacity-90 min-h-[44px]"
              style={{ backgroundColor: 'var(--ecode-accent)' }}
              onClick={() => (window.location.href = '/contact-sales')}
              data-testid="button-partners-contact-sales"
            >
              Become a Partner
            </button>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
