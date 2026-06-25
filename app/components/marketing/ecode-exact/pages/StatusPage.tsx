import { Activity, ShieldCheck, Bell, Boxes, Rocket, Bot, LayoutDashboard, Server, ArrowRight } from 'lucide-react';
import { SiPostgresql, SiOpenai } from 'react-icons/si';
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

const PRODUCT = '/ecode-static/assets/product';

export default function StatusPage() {
  const components = [
    {
      icon: Server,
      brand: false,
      name: 'API',
      description: 'REST endpoints powering projects, builds and account operations.',
    },
    {
      icon: Boxes,
      brand: false,
      name: 'Workspaces',
      description: 'Cloud development environments, runtimes and live previews.',
    },
    {
      icon: Rocket,
      brand: false,
      name: 'Deployments',
      description: 'Build pipelines and hosting for shipped applications.',
    },
    {
      icon: Bot,
      brand: false,
      name: 'AI Agent',
      description: 'Code generation and autonomous assistance across providers.',
    },
    {
      icon: LayoutDashboard,
      brand: false,
      name: 'Dashboard',
      description: 'The web console for projects, settings and team management.',
    },
    {
      icon: SiPostgresql,
      brand: true,
      name: 'Database',
      description: 'Managed Postgres and persistent storage for your apps.',
    },
  ];

  const principles = [
    {
      icon: Activity,
      title: 'Continuous monitoring',
      description:
        'Every core service — API, workspaces, deployments and the AI agent — is monitored around the clock so issues surface fast.',
    },
    {
      icon: Bell,
      title: 'Transparent incident updates',
      description:
        'When something goes wrong, we post what happened, what we are doing, and when it is resolved — no vague status pages.',
    },
    {
      icon: ShieldCheck,
      title: 'Built for resilience',
      description:
        'Workspaces, builds and storage run on managed Kubernetes with automatic recovery, so a single failure does not take you down.',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-bolt-elements-background-depth-1" data-testid="page-status">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="bg-bolt-elements-background-depth-1">
          <div className="container-responsive py-16 sm:py-24">
            <div className="text-center max-w-3xl mx-auto">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#F26207] mb-5">
                <Activity className="h-6 w-6 text-white" />
              </span>
              <h1 className="mkt-h1 font-bold text-bolt-elements-textPrimary mb-4" data-testid="heading-status">
                Platform status
              </h1>
              <p className="mkt-lead text-bolt-elements-textSecondary mb-8 leading-relaxed">
                A live look at the services behind E-Code and how we keep you informed when something needs attention.
              </p>

              <div className="inline-flex items-center justify-center gap-3 rounded-xl ring-1 ring-[#F26207]/30 bg-[#F26207]/10 px-6 py-4">
                <span className="relative flex h-3 w-3 flex-shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F26207] opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-[#F26207]" />
                </span>
                <span className="text-[15px] font-semibold text-bolt-elements-textPrimary">
                  All systems operational
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Components */}
        <section className="bg-bolt-elements-background-depth-2 border-y border-bolt-elements-borderColor">
          <div className="container-responsive py-16 sm:py-24">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="mkt-h2 font-bold text-bolt-elements-textPrimary mb-4">Core services</h2>
              <p className="mkt-body text-bolt-elements-textSecondary leading-relaxed">
                The building blocks that run every project on E-Code.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
              {components.map((component) => {
                const Icon = component.icon;
                return (
                  <Card
                    key={component.name}
                    className="bg-bolt-elements-background-depth-1 border-bolt-elements-borderColor"
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F26207]/10 ring-1 ring-[#F26207]/20 flex-shrink-0">
                            <Icon className="h-5 w-5 text-[#F26207]" />
                          </span>
                          <div>
                            <h3 className="font-semibold text-bolt-elements-textPrimary">{component.name}</h3>
                            <p className="mkt-small text-bolt-elements-textSecondary leading-relaxed mt-0.5">
                              {component.description}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="secondary"
                          className="flex-shrink-0 border-[#F26207]/30 bg-[#F26207]/10 text-[#F26207]"
                        >
                          Operational
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* How we handle reliability */}
        <section className="bg-bolt-elements-background-depth-1">
          <div className="container-responsive py-16 sm:py-24">
            <div className="grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
              <div>
                <Badge variant="secondary" className="mb-5 border-[#F26207]/30 bg-[#F26207]/10 text-[#F26207]">
                  Reliability
                </Badge>
                <h2 className="mkt-h2 font-bold text-bolt-elements-textPrimary mb-6">How we keep E-Code running</h2>
                <div className="space-y-6">
                  {principles.map((principle) => {
                    const Icon = principle.icon;
                    return (
                      <div key={principle.title} className="flex gap-4">
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F26207]/10 ring-1 ring-[#F26207]/20 flex-shrink-0">
                          <Icon className="h-5 w-5 text-[#F26207]" />
                        </span>
                        <div>
                          <h3 className="font-semibold text-bolt-elements-textPrimary mb-1">{principle.title}</h3>
                          <p className="mkt-body text-bolt-elements-textSecondary leading-relaxed">
                            {principle.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="relative">
                <div className="absolute -inset-2 bg-gradient-to-r from-[#F26207]/20 to-[#F99D25]/20 blur-2xl rounded-2xl pointer-events-none" />
                <figure className="relative overflow-hidden rounded-2xl ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-2xl">
                  <img
                    src={`${PRODUCT}/dashboard.png`}
                    alt="The E-Code dashboard, where you manage projects and monitor running workspaces"
                    className="w-full h-auto"
                    loading="lazy"
                  />
                </figure>
              </div>
            </div>
          </div>
        </section>

        {/* AI provider note */}
        <section className="bg-bolt-elements-background-depth-2 border-y border-bolt-elements-borderColor">
          <div className="container-responsive py-12">
            <div className="max-w-4xl mx-auto">
              <Card className="bg-bolt-elements-background-depth-1 border-bolt-elements-borderColor">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F26207]/10 ring-1 ring-[#F26207]/20 flex-shrink-0">
                      <SiOpenai className="h-5 w-5 text-[#F26207]" />
                    </span>
                    <div>
                      <CardTitle className="text-bolt-elements-textPrimary">AI model providers</CardTitle>
                      <CardDescription className="text-bolt-elements-textSecondary">
                        The agent routes across multiple model providers.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="mkt-body text-bolt-elements-textSecondary leading-relaxed">
                    Code generation depends on upstream AI providers such as OpenAI and Anthropic. When a provider
                    degrades, the agent can fall back to an available model so you can keep working — and we report any
                    provider-side disruption here.
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
                  <Rocket className="h-6 w-6 text-white" />
                </span>
                <h2 className="mkt-h2 font-bold text-bolt-elements-textPrimary mb-4">
                  Build on a platform that stays up
                </h2>
                <p className="mkt-lead text-bolt-elements-textSecondary mb-8 leading-relaxed">
                  Spin up a workspace, ship a deployment, and let the agent do the heavy lifting. Your next app is one
                  prompt away.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <a
                    href="/signup"
                    className="inline-flex items-center justify-center gap-2 rounded-md px-6 py-3 text-[15px] font-medium text-white min-h-[44px] w-full sm:w-auto transition-opacity hover:opacity-90"
                    style={{ backgroundColor: '#F26207' }}
                    data-testid="button-status-cta"
                  >
                    Get started for free
                    <ArrowRight className="h-4 w-4" />
                  </a>
                  <a
                    href="/dashboard"
                    className="inline-flex items-center justify-center rounded-md px-6 py-3 text-[15px] font-medium min-h-[44px] w-full sm:w-auto border border-bolt-elements-borderColor text-bolt-elements-textPrimary bg-bolt-elements-background-depth-1 transition-colors hover:bg-bolt-elements-background-depth-3"
                    data-testid="button-status-cta-secondary"
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
