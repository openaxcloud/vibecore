import { describe, expect, it } from 'vitest';

import { getTextDirection, isRtlLanguage } from './direction';

describe('i18n direction', () => {
  it('flags Arabic (and other RTL scripts) as rtl', () => {
    expect(isRtlLanguage('ar')).toBe(true);
    expect(isRtlLanguage('AR')).toBe(true);
    expect(isRtlLanguage('ar-EG')).toBe(true);
    expect(isRtlLanguage('he')).toBe(true);
    expect(isRtlLanguage('fa')).toBe(true);
  });

  it('keeps LTR languages left-to-right', () => {
    for (const ltr of ['en', 'fr', 'es', 'es-MX', 'de', '', null, undefined]) {
      expect(isRtlLanguage(ltr)).toBe(false);
    }
  });

  it('resolves the dir attribute value', () => {
    expect(getTextDirection('ar')).toBe('rtl');
    expect(getTextDirection('en')).toBe('ltr');
    expect(getTextDirection('fr')).toBe('ltr');
    expect(getTextDirection('es')).toBe('ltr');
  });
});
