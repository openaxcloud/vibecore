import { USER_AREA_LOCALE, USER_AREA_TIME_ZONE } from './i18n/user-area-locale';

/**
 * Relative timestamps for list surfaces ("Updated 2 hours ago"). Fixed 'en'
 * locale — the product UI is English — so server and client render the same
 * string. Beyond a week the relative form stops being useful and we fall back
 * to an absolute date.
 */
const relativeFormatter = new Intl.RelativeTimeFormat(USER_AREA_LOCALE, { numeric: 'auto' });

const absoluteDateFormatter = new Intl.DateTimeFormat(USER_AREA_LOCALE, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: USER_AREA_TIME_ZONE,
});

const absoluteDateTimeFormatter = new Intl.DateTimeFormat(USER_AREA_LOCALE, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: USER_AREA_TIME_ZONE,
});

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

function toDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

/** Full absolute form for tooltips ("Jul 3, 2026, 09:12 AM"). */
export function formatAbsoluteTime(value: string | number | Date): string {
  const date = toDate(value);

  return date ? absoluteDateTimeFormatter.format(date) : '';
}

/**
 * "just now" (<45s), then minutes, hours, days — and past a week the absolute
 * date ("Jun 24, 2026"). Future dates degrade to the absolute form too.
 */
export function formatRelativeTime(value: string | number | Date, now: Date = new Date()): string {
  const date = toDate(value);

  if (!date) {
    return '';
  }

  const elapsedMs = now.getTime() - date.getTime();

  if (elapsedMs < 0 || elapsedMs > WEEK_MS) {
    return absoluteDateFormatter.format(date);
  }

  if (elapsedMs < 45_000) {
    return 'just now';
  }

  if (elapsedMs < HOUR_MS) {
    return relativeFormatter.format(-Math.round(elapsedMs / MINUTE_MS), 'minute');
  }

  if (elapsedMs < DAY_MS) {
    return relativeFormatter.format(-Math.round(elapsedMs / HOUR_MS), 'hour');
  }

  return relativeFormatter.format(-Math.round(elapsedMs / DAY_MS), 'day');
}
