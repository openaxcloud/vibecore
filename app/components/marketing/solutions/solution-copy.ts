import type { SupportedLanguage } from '~/lib/i18n/language';

/**
 * Shared content contract for the solution sales pages (SOL-02 → SOL-09).
 *
 * These pages reuse the App Builder gabarit's structure (hero, problem, build,
 * deliverables, capabilities, use cases, FAQ, CTA). Their photographed working
 * applications are registered separately in `solution-app-showcases.ts`, so
 * editorial copy cannot silently substitute a decorative or unrelated visual.
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

export type SolutionCopy = Readonly<{
  seo: Readonly<{ title: string; description: string }>;
  hero: Readonly<{
    eyebrow: string;
    title: string;
    subtitle: string;
    primaryCta: ActionCopy;
    secondaryCta: ActionCopy;
    microcopy: string;
  }>;
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
export type SolutionAppShowcaseSlug =
  | 'website-builder'
  | 'game-builder'
  | 'dashboard-builder'
  | 'chatbot-builder'
  | 'internal-ai-builder'
  | 'enterprise'
  | 'startups'
  | 'freelancers';
export type SolutionCopyByLanguage = Record<BilingualLanguage, SolutionCopy>;

export function toBilingual(language: SupportedLanguage): BilingualLanguage {
  return language === 'fr' ? 'fr' : 'en';
}

/** Metadata used by the shared route helper for each solution. */
export type SolutionRouteConfig = Readonly<{
  slug: SolutionAppShowcaseSlug;
  canonicalUrl: string;
  ogImage: Readonly<{ en: string; fr: string }>;
}>;
