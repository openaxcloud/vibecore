/**
 * Lightweight i18n dictionary + lookup for Phase 0 #7.
 *
 * The roadmap calls for a full react-i18next migration eventually, but a
 * single-file dictionary is the right shape for incremental adoption:
 * components import `t('namespace.key')` and pass interpolation params;
 * the lookup falls back to English when a key isn't translated yet so
 * partial coverage doesn't crash the UI.
 *
 * The full react-i18next runtime is wired in `app/lib/i18n/runtime.ts`
 * when we're ready to load translation bundles lazily. This file is the
 * compile-time-safe entry point.
 */

import { detectUserLanguage, type SupportedLanguage } from './language';
import { en } from './messages/en';

/**
 * Bundled translation tables. New languages are added by importing
 * their JSON / TS bundle and registering it here. Keeping the shape
 * identical to the English seed keeps `t()` strongly typed.
 */
export type TranslationKey = keyof typeof en;
type TranslationBundle = Partial<Record<TranslationKey, string>>;

const MESSAGES: Record<SupportedLanguage, TranslationBundle> = {
  en,
  fr: {},
};

let currentLanguage: SupportedLanguage = detectUserLanguage();

export function getCurrentLanguage(): SupportedLanguage {
  return currentLanguage;
}

export function setCurrentLanguage(language: SupportedLanguage): void {
  currentLanguage = language;
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
