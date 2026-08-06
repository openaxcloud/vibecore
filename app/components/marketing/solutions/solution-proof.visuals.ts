import type { SolutionCopy } from './solution-copy';
import type { SupportedLanguage } from '~/lib/i18n/language';
import type { Theme } from '~/lib/stores/theme';

/** New real-capture scope. Enterprise intentionally remains on its legacy UI. */
export const SOLUTION_PROOF_VISUAL_SLUGS = [
  'website-builder',
  'game-builder',
  'dashboard-builder',
  'chatbot-builder',
  'internal-ai-builder',
  'startups',
  'freelancers',
] as const;

export const LEGACY_SOLUTION_VISUAL_SLUG = 'enterprise' as const;

export const SOLUTION_SALES_PAGE_SLUGS = [...SOLUTION_PROOF_VISUAL_SLUGS, LEGACY_SOLUTION_VISUAL_SLUG] as const;

export type CapturedSolutionProofVisualSlug = (typeof SOLUTION_PROOF_VISUAL_SLUGS)[number];

/** Kept as the route-config compatibility type for all declined solution pages. */
export type SolutionProofVisualSlug = (typeof SOLUTION_SALES_PAGE_SLUGS)[number];
export type SolutionProofVisualLanguage = 'en' | 'fr';
export type SolutionProofVisualTheme = Theme;

export const SOLUTION_PROOF_VISUAL_THEMES = ['light', 'dark'] as const satisfies readonly SolutionProofVisualTheme[];

export const SOLUTION_PROOF_VISUAL_SLOTS = [
  'prompt',
  'preview',
  'webviewOverview',
  'iteration',
  'webviewIteration',
  'files',
] as const;

export type SolutionProofVisualSlot = (typeof SOLUTION_PROOF_VISUAL_SLOTS)[number];

export type SolutionProofVisualSource = Readonly<{
  src: string;
  width: 720 | 1440;
  height: 450 | 900;
}>;

export type SolutionProofVisualAsset = Readonly<{
  src: string;
  srcSet: string;
  sources: readonly [SolutionProofVisualSource, SolutionProofVisualSource];
  width: 1440;
  height: 900;
  language: SolutionProofVisualLanguage;
  theme: SolutionProofVisualTheme;
  slug: CapturedSolutionProofVisualSlug;
  slot: SolutionProofVisualSlot;
}>;

export type SolutionProofVisualSet = Readonly<Record<SolutionProofVisualSlot, SolutionProofVisualAsset>>;

export type SolutionProofVisualContent = Readonly<{
  title: string;
  body: string;
  alt: string;
}>;

export type SolutionProofVisualContentSet = Readonly<Record<SolutionProofVisualSlot, SolutionProofVisualContent>>;

const SOLUTION_PROOF_VISUAL_FILENAMES = {
  prompt: 'ide-agent-prompt',
  preview: 'ide-agent-preview',
  webviewOverview: 'ide-webview-overview',
  iteration: 'ide-agent-iteration',
  webviewIteration: 'ide-webview-iteration',
  files: 'ide-agent-files',
} as const satisfies Record<SolutionProofVisualSlot, string>;

function responsiveSource(
  slug: CapturedSolutionProofVisualSlug,
  language: SolutionProofVisualLanguage,
  theme: SolutionProofVisualTheme,
  slot: SolutionProofVisualSlot,
  width: 720 | 1440,
): SolutionProofVisualSource {
  return {
    src: `/assets/solutions/${slug}/${language}/${theme}/${SOLUTION_PROOF_VISUAL_FILENAMES[slot]}-${width}.webp`,
    width,
    height: width === 720 ? 450 : 900,
  };
}

function visualAsset(
  slug: CapturedSolutionProofVisualSlug,
  language: SolutionProofVisualLanguage,
  theme: SolutionProofVisualTheme,
  slot: SolutionProofVisualSlot,
): SolutionProofVisualAsset {
  const sources = [
    responsiveSource(slug, language, theme, slot, 720),
    responsiveSource(slug, language, theme, slot, 1440),
  ] as const;

  return {
    src: sources[1].src,
    srcSet: sources.map((source) => `${source.src} ${source.width}w`).join(', '),
    sources,
    width: 1440,
    height: 900,
    language,
    theme,
    slug,
    slot,
  };
}

