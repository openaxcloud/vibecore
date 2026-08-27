import { useTranslation } from 'react-i18next';

import { adminRouteCatalog, translateAdminRoute, type AdminRouteTranslationKey } from './catalogs/admin-route';
import type { SupportedLanguage } from './language';

export type AdminRouteTranslator = (
  key: AdminRouteTranslationKey,
  values?: Readonly<Record<string, string | number>>,
) => string;

export const adminRouteEnglishT: AdminRouteTranslator = (key, values) => translateAdminRoute('en', key, values);

export function useAdminRouteTranslation(): {
  language: SupportedLanguage;
  t: AdminRouteTranslator;
} {
  const { i18n } = useTranslation();
  const language: SupportedLanguage = i18n.resolvedLanguage?.toLowerCase().startsWith('fr') ? 'fr' : 'en';

  return {
    language,
    t: (key, values) => translateAdminRoute(language, key, values),
  };
}

const adminRouteKeyByEnglish = new Map<string, AdminRouteTranslationKey>(
  Object.entries(adminRouteCatalog.en).map(([key, value]) => [value, key as AdminRouteTranslationKey]),
);

export function translateAdminRouteEnglish(language: SupportedLanguage, english: string): string {
  const key = adminRouteKeyByEnglish.get(english);
  return key ? translateAdminRoute(language, key) : english;
}
