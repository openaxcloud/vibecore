import { describe, expect, it } from 'vitest';
import { formatAbsoluteTime, formatRelativeTime } from './format-relative';

const NOW = new Date('2026-07-03T12:00:00.000Z');

const secondsAgo = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);

describe('formatRelativeTime', () => {
  it('renders the locale-native current-time label under 45 seconds', () => {
    expect(formatRelativeTime(secondsAgo(0), NOW, 'en')).toBe('now');
    expect(formatRelativeTime(secondsAgo(44), NOW, 'en')).toBe('now');
  });

  it('renders minutes between 45s and an hour', () => {
    expect(formatRelativeTime(secondsAgo(46), NOW, 'en')).toBe('1 minute ago');
    expect(formatRelativeTime(secondsAgo(15 * 60), NOW, 'en')).toBe('15 minutes ago');
    expect(formatRelativeTime(secondsAgo(59 * 60), NOW, 'en')).toBe('59 minutes ago');
  });

  it('renders hours under a day', () => {
    expect(formatRelativeTime(secondsAgo(2 * 3600), NOW, 'en')).toBe('2 hours ago');
    expect(formatRelativeTime(secondsAgo(23 * 3600), NOW, 'en')).toBe('23 hours ago');
  });

  it('renders days up to a week', () => {
    expect(formatRelativeTime(secondsAgo(25 * 3600), NOW, 'en')).toBe('yesterday');
    expect(formatRelativeTime(secondsAgo(6 * 24 * 3600), NOW, 'en')).toBe('6 days ago');
  });

  it('falls back to the absolute date beyond a week (and for future dates)', () => {
    expect(formatRelativeTime(secondsAgo(8 * 24 * 3600), NOW, 'en')).toBe('25 Jun 2026');
    expect(formatRelativeTime(secondsAgo(-3600), NOW, 'en')).toBe('3 Jul 2026');
  });

  it('returns an empty string for invalid input', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('');
  });

  it('renders French relative and absolute forms', () => {
    expect(formatRelativeTime(secondsAgo(2 * 3600), NOW, 'fr')).toBe('il y a 2 heures');
    expect(formatRelativeTime(secondsAgo(8 * 24 * 3600), NOW, 'fr')).toMatch(/25 juin 2026/);
  });
});

describe('formatAbsoluteTime', () => {
  it('renders a full date-time for tooltips', () => {
    expect(formatAbsoluteTime(NOW, 'en')).toMatch(/3 Jul 2026/);
    expect(formatAbsoluteTime(NOW, 'fr')).toMatch(/3 juil\. 2026/);
  });

  it('returns an empty string for invalid input', () => {
    expect(formatAbsoluteTime('nope')).toBe('');
  });
});
