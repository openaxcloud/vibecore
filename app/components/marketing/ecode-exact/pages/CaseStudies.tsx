import {
  ArrowRight,
  Boxes,
  GitBranch,
  Globe,
  LayoutDashboard,
  Rocket,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  Workflow,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import {
  getMarketingExactCaseStudiesCollaborationCopy,
  type CaseStudyCapabilityId,
  type CaseStudyShowcaseId,
  type CaseStudyWorkflowId,
} from '~/lib/i18n/catalogs/marketing-exact-case-studies-collaboration';

const ACCENT = '#F26207';
const ACCENT_2 = '#F99D25';

const CASE_STUDY_WORKFLOW_ICONS: Record<CaseStudyWorkflowId, LucideIcon> = {
  idea: Sparkles,
  preview: Zap,
  git: GitBranch,
  deploy: Rocket,
  workspaces: Boxes,
  mcp: Workflow,
};

const CASE_STUDY_SHOWCASE_MEDIA: Record<
  CaseStudyShowcaseId,
  { src: string; icon: LucideIcon; span: string; glow: string; testId: string }
> = {
  workspace: {
    src: '/ecode-static/assets/product/ide.png',
    icon: LayoutDashboard,
    span: 'lg:col-span-3',
    glow: 'from-[#F26207]/20 to-[#F99D25]/20',
    testId: 'img-case-studies-ide',
  },
  git: {
    src: '/ecode-static/assets/product/ide-git.png',
    icon: GitBranch,
    span: 'lg:col-span-2',
    glow: 'from-[#F99D25]/15 to-[#F26207]/15',
    testId: 'img-case-studies-git',
  },
};

const CASE_STUDY_CAPABILITY_ICONS: Record<CaseStudyCapabilityId, LucideIcon> = {
  hosting: Globe,
  mobile: Smartphone,
  isolation: ShieldCheck,
  terminal: Terminal,
};

export default function CaseStudies() {
  const { i18n } = useTranslation();
  const copy = getMarketingExactCaseStudiesCollaborationCopy(i18n.resolvedLanguage ?? i18n.language).exactCaseStudies;

  const workflows = copy.workflow.items.map((workflow) => ({
    ...workflow,
    icon: CASE_STUDY_WORKFLOW_ICONS[workflow.id],
  }));

  const showcase = copy.showcase.map((shot) => ({ ...shot, ...CASE_STUDY_SHOWCASE_MEDIA[shot.id] }));

  const capabilities = copy.capabilities.items.map((capability) => ({
    ...capability,
    icon: CASE_STUDY_CAPABILITY_ICONS[capability.id],
  }));

  return (
    <div
      className="min-h-screen flex flex-col bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary"
      data-testid="page-case-studies"
    >
      <PublicNavbar />

      <main className="flex-1">
        <section className="relative overflow-hidden py-16 sm:py-20 md:py-28 px-4">
          <div
            className="absolute inset-0 -z-10 opacity-60 pointer-events-none"
            style={{
              background: 'radial-gradient(60% 50% at 50% 0%, rgba(242,98,7,0.16) 0%, rgba(242,98,7,0) 70%)',
            }}
          />
          <div className="max-w-3xl mx-auto text-center">
            <span
              className="inline-flex max-w-full items-center gap-2 whitespace-normal rounded-full px-3 py-1 text-center text-[13px] font-medium ring-1"
              style={{ color: ACCENT, borderColor: `${ACCENT}40`, background: `${ACCENT}14`, borderWidth: 1 }}
            >
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
              {copy.hero.badge}
            </span>
            <h1 className="mt-6 mkt-h1 font-bold tracking-tight" data-testid="heading-case-studies">
              {copy.hero.title}
            </h1>
            <p className="mt-5 mkt-lead text-bolt-elements-textSecondary">{copy.hero.description}</p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="/signup"
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-6 py-3 rounded-md text-white font-medium min-h-[44px] transition-transform hover:scale-[1.02]"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_2})` }}
                data-testid="button-case-studies-hero-signup"
              >
                {copy.hero.primary}
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </a>
              <a
                href="/dashboard"
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-6 py-3 rounded-md font-medium min-h-[44px] ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 transition-colors"
                data-testid="button-case-studies-hero-dashboard"
              >
                {copy.hero.secondary}
              </a>
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-16 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 sm:gap-8 items-stretch">
              {showcase.map((shot) => {
                const Icon = shot.icon;

                return (
                  <figure key={shot.id} className={`${shot.span} group relative`}>
                    <div
                      className={`absolute -inset-2 bg-gradient-to-r ${shot.glow} blur-2xl rounded-2xl pointer-events-none`}
                    />
                    <div className="relative rounded-xl overflow-hidden ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-2xl">
                      <div className="flex min-w-0 items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
                        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: ACCENT }} aria-hidden />
                        <span className="min-w-0 truncate mkt-small text-bolt-elements-textSecondary font-medium">
                          {shot.label}
                        </span>
                      </div>
                      <img
                        src={shot.src}
                        alt={shot.imageAlt}
                        width={1440}
                        height={900}
                        loading="lazy"
                        className="block w-full h-auto"
                        data-testid={shot.testId}
                      />
                    </div>
                    <figcaption className="mt-3 flex items-start gap-2 mkt-small text-bolt-elements-textSecondary px-1">
                      <Icon
                        className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0 mt-0.5"
                        style={{ color: ACCENT }}
                        aria-hidden
                      />
                      <span>{shot.caption}</span>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-16 md:py-20 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="mkt-h2 font-bold tracking-tight">{copy.workflow.title}</h2>
              <p className="mt-4 mkt-body text-bolt-elements-textSecondary">{copy.workflow.description}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {workflows.map((workflow) => {
                const Icon = workflow.icon;

                return (
                  <div
                    key={workflow.id}
                    className="h-full rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6 transition-all hover:border-[#F26207]/50 hover:shadow-md"
                    data-testid={`card-workflow-${workflow.id}`}
                  >
                    <div
                      className="flex items-center justify-center w-11 h-11 rounded-lg mb-4 ring-1"
                      style={{ background: `${ACCENT}1A`, borderColor: `${ACCENT}40` }}
                    >
                      <Icon className="h-5 w-5" style={{ color: ACCENT }} aria-hidden />
                    </div>
                    <h3 className="mkt-h3 font-semibold mb-2">{workflow.title}</h3>
                    <p className="mkt-body text-bolt-elements-textSecondary leading-relaxed">{workflow.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-16 md:py-20 px-4 bg-bolt-elements-background-depth-2 border-y border-bolt-elements-borderColor">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <figure className="group relative order-2 lg:order-1">
              <div className="absolute -inset-2 bg-gradient-to-r from-[#F26207]/15 to-[#F99D25]/15 blur-2xl rounded-2xl pointer-events-none" />
              <div className="relative rounded-xl overflow-hidden ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-1 shadow-2xl">
                <div className="flex min-w-0 items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
                  <Rocket className="h-3.5 w-3.5 shrink-0" style={{ color: ACCENT }} aria-hidden />
                  <span className="min-w-0 truncate mkt-small text-bolt-elements-textSecondary font-medium">
                    {copy.deploymentShowcase.label}
                  </span>
                </div>
                <img
                  src="/ecode-static/assets/product/ide-deploy.png"
                  alt={copy.deploymentShowcase.imageAlt}
                  width={1440}
                  height={900}
                  loading="lazy"
                  className="block w-full h-auto"
                  data-testid="img-case-studies-deploy"
                />
              </div>
              <figcaption className="mt-3 flex items-start gap-2 mkt-small text-bolt-elements-textSecondary px-1">
                <Rocket
                  className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0 mt-0.5"
                  style={{ color: ACCENT }}
                  aria-hidden
                />
                <span>{copy.deploymentShowcase.caption}</span>
              </figcaption>
            </figure>

            <div className="order-1 lg:order-2">
              <h2 className="mkt-h2 font-bold tracking-tight">{copy.capabilities.title}</h2>
              <p className="mt-4 mkt-body text-bolt-elements-textSecondary">{copy.capabilities.description}</p>
              <ul className="mt-8 space-y-5">
                {capabilities.map((capability) => {
                  const Icon = capability.icon;

                  return (
                    <li key={capability.id} className="flex items-start gap-4">
                      <div
                        className="flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0 ring-1"
                        style={{ background: `${ACCENT}1A`, borderColor: `${ACCENT}40` }}
                      >
                        <Icon className="h-5 w-5" style={{ color: ACCENT }} aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <h3 className="mkt-h3 font-semibold">{capability.title}</h3>
                        <p className="mt-1 mkt-body text-bolt-elements-textSecondary leading-relaxed">
                          {capability.body}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20 md:py-24 px-4">
          <div
            className="max-w-4xl mx-auto rounded-2xl p-6 sm:p-12 text-center relative overflow-hidden ring-1 ring-[#F26207]/30"
            style={{ background: `linear-gradient(135deg, ${ACCENT}1A, ${ACCENT_2}0D)` }}
          >
            <div
              className="absolute inset-0 -z-10 opacity-70 pointer-events-none"
              style={{
                background: 'radial-gradient(50% 80% at 50% 0%, rgba(242,98,7,0.18) 0%, rgba(242,98,7,0) 70%)',
              }}
            />
            <h2 className="mkt-h2 font-bold tracking-tight">{copy.cta.title}</h2>
            <p className="mt-4 mkt-lead text-bolt-elements-textSecondary max-w-2xl mx-auto">{copy.cta.description}</p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="/signup"
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-7 py-3 rounded-md text-white font-medium min-h-[44px] transition-transform hover:scale-[1.02]"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_2})` }}
                data-testid="button-case-studies-signup"
              >
                {copy.cta.primary}
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </a>
              <a
                href="/dashboard"
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-7 py-3 rounded-md font-medium min-h-[44px] ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 transition-colors"
                data-testid="button-case-studies-dashboard"
              >
                {copy.cta.secondary}
              </a>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
