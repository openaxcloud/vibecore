import { normalizeSupportedLanguage } from './language';

const LEGAL_MONTH_INDEX = {
  January: 0,
  February: 1,
  March: 2,
  April: 3,
  May: 4,
  June: 5,
  July: 6,
  August: 7,
  September: 8,
  October: 9,
  November: 10,
  December: 11,
} as const;

type LegalMonth = keyof typeof LEGAL_MONTH_INDEX;

export function formatLegalMonthYear(value: string, language?: string | null): string {
  const match = /^(\w+) (\d{4})$/.exec(value);

  if (!match) {
    return value;
  }

  const [, month, rawYear] = match;

  if (!(month in LEGAL_MONTH_INDEX)) {
    return value;
  }

  const year = Number(rawYear);

  if (!Number.isInteger(year)) {
    return value;
  }

  const locale = normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-GB';
  const date = new Date(Date.UTC(year, LEGAL_MONTH_INDEX[month as LegalMonth], 1));

  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(date);
}
