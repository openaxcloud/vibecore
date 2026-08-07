import { describe, expect, it } from 'vitest';

import { detectMobileLanguage, getMobileCopy } from './i18n';

describe('mobile shell i18n', () => {
  it('keeps exact English and French catalogue parity', () => {
    expect(Object.keys(getMobileCopy('fr')).sort()).toEqual(Object.keys(getMobileCopy('en')).sort());
  });

  it('uses the manual cookie before automatic and browser detection', () => {
    expect(detectMobileLanguage('vibecore-lang=en; vibecore-auto-lang=fr', 'fr-FR')).toBe('en');
    expect(detectMobileLanguage('vibecore-auto-lang=fr', 'en-US')).toBe('fr');
  });

  it('detects French browsers on the first visit and defaults unsupported locales to English', () => {
    expect(detectMobileLanguage('', 'fr-CA')).toBe('fr');
    expect(detectMobileLanguage('', 'de-DE')).toBe('en');
  });

  it('provides professional French shell and error copy', () => {
    const copy = getMobileCopy('fr-FR');

    expect(copy.titleDashboard).toBe('Tableau de bord');
    expect(copy.navigationSettings).toBe('Paramètres');
    expect(copy.uploadFailed).toContain('Impossible d’importer');
    expect(copy.languageSwitchLabel).toBe('Passer à l’anglais');
  });
});
