import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';

import { userAreaEn, userAreaFr } from './user-area';

describe('user-area translation catalog', () => {
  it.each([
    [0, 'Aucun déploiement'],
    [1, '1 déploiement'],
    [2, '2 déploiements'],
    [1000000, '1000000 déploiements'],
    [1000001, '1000001 déploiements'],
    [1000000000, '1000000000 déploiements'],
  ] as const)('renders %s deployments with only the French catalogue loaded', async (count, expected) => {
    // French documents load only French resources; an English fallback must not hide a missing plural form.
    const i18n = createInstance();
    await i18n.init({
      resources: { fr: { translation: userAreaFr } },
      lng: 'fr',
      fallbackLng: 'en',
      interpolation: { prefix: '{', suffix: '}', escapeValue: false },
      initImmediate: false,
      parseMissingKeyHandler: () => 'Unavailable',
    });

    expect(i18n.hasResourceBundle('en', 'translation')).toBe(false);
    expect(i18n.t('userArea.project.deploymentCount', { count })).toBe(expected);
  });

  it('keeps English and French keys and interpolation tokens in exact parity', () => {
    expect(Object.keys(userAreaFr).sort()).toEqual(Object.keys(userAreaEn).sort());

    for (const key of Object.keys(userAreaEn) as Array<keyof typeof userAreaEn>) {
      const tokens = (value: string) => [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/gu)].map((match) => match[1]).sort();
      expect(tokens(userAreaFr[key]), key).toEqual(tokens(userAreaEn[key]));
    }
  });

  it('uses reviewed French terminology while preserving technical identifiers', () => {
    expect(userAreaFr['userArea.template.aiAgent.stack']).toBe('RuntimeAdapter, outils, diffusion en continu');
    expect(userAreaFr['userArea.template.landingPage.stack']).toBe('Remix, contenu adaptatif');
    expect(userAreaFr['userArea.template.aiAgent.stack']).not.toMatch(/\bstreaming\b/iu);
    expect(userAreaFr['userArea.template.landingPage.stack']).not.toMatch(/\bresponsive\b/iu);
    expect(userAreaEn['userArea.template.aiAgent.stack']).toBe('RuntimeAdapter, tools, streaming');
    expect(userAreaEn['userArea.template.landingPage.stack']).toBe('Remix, responsive content');
  });
});
