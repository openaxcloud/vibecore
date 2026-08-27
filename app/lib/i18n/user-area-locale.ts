import { detectUserLanguage, type SupportedLanguage } from './language';

export const USER_AREA_LOCALE = 'en-GB';
export const USER_AREA_LOCALES = {
  en: 'en-GB',
  fr: 'fr-FR',
  es: 'es-ES',
  ar: 'ar',
} as const satisfies Record<SupportedLanguage, string>;
export const USER_AREA_TIME_ZONE = 'UTC';

type DateInput = Date | string | number;

function validDate(value: DateInput): Date | null {
  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function localeFor(language?: SupportedLanguage): string {
  return USER_AREA_LOCALES[language ?? detectUserLanguage()];
}

export function formatUserAreaNumber(
  value: number | bigint,
  options?: Intl.NumberFormatOptions,
  language?: SupportedLanguage,
): string {
  return new Intl.NumberFormat(localeFor(language), options).format(value);
}

export function formatUserAreaDate(
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
  language?: SupportedLanguage,
): string | null {
  const date = validDate(value);

  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat(
    localeFor(language),
    options ? { timeZone: USER_AREA_TIME_ZONE, ...options } : { dateStyle: 'medium', timeZone: USER_AREA_TIME_ZONE },
  ).format(date);
}

export function formatUserAreaTime(
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
  language?: SupportedLanguage,
): string | null {
  const date = validDate(value);

  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat(
    localeFor(language),
    options ? { timeZone: USER_AREA_TIME_ZONE, ...options } : { timeStyle: 'short', timeZone: USER_AREA_TIME_ZONE },
  ).format(date);
}

export function formatUserAreaDateTime(
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
  language?: SupportedLanguage,
): string | null {
  const date = validDate(value);

  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat(localeFor(language), {
    ...(options ?? {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
    timeZone: options?.timeZone ?? USER_AREA_TIME_ZONE,
  }).format(date);
}
