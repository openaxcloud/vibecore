/**
 * Supported language detection for the i18n dictionary.
 *
 * The list is intentionally short — adding a language is a coordinated
 * change (bundle JSON + dictionary entry + QA pass). The detection
 * order is:
 *   1. The `vibecore-lang` cookie, set by PATCH /auth/me when the user
 *      picks a language. Authoritative across devices because the server
 *      mirrors it from the persisted User.language column.
 *   2. The user-level preference key in localStorage. Pre-auth / offline
 *      fallback so unauthenticated users keep their language across tabs.
 *   3. `navigator.language` truncated to its primary tag.
 *   4. Default to `'en'`.
 */

export const SUPPORTED_LANGUAGES = ['en', 'fr', 'es', 'ar'] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const USER_LANGUAGE_STORAGE_KEY = 'vibecore:user-language';
export const USER_LANGUAGE_COOKIE = 'vibecore-lang';

function isSupported(candidate: string): candidate is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(candidate);
}

function readLanguageCookie(): string | undefined {
  if (typeof globalThis === 'undefined' || typeof globalThis.document === 'undefined') {
    return undefined;
  }

  const raw = globalThis.document.cookie ?? '';

  if (!raw) {
    return undefined;
  }

  for (const segment of raw.split(';')) {
    const trimmed = segment.trim();

    if (!trimmed.startsWith(`${USER_LANGUAGE_COOKIE}=`)) {
      continue;
    }

    const value = trimmed.slice(USER_LANGUAGE_COOKIE.length + 1);

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return undefined;
}

export function detectUserLanguage(): SupportedLanguage {
  const fromCookie = readLanguageCookie();

  if (fromCookie && isSupported(fromCookie)) {
    return fromCookie;
  }

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
