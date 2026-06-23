import { describe, it, expect } from 'vitest';
import { formatProjectStatusLabel } from './SupabaseTab';

describe('formatProjectStatusLabel', () => {
  it('humanizes a normal underscored status', () => {
    expect(formatProjectStatusLabel('ACTIVE_HEALTHY')).toBe('ACTIVE HEALTHY');
  });

  it('passes through a status without underscores', () => {
    expect(formatProjectStatusLabel('INACTIVE')).toBe('INACTIVE');
  });

  it('does not throw and returns UNKNOWN when status is undefined', () => {
    expect(() => formatProjectStatusLabel(undefined)).not.toThrow();
    expect(formatProjectStatusLabel(undefined)).toBe('UNKNOWN');
  });

  it('does not throw and returns UNKNOWN when status is null', () => {
    expect(() => formatProjectStatusLabel(null)).not.toThrow();
    expect(formatProjectStatusLabel(null)).toBe('UNKNOWN');
  });
});
