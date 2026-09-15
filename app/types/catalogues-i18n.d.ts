/**
 * Module virtuel fourni par `build-config/catalogues-i18n-plugin.ts` :
 * l'URL du catalogue JSON de chaque couple (langue, surface).
 */
declare module 'virtual:catalogues-i18n' {
  import type { SupportedLanguage } from '~/lib/i18n/language';
  import type { Surface } from '~/lib/i18n/surfaces';

  export const URLS: Record<SupportedLanguage, Record<Surface, string>>;
}
