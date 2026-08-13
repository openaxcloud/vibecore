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
  APP_BUILDER_VISUAL_ASSETS,
  resolveAppBuilderVisualLanguage,
  type AppBuilderVisualAsset,
} from './app-builder.visuals';
import type { SolutionCopy } from './solution-copy';
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

export function SolutionSalesPage({ copy, language }: { copy: SolutionCopy; language: SupportedLanguage }) {
  const direction = language === 'ar' ? 'rtl' : 'ltr';

  return (
    <PublicShell language={language}>
      <main
        className="sol-sales"
        data-ecode-marketing-page={`solution-${copy.demo.brand.toLowerCase().replace(/\s+/g, '-')}`}
        data-testid="solution-page"
        aria-label={copy.aria.pageLabel}
        lang={language}
        dir={direction}
      >
        <Hero copy={copy} />
        <ProblemSection copy={copy} />
        <BuildSection copy={copy} />
        <ProofLinkBand copy={copy} language={language} />
        <DeliverablesSection copy={copy} />
        <FeaturesSection copy={copy} />
        <UseCasesSection copy={copy} />
        <FaqSection copy={copy} />
        <FinalCta copy={copy} />
      </main>
    </PublicShell>
  );
}

function Hero({ copy }: { copy: SolutionCopy }) {
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
        <DemoMock copy={copy} />
      </div>
    </section>
  );
}

function DemoMock({ copy }: { copy: SolutionCopy }) {
  const { demo } = copy;

  return (
    <figure className="sol-demo" aria-describedby="solution-demo-caption" data-testid="solution-demo">
      <div className="sol-demo__frame">
        <div className="sol-demo__chrome" aria-hidden>
          <span className="sol-demo__dot" />
          <span className="sol-demo__dot" />
          <span className="sol-demo__dot" />
          <span className="sol-demo__url">{demo.brand.toLowerCase().replace(/[^a-z0-9]+/g, '')}.example.test</span>
        </div>
        <div className="sol-demo__body" role="img" aria-label={demo.alt}>
          <div className="sol-demo__topbar">
            <div className="sol-demo__brand">
              <strong>{demo.brand}</strong>
              <span>{demo.brandType}</span>
            </div>
            <nav className="sol-demo__nav" aria-hidden>
              {demo.nav.map((item) => (
                <span key={item}>{item}</span>
              ))}
              <span className="sol-demo__badge">{demo.badge}</span>
            </nav>
          </div>
          <div className="sol-demo__hero">
            <p className="sol-demo__hero-eyebrow">{demo.eyebrow}</p>
            <h3>{demo.title}</h3>
            <p>{demo.intro}</p>
          </div>
          <div className="sol-demo__split">
            <div className="sol-demo__panel">
              <p className="sol-demo__panel-heading">{demo.primaryHeading}</p>
              <ul className="sol-demo__rows">
                {demo.primaryRows.map((row) => (
                  <li key={row.label}>
                    <span className="sol-demo__row-main">{row.label}</span>
                    <span className="sol-demo__row-meta">{row.meta}</span>
                    {row.status ? <span className="sol-demo__row-status">{row.status}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
            <aside className="sol-demo__aside">
              <p className="sol-demo__aside-heading">{demo.asideHeading}</p>
              <dl>
                {demo.asideRows.map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
              <span className="sol-demo__aside-cta">{demo.asideCta}</span>
            </aside>
          </div>
        </div>
      </div>
      <figcaption id="solution-demo-caption">
        <span>{demo.disclaimer}</span>
        <strong>{demo.caption.title}</strong>
        <p>{demo.caption.body}</p>
      </figcaption>
    </figure>
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

function ProofLinkBand({ copy, language }: { copy: SolutionCopy; language: SupportedLanguage }) {
  const visualLanguage = resolveAppBuilderVisualLanguage(language);
  const assets = APP_BUILDER_VISUAL_ASSETS[visualLanguage];

  return (
    <section className="sol-proof-link" aria-label={copy.aria.proofLinkLabel} data-testid="solution-proof-link">
      <div className="container-responsive sol-proof-link__layout">
        <div className="sol-proof-link__intro">
          <div>
            <p className="sol-eyebrow">
              <Sparkles aria-hidden />
              {copy.proofLink.eyebrow}
            </p>
            <h2>{copy.proofLink.title}</h2>
            <p>{copy.proofLink.body}</p>
          </div>
          <ActionLink
            to={`/solutions/app-builder?lang=${visualLanguage}`}
            action={copy.proofLink.cta}
            variant="secondary"
          />
        </div>

        <div
          className="sol-proof-link__gallery"
          role="group"
          aria-label={copy.proofLink.galleryLabel}
          data-testid="solution-ide-proof-gallery"
        >
          <SolutionProofVisual
            asset={assets.idePreview}
            content={copy.proofLink.preview}
            disclaimer={copy.proofLink.disclaimer}
            openFullSizeLabel={copy.proofLink.openFullSizeLabel}
            testId="solution-ide-preview"
          />
          <SolutionProofVisual
            asset={assets.ideIteration}
            content={copy.proofLink.iteration}
            disclaimer={copy.proofLink.disclaimer}
            openFullSizeLabel={copy.proofLink.openFullSizeLabel}
            testId="solution-ide-iteration"
          />
        </div>
      </div>
    </section>
  );
}

function SolutionProofVisual({
  asset,
  content,
  disclaimer,
  openFullSizeLabel,
  testId,
}: {
  asset: AppBuilderVisualAsset;
  content: SolutionCopy['proofLink']['preview'];
  disclaimer: string;
  openFullSizeLabel: string;
  testId: string;
}) {
  const captionId = `${testId}-caption`;

  return (
    <figure
      className="sol-product-visual sol-product-visual--ide-reference"
      aria-describedby={captionId}
      data-visual-language={asset.language}
      data-testid={testId}
    >
      <div className="sol-product-visual__media">
        <img
          src={asset.src}
          width={asset.width}
          height={asset.height}
          alt={content.alt}
          loading="lazy"
          decoding="async"
        />
      </div>
      <figcaption id={captionId}>
        <span>{disclaimer}</span>
        <strong>{content.title}</strong>
        <p>{content.body}</p>
        <a
          className="sol-product-visual__full-size"
          href={asset.src}
          target="_blank"
          rel="noopener"
          aria-label={`${openFullSizeLabel}: ${content.title}`}
          data-testid={`${testId}-open-full-size`}
        >
          <span>{openFullSizeLabel}</span>
          <ExternalLink aria-hidden />
        </a>
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
