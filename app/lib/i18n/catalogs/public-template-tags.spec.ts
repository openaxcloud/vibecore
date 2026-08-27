import { describe, expect, it } from 'vitest';

import {
  getPublicTemplateTagLabel,
  publicTemplateTagLabelsEn,
  publicTemplateTagLabelsFr,
} from './public-template-tags';
import { createI18nInstance } from '~/lib/i18n/runtime';
import { getEcodeTemplateCatalog } from '~/lib/marketing/ecode-template-catalog.server';

describe('public template tag labels', () => {
  it('keeps exact EN/FR taxonomy parity', () => {
    expect(Object.keys(publicTemplateTagLabelsFr).sort()).toEqual(Object.keys(publicTemplateTagLabelsEn).sort());
  });

  it.each([
    ['frontend', 'Interface utilisateur'],
    ['dashboard', 'Tableau de bord'],
    ['streaming', 'Diffusion en continu'],
    ['deployments', 'Déploiements'],
    ['angular', 'Angular'],
    ['app', 'Application'],
  ])('localizes the %s display label without exposing its machine ID', (tag, label) => {
    expect(getPublicTemplateTagLabel(tag, 'fr-FR')).toBe(label);
  });

  it('covers every machine tag served by the public template catalogue', () => {
    const catalogTagIds = new Set(
      Object.keys(publicTemplateTagLabelsEn).map((key) => key.replace(/^publicTemplateTag\./u, '')),
    );

    const servedTagIds = new Set(getEcodeTemplateCatalog('en').flatMap((template) => template.tags));

    expect([...servedTagIds].filter((tag) => !catalogTagIds.has(tag)).sort()).toEqual([]);
  });

  it('formats English labels and preserves unknown IDs verbatim', () => {
    expect(getPublicTemplateTagLabel('nextjs', 'en-US')).toBe('Next.js');
    expect(getPublicTemplateTagLabel('future-framework', 'fr')).toBe('future-framework');
  });

  it('registers both catalogues in the central i18next runtime', () => {
    expect(createI18nInstance('en').t('publicTemplateTag.dashboard')).toBe('Dashboard');
    expect(createI18nInstance('fr').t('publicTemplateTag.dashboard')).toBe('Tableau de bord');
    expect(createI18nInstance('fr').t('publicTemplateTag.streaming')).toBe('Diffusion en continu');
  });
});
