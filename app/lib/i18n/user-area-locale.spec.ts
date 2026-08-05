import { describe, expect, it } from 'vitest';
import {
  formatUserAreaDate,
  formatUserAreaDateTime,
  formatUserAreaNumber,
  formatUserAreaTime,
  USER_AREA_LOCALE,
  USER_AREA_TIME_ZONE,
} from './user-area-locale';

describe('user-area locale formatters', () => {
  it('uses one English locale for every user-area formatter', () => {
    expect(USER_AREA_LOCALE).toBe('en-GB');
    expect(USER_AREA_TIME_ZONE).toBe('UTC');
    expect(formatUserAreaNumber(1234567, undefined, 'en')).toBe('1,234,567');
    expect(formatUserAreaDate('2026-07-14T18:05:00.000Z', { dateStyle: 'medium', timeZone: 'UTC' }, 'en')).toBe(
      '14 Jul 2026',
    );
    expect(formatUserAreaTime('2026-07-14T18:05:00.000Z', { timeStyle: 'short', timeZone: 'UTC' }, 'en')).toBe('18:05');
    expect(
      formatUserAreaDateTime(
        '2026-07-14T18:05:00.000Z',
        {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'UTC',
        },
        'en',
      ),
    ).toBe('14 Jul 2026, 18:05');
  });

  it('formats French dates, numbers and euros with locale punctuation', () => {
    expect(formatUserAreaNumber(1234567.5, undefined, 'fr')).toBe('1 234 567,5');
    expect(formatUserAreaNumber(1234.5, { style: 'currency', currency: 'EUR' }, 'fr')).toBe('1 234,50 €');
    expect(
      formatUserAreaDateTime(
        '2026-07-14T18:05:00.000Z',
        { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' },
        'fr',
      ),
    ).toBe('14 juil. 2026, 18:05');
  });

  it('uses a deterministic UTC fallback while allowing an explicit IANA time zone', () => {
    expect(formatUserAreaDateTime('2026-07-14T23:30:00.000Z', undefined, 'en')).toBe('14 Jul 2026, 23:30');
    expect(
      formatUserAreaDateTime(
        '2026-07-14T23:30:00.000Z',
        {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'Asia/Jerusalem',
        },
        'en',
      ),
    ).toBe('15 Jul 2026, 02:30');
  });

  it('returns null instead of exposing an invalid date', () => {
    expect(formatUserAreaDate('not-a-date')).toBeNull();
    expect(formatUserAreaTime('not-a-date')).toBeNull();
    expect(formatUserAreaDateTime('not-a-date')).toBeNull();
  });
});
