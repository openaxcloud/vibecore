/**
 * Lightweight i18n dictionary + lookup for Phase 0 #7.
 *
 * Today this is the only i18n runtime: components import `t('namespace.key')`
 * and pass interpolation params; the lookup falls back to English when a key
 * isn't translated yet so partial coverage doesn't crash the UI. The roadmap
 * calls for a full react-i18next migration (lazy bundles per namespace + a
 * `User.language` column in Prisma + cookie propagation) but no `runtime.ts`
 * exists yet — until it does, this file is the entry point everywhere.
 */

import { detectUserLanguage, type SupportedLanguage } from './language';
import { ar } from './messages/ar';
import { en } from './messages/en';
import { es } from './messages/es';
import { fr } from './messages/fr';

/**
 * Bundled translation tables. New languages are added by importing
 * their JSON / TS bundle and registering it here. Keeping the shape
 * identical to the English seed keeps `t()` strongly typed.
 */
export type TranslationKey = keyof typeof en;
export type TranslationBundle = Partial<Record<TranslationKey, string>>;

const MESSAGES: Record<SupportedLanguage, TranslationBundle> = {
  en,
  fr,
  es,
  ar,
};

let currentLanguage: SupportedLanguage = detectUserLanguage();

export function getCurrentLanguage(): SupportedLanguage {
  return currentLanguage;
}

export function setCurrentLanguage(language: SupportedLanguage): void {
  currentLanguage = language;

  /*
   * Notify direction-aware surfaces (useTextDirection) so RTL/LTR flips without
   * a reload when the user switches language in-session.
   */
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vibecore:language-change', { detail: { language } }));
  }
}

/**
 * Lookup a translation key with optional `{name}` interpolation. Falls
 * back to the English seed when the current language doesn't have a
 * translation yet.
 */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const bundle = MESSAGES[currentLanguage] ?? {};
  const template = (bundle[key] as string | undefined) ?? en[key];

  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(params, name)) {
      return String(params[name]);
    }

    return `{${name}}`;
  });
}

/**
 * Tests-only escape hatch: register a translation bundle without
 * touching the build-time import graph. Returns an unregister fn.
 */
export function registerTranslationsForTest(language: SupportedLanguage, bundle: TranslationBundle): () => void {
  const previous = MESSAGES[language];
  MESSAGES[language] = { ...previous, ...bundle };

  return () => {
    MESSAGES[language] = previous;
  };
}
