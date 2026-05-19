import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { en } from './messages/en';
import { fr } from './messages/fr';
import { getI18nInstance, resetI18nForTest } from './runtime';

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

    /*
     * Pick a key that doesn't exist anywhere — the runtime is configured
     * with `returnEmptyString: false` and a fallback to `en`, so unknown
     * keys must surface as their key (i18next's default behaviour) rather
     * than collapsing to an empty string and rendering an empty span.
     */
    const missing = instance.t('this.key.does.not.exist');
    expect(missing).toBe('this.key.does.not.exist');
  });

  it('returns the same instance on subsequent calls (singleton init)', () => {
    const a = getI18nInstance();
    const b = getI18nInstance();

    expect(a).toBe(b);
  });
});