function visualSet(
  slug: CapturedSolutionProofVisualSlug,
  language: SolutionProofVisualLanguage,
  theme: SolutionProofVisualTheme,
): SolutionProofVisualSet {
  return {
    prompt: visualAsset(slug, language, theme, 'prompt'),
    preview: visualAsset(slug, language, theme, 'preview'),
    webviewOverview: visualAsset(slug, language, theme, 'webviewOverview'),
    iteration: visualAsset(slug, language, theme, 'iteration'),
    webviewIteration: visualAsset(slug, language, theme, 'webviewIteration'),
    files: visualAsset(slug, language, theme, 'files'),
  };
}

function themedVisualSets(slug: CapturedSolutionProofVisualSlug, language: SolutionProofVisualLanguage) {
  return {
    light: visualSet(slug, language, 'light'),
    dark: visualSet(slug, language, 'dark'),
  } as const satisfies Record<SolutionProofVisualTheme, SolutionProofVisualSet>;
}

function localizedVisualSets(slug: CapturedSolutionProofVisualSlug) {
  return {
    en: themedVisualSets(slug, 'en'),
    fr: themedVisualSets(slug, 'fr'),
  } as const satisfies Record<SolutionProofVisualLanguage, Record<SolutionProofVisualTheme, SolutionProofVisualSet>>;
}

export const SOLUTION_PROOF_VISUAL_ASSETS = {
  'website-builder': localizedVisualSets('website-builder'),
  'game-builder': localizedVisualSets('game-builder'),
  'dashboard-builder': localizedVisualSets('dashboard-builder'),
  'chatbot-builder': localizedVisualSets('chatbot-builder'),
  'internal-ai-builder': localizedVisualSets('internal-ai-builder'),
  startups: localizedVisualSets('startups'),
  freelancers: localizedVisualSets('freelancers'),
} as const satisfies Record<
  CapturedSolutionProofVisualSlug,
  Record<SolutionProofVisualLanguage, Record<SolutionProofVisualTheme, SolutionProofVisualSet>>
>;

export function isCapturedSolutionProofVisualSlug(
  slug: SolutionProofVisualSlug,
): slug is CapturedSolutionProofVisualSlug {
  return slug !== LEGACY_SOLUTION_VISUAL_SLUG;
}

export function resolveSolutionProofVisualLanguage(language: SupportedLanguage): SolutionProofVisualLanguage {
  return language === 'fr' ? 'fr' : 'en';
}

export function getSolutionProofVisuals(
  slug: CapturedSolutionProofVisualSlug,
  language: SupportedLanguage,
  theme: SolutionProofVisualTheme,
) {
  return SOLUTION_PROOF_VISUAL_ASSETS[slug][resolveSolutionProofVisualLanguage(language)][theme];
}

/** Maps each real capture to page-authored, localized captions and alt text. */
export function getSolutionProofVisualContent(copy: SolutionCopy): SolutionProofVisualContentSet {
  const alts = copy.proofVisualAlts;

  if (!alts) {
    throw new Error('Captured solution copy is missing its six localized proof visual alternatives.');
  }

  return {
    prompt: {
      title: `${copy.proofLink.eyebrow} — ${copy.build.label}`,
      body: `${copy.build.promptText} ${copy.build.outputs[0].body}`,
      alt: alts.prompt,
    },
    preview: {
      ...copy.proofLink.preview,
      alt: alts.preview,
    },
    webviewOverview: {
      title: `${copy.demo.brand} — ${copy.demo.caption.title}`,
      body: copy.demo.caption.body,
      alt: alts.webviewOverview,
    },
    iteration: {
      ...copy.proofLink.iteration,
      alt: alts.iteration,
    },
    webviewIteration: {
      title: `${copy.demo.brand} — ${copy.features.items[0].title}`,
      body: `${copy.features.items[0].body} ${copy.features.items[1].body}`,
      alt: alts.webviewIteration,
    },
    files: {
      title: `${copy.demo.brand} — ${copy.deliverables.items[0].title}`,
      body: copy.deliverables.items[0].body,
      alt: alts.files,
    },
  };
}
