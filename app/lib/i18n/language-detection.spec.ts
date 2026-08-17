/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectUserLanguage, setUserLanguagePreference, USER_LANGUAGE_STORAGE_KEY } from '~/lib/i18n/language';

afterEach(() => {
  localStorage.clear();
  document.cookie = 'vibecore-lang=; Max-Age=0; path=/';
  document.cookie = 'vibecore-auto-lang=; Max-Age=0; path=/';
  vi.restoreAllMocks();
});

describe('détection de langue au chargement', () => {
  it('navigateur FR -> FR', () => {
    vi.spyOn(globalThis.navigator, 'language', 'get').mockReturnValue('fr-FR');
    expect(detectUserLanguage()).toBe('fr');
  });

  it('navigateur EN -> EN', () => {
    vi.spyOn(globalThis.navigator, 'language', 'get').mockReturnValue('en-US');
    expect(detectUserLanguage()).toBe('en');
  });

  it('navigateur inconnu (de-DE) -> EN par défaut', () => {
    vi.spyOn(globalThis.navigator, 'language', 'get').mockReturnValue('de-DE');
    expect(detectUserLanguage()).toBe('en');
  });

  it('le réglage des Paramètres SURCHARGE la détection navigateur', () => {
    vi.spyOn(globalThis.navigator, 'language', 'get').mockReturnValue('en-US');
    setUserLanguagePreference('fr');
    expect(detectUserLanguage()).toBe('fr');
    expect(localStorage.getItem(USER_LANGUAGE_STORAGE_KEY)).toBe('fr');
  });

  it('la surcharge tient aussi dans le sens inverse (navigateur FR, réglage EN)', () => {
    vi.spyOn(globalThis.navigator, 'language', 'get').mockReturnValue('fr-FR');
    setUserLanguagePreference('en');
    expect(detectUserLanguage()).toBe('en');
  });
});
