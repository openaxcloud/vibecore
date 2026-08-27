import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { en } from './messages/en';
import { fr } from './messages/fr';
import { createI18nInstance, getI18nInstance, resetI18nForTest } from './runtime';

describe('i18next runtime', () => {
  beforeEach(() => {
    resetI18nForTest();
  });

  afterEach(() => {
    resetI18nForTest();
  });

  it('boots with the bundled en + fr resources and resolves a flat dotted key in both', () => {
    const instance = getI18nInstance();

    expect(instance.t('patchReview.title', { lng: 'en' })).toBe(en['patchReview.title']);
    expect(instance.t('patchReview.title', { lng: 'fr' })).toBe(fr['patchReview.title'] ?? en['patchReview.title']);
  });

  it('interpolates {placeholder} params using the legacy `{name}` brace syntax', () => {
    const instance = getI18nInstance();

    expect(instance.t('patchReview.filesCount', { count: 3, lng: 'en' })).toBe('3 files');
    expect(instance.t('patchReview.filesCount', { count: 3, lng: 'fr' })).toBe(
      (fr['patchReview.filesCount'] ?? '{count} files').replace('{count}', '3'),
    );
  });

  it('falls back to the English bundle when the active language is missing a key', () => {
    const instance = getI18nInstance();
    instance.changeLanguage('fr');

    // A programming error must never leak an implementation key to users.
    const missing = instance.t('this.key.does.not.exist');
    expect(missing).toBe(en['common.unavailable']);
  });

  it('returns the same instance on subsequent calls (singleton init)', () => {
    const a = getI18nInstance();
    const b = getI18nInstance();

    expect(a).toBe(b);
  });

  it('keeps request-scoped instances isolated during concurrent SSR renders', async () => {
    const english = createI18nInstance('en');
    const french = createI18nInstance('fr');

    expect(english.t('root.loadingPage')).toBe('Loading page');
    expect(french.t('root.loadingPage')).toBe('Chargement de la page');

    await french.changeLanguage('en');

    expect(english.language).toBe('en');
    expect(french.language).toBe('en');
    await french.changeLanguage('fr');
    expect(english.t('root.loadingPage')).toBe('Loading page');
    expect(french.t('root.loadingPage')).toBe('Chargement de la page');
  });
});
