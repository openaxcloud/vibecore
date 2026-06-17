import { Compass, Heart, Rocket, Sparkles, Target, Users, Zap, Globe } from 'lucide-react';
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

export default function About() {
  const values = [
    {
      icon: Sparkles,
      title: 'Creation for everyone',
      description:
        'Software should be as easy to make as it is to imagine. We remove the friction between an idea and a working app.',
    },
    {
      icon: Zap,
      title: 'Speed without shortcuts',
      description:
        'We obsess over the fast path, but never at the cost of real, production-quality code you actually own.',
    },
    {
      icon: Users,
      title: 'Build in the open',
      description:
        'Collaboration is a first-class feature. Teams, agents, and tools work side by side in a shared workspace.',
    },
    {
      icon: Heart,
      title: 'Trust by default',
      description: 'Your code and data belong to you. Security, privacy, and transparency are baked into every layer.',
    },
    {
      icon: Compass,
      title: 'Stay curious',
      description:
        'AI-native development is a frontier. We ship, learn, and iterate alongside the builders who use us.',
    },
    {
      icon: Globe,
      title: 'Open to the world',
      description: 'From a first prototype to a global product, E-Code scales with you across every stage of growth.',
    },
  ];

  const timeline = [
    {
      year: '2023',
      title: 'A simple question',
      description: 'What if anyone could turn a sentence into running software? E-Code began as a single prompt box.',
    },
    {
      year: '2024',
      title: 'The AI-native IDE',
      description:
        'We paired an autonomous coding agent with a full cloud workspace — editor, terminal, preview, and deploy.',
    },
    {
      year: '2025',
      title: 'From prototype to production',
      description:
        'Teams started shipping real products. We added multi-agent workflows, integrations, and one-click deploys.',
    },
    {
      year: '2026',
      title: 'Software creation, reimagined',
      description: 'Today E-Code powers builders worldwide — turning ideas into apps faster than ever before.',
    },
  ];

  const stats = [
    { value: '1M+', label: 'Projects created' },
    { value: '150+', label: 'Countries reached' },
    { value: '99.9%', label: 'Platform uptime' },
    { value: '10x', label: 'Faster to ship' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-bolt-elements-background-depth-1" data-testid="page-about">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
          <div className="container-responsive py-16 sm:py-20 lg:py-28">
            <div className="text-center max-w-3xl mx-auto">
              <Badge
                variant="secondary"
                className="mb-6 px-4 py-1.5 text-[13px]"
                style={{ color: 'var(--ecode-accent)' }}
              >
                Our story
              </Badge>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-bolt-elements-textPrimary mb-6">
                Building the future of software creation
              </h1>
              <p className="text-base sm:text-lg text-bolt-elements-textSecondary leading-relaxed">
                E-Code is an AI-native development platform that turns plain language into real, deployable
                applications. We are on a mission to make software creation accessible to everyone.
              </p>
            </div>
          </div>
        </section>

        {/* Mission */}
        <section className="bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor">
          <div className="container-responsive py-14 sm:py-20">
            <div className="grid gap-10 lg:grid-cols-2 lg:items-center max-w-5xl mx-auto">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <Target className="h-6 w-6" style={{ color: 'var(--ecode-accent)' }} />
                  <span className="text-[13px] font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
                    Our mission
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-bolt-elements-textPrimary mb-4">
                  Everyone should be able to build
                </h2>
                <p className="text-bolt-elements-textSecondary leading-relaxed mb-4">
                  For decades, building software meant years of training, expensive teams, and slow feedback loops. We
                  believe the next generation of creators should be limited only by their imagination — not by syntax,
                  setup, or scale.
                </p>
                <p className="text-bolt-elements-textSecondary leading-relaxed">
                  E-Code pairs an autonomous coding agent with a complete cloud workspace, so describing what you want
                  is enough to get a working app you can edit, run, and ship.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {stats.map((stat) => (
                  <Card key={stat.label} className="bg-bolt-elements-background-depth-1">
                    <CardContent className="p-6 text-center">
                      <div
                        className="text-3xl font-bold mb-1 text-bolt-elements-textPrimary"
                        style={{ color: 'var(--ecode-accent)' }}
                      >
                        {stat.value}
                      </div>
                      <div className="text-[13px] text-bolt-elements-textSecondary">{stat.label}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Story / timeline */}
        <section className="border-b border-bolt-elements-borderColor">
          <div className="container-responsive py-14 sm:py-20">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <Rocket className="h-8 w-8 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
              <h2 className="text-2xl sm:text-3xl font-bold text-bolt-elements-textPrimary mb-3">How we got here</h2>
              <p className="text-bolt-elements-textSecondary">
                From a single prompt box to a platform powering builders around the world.
              </p>
            </div>

            <div className="max-w-3xl mx-auto space-y-6">
              {timeline.map((item) => (
                <div
                  key={item.year}
                  className="flex flex-col sm:flex-row sm:gap-8 gap-2 pb-6 border-b border-bolt-elements-borderColor last:border-0 last:pb-0"
                >
                  <div className="sm:w-24 flex-shrink-0">
                    <span className="text-lg font-bold" style={{ color: 'var(--ecode-accent)' }}>
                      {item.year}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-bolt-elements-textPrimary mb-1">{item.title}</h3>
                    <p className="text-bolt-elements-textSecondary leading-relaxed">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor">
          <div className="container-responsive py-14 sm:py-20">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-bolt-elements-textPrimary mb-3">What we value</h2>
              <p className="text-bolt-elements-textSecondary">
                The principles that guide every product decision we make.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
              {values.map((value) => {
                const Icon = value.icon;
                return (
                  <Card key={value.title} className="bg-bolt-elements-background-depth-1 h-full">
                    <CardHeader>
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg mb-3 bg-bolt-elements-background-depth-2">
                        <Icon className="h-5 w-5" style={{ color: 'var(--ecode-accent)' }} />
                      </div>
                      <CardTitle className="text-bolt-elements-textPrimary">{value.title}</CardTitle>
                      <CardDescription className="text-bolt-elements-textSecondary">
                        {value.description}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Closing */}
        <section className="bg-bolt-elements-background-depth-1">
          <div className="container-responsive py-16 sm:py-24">
            <div className="text-center max-w-2xl mx-auto">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-bolt-elements-textPrimary mb-4">
                Start building with E-Code
              </h2>
              <p className="text-base sm:text-lg text-bolt-elements-textSecondary mb-8 leading-relaxed">
                Join the creators turning ideas into software every day. Your next app is one prompt away.
              </p>
              <a
                href="/"
                className="inline-flex items-center justify-center rounded-md px-6 py-3 text-[15px] font-medium text-white min-h-[44px] transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--ecode-accent)' }}
                data-testid="button-about-cta"
              >
                Get started for free
              </a>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
