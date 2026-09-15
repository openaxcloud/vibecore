import {
  ArrowRight,
  Boxes,
  CircleCheck,
  Clock3,
  Code2,
  Database,
  ExternalLink,
  FileCode2,
  KeyRound,
  Mail,
  MessageSquareText,
  MonitorSmartphone,
  Rocket,
  Sparkles,
  Unplug,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { APP_BUILDER_COPY, type AppBuilderCopy } from './app-builder.copy';
import './app-builder.css';
import {
  APP_BUILDER_VISUAL_ASSETS,
  resolveAppBuilderVisualLanguage,
  type AppBuilderVisualAsset,
  type AppBuilderVisualSet,
} from './app-builder.visuals';
import { EcodeExactPublicShell as PublicShell } from '~/components/marketing/ecode-exact/EcodeExactShell';
import type { SupportedLanguage } from '~/lib/i18n/language';

const problemIcons = [Unplug, Boxes, Clock3] as const satisfies readonly LucideIcon[];
const outputIcons = [MonitorSmartphone, Database, Workflow, Rocket] as const satisfies readonly LucideIcon[];
const proofStepIcons = [MessageSquareText, Workflow, MonitorSmartphone] as const satisfies readonly LucideIcon[];

const deliverableIcons = [
  FileCode2,
  Database,
  MonitorSmartphone,
  Rocket,
  ExternalLink,
  MessageSquareText,
] as const satisfies readonly LucideIcon[];
const featureIcons = [
  Workflow,
  Database,
  KeyRound,
  Mail,
  MonitorSmartphone,
  Code2,
] as const satisfies readonly LucideIcon[];

export function AppBuilderSolutionPage({ language }: { language: SupportedLanguage }) {
  const copy = APP_BUILDER_COPY[language];
  const direction = language === 'ar' ? 'rtl' : 'ltr';
  const visualLanguage = resolveAppBuilderVisualLanguage(language);
  const visualAssets = APP_BUILDER_VISUAL_ASSETS[visualLanguage];

  return (
    <PublicShell language={language}>
      <main
        className="app-builder-sales"
        data-ecode-marketing-page="app-builder"
        data-testid="app-builder-page"
        aria-label={copy.aria.pageLabel}
        lang={language}
        dir={direction}
      >
        <Hero copy={copy} asset={visualAssets.hero} />
        <ProblemSection copy={copy} />
        <PromptSection copy={copy} assets={visualAssets} />
        <IdeProofSection copy={copy} assets={visualAssets} />
        <DeliverablesSection copy={copy} />
        <FeaturesSection copy={copy} asset={visualAssets.reminder} />
        <UseCasesSection copy={copy} />
        <FaqSection copy={copy} />
        <FinalCta copy={copy} />
      </main>
    </PublicShell>
  );
}

function Hero({ copy, asset }: { copy: AppBuilderCopy; asset: AppBuilderVisualAsset }) {
  return (
    <section className="app-builder-hero" aria-label={copy.aria.heroLabel} data-testid="app-builder-hero">
      <div className="app-builder-hero__grid" aria-hidden />
      <div className="container-responsive app-builder-hero__layout">
        <div className="app-builder-hero__copy">
          <p className="app-builder-eyebrow">
            <Sparkles aria-hidden />
            {copy.hero.eyebrow}
          </p>
          <h1 className="app-builder-title">{copy.hero.title}</h1>
          <p className="app-builder-hero__subtitle">{copy.hero.subtitle}</p>
          <div className="app-builder-actions">
            <ActionLink to="/projects/new" action={copy.hero.primaryCta} />
            <ActionLink to="#one-prompt" action={copy.hero.secondaryCta} variant="secondary" />
          </div>
          <p className="app-builder-microcopy">
            <CircleCheck aria-hidden />
            {copy.hero.microcopy}
          </p>
        </div>

        <ProductVisual
          asset={asset}
          content={copy.visuals.system}
          disclaimer={copy.visuals.disclaimer}
          className="app-builder-product-visual--hero"
          eager
          testId="app-builder-visual-hero"
        />
      </div>
    </section>
  );
}

function ProblemSection({ copy }: { copy: AppBuilderCopy }) {
  return (
    <section
      className="app-builder-section app-builder-section--problem"
      aria-label={copy.aria.problemLabel}
      data-testid="app-builder-problem"
    >
      <div className="container-responsive">
        <SectionHeading eyebrow={copy.problem.eyebrow} title={copy.problem.title} intro={copy.problem.intro} />
        <div className="app-builder-problem-grid">
          {copy.problem.obstacles.map((obstacle, index) => {
            const Icon = problemIcons[index];

            return (
              <article className="app-builder-problem-card" key={obstacle.title}>
                <span className="app-builder-icon-tile">
                  <Icon aria-hidden />
                </span>
                <h3>{obstacle.title}</h3>
                <p>{obstacle.body}</p>
              </article>
            );
          })}
        </div>
        <div className="app-builder-bridge">
          <ArrowRight aria-hidden />
          <p>{copy.problem.bridge}</p>
        </div>
      </div>
    </section>
  );
}

function PromptSection({ copy, assets }: { copy: AppBuilderCopy; assets: AppBuilderVisualSet }) {
  return (
    <section
      id="one-prompt"
      className="app-builder-section app-builder-section--prompt"
      aria-label={copy.aria.promptLabel}
      data-testid="app-builder-prompt"
    >
      <div className="container-responsive">
        <SectionHeading eyebrow={copy.prompt.eyebrow} title={copy.prompt.title} intro={copy.prompt.intro} />

        <div className="app-builder-prompt-layout">
          <div className="app-builder-prompt-card">
            <div className="app-builder-prompt-card__label">
              <MessageSquareText aria-hidden />
              {copy.prompt.label}
            </div>
            <blockquote aria-label={copy.aria.promptCodeLabel}>{copy.prompt.text}</blockquote>
            <div className="app-builder-prompt-card__command" aria-hidden>
              <span>E-Code</span>
              <ArrowRight />
              <span>{copy.prompt.demoLabels.statuses.items[0]}</span>
            </div>
          </div>

          <ol className="app-builder-output-grid" aria-label={copy.aria.outputListLabel}>
            {copy.prompt.outputs.map((output, index) => {
              const Icon = outputIcons[index];

              return (
                <li key={output.title}>
                  <span className="app-builder-output-grid__number">0{index + 1}</span>
                  <span className="app-builder-icon-tile">
                    <Icon aria-hidden />
                  </span>
                  <div>
                    <h3>{output.title}</h3>
                    <p>{output.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div
          className="app-builder-visual-gallery"
          role="group"
          aria-label={copy.visuals.galleryLabel}
          data-testid="app-builder-visual-gallery"
        >
          <ProductVisual
            asset={assets.booking}
            content={copy.visuals.items[0]}
            disclaimer={copy.visuals.disclaimer}
            className="app-builder-product-visual--booking"
            testId="app-builder-visual-booking"
          />
          <ProductVisual
            asset={assets.schedule}
            content={copy.visuals.items[1]}
            disclaimer={copy.visuals.disclaimer}
            testId="app-builder-visual-schedule"
          />
        </div>
      </div>
    </section>
  );
}

function IdeProofSection({ copy, assets }: { copy: AppBuilderCopy; assets: AppBuilderVisualSet }) {
  return (
    <section
      className="app-builder-section app-builder-section--proof"
      aria-label={copy.aria.ideProofLabel}
      data-testid="app-builder-ide-proof"
    >
      <div className="container-responsive">
        <SectionHeading eyebrow={copy.proof.eyebrow} title={copy.proof.title} intro={copy.proof.intro} />

        <ol className="app-builder-proof-steps">
          {copy.proof.steps.map((step, index) => {
            const Icon = proofStepIcons[index];

            return (
              <li key={step.title}>
                <span className="app-builder-proof-steps__number">0{index + 1}</span>
                <span className="app-builder-icon-tile">
                  <Icon aria-hidden />
                </span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="app-builder-proof-visuals">
          <ProductVisual
            asset={assets.idePreview}
            content={copy.proof.preview}
            disclaimer={copy.proof.disclaimer}
            className="app-builder-product-visual--ide-proof"
            openFullSizeLabel={copy.proof.openFullSizeLabel}
            testId="app-builder-visual-ide-preview"
          />
          <ProductVisual
            asset={assets.ideIteration}
            content={copy.proof.iteration}
            disclaimer={copy.proof.disclaimer}
            className="app-builder-product-visual--ide-iteration"
            openFullSizeLabel={copy.proof.openFullSizeLabel}
            testId="app-builder-visual-ide-iteration"
          />
        </div>
      </div>
    </section>
  );
}

function DeliverablesSection({ copy }: { copy: AppBuilderCopy }) {
  return (
    <section
      className="app-builder-section app-builder-section--deliverables"
      aria-label={copy.aria.deliverablesLabel}
      data-testid="app-builder-deliverables"
    >
      <div className="container-responsive">
        <SectionHeading
          eyebrow={copy.deliverables.eyebrow}
          title={copy.deliverables.title}
          intro={copy.deliverables.intro}
        />
        <div className="app-builder-deliverables-grid">
          {copy.deliverables.items.map((item, index) => {
            const Icon = deliverableIcons[index];

            return (
              <article key={item.title}>
                <span className="app-builder-icon-tile">
                  <Icon aria-hidden />
                </span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection({ copy, asset }: { copy: AppBuilderCopy; asset: AppBuilderVisualAsset }) {
  return (
    <section
      className="app-builder-section app-builder-section--features"
      aria-label={copy.aria.featuresLabel}
      data-testid="app-builder-features"
    >
      <div className="container-responsive app-builder-features-layout">
        <div className="app-builder-features-intro">
          <SectionHeading eyebrow={copy.features.eyebrow} title={copy.features.title} intro={copy.features.intro} />
          <ProductVisual
            asset={asset}
            content={copy.visuals.items[2]}
            disclaimer={copy.visuals.disclaimer}
            className="app-builder-product-visual--feature"
            testId="app-builder-visual-reminder"
          />
        </div>
        <div className="app-builder-features-list">
          {copy.features.items.map((item, index) => {
            const Icon = featureIcons[index];

            return (
              <article key={item.title}>
                <span className="app-builder-icon-tile">
                  <Icon aria-hidden />
                </span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function UseCasesSection({ copy }: { copy: AppBuilderCopy }) {
  return (
    <section
      className="app-builder-section app-builder-section--use-cases"
      aria-label={copy.aria.useCasesLabel}
      data-testid="app-builder-use-cases"
    >
      <div className="container-responsive">
        <SectionHeading eyebrow={copy.useCases.eyebrow} title={copy.useCases.title} intro={copy.useCases.intro} />
        <div className="app-builder-use-case-grid">
          {copy.useCases.items.map((item, index) => (
            <article key={item.title}>
              <span>0{index + 1}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqSection({ copy }: { copy: AppBuilderCopy }) {
  return (
    <section
      className="app-builder-section app-builder-section--faq"
      aria-label={copy.aria.faqLabel}
      data-testid="app-builder-faq"
    >
      <div className="container-responsive app-builder-faq-layout">
        <SectionHeading eyebrow={copy.faq.eyebrow} title={copy.faq.title} intro={copy.faq.intro} />
        <div className="app-builder-faq-list">
          {copy.faq.items.map((item, index) => (
            <details key={item.question} open={index === 0}>
              <summary>
                <span>{item.question}</span>
                <i aria-hidden>+</i>
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta({ copy }: { copy: AppBuilderCopy }) {
  return (
    <section className="app-builder-final-cta" aria-label={copy.aria.finalCtaLabel} data-testid="app-builder-final-cta">
      <div className="app-builder-final-cta__grid" aria-hidden />
      <div className="container-responsive app-builder-final-cta__layout">
        <div>
          <p className="app-builder-eyebrow">
            <Sparkles aria-hidden />
            {copy.hero.eyebrow}
          </p>
          <h2>{copy.finalCta.title}</h2>
          <p>{copy.finalCta.body}</p>
        </div>
        <div className="app-builder-actions">
          <ActionLink to="/projects/new" action={copy.finalCta.primaryCta} />
          <ActionLink to="#one-prompt" action={copy.finalCta.secondaryCta} variant="secondary" />
        </div>
      </div>
    </section>
  );
}

function ProductVisual({
  asset,
  className = '',
  content,
  disclaimer,
  eager = false,
  openFullSizeLabel,
  testId,
}: {
  asset: AppBuilderVisualAsset;
  className?: string;
  content: AppBuilderCopy['visuals']['system'];
  disclaimer: string;
  eager?: boolean;
  openFullSizeLabel?: string;
  testId: string;
}) {
  const captionId = `${testId}-caption`;

  const imagePriority = { fetchpriority: eager ? 'high' : 'low' };

  return (
    <figure
      className={`app-builder-product-visual ${className}`.trim()}
      aria-describedby={captionId}
      data-visual-language={asset.language}
      data-testid={testId}
    >
      <div className="app-builder-product-visual__media">
        <img
          {...imagePriority}
          src={asset.src}
          width={asset.width}
          height={asset.height}
          alt={content.alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
        />
      </div>
      <figcaption id={captionId}>
        <span>{disclaimer}</span>
        <strong>{content.title}</strong>
        <p>{content.body}</p>
        {openFullSizeLabel ? (
          <a
            className="app-builder-product-visual__full-size"
            href={asset.src}
            target="_blank"
            rel="noopener"
            aria-label={`${openFullSizeLabel}: ${content.title}`}
            data-testid={`${testId}-open-full-size`}
          >
            <span>{openFullSizeLabel}</span>
            <ExternalLink aria-hidden />
          </a>
        ) : null}
      </figcaption>
    </figure>
  );
}

function SectionHeading({ eyebrow, title, intro }: { eyebrow: string; title: string; intro: string }) {
  return (
    <div className="app-builder-section-heading">
      <p className="app-builder-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{intro}</p>
    </div>
  );
}

function ActionLink({
  action,
  to,
  variant = 'primary',
}: {
  action: Readonly<{ label: string; ariaLabel: string }>;
  to: string;
  variant?: 'primary' | 'secondary';
}) {
  const content: ReactNode = (
    <>
      <span>{action.label}</span>
      <ArrowRight aria-hidden />
    </>
  );

  const className = `app-builder-action app-builder-action--${variant}`;
  const accessibleName = `${action.label}. ${action.ariaLabel}`;

  if (to.startsWith('#')) {
    return (
      <a href={to} className={className} aria-label={accessibleName}>
        {content}
      </a>
    );
  }

  return (
    <Link to={to} className={className} aria-label={accessibleName}>
      {content}
    </Link>
  );
}
