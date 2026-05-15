import { afterEach, describe, expect, it } from 'vitest';

import { registerTranslationsForTest, setCurrentLanguage, t } from './dictionary';

const RESTORE: Array<() => void> = [];

afterEach(() => {
  while (RESTORE.length > 0) {
    RESTORE.pop()?.();
  }
  setCurrentLanguage('en');
});

describe('t() lookup', () => {
  it('returns the English seed when nothing is registered for the active language', () => {
    setCurrentLanguage('fr');
    expect(t('patchReview.title')).toBe('Files changed');
  });

  it('interpolates `{name}` placeholders from params', () => {
    expect(t('patchReview.filesCount', { count: 5 })).toBe('5 files');
  });

  it('uses the registered translation when present', () => {
    RESTORE.push(registerTranslationsForTest('fr', { 'patchReview.title': 'Fichiers modifiés' }));
    setCurrentLanguage('fr');
    expect(t('patchReview.title')).toBe('Fichiers modifiés');
  });

  it('keeps unknown placeholders as literal `{name}`', () => {
    expect(t('patchReview.filesCount')).toBe('{count} files');
  });
});
