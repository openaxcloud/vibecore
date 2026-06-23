import { describe, it, expect } from 'vitest';
import { formatPublishedAgo } from './format-published';

describe('formatPublishedAgo', () => {
  it('returns a relative string for a valid ISO timestamp', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const result = formatPublishedAgo(oneHourAgo);

    expect(result).toBe('about 1 hour ago');
  });

  it('returns null when published_at is undefined (deploy never published)', () => {
    /*
     * Netlify returns a published_deploy object for a still-building/errored
     * first deploy where published_at is absent.
     */
    expect(formatPublishedAgo(undefined)).toBeNull();
  });

  it('returns null when published_at is null', () => {
    expect(formatPublishedAgo(null)).toBeNull();
  });

  it('returns null when published_at is an empty string', () => {
    expect(formatPublishedAgo('')).toBeNull();
  });

  it('returns null (never throws) for an unparseable date string', () => {
    expect(() => formatPublishedAgo('not-a-date')).not.toThrow();
    expect(formatPublishedAgo('not-a-date')).toBeNull();
  });
});
