import { describe, expect, it } from 'vitest';

import type { SolutionCopyByLanguage } from './solution-copy';
import { createSolutionTranslator, type SolutionTranslationPath } from './solution-translator';
import { WEBSITE_BUILDER_COPY } from './website-builder.copy';

function withFrenchOverrides(overrides: Record<string, unknown>): SolutionCopyByLanguage {
  return {
    en: WEBSITE_BUILDER_COPY.en,
    fr: {
      ...WEBSITE_BUILDER_COPY.fr,
      ...overrides,
    },
  } as SolutionCopyByLanguage;
}

describe('solution translator', () => {
  it('reads a French UI or metadata leaf through a typed path', () => {
    const translator = createSolutionTranslator(WEBSITE_BUILDER_COPY, 'fr');
    const path: SolutionTranslationPath = 'seo.description';

    expect(translator.language).toBe('fr');
    expect(translator.t(path)).toBe(WEBSITE_BUILDER_COPY.fr.seo.description);
    expect(translator.t('aria.demoLabel')).toBe(WEBSITE_BUILDER_COPY.fr.aria.demoLabel);
    expect(translator.t('features.items.0.title')).toBe(WEBSITE_BUILDER_COPY.fr.features.items[0].title);
  });

  it('falls back leaf-by-leaf to English for missing or blank French content', () => {
    const catalogues = withFrenchOverrides({
      seo: {
        ...WEBSITE_BUILDER_COPY.fr.seo,
        description: '   ',
      },
    });

    const translator = createSolutionTranslator(catalogues, 'fr');

    expect(translator.t('seo.title')).toBe(WEBSITE_BUILDER_COPY.fr.seo.title);
    expect(translator.t('seo.description')).toBe(WEBSITE_BUILDER_COPY.en.seo.description);
    expect(translator.catalogue.seo.description).toBe(WEBSITE_BUILDER_COPY.en.seo.description);
  });

  it('uses English for every unsupported locale', () => {
    const translator = createSolutionTranslator(WEBSITE_BUILDER_COPY, 'es-MX');

    expect(translator.language).toBe('en');
    expect(translator.catalogue).toBe(WEBSITE_BUILDER_COPY.en);
    expect(translator.t('hero.primaryCta.ariaLabel')).toBe(WEBSITE_BUILDER_COPY.en.hero.primaryCta.ariaLabel);
  });
});
