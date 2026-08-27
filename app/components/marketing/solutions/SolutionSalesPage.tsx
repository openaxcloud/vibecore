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
  MessageSquareText,
  MonitorSmartphone,
  Rocket,
  ShieldCheck,
  Sparkles,
  Unplug,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import './solution-sales.css';
import {
  getSolutionAppShowcase,
  SOLUTION_SHOWCASE_UI,
  type SolutionAppShowcase,
  type SolutionAppVisual,
} from './solution-app-showcases';
import { toBilingual, type BilingualLanguage, type SolutionAppShowcaseSlug, type SolutionCopy } from './solution-copy';
import { EcodeExactPublicShell as PublicShell } from '~/components/marketing/ecode-exact/EcodeExactShell';
import type { SupportedLanguage } from '~/lib/i18n/language';

const problemIcons = [Unplug, Boxes, Clock3] as const satisfies readonly LucideIcon[];
const outputIcons = [MonitorSmartphone, Database, Workflow, Rocket] as const satisfies readonly LucideIcon[];

const deliverableIcons = [
  FileCode2,
  Database,
  MonitorSmartphone,
  Rocket,
  ShieldCheck,
  MessageSquareText,
] as const satisfies readonly LucideIcon[];

const featureIcons = [
  Workflow,
  Database,
  KeyRound,
  ShieldCheck,
  MonitorSmartphone,
  Code2,
] as const satisfies readonly LucideIcon[];

export function SolutionSalesPage({
  copy,
  language,
  solutionSlug,
}: {
  copy: SolutionCopy;
  language: SupportedLanguage;
  solutionSlug: SolutionAppShowcaseSlug;
}) {
  const direction = language === 'ar' ? 'rtl' : 'ltr';
  const visualLanguage = toBilingual(language);
  const showcase = getSolutionAppShowcase(solutionSlug);

  return (
    <PublicShell language={language}>
      <main
        className="sol-sales"
        data-ecode-marketing-page={`solution-${solutionSlug}`}
        data-testid="solution-page"
        aria-label={copy.aria.pageLabel}
        lang={language}
        dir={direction}
      >
        <Hero copy={copy} language={visualLanguage} visual={showcase.primary} />
        <ProofLinkBand language={visualLanguage} showcase={showcase} />
        <ProblemSection copy={copy} />
        <BuildSection copy={copy} />
        <DeliverablesSection copy={copy} />
        <FeaturesSection copy={copy} />
        <UseCasesSection copy={copy} />
        <FaqSection copy={copy} />
        <FinalCta copy={copy} />
      </main>
    </PublicShell>
  );
}

function Hero({
  copy,
  language,
  visual,
}: {
  copy: SolutionCopy;
  language: BilingualLanguage;
  visual: SolutionAppVisual;
}) {
  return (
    <section className="sol-hero" aria-label={copy.aria.heroLabel} data-testid="solution-hero">
      <div className="sol-hero__grid" aria-hidden />
      <div className="container-responsive sol-hero__layout">
        <div className="sol-hero__copy">
          <p className="sol-eyebrow">
            <Sparkles aria-hidden />
            {copy.hero.eyebrow}
          </p>
          <h1 className="sol-title">{copy.hero.title}</h1>
          <p className="sol-hero__subtitle">{copy.hero.subtitle}</p>
          <div className="sol-actions">
            <ActionLink to="/projects/new" action={copy.hero.primaryCta} />
            <ActionLink to="#build" action={copy.hero.secondaryCta} variant="secondary" />
          </div>
          <p className="sol-microcopy">
            <CircleCheck aria-hidden />
            {copy.hero.microcopy}
          </p>
        </div>
        <SolutionAppVisualCard visual={visual} language={language} eager hero testId="solution-demo" />
      </div>
    </section>
  );
}

