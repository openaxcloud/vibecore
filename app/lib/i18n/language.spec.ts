import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  USER_LANGUAGE_COOKIE,
  USER_LANGUAGE_STORAGE_KEY,
  detectUserLanguage,
  setUserLanguagePreference,
} from './language';

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
    vi.stubGlobal('document', { cookie: '' });
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

  it('reads the vibecore-lang cookie first, overriding localStorage', () => {
    /*
     * Server-set cookie is the cross-device source of truth, so a stale
     * localStorage from another tab shouldn't win over a freshly stored
     * preference the user set on a different device.
     */
    globalThis.localStorage.setItem(USER_LANGUAGE_STORAGE_KEY, 'fr');
    vi.stubGlobal('document', { cookie: `other=1; ${USER_LANGUAGE_COOKIE}=en; trailing=ok` });

    expect(detectUserLanguage()).toBe('en');
  });

  it('ignores an unsupported tag in the cookie and falls through to localStorage', () => {
    globalThis.localStorage.setItem(USER_LANGUAGE_STORAGE_KEY, 'fr');
    vi.stubGlobal('document', { cookie: `${USER_LANGUAGE_COOKIE}=klingon` });

    expect(detectUserLanguage()).toBe('fr');
  });

  it('decodes a percent-encoded cookie value', () => {
    vi.stubGlobal('document', { cookie: `${USER_LANGUAGE_COOKIE}=${encodeURIComponent('fr')}` });
    expect(detectUserLanguage()).toBe('fr');
  });
});
