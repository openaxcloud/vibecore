import { ArrowRight, Building2, Quote, Rocket, Timer, TrendingUp, Users } from 'lucide-react';
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

export default function CaseStudies() {
  const caseStudies = [
    {
      company: 'Northwind Labs',
      industry: 'Fintech',
      metric: '6x faster shipping',
      headline: 'From idea to production in a single afternoon',
      summary:
        'Northwind replaced a tangle of local toolchains with VibeCore and now prototypes payment flows directly in the browser, cutting setup time to zero.',
    },
    {
      company: 'Cobalt Health',
      industry: 'Healthcare',
      metric: '40% lower onboarding cost',
      headline: 'New engineers commit on day one',
      summary:
        'With reproducible cloud workspaces, Cobalt onboards clinicians-turned-builders without a single "works on my machine" ticket.',
    },
    {
      company: 'Meridian Retail',
      industry: 'E-commerce',
      metric: '12 stores launched in a quarter',
      headline: 'Storefronts built by the merchandising team',
      summary:
        'Non-engineers describe the storefront they want and VibeCore agents scaffold, preview, and deploy it — freeing the core team for platform work.',
    },
    {
      company: 'Atlas Robotics',
      industry: 'Hardware',
      metric: '3x more experiments',
      headline: 'Firmware dashboards without the DevOps tax',
      summary:
        'Atlas spins up isolated environments per experiment, so telemetry dashboards ship alongside the robots instead of weeks later.',
    },
    {
      company: 'Lumen Media',
      industry: 'Media',
      metric: '90% less environment drift',
      headline: 'One workspace, every contributor',
      summary:
        'Lumen standardized its editorial tooling on VibeCore, so freelance contributors build in the exact same environment as staff.',
    },
    {
      company: 'Verdant Energy',
      industry: 'Climate Tech',
      metric: '2 weeks to first pilot',
      headline: 'Grid analytics prototyped by data scientists',
      summary:
        'Verdant data scientists turn modeling notebooks into shareable internal apps without waiting on a platform team.',
    },
  ];

  const stats = [
    { icon: Rocket, value: '500+', label: 'Teams building on VibeCore' },
    { icon: Timer, value: '6x', label: 'Faster time to first deploy' },
    { icon: TrendingUp, value: '40%', label: 'Lower tooling overhead' },
    { icon: Users, value: '50k+', label: 'Workspaces provisioned' },
  ];

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-case-studies">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <Building2 className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
              <h1 className="text-4xl font-bold mb-4" data-testid="heading-case-studies">
                Case Studies
              </h1>
              <p className="text-[15px] text-muted-foreground mb-8">
                See how teams of every size ship faster with VibeCore — real workflows, measurable results.
              </p>
              <Badge variant="secondary" className="text-[15px] px-4 py-2">
                Trusted by builders worldwide
              </Badge>
            </div>
          </div>
        </section>

        {/* Case Study Grid */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-12">Customer stories</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {caseStudies.map((study) => (
                <Card key={study.company} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-center justify-between mb-2">
                      <CardTitle className="text-lg">{study.company}</CardTitle>
                      <Badge variant="secondary">{study.industry}</Badge>
                    </div>
                    <div className="text-2xl font-bold" style={{ color: 'var(--ecode-accent)' }}>
                      {study.metric}
                    </div>
                    <CardDescription className="text-[15px] font-medium text-foreground">
                      {study.headline}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col flex-1 justify-between gap-4">
                    <p className="text-[13px] text-muted-foreground">{study.summary}</p>
                    <a
                      href="/contact"
                      className="inline-flex items-center gap-1 text-[13px] font-medium hover:underline"
                      style={{ color: 'var(--ecode-accent)' }}
                      data-testid={`link-case-study-${study.company.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      Read story
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Stats Band */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="text-center">
                    <Icon className="h-8 w-8 mx-auto mb-3" style={{ color: 'var(--ecode-accent)' }} />
                    <div className="text-3xl font-bold mb-1">{stat.value}</div>
                    <p className="text-[13px] text-muted-foreground">{stat.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Featured Quote */}
        <section className="py-responsive">
          <div className="container-responsive">
            <Card className="max-w-3xl mx-auto">
              <CardContent className="p-8 text-center">
                <Quote className="h-10 w-10 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
                <p className="text-xl font-medium mb-4">
                  "VibeCore collapsed our setup, review, and deploy loop into one place. We ship the moment an idea is
                  ready."
                </p>
                <p className="text-[13px] text-muted-foreground">Head of Engineering, Northwind Labs</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Call To Action */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive text-center">
            <h2 className="text-3xl font-bold mb-4">Write your own story</h2>
            <p className="text-[15px] text-muted-foreground mb-8 max-w-2xl mx-auto">
              Tell us what you are building and we will show you how teams like yours ship faster with VibeCore.
            </p>
            <a
              href="/contact"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md text-white min-h-[44px]"
              style={{ backgroundColor: 'var(--ecode-accent)' }}
              data-testid="button-case-studies-contact"
            >
              Talk to our team
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