function ProblemSection({ copy }: { copy: SolutionCopy }) {
  return (
    <section
      className="sol-section sol-section--problem"
      aria-label={copy.aria.problemLabel}
      data-testid="solution-problem"
    >
      <div className="container-responsive">
        <SectionHeading eyebrow={copy.problem.eyebrow} title={copy.problem.title} intro={copy.problem.intro} />
        <div className="sol-problem-grid">
          {copy.problem.obstacles.map((obstacle, index) => {
            const Icon = problemIcons[index];

            return (
              <article className="sol-problem-card" key={obstacle.title}>
                <span className="sol-icon-tile">
                  <Icon aria-hidden />
                </span>
                <h3>{obstacle.title}</h3>
                <p>{obstacle.body}</p>
              </article>
            );
          })}
        </div>
        <div className="sol-bridge">
          <ArrowRight aria-hidden />
          <p>{copy.problem.bridge}</p>
        </div>
      </div>
    </section>
  );
}

function BuildSection({ copy }: { copy: SolutionCopy }) {
  return (
    <section
      id="build"
      className="sol-section sol-section--prompt"
      aria-label={copy.aria.buildLabel}
      data-testid="solution-build"
    >
      <div className="container-responsive">
        <SectionHeading eyebrow={copy.build.eyebrow} title={copy.build.title} intro={copy.build.intro} />
        <div className="sol-prompt-layout">
          <div className="sol-prompt-card">
            <div className="sol-prompt-card__label">
              <MessageSquareText aria-hidden />
              {copy.build.label}
            </div>
            <blockquote>{copy.build.promptText}</blockquote>
            <div className="sol-prompt-card__command" aria-hidden>
              <span>E-Code</span>
              <ArrowRight />
              <span>{copy.build.outputs[0].title}</span>
            </div>
          </div>
          <ol className="sol-output-grid" aria-label={copy.aria.outputListLabel}>
            {copy.build.outputs.map((output, index) => {
              const Icon = outputIcons[index];

              return (
                <li key={output.title}>
                  <span className="sol-output-grid__number">0{index + 1}</span>
                  <span className="sol-icon-tile">
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
      </div>
    </section>
  );
}

function ProofLinkBand({ language, showcase }: { language: BilingualLanguage; showcase: SolutionAppShowcase }) {
  const ui = SOLUTION_SHOWCASE_UI[language];

  return (
    <section className="sol-proof-link" aria-label={ui.sectionLabel} data-testid="solution-proof-link">
      <div className="container-responsive sol-proof-link__layout">
        <div className="sol-proof-link__intro">
          <div>
            <p className="sol-eyebrow">
              <Sparkles aria-hidden />
              {ui.sectionEyebrow}
            </p>
            <h2>{ui.sectionTitle}</h2>
            <p>{ui.sectionBody}</p>
          </div>
        </div>

        <div
          className="sol-proof-link__gallery"
          role="group"
          aria-label={ui.sectionLabel}
          data-testid="solution-ide-proof-gallery"
        >
          <SolutionAppVisualCard visual={showcase.supporting} language={language} testId="solution-app-supporting" />
          <SolutionAppVisualCard visual={showcase.related} language={language} testId="solution-app-related" />
        </div>
      </div>
    </section>
  );
}

function SolutionAppVisualCard({
  visual,
  language,
  eager = false,
  hero = false,
  testId,
}: {
  visual: SolutionAppVisual;
  language: BilingualLanguage;
  eager?: boolean;
  hero?: boolean;
  testId: string;
}) {
  const captionId = `${testId}-caption`;
  const ui = SOLUTION_SHOWCASE_UI[language];

  return (
    <figure
      className={`sol-app-showcase${hero ? ' sol-app-showcase--hero' : ''}`}
      aria-describedby={captionId}
      data-gallery-app-id={visual.id}
      data-visual-kind="working-demo-app"
      data-testid={testId}
    >
      <div className="sol-app-showcase__chrome" aria-hidden>
        <span />
        <span />
        <span />
        <strong>{visual.name[language]}</strong>
        <em>{ui.realApp}</em>
      </div>
      <a
        className="sol-app-showcase__media"
        href={visual.previewHref}
        target="_blank"
        rel="noopener"
        aria-label={`${ui.openPreviewAria}: ${visual.name[language]}`}
      >
        <img
          src={visual.thumbnailSrc}
          width={1200}
          height={675}
          alt={visual.alt[language]}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={eager ? 'high' : 'auto'}
        />
        <span className="sol-app-showcase__open-hint">
          {ui.openPreview}
          <ExternalLink aria-hidden />
        </span>
      </a>
      <figcaption id={captionId}>
        <span>
          {ui.workingDemo} · {visual.capability[language]}
        </span>
        <strong>{visual.name[language]}</strong>
        <p>{visual.description[language]}</p>
      </figcaption>
    </figure>
  );
}

function DeliverablesSection({ copy }: { copy: SolutionCopy }) {
  return (
    <section
      className="sol-section sol-section--deliverables"
      aria-label={copy.aria.deliverablesLabel}
      data-testid="solution-deliverables"
    >
      <div className="container-responsive">
        <SectionHeading
          eyebrow={copy.deliverables.eyebrow}
          title={copy.deliverables.title}
          intro={copy.deliverables.intro}
        />
        <div className="sol-deliverables-grid">
          {copy.deliverables.items.map((item, index) => {
            const Icon = deliverableIcons[index];

            return (
              <article key={item.title}>
                <span className="sol-icon-tile">
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

function FeaturesSection({ copy }: { copy: SolutionCopy }) {
  return (
    <section
      className="sol-section sol-section--features"
      aria-label={copy.aria.featuresLabel}
      data-testid="solution-features"
    >
      <div className="container-responsive sol-features-layout">
        <div className="sol-features-intro">
          <SectionHeading eyebrow={copy.features.eyebrow} title={copy.features.title} intro={copy.features.intro} />
        </div>
        <div className="sol-features-list">
          {copy.features.items.map((item, index) => {
            const Icon = featureIcons[index];

            return (
              <article key={item.title}>
                <span className="sol-icon-tile">
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

function UseCasesSection({ copy }: { copy: SolutionCopy }) {
  return (
    <section
      className="sol-section sol-section--use-cases"
      aria-label={copy.aria.useCasesLabel}
      data-testid="solution-use-cases"
    >
      <div className="container-responsive">
        <SectionHeading eyebrow={copy.useCases.eyebrow} title={copy.useCases.title} intro={copy.useCases.intro} />
        <div className="sol-use-case-grid">
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

function FaqSection({ copy }: { copy: SolutionCopy }) {
  return (
    <section className="sol-section sol-section--faq" aria-label={copy.aria.faqLabel} data-testid="solution-faq">
      <div className="container-responsive sol-faq-layout">
        <SectionHeading eyebrow={copy.faq.eyebrow} title={copy.faq.title} intro={copy.faq.intro} />
        <div className="sol-faq-list">
          {copy.faq.items.map((item, index) => (
            <details key={item.title} open={index === 0}>
              <summary>
                <span>{item.title}</span>
                <i aria-hidden>+</i>
              </summary>
              <p>{item.body}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta({ copy }: { copy: SolutionCopy }) {
  return (
    <section className="sol-final-cta" aria-label={copy.aria.finalCtaLabel} data-testid="solution-final-cta">
      <div className="sol-final-cta__grid" aria-hidden />
      <div className="container-responsive sol-final-cta__layout">
        <div>
          <p className="sol-eyebrow">
            <Sparkles aria-hidden />
            {copy.hero.eyebrow}
          </p>
          <h2>{copy.finalCta.title}</h2>
          <p>{copy.finalCta.body}</p>
        </div>
        <div className="sol-actions">
          <ActionLink to="/projects/new" action={copy.finalCta.primaryCta} />
          <ActionLink to="#build" action={copy.finalCta.secondaryCta} variant="secondary" />
        </div>
      </div>
    </section>
  );
}

function SectionHeading({ eyebrow, title, intro }: { eyebrow: string; title: string; intro: string }) {
  return (
    <div className="sol-section-heading">
      <p className="sol-eyebrow">{eyebrow}</p>
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

  const className = `sol-action sol-action--${variant}`;
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
