/**
 * react-i18next runtime that takes over from the legacy `dictionary.ts`
 * lookup. Phase 0 #7 slice 1 — the provider boots i18next with the
 * existing en/fr bundles so components can switch to the `useTranslation()`
 * hook without breaking the synchronous `t()` import path the rest of the
 * codebase still uses. The two paths share the same source of truth (the
 * `messages/{en,fr}.ts` modules), so a translation added to either is
 * visible from both surfaces.
 *
 * Slice 1 stays client-only on purpose: no `remix-i18next` SSR wiring, no
 * lazy bundles per namespace. The dictionary's keys are already flat
 * "<namespace>.<key>" strings (e.g. `patchReview.title`), so the
 * i18next resource shape is intentionally a single `translation`
 * namespace keyed by the same composite string — moving call sites over
 * is a like-for-like rename later.
 */

import i18next, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { detectUserLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from './language';
import { ar } from './messages/ar';
import { en } from './messages/en';
import { es } from './messages/es';
import { fr } from './messages/fr';

const RESOURCES: Record<SupportedLanguage, { translation: Record<string, string> }> = {
  en: { translation: { ...en } },
  fr: { translation: { ...fr } },
  es: { translation: { ...es } },
  ar: { translation: { ...ar } },
};

let initialized = false;

export function getI18nInstance(): I18nInstance {
  if (!initialized) {
    i18next
      .use(initReactI18next)
      .init({
        resources: RESOURCES,
        lng: detectUserLanguage(),
        fallbackLng: 'en',
        supportedLngs: [...SUPPORTED_LANGUAGES],
        interpolation: {
          /*
           * React already escapes interpolated values; double escaping
           * would render &amp; in tooltips. The legacy `t()` helper
           * matched this behaviour, so flip the i18next default off to
           * keep the two paths byte-identical.
           */
          escapeValue: false,
          prefix: '{',
          suffix: '}',
        },
        returnNull: false,
        returnEmptyString: false,
      })
      .catch(() => {
        /*
         * Init only fails on truly bad config; nothing to do at runtime —
         * the fallbackLng path returns the key as the value, which is the
         * same degraded behaviour the old `t()` already had.
         */
      });

    initialized = true;
  }

  return i18next;
}

/**
 * Tests-only reset so a spec can boot i18next fresh between cases without
 * leaking interpolation prefix overrides into the next module.
 */
export function resetI18nForTest(): void {
  initialized = false;
}
