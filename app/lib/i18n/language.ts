/**
 * Supported language detection for the i18n dictionary.
 *
 * The list is intentionally short — adding a language is a coordinated
 * change (bundle JSON + dictionary entry + QA pass). The detection
 * order is:
 *   1. The user-level preference key in localStorage.
 *   2. `navigator.language` truncated to its primary tag.
 *   3. Default to `'en'`.
 */

export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const USER_LANGUAGE_STORAGE_KEY = 'vibecore:user-language';

function isSupported(candidate: string): candidate is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(candidate);
}

export function detectUserLanguage(): SupportedLanguage {
  if (typeof globalThis !== 'undefined' && typeof globalThis.localStorage !== 'undefined') {
    try {
      const stored = globalThis.localStorage.getItem(USER_LANGUAGE_STORAGE_KEY);

      if (stored && isSupported(stored)) {
        return stored;
      }
    } catch {
      // ignore storage errors and fall through to navigator detection
    }
  }

  if (typeof globalThis !== 'undefined' && typeof globalThis.navigator !== 'undefined') {
    const raw = globalThis.navigator.language ?? '';
    const primary = raw.split('-')[0].toLowerCase();

    if (isSupported(primary)) {
      return primary;
    }
  }

  return 'en';
}

export function setUserLanguagePreference(language: SupportedLanguage): void {
  if (typeof globalThis === 'undefined' || typeof globalThis.localStorage === 'undefined') {
    return;
  }

  try {
    globalThis.localStorage.setItem(USER_LANGUAGE_STORAGE_KEY, language);
  } catch {
    // localStorage write failures are non-fatal — runtime stays in memory
  }
}
