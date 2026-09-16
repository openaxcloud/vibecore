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
export const AUTO_LANGUAGE_COOKIE = 'vibecore-auto-lang';

export function isSupportedLanguage(candidate: string): candidate is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(candidate);
}

export function normalizeSupportedLanguage(candidate: string | null | undefined): SupportedLanguage | undefined {
  const primary = candidate?.trim().toLowerCase().split(/[-_]/)[0];

  return primary && isSupportedLanguage(primary) ? primary : undefined;
}

function readCookie(name: string): string | undefined {
  if (typeof globalThis === 'undefined' || typeof globalThis.document === 'undefined') {
    return undefined;
  }

  const raw = globalThis.document.cookie ?? '';

  if (!raw) {
    return undefined;
  }

  for (const segment of raw.split(';')) {
    const trimmed = segment.trim();

    if (!trimmed.startsWith(`${name}=`)) {
      continue;
    }

    const value = trimmed.slice(name.length + 1);

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return undefined;
}

export function detectUserLanguage(): SupportedLanguage {
  const fromCookie = normalizeSupportedLanguage(readCookie(USER_LANGUAGE_COOKIE));

  if (fromCookie) {
    return fromCookie;
  }

  if (typeof globalThis !== 'undefined' && typeof globalThis.localStorage !== 'undefined') {
    try {
      const stored = globalThis.localStorage.getItem(USER_LANGUAGE_STORAGE_KEY);

      if (stored && isSupportedLanguage(stored)) {
        return stored;
      }
    } catch {
      // ignore storage errors and fall through to navigator detection
    }
  }

  const fromAutomaticCookie = normalizeSupportedLanguage(readCookie(AUTO_LANGUAGE_COOKIE));

  if (fromAutomaticCookie) {
    return fromAutomaticCookie === 'fr' ? 'fr' : 'en';
  }

  if (typeof globalThis !== 'undefined' && typeof globalThis.navigator !== 'undefined') {
    const detected = normalizeSupportedLanguage(globalThis.navigator.language);

    return detected === 'fr' ? 'fr' : 'en';
  }

  return 'en';
}

/**
 * Efface le choix explicite pour revenir à la détection automatique.
 *
 * Sans cela, « Automatique » ne serait pas réellement atteignable : une fois le
 * cookie `vibecore-lang` posé, il gagne sur tout le reste — y compris sur
 * `navigator.language` — et l'utilisateur resterait figé dans la langue choisie
 * une fois, sans moyen de rendre la main au navigateur.
 *
 * Le cookie est expiré sur les deux portées possibles (hôte courant ET
 * `.e-code.ai`), parce que `setUserLanguagePreference` pose la variante à
 * domaine sur la production : n'en effacer qu'une laisserait l'autre décider.
 */
export function clearUserLanguagePreference(): void {
  if (typeof globalThis === 'undefined') {
    return;
  }

  if (typeof globalThis.localStorage !== 'undefined') {
    try {
      globalThis.localStorage.removeItem(USER_LANGUAGE_STORAGE_KEY);
    } catch {
      // Même raison qu'à l'écriture : le cookie reste la source qui fait foi.
    }
  }

  if (typeof globalThis.document !== 'undefined') {
    const secure = globalThis.location?.protocol === 'https:' ? '; Secure' : '';
    const expire = `${USER_LANGUAGE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;

    globalThis.document.cookie = `${expire}${secure}`;
    globalThis.document.cookie = `${expire}; Domain=.e-code.ai${secure}`;
  }
}

export function setUserLanguagePreference(language: SupportedLanguage): void {
  if (typeof globalThis === 'undefined') {
    return;
  }

  if (typeof globalThis.localStorage !== 'undefined') {
    try {
      globalThis.localStorage.setItem(USER_LANGUAGE_STORAGE_KEY, language);
    } catch {
      // localStorage write failures are non-fatal — the cookie remains authoritative
    }
  }

  if (typeof globalThis.document !== 'undefined') {
    const secure = globalThis.location?.protocol === 'https:' ? '; Secure' : '';
    const hostname = globalThis.location?.hostname?.toLowerCase() ?? '';
    const domain = hostname === 'e-code.ai' || hostname.endsWith('.e-code.ai') ? '; Domain=.e-code.ai' : '';
    globalThis.document.cookie = `${USER_LANGUAGE_COOKIE}=${encodeURIComponent(language)}; Path=/; Max-Age=31536000; SameSite=Lax${domain}${secure}`;
  }
}
