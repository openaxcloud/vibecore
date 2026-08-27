import { detectUserLanguage, type SupportedLanguage } from './i18n/language';
import { USER_AREA_LOCALES, USER_AREA_TIME_ZONE } from './i18n/user-area-locale';

/**
 * Relative timestamps for list surfaces ("Updated 2 hours ago"). Callers that
 * render during SSR pass the active request language explicitly so the server
 * and client produce the same string. Beyond a week the relative form stops
 * being useful and we fall back to an absolute date.
 */
type RelativeFormatters = Readonly<{
  relative: Intl.RelativeTimeFormat;
  absoluteDate: Intl.DateTimeFormat;
  absoluteDateTime: Intl.DateTimeFormat;
}>;

const FORMATTERS = new Map<SupportedLanguage, RelativeFormatters>();

function formatters(language?: SupportedLanguage): RelativeFormatters {
  const resolvedLanguage = language ?? detectUserLanguage();
  const cached = FORMATTERS.get(resolvedLanguage);

  if (cached) {
    return cached;
  }

  const locale = USER_AREA_LOCALES[resolvedLanguage];

  const created = {
    relative: new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }),
    absoluteDate: new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: USER_AREA_TIME_ZONE,
    }),
    absoluteDateTime: new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: USER_AREA_TIME_ZONE,
    }),
  };

  FORMATTERS.set(resolvedLanguage, created);

  return created;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

function toDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

/** Full absolute form for tooltips ("Jul 3, 2026, 09:12 AM"). */
export function formatAbsoluteTime(value: string | number | Date, language?: SupportedLanguage): string {
  const date = toDate(value);

  return date ? formatters(language).absoluteDateTime.format(date) : '';
}

/**
 * "just now" (<45s), then minutes, hours, days — and past a week the absolute
 * date ("Jun 24, 2026"). Future dates degrade to the absolute form too.
 */
export function formatRelativeTime(
  value: string | number | Date,
  now: Date = new Date(),
  language?: SupportedLanguage,
): string {
  const date = toDate(value);

  if (!date) {
    return '';
  }

  const elapsedMs = now.getTime() - date.getTime();
  const { absoluteDate, relative } = formatters(language);

  if (elapsedMs < 0 || elapsedMs > WEEK_MS) {
    return absoluteDate.format(date);
  }

  if (elapsedMs < 45_000) {
    return relative.format(0, 'second');
  }

  if (elapsedMs < HOUR_MS) {
    return relative.format(-Math.round(elapsedMs / MINUTE_MS), 'minute');
  }

  if (elapsedMs < DAY_MS) {
    return relative.format(-Math.round(elapsedMs / HOUR_MS), 'hour');
  }

  return relative.format(-Math.round(elapsedMs / DAY_MS), 'day');
}
