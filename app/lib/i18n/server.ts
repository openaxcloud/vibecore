import type { TranslationBundle, TranslationKey } from './dictionary';
import { type SupportedLanguage } from './language';
import { ar } from './messages/ar';
import { en } from './messages/en';
import { es } from './messages/es';
import { fr } from './messages/fr';

const SERVER_MESSAGES: Record<SupportedLanguage, TranslationBundle> = {
  en,
  fr,
  es,
  ar,
};

/**
 * Request-safe translation lookup for loaders and route metadata.
 *
 * Unlike the browser singleton, this helper receives the resolved locale for
 * the current request. Missing translations always use the English catalog,
 * and interpolation follows the same single-brace convention as the client.
 */
export function translateServerMessage(
  language: SupportedLanguage | undefined,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const template = SERVER_MESSAGES[language ?? 'en']?.[key] ?? en[key] ?? en['common.unavailable'];

  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : `{${name}}`,
  );
}
