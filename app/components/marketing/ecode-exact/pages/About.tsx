import {
  ArrowRight,
  Bot,
  Cloud,
  Compass,
  GitBranch,
  Globe,
  LayoutDashboard,
  Lock,
  MessageSquare,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  Terminal,
  Users,
  Zap,
} from 'lucide-react';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import { Badge, Card, CardDescription, CardHeader, CardTitle } from '~/components/marketing/ecode-exact/EcodeExactUi';

const PRODUCT = '/ecode-static/assets/product';

export default function About() {
  // Principles that guide product decisions. Each icon matches its title.
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
        'Collaboration is a first-class feature. Teammates, agents, and tools work side by side in one shared workspace.',
    },
    {
      icon: ShieldCheck,
      title: 'Trust by default',
      description:
        'Your code and data belong to you. Security, privacy, and transparency are baked into every layer of the platform.',
    },
    {
      icon: Compass,
      title: 'Stay curious',
      description:
        'AI-native development is a frontier. We ship, learn, and iterate alongside the builders who use E-Code every day.',
    },
    {
      icon: Globe,
      title: 'Open to the world',
      description: 'From a first prototype to a global product, E-Code scales with you across every stage of growth.',
    },
  ];

  // Honest, platform-true description of what runs under the hood — no invented stats.
  const platform = [
    {
      icon: Bot,
      title: 'Autonomous AI agent',
      description:
        'Describe what you want in plain language. The agent plans the work, writes and edits files across your project, and explains every change.',
    },
    {
      icon: Terminal,
      title: 'Full cloud workspace',
      description:
        'A real editor, terminal, and package manager run in the cloud — so there is nothing to install and your environment is ready in seconds.',
    },
    {
      icon: LayoutDashboard,
      title: 'Live preview',
      description:
        'See your app running as the agent builds it. Every edit updates the preview instantly, side by side with the code.',
    },
    {
      icon: GitBranch,
      title: 'Git built in',
      description:
        'Connect GitHub or GitLab, branch, commit, and push from inside the workspace. Your history stays yours.',
    },
    {
      icon: Cloud,
      title: 'One-click deploy',
      description:
        'Ship to a live URL straight from the editor. Static sites and full-stack apps go to production without leaving E-Code.',
    },
    {
      icon: Lock,
      title: 'Secure by design',
      description:
        'Each project runs in its own isolated sandbox. Credentials are encrypted and access is scoped to the people you invite.',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-bolt-elements-background-depth-1" data-testid="page-about">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
          <div className="container-responsive py-16 sm:py-20 lg:py-28">
            <div className="text-center max-w-3xl mx-auto">
              <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-[13px]" style={{ color: '#F26207' }}>
                Our story
              </Badge>
              <h1 className="mkt-h1 tracking-tight text-bolt-elements-textPrimary mb-6">
                Building the future of software creation
              </h1>
              <p className="mkt-lead text-bolt-elements-textSecondary">
                E-Code is an AI-native development platform that turns plain language into real, deployable
                applications. We are on a mission to make software creation accessible to everyone.
              </p>
            </div>
          </div>
        </section>

        {/* Mission + real product capture */}
        <section className="bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor">
          <div className="container-responsive py-14 sm:py-20">
            <div className="grid gap-10 lg:gap-14 lg:grid-cols-2 lg:items-center max-w-6xl mx-auto">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F26207]">
                    <Target className="h-4 w-4 text-white" />
                  </span>
                  <span className="mkt-small font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
                    Our mission
                  </span>
                </div>
                <h2 className="mkt-h2 text-bolt-elements-textPrimary mb-4">Everyone should be able to build</h2>
                <p className="mkt-body text-bolt-elements-textSecondary mb-4">
                  For decades, building software meant years of training, expensive teams, and slow feedback loops. We
                  believe the next generation of creators should be limited only by their imagination — not by syntax,
                  setup, or scale.
                </p>
                <p className="mkt-body text-bolt-elements-textSecondary">
                  E-Code pairs an autonomous coding agent with a complete cloud workspace, so describing what you want
                  is enough to get a working app you can edit, run, and ship.
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
                      E-Code Workspace
                    </span>
                  </div>
                  <img
                    src={`${PRODUCT}/ide.png`}
                    alt="The E-Code IDE showing the AI Agent panel, code editor, file tree and live preview together in one workspace"
                    width={1440}
                    height={900}
                    loading="lazy"
                    className="block w-full h-auto"
                    data-testid="img-about-ide"
                  />
                </div>
                <figcaption className="mt-3 flex items-start gap-2 mkt-small text-bolt-elements-textSecondary px-1">
                  <LayoutDashboard className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#F26207] flex-shrink-0 mt-0.5" />
                  <span>The E-Code IDE: agent, editor, files and live preview in one workspace.</span>
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* What E-Code is — honest platform capabilities (replaces fabricated timeline/stats) */}
        <section className="border-b border-bolt-elements-borderColor">
          <div className="container-responsive py-14 sm:py-20">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#F26207] mb-4">
                <Rocket className="h-5 w-5 text-white" />
              </span>
              <h2 className="mkt-h2 text-bolt-elements-textPrimary mb-3">What powers E-Code</h2>
              <p className="mkt-body text-bolt-elements-textSecondary">
                An autonomous agent and a full cloud workspace, working together so you can go from prompt to production
                without leaving the browser.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
              {platform.map((item) => {
                const Icon = item.icon;
                return (
                  <Card key={item.title} className="bg-bolt-elements-background-depth-2 h-full">
                    <CardHeader>
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg mb-3 bg-[#F26207]">
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <CardTitle className="text-bolt-elements-textPrimary">{item.title}</CardTitle>
                      <CardDescription className="text-bolt-elements-textSecondary">{item.description}</CardDescription>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor">
          <div className="container-responsive py-14 sm:py-20">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="mkt-h2 text-bolt-elements-textPrimary mb-3">What we value</h2>
              <p className="mkt-body text-bolt-elements-textSecondary">
                The principles that guide every product decision we make.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
              {values.map((value) => {
                const Icon = value.icon;
                return (
                  <Card key={value.title} className="bg-bolt-elements-background-depth-1 h-full">
                    <CardHeader>
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg mb-3 bg-[#F26207]">
                        <Icon className="h-5 w-5 text-white" />
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

        {/* Closing CTA banner */}
        <section className="bg-bolt-elements-background-depth-1">
          <div className="container-responsive py-16 sm:py-24">
            <div className="relative overflow-hidden rounded-2xl ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-6 py-12 sm:px-12 sm:py-16">
              <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[#F26207]/15 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-[#F99D25]/10 blur-3xl pointer-events-none" />
              <div className="relative text-center max-w-2xl mx-auto">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#F26207] mb-5">
                  <MessageSquare className="h-6 w-6 text-white" />
                </span>
                <h2 className="mkt-h2 text-bolt-elements-textPrimary mb-4">Start building with E-Code</h2>
                <p className="mkt-lead text-bolt-elements-textSecondary mb-8">
                  Join the creators turning ideas into software every day. Your next app is one prompt away.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <a
                    href="/signup"
                    className="inline-flex items-center justify-center gap-2 rounded-md px-6 py-3 text-[15px] font-medium text-white min-h-[44px] w-full sm:w-auto transition-opacity hover:opacity-90"
                    style={{ backgroundColor: '#F26207' }}
                    data-testid="button-about-cta"
                  >
                    Get started for free
                    <ArrowRight className="h-4 w-4" />
                  </a>
                  <a
                    href="/dashboard"
                    className="inline-flex items-center justify-center rounded-md px-6 py-3 text-[15px] font-medium min-h-[44px] w-full sm:w-auto border border-bolt-elements-borderColor text-bolt-elements-textPrimary bg-bolt-elements-background-depth-1 transition-colors hover:bg-bolt-elements-background-depth-3"
                    data-testid="button-about-cta-secondary"
                  >
                    Open dashboard
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
