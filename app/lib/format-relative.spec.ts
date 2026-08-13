import { describe, expect, it } from 'vitest';
import { formatAbsoluteTime, formatRelativeTime } from './format-relative';

const NOW = new Date('2026-07-03T12:00:00.000Z');

const secondsAgo = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);

describe('formatRelativeTime', () => {
  it('renders "just now" under 45 seconds', () => {
    expect(formatRelativeTime(secondsAgo(0), NOW)).toBe('just now');
    expect(formatRelativeTime(secondsAgo(44), NOW)).toBe('just now');
  });

  it('renders minutes between 45s and an hour', () => {
    expect(formatRelativeTime(secondsAgo(46), NOW)).toBe('1 minute ago');
    expect(formatRelativeTime(secondsAgo(15 * 60), NOW)).toBe('15 minutes ago');
    expect(formatRelativeTime(secondsAgo(59 * 60), NOW)).toBe('59 minutes ago');
  });

  it('renders hours under a day', () => {
    expect(formatRelativeTime(secondsAgo(2 * 3600), NOW)).toBe('2 hours ago');
    expect(formatRelativeTime(secondsAgo(23 * 3600), NOW)).toBe('23 hours ago');
  });

  it('renders days up to a week', () => {
    expect(formatRelativeTime(secondsAgo(25 * 3600), NOW)).toBe('yesterday');
    expect(formatRelativeTime(secondsAgo(6 * 24 * 3600), NOW)).toBe('6 days ago');
  });

  it('falls back to the absolute date beyond a week (and for future dates)', () => {
    expect(formatRelativeTime(secondsAgo(8 * 24 * 3600), NOW)).toBe('25 Jun 2026');
    expect(formatRelativeTime(secondsAgo(-3600), NOW)).toBe('3 Jul 2026');
  });

  it('returns an empty string for invalid input', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('');
  });
});

describe('formatAbsoluteTime', () => {
  it('renders a full date-time for tooltips', () => {
    expect(formatAbsoluteTime(NOW)).toMatch(/3 Jul 2026/);
  });

  it('returns an empty string for invalid input', () => {
    expect(formatAbsoluteTime('nope')).toBe('');
  });
});
