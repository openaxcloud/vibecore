import { describe, it, expect } from 'vitest';
import { formatModifiedTime } from './diff-modified-time';

describe('formatModifiedTime', () => {
  it('formats a real epoch-millisecond timestamp as localized English date and time', () => {
    const lastModified = new Date('2024-01-02T03:04:05Z').getTime();

    const expected = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(lastModified);

    expect(formatModifiedTime(lastModified, 'en-US')).toBe(expected);
  });

  it('uses French date and time conventions for French locales', () => {
    const lastModified = new Date('2024-01-02T03:04:05Z').getTime();

    const expected = new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(lastModified);

    expect(formatModifiedTime(lastModified, 'fr-CA')).toBe(expected);
  });

  it('reflects the file modification time, not the current wall-clock time', () => {
    // A fixed timestamp well in the past must NOT format to "now".
    const lastModified = new Date('2020-06-15T12:00:00Z').getTime();

    const formatted = formatModifiedTime(lastModified, 'en');
    const nowFormatted = formatModifiedTime(Date.now(), 'en');

    expect(formatted).toBe(
      new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(lastModified),
    );

    /*
     * It would be astronomically unlikely for the past timestamp to coincide
     * with the current second; assert they differ to prove we are not using now().
     */
    expect(formatted).not.toBe(nowFormatted);
  });

  it('is stable across calls (does not change on re-render)', () => {
    const lastModified = new Date('2023-09-10T08:30:00Z').getTime();

    expect(formatModifiedTime(lastModified)).toBe(formatModifiedTime(lastModified));
  });

  it('returns an empty string for undefined input', () => {
    expect(formatModifiedTime(undefined)).toBe('');
  });

  it('returns an empty string for non-finite input', () => {
    expect(formatModifiedTime(Number.NaN)).toBe('');
    expect(formatModifiedTime(Number.POSITIVE_INFINITY)).toBe('');
  });
});
