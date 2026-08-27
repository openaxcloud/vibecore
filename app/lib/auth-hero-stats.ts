import type { TranslationKey } from './i18n/dictionary';

/*
 * Single source of truth for the auth hero stats. The login page previously
 * showed "21 AI providers" in the desktop panel but "21 AI models" in the mobile
 * strip — same number, contradictory label. Share one list so the figures can
 * never drift again; the desktop panel uses the first two, mobile uses all four.
 */
export const AUTH_HERO_STATS = [
  { value: '21', labelKey: 'auth.login.statProviders' },
  { value: '29+', labelKey: 'auth.login.statLanguages' },
  { value: '99.9%', labelKey: 'auth.login.statUptime' },
  { value: 'SOC2', labelKey: 'auth.login.statControls' },
] as const satisfies ReadonlyArray<{ value: string; labelKey: TranslationKey }>;
