import type { SolutionCopy } from './solution-copy';
import type { SupportedLanguage } from '~/lib/i18n/language';

export const SOLUTION_PROOF_VISUAL_SLUGS = [
  'website-builder',
  'game-builder',
  'dashboard-builder',
  'chatbot-builder',
  'internal-ai-builder',
  'enterprise',
  'startups',
  'freelancers',
] as const;

export type SolutionProofVisualSlug = (typeof SOLUTION_PROOF_VISUAL_SLUGS)[number];
export type SolutionProofVisualLanguage = 'en' | 'fr';

export const SOLUTION_PROOF_VISUAL_SLOTS = [
  'prompt',
  'preview',
  'webviewOverview',
  'iteration',
  'webviewIteration',
  'files',
] as const;

export type SolutionProofVisualSlot = (typeof SOLUTION_PROOF_VISUAL_SLOTS)[number];

export type SolutionProofVisualAsset = Readonly<{
  src: string;
  width: 1440;
  height: 900;
  language: SolutionProofVisualLanguage;
  slug: SolutionProofVisualSlug;
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
  prompt: 'ide-agent-prompt.png',
  preview: 'ide-agent-preview.png',
  webviewOverview: 'ide-webview-overview.png',
  iteration: 'ide-agent-iteration.png',
  webviewIteration: 'ide-webview-iteration.png',
  files: 'ide-agent-files.png',
} as const satisfies Record<SolutionProofVisualSlot, string>;

function visualAsset(
  slug: SolutionProofVisualSlug,
  language: SolutionProofVisualLanguage,
  slot: SolutionProofVisualSlot,
): SolutionProofVisualAsset {
  return {
    src: `/assets/solutions/${slug}/${language}/${SOLUTION_PROOF_VISUAL_FILENAMES[slot]}`,
    width: 1440,
    height: 900,
    language,
    slug,
    slot,
  };
}

function visualSet(slug: SolutionProofVisualSlug, language: SolutionProofVisualLanguage): SolutionProofVisualSet {
  return {
    prompt: visualAsset(slug, language, 'prompt'),
    preview: visualAsset(slug, language, 'preview'),
    webviewOverview: visualAsset(slug, language, 'webviewOverview'),
    iteration: visualAsset(slug, language, 'iteration'),
    webviewIteration: visualAsset(slug, language, 'webviewIteration'),
    files: visualAsset(slug, language, 'files'),
  };
}

export const SOLUTION_PROOF_VISUAL_ASSETS = {
  'website-builder': {
    en: visualSet('website-builder', 'en'),
    fr: visualSet('website-builder', 'fr'),
  },
  'game-builder': {
    en: visualSet('game-builder', 'en'),
    fr: visualSet('game-builder', 'fr'),
  },
  'dashboard-builder': {
    en: visualSet('dashboard-builder', 'en'),
    fr: visualSet('dashboard-builder', 'fr'),
  },
  'chatbot-builder': {
    en: visualSet('chatbot-builder', 'en'),
    fr: visualSet('chatbot-builder', 'fr'),
  },
  'internal-ai-builder': {
    en: visualSet('internal-ai-builder', 'en'),
    fr: visualSet('internal-ai-builder', 'fr'),
  },
  enterprise: {
    en: visualSet('enterprise', 'en'),
    fr: visualSet('enterprise', 'fr'),
  },
  startups: {
    en: visualSet('startups', 'en'),
    fr: visualSet('startups', 'fr'),
  },
  freelancers: {
    en: visualSet('freelancers', 'en'),
    fr: visualSet('freelancers', 'fr'),
  },
} as const satisfies Record<SolutionProofVisualSlug, Record<SolutionProofVisualLanguage, SolutionProofVisualSet>>;

export function resolveSolutionProofVisualLanguage(language: SupportedLanguage): SolutionProofVisualLanguage {
  return language === 'fr' ? 'fr' : 'en';
}

export function getSolutionProofVisuals(slug: SolutionProofVisualSlug, language: SupportedLanguage) {
  return SOLUTION_PROOF_VISUAL_ASSETS[slug][resolveSolutionProofVisualLanguage(language)];
}

/**
 * Maps each real capture to page-authored, solution-specific prose. Reusing the
 * existing localized sales copy keeps captions honest: every label describes a
 * capability or screen that the corresponding page already promises and scopes.
 */
export function getSolutionProofVisualContent(copy: SolutionCopy): SolutionProofVisualContentSet {
  return {
    prompt: {
      title: `${copy.proofLink.eyebrow} — ${copy.build.label}`,
      body: `${copy.build.promptText} ${copy.build.outputs[0].body}`,
      alt: `${copy.aria.pageLabel}: ${copy.build.label}. ${copy.build.promptText}`,
    },
    preview: copy.proofLink.preview,
    webviewOverview: {
      title: `${copy.demo.brand} — ${copy.demo.caption.title}`,
      body: copy.demo.caption.body,
      alt: copy.demo.alt,
    },
    iteration: copy.proofLink.iteration,
    webviewIteration: {
      title: `${copy.demo.brand} — ${copy.features.items[0].title}`,
      body: `${copy.features.items[0].body} ${copy.features.items[1].body}`,
      alt: `${copy.demo.alt} ${copy.features.items[0].title}: ${copy.features.items[0].body}`,
    },
    files: {
      title: `${copy.demo.brand} — ${copy.deliverables.items[0].title}`,
      body: copy.deliverables.items[0].body,
      alt: `${copy.proofLink.preview.alt} ${copy.deliverables.items[0].title}.`,
    },
  };
}
