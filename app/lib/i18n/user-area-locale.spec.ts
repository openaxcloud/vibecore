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
    expect(formatUserAreaNumber(1234567)).toBe('1,234,567');
    expect(formatUserAreaDate('2026-07-14T18:05:00.000Z', { dateStyle: 'medium', timeZone: 'UTC' })).toBe(
      '14 Jul 2026',
    );
    expect(formatUserAreaTime('2026-07-14T18:05:00.000Z', { timeStyle: 'short', timeZone: 'UTC' })).toBe('18:05');
    expect(
      formatUserAreaDateTime('2026-07-14T18:05:00.000Z', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }),
    ).toBe('14 Jul 2026, 18:05');
  });

  it('uses a deterministic UTC fallback while allowing an explicit IANA time zone', () => {
    expect(formatUserAreaDateTime('2026-07-14T23:30:00.000Z')).toBe('14 Jul 2026, 23:30');
    expect(
      formatUserAreaDateTime('2026-07-14T23:30:00.000Z', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Jerusalem',
      }),
    ).toBe('15 Jul 2026, 02:30');
  });

  it('returns null instead of exposing an invalid date', () => {
    expect(formatUserAreaDate('not-a-date')).toBeNull();
    expect(formatUserAreaTime('not-a-date')).toBeNull();
    expect(formatUserAreaDateTime('not-a-date')).toBeNull();
  });
});
