import { describe, expect, it } from 'vitest';
import {
  formatPublicGalleryCopy,
  formatPublicGalleryNumber,
  getPublicGalleryCopy,
  publicGalleryEn,
  publicGalleryFr,
} from './public-gallery';
import { getEcodeTemplateCategories, getEcodeTemplateCatalog } from '~/lib/marketing/ecode-template-catalog.server';

describe('public gallery catalog', () => {
  it('keeps complete EN/FR parity and falls back to English', () => {
    expect(Object.keys(publicGalleryFr).sort()).toEqual(Object.keys(publicGalleryEn).sort());
    expect(getPublicGalleryCopy('de-DE')).toBe(publicGalleryEn);
    expect(
      formatPublicGalleryCopy(publicGalleryFr['publicGallery.card.author'], {
        author: 'octocat',
      }),
    ).toBe('par octocat');
  });

  it('formats French counts and localizes curated template copy without changing repository identifiers', () => {
    expect(formatPublicGalleryNumber('fr-FR', 12_345)).toMatch(/^12[\s\u202f]345$/u);

    const english = getEcodeTemplateCatalog('en');
    const french = getEcodeTemplateCatalog('fr');
    const englishReact = english.find((template) => template.id === 'react-saas');
    const frenchReact = french.find((template) => template.id === 'react-saas');
    const englishExpo = english.find((template) => template.githubRepo === 'xKevIsDev/bolt-expo-template');
    const frenchExpo = french.find((template) => template.githubRepo === 'xKevIsDev/bolt-expo-template');

    expect(frenchReact).toMatchObject({
      id: englishReact?.id,
      category: englishReact?.category,
      name: 'SaaS React',
    });
    expect(frenchReact?.description).toContain('Modèle SaaS de production');
    expect(frenchExpo).toMatchObject({
      id: englishExpo?.id,
      githubRepo: englishExpo?.githubRepo,
      name: 'Application Expo',
    });
    expect(getEcodeTemplateCategories('fr').find((category) => category.slug === 'web')?.name).toBe('Applications web');
  });
});
