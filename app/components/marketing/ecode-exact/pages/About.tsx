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
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import { Badge, Card, CardDescription, CardHeader, CardTitle } from '~/components/marketing/ecode-exact/EcodeExactUi';
import {
  getMarketingExactAboutContactCopy,
  type AboutPlatformId,
  type AboutValueId,
} from '~/lib/i18n/catalogs/marketing-exact-about-contact';

const PRODUCT = '/ecode-static/assets/product';

const VALUE_ICONS: Record<AboutValueId, ComponentType<{ className?: string }>> = {
  creation: Sparkles,
  speed: Zap,
  open: Users,
  trust: ShieldCheck,
  curiosity: Compass,
  world: Globe,
};

const PLATFORM_ICONS: Record<AboutPlatformId, ComponentType<{ className?: string }>> = {
  agent: Bot,
  workspace: Terminal,
  preview: LayoutDashboard,
  git: GitBranch,
  deploy: Cloud,
  security: Lock,
};

export default function About() {
  const { i18n } = useTranslation();
  const copy = getMarketingExactAboutContactCopy(i18n.resolvedLanguage ?? i18n.language).exactAbout;
  const values = copy.values.items.map((value) => ({ ...value, icon: VALUE_ICONS[value.id] }));
  const platform = copy.platform.items.map((item) => ({ ...item, icon: PLATFORM_ICONS[item.id] }));

  return (
    <div className="min-h-screen flex flex-col bg-bolt-elements-background-depth-1" data-testid="page-about">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
          <div className="container-responsive py-16 sm:py-20 lg:py-28">
            <div className="text-center max-w-3xl mx-auto">
              <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-[13px]" style={{ color: '#F26207' }}>
                {copy.hero.badge}
              </Badge>
              <h1 className="mkt-h1 tracking-tight text-bolt-elements-textPrimary mb-6">{copy.hero.title}</h1>
              <p className="mkt-lead text-bolt-elements-textSecondary">{copy.hero.description}</p>
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
                    {copy.mission.eyebrow}
                  </span>
                </div>
                <h2 className="mkt-h2 text-bolt-elements-textPrimary mb-4">{copy.mission.title}</h2>
                <p className="mkt-body text-bolt-elements-textSecondary mb-4">{copy.mission.paragraphs[0]}</p>
                <p className="mkt-body text-bolt-elements-textSecondary">{copy.mission.paragraphs[1]}</p>
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
                      {copy.mission.windowLabel}
                    </span>
                  </div>
                  <img
                    src={`${PRODUCT}/ide.png`}
                    alt={copy.mission.imageAlt}
                    width={1440}
                    height={900}
                    loading="lazy"
                    className="block w-full h-auto"
                    data-testid="img-about-ide"
                  />
                </div>
                <figcaption className="mt-3 flex items-start gap-2 mkt-small text-bolt-elements-textSecondary px-1">
                  <LayoutDashboard className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#F26207] flex-shrink-0 mt-0.5" />
                  <span>{copy.mission.imageCaption}</span>
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
              <h2 className="mkt-h2 text-bolt-elements-textPrimary mb-3">{copy.platform.title}</h2>
              <p className="mkt-body text-bolt-elements-textSecondary">{copy.platform.description}</p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
              {platform.map((item) => {
                const Icon = item.icon;
                return (
                  <Card key={item.id} className="bg-bolt-elements-background-depth-2 h-full">
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
              <h2 className="mkt-h2 text-bolt-elements-textPrimary mb-3">{copy.values.title}</h2>
              <p className="mkt-body text-bolt-elements-textSecondary">{copy.values.description}</p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
              {values.map((value) => {
                const Icon = value.icon;
                return (
                  <Card key={value.id} className="bg-bolt-elements-background-depth-1 h-full">
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
                <h2 className="mkt-h2 text-bolt-elements-textPrimary mb-4">{copy.cta.title}</h2>
                <p className="mkt-lead text-bolt-elements-textSecondary mb-8">{copy.cta.description}</p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <a
                    href="/signup"
                    className="inline-flex items-center justify-center gap-2 rounded-md px-6 py-3 text-[15px] font-medium text-white min-h-[44px] w-full sm:w-auto transition-opacity hover:opacity-90"
                    style={{ backgroundColor: '#F26207' }}
                    data-testid="button-about-cta"
                  >
                    {copy.cta.primary}
                    <ArrowRight className="h-4 w-4" />
                  </a>
                  <a
                    href="/dashboard"
                    className="inline-flex items-center justify-center rounded-md px-6 py-3 text-[15px] font-medium min-h-[44px] w-full sm:w-auto border border-bolt-elements-borderColor text-bolt-elements-textPrimary bg-bolt-elements-background-depth-1 transition-colors hover:bg-bolt-elements-background-depth-3"
                    data-testid="button-about-cta-secondary"
                  >
                    {copy.cta.secondary}
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
