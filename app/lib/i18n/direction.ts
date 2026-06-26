/**
 * Text-direction (LTR / RTL) resolution for the i18n layer.
 *
 * Direction is a *layout* concern that is intentionally decoupled from
 * translation completeness: a language can be in RTL_LANGUAGES and still fall
 * back to the English seed for untranslated keys. Arabic ('ar') is the first
 * RTL language shipped; the others are listed so a future bundle automatically
 * gets correct mirroring without touching call sites.
 *
 * Surfaces that contain user/agent text (the agent-chat panel, message list and
 * the prompt/content editor) read `useTextDirection()` and set `dir` on their
 * container so only those regions mirror — the IDE chrome (sidebars, toolbars)
 * stays LTR, which keeps the other languages (en/fr/es) completely unchanged.
 */

import { useEffect, useState } from 'react';

import { detectUserLanguage } from './language';

export type TextDirection = 'ltr' | 'rtl';

/** Primary language subtags whose script is written right-to-left. */
export const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur', 'ps', 'dv', 'syr', 'ckb'] as const;

/** True when the given language tag (any region, any case) is right-to-left. */
export function isRtlLanguage(language: string | null | undefined): boolean {
  if (!language) {
    return false;
  }

  const primary = language.split(/[-_]/)[0].toLowerCase();

  return (RTL_LANGUAGES as readonly string[]).includes(primary);
}

/** Resolve a language tag to its text direction. */
export function getTextDirection(language: string | null | undefined): TextDirection {
  return isRtlLanguage(language) ? 'rtl' : 'ltr';
}

/**
 * Reactive text direction for the active UI language. Re-resolves when the
 * `vibecore:language-change` event fires (dispatched by the language setter) so
 * switching language flips affected surfaces without a reload. Falls back to the
 * detected language on mount; safe during SSR (returns 'ltr').
 */
export function useTextDirection(): TextDirection {
  const [direction, setDirection] = useState<TextDirection>(() =>
    typeof document === 'undefined' ? 'ltr' : getTextDirection(detectUserLanguage()),
  );

  useEffect(() => {
    const resolve = () => setDirection(getTextDirection(detectUserLanguage()));

    resolve();
    window.addEventListener('vibecore:language-change', resolve);
    window.addEventListener('storage', resolve);

    return () => {
      window.removeEventListener('vibecore:language-change', resolve);
      window.removeEventListener('storage', resolve);
    };
  }, []);

  return direction;
}
