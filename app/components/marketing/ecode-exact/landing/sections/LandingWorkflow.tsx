import { Code2, Gauge, MessageSquarePlus, Rocket, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  formatMarketingLandingWorkflowNumber,
  formatMarketingLandingWorkflowStepPosition,
  formatMarketingLandingWorkflowSubtitle,
  getMarketingLandingWorkflowCopy,
  type MarketingLandingWorkflowKey,
} from '~/lib/i18n/catalogs/marketing-landing-workflow';

const steps = [
  {
    id: 'describe',
    icon: MessageSquarePlus,
    titleKey: 'marketingLandingWorkflow.step.describe.title',
    descriptionKey: 'marketingLandingWorkflow.step.describe.description',
  },
  {
    id: 'generate',
    icon: Code2,
    titleKey: 'marketingLandingWorkflow.step.generate.title',
    descriptionKey: 'marketingLandingWorkflow.step.generate.description',
  },
  {
    id: 'deploy',
    icon: Rocket,
    titleKey: 'marketingLandingWorkflow.step.deploy.title',
    descriptionKey: 'marketingLandingWorkflow.step.deploy.description',
  },
  {
    id: 'scale',
    icon: Gauge,
    titleKey: 'marketingLandingWorkflow.step.scale.title',
    descriptionKey: 'marketingLandingWorkflow.step.scale.description',
  },
] as const satisfies ReadonlyArray<{
  id: string;
  icon: LucideIcon;
  titleKey: MarketingLandingWorkflowKey;
  descriptionKey: MarketingLandingWorkflowKey;
}>;

export default function LandingWorkflow() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingLandingWorkflowCopy(language);

  return (
    <section
      className="bg-[var(--ecode-surface-tertiary)] py-14 sm:py-20 lg:py-24"
      aria-labelledby="landing-workflow-heading"
      data-testid="section-workflow"
    >
      <div className="container-responsive max-w-7xl">
        <div className="mx-auto mb-10 min-w-0 max-w-3xl animate-fade-in text-center motion-reduce:animate-none sm:mb-16">
          <h2
            id="landing-workflow-heading"
            className="mb-4 break-words text-responsive-2xl font-bold text-[var(--ecode-text)] [overflow-wrap:anywhere]"
          >
            {copy['marketingLandingWorkflow.title']}
          </h2>
          <p className="mx-auto max-w-3xl break-words text-responsive-base text-[var(--ecode-text-muted)] [overflow-wrap:anywhere]">
            {formatMarketingLandingWorkflowSubtitle(steps.length, language)}
          </p>
        </div>

        <ol className="grid min-w-0 grid-cols-1 gap-10 sm:grid-cols-2 sm:gap-8 lg:grid-cols-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const positionId = `landing-workflow-${step.id}-position`;
            const titleId = `landing-workflow-${step.id}-title`;
            const descriptionId = `landing-workflow-${step.id}-description`;

            return (
              <li
                key={step.id}
                className="relative min-w-0 animate-fade-in text-center motion-reduce:animate-none"
                style={{ animationDelay: `${index * 100}ms` }}
                aria-labelledby={`${positionId} ${titleId} ${descriptionId}`}
              >
                <span id={positionId} className="sr-only">
                  {formatMarketingLandingWorkflowStepPosition(index + 1, steps.length, language)}
                </span>
                {index < steps.length - 1 && (
                  <div
                    className="absolute top-12 left-1/2 hidden h-0.5 w-full bg-gradient-to-r from-ecode-accent to-ecode-accent/20 lg:block"
                    aria-hidden="true"
                  />
                )}
                <div
                  className="relative z-10 mb-6 inline-flex h-24 w-24 items-center justify-center rounded-full border-2 border-ecode-accent bg-ecode-accent shadow-[0_8px_24px_-8px_rgba(242,98,7,0.5)]"
                  aria-hidden="true"
                >
                  <Icon className="h-8 w-8 text-white" aria-hidden="true" />
                  <span className="absolute -top-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--vc-action-primary-strong)] text-[13px] font-bold text-white">
                    {formatMarketingLandingWorkflowNumber(index + 1, language)}
                  </span>
                </div>
                <h3
                  id={titleId}
                  className="mb-2 break-words text-lg font-bold text-[var(--ecode-text)] [overflow-wrap:anywhere] sm:text-xl"
                >
                  {copy[step.titleKey]}
                </h3>
                <p
                  id={descriptionId}
                  className="break-words text-base leading-relaxed text-[var(--ecode-text-muted)] [overflow-wrap:anywhere]"
                >
                  {copy[step.descriptionKey]}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
