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

export type SolutionProofVisualAsset = Readonly<{
  src: string;
  width: 1440;
  height: 900;
  language: SolutionProofVisualLanguage;
  slug: SolutionProofVisualSlug;
}>;

export type SolutionProofVisualSet = Readonly<{
  preview: SolutionProofVisualAsset;
  iteration: SolutionProofVisualAsset;
}>;

function visualAsset(
  slug: SolutionProofVisualSlug,
  language: SolutionProofVisualLanguage,
  file: 'ide-agent-preview.png' | 'ide-agent-iteration.png',
): SolutionProofVisualAsset {
  return {
    src: `/assets/solutions/${slug}/${language}/${file}`,
    width: 1440,
    height: 900,
    language,
    slug,
  };
}

function visualSet(slug: SolutionProofVisualSlug, language: SolutionProofVisualLanguage): SolutionProofVisualSet {
  return {
    preview: visualAsset(slug, language, 'ide-agent-preview.png'),
    iteration: visualAsset(slug, language, 'ide-agent-iteration.png'),
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
