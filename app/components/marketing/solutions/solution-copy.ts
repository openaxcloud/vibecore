import type { SolutionProofVisualSlug } from './solution-proof.visuals';
import type { SupportedLanguage } from '~/lib/i18n/language';

/**
 * Shared content contract for the declined solution sales pages (SOL-02 → SOL-09).
 *
 * These pages reuse the App Builder gabarit's structure (hero, problem, build,
 * deliverables, capabilities, use cases, FAQ, CTA) but render an inline, fully
 * responsive product demonstration mock, then show localized, solution-specific
 * IDE captures as clearly-labelled proof of the real E-Code build loop. The
 * page-specific mock is never presented as a generation record.
 */

export type ActionCopy = Readonly<{ label: string; ariaLabel: string }>;
export type ContentItem = Readonly<{ title: string; body: string }>;

type ThreeItems = readonly [ContentItem, ContentItem, ContentItem];
type FourItems = readonly [ContentItem, ContentItem, ContentItem, ContentItem];
type FiveItems = readonly [ContentItem, ContentItem, ContentItem, ContentItem, ContentItem];
type SixItems = readonly [ContentItem, ContentItem, ContentItem, ContentItem, ContentItem, ContentItem];

export type DemoRow = Readonly<{ label: string; meta: string; status?: string }>;
export type DemoAsideRow = Readonly<{ label: string; value: string }>;

/**
 * Inline product demonstration. Renders as a browser-framed, responsive mock of
 * a realistic product screen for the use case. All data is fictional and labeled.
 */
export type SolutionDemo = Readonly<{
  badge: string;
  brand: string;
  brandType: string;
  nav: readonly [string, string, string];
  eyebrow: string;
  title: string;
  intro: string;
  primaryHeading: string;
  primaryRows: readonly [DemoRow, DemoRow, DemoRow];
  asideHeading: string;
  asideRows: readonly [DemoAsideRow, DemoAsideRow, DemoAsideRow];
  asideCta: string;
  disclaimer: string;
  caption: ContentItem;
  alt: string;
}>;

/**
 * Localized alternatives for the six real capture placements. Copy modules can
 * provide the authored descriptions incrementally; the renderer derives a
 * localized description from existing copy until every page supplies them.
 */
export type SolutionProofVisualAltCopy = Readonly<{
  prompt: string;
  preview: string;
  webviewOverview: string;
  iteration: string;
  webviewIteration: string;
  files: string;
}>;

export type SolutionCopy = Readonly<{
  seo: Readonly<{ title: string; description: string; ogImageAlt: string }>;
  hero: Readonly<{
    eyebrow: string;
    title: string;
    subtitle: string;
    primaryCta: ActionCopy;
    secondaryCta: ActionCopy;
    microcopy: string;
  }>;
  languageSwitch: Readonly<{ label: string; english: string; french: string }>;
  demo: SolutionDemo;
  problem: Readonly<{
    eyebrow: string;
    title: string;
    intro: string;
    obstacles: ThreeItems;
    bridge: string;
  }>;
  build: Readonly<{
    eyebrow: string;
    title: string;
    intro: string;
    label: string;
    promptText: string;
    outputs: FourItems;
  }>;
  proofLink: Readonly<{
    eyebrow: string;
    title: string;
    body: string;
    cta: ActionCopy;
    galleryLabel: string;
    disclaimer: string;
    openFullSizeLabel: string;
    preview: ContentItem & Readonly<{ alt: string }>;
    iteration: ContentItem & Readonly<{ alt: string }>;
  }>;
  proofVisualAlts?: SolutionProofVisualAltCopy;
  deliverables: Readonly<{ eyebrow: string; title: string; intro: string; items: SixItems }>;
  features: Readonly<{ eyebrow: string; title: string; intro: string; items: SixItems }>;
  useCases: Readonly<{ eyebrow: string; title: string; intro: string; items: FourItems }>;
  faq: Readonly<{ eyebrow: string; title: string; intro: string; items: FiveItems }>;
  finalCta: Readonly<{ title: string; body: string; primaryCta: ActionCopy; secondaryCta: ActionCopy }>;
  aria: Readonly<{
    pageLabel: string;
    heroLabel: string;
    demoLabel: string;
    problemLabel: string;
    buildLabel: string;
    outputListLabel: string;
    proofLinkLabel: string;
    deliverablesLabel: string;
    featuresLabel: string;
    useCasesLabel: string;
    faqLabel: string;
    finalCtaLabel: string;
  }>;
}>;

/**
 * The declined solution pages are authored bilingual (English + French). Other
 * supported languages (es, ar) fall back to English via the shared route helper,
 * which clamps the resolved language before selecting copy.
 */
export type BilingualLanguage = 'en' | 'fr';
export type SolutionCopyByLanguage = Record<BilingualLanguage, SolutionCopy>;

export type CapturedSolutionCopy = SolutionCopy &
  Readonly<{
    proofVisualAlts: SolutionProofVisualAltCopy;
  }>;
export type CapturedSolutionCopyByLanguage = Record<BilingualLanguage, CapturedSolutionCopy>;

export function toBilingual(language: SupportedLanguage): BilingualLanguage {
  return language === 'fr' ? 'fr' : 'en';
}

/** Metadata used by the shared route helper for each declined solution. */
export type SolutionRouteConfig = Readonly<{
  slug: SolutionProofVisualSlug;
  canonicalUrl: string;
  ogImage: Readonly<{ en: string; fr: string }>;
}>;
