export const USER_AREA_LOCALE = 'en-GB';
export const USER_AREA_TIME_ZONE = 'UTC';

type DateInput = Date | string | number;

function validDate(value: DateInput): Date | null {
  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatUserAreaNumber(value: number | bigint, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(USER_AREA_LOCALE, options).format(value);
}

export function formatUserAreaDate(value: DateInput, options?: Intl.DateTimeFormatOptions): string | null {
  const date = validDate(value);

  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat(
    USER_AREA_LOCALE,
    options ? { timeZone: USER_AREA_TIME_ZONE, ...options } : { dateStyle: 'medium', timeZone: USER_AREA_TIME_ZONE },
  ).format(date);
}

export function formatUserAreaTime(value: DateInput, options?: Intl.DateTimeFormatOptions): string | null {
  const date = validDate(value);

  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat(
    USER_AREA_LOCALE,
    options ? { timeZone: USER_AREA_TIME_ZONE, ...options } : { timeStyle: 'short', timeZone: USER_AREA_TIME_ZONE },
  ).format(date);
}

export function formatUserAreaDateTime(value: DateInput, options?: Intl.DateTimeFormatOptions): string | null {
  const date = validDate(value);

  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat(USER_AREA_LOCALE, {
    ...(options ?? {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
    timeZone: options?.timeZone ?? USER_AREA_TIME_ZONE,
  }).format(date);
}
