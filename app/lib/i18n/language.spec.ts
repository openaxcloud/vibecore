import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { USER_LANGUAGE_STORAGE_KEY, detectUserLanguage, setUserLanguagePreference } from './language';

describe('detectUserLanguage', () => {
  beforeEach(() => {
    /*
     * The detection helper reads `globalThis.localStorage` and
     * `globalThis.navigator`. We stub both so the test is hermetic.
     */
    const memoryStore = new Map<string, string>();

    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memoryStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memoryStore.set(key, value);
      },
      removeItem: (key: string) => {
        memoryStore.delete(key);
      },
    });

    vi.stubGlobal('navigator', { language: 'en-US' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the stored preference when present', () => {
    globalThis.localStorage.setItem(USER_LANGUAGE_STORAGE_KEY, 'fr');
    expect(detectUserLanguage()).toBe('fr');
  });

  it('falls back to navigator.language primary tag', () => {
    vi.stubGlobal('navigator', { language: 'fr-CA' });
    expect(detectUserLanguage()).toBe('fr');
  });

  it('defaults to English when nothing matches', () => {
    vi.stubGlobal('navigator', { language: 'pt-BR' });
    expect(detectUserLanguage()).toBe('en');
  });

  it('setUserLanguagePreference writes through localStorage', () => {
    setUserLanguagePreference('fr');
    expect(globalThis.localStorage.getItem(USER_LANGUAGE_STORAGE_KEY)).toBe('fr');
  });
});
