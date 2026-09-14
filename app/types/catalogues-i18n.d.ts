/**
 * Module virtuel fourni par `build-config/catalogues-i18n-plugin.ts` :
 * l'URL du catalogue JSON de chaque langue (BUG-PERF-I18N-RACINE-001).
 */
declare module 'virtual:catalogues-i18n' {
  export const URLS: Readonly<Record<'en' | 'fr' | 'es' | 'ar', string>>;
}
