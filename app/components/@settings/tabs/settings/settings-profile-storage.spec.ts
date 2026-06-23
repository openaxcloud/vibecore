import { describe, expect, it } from 'vitest';
import { mergeNotificationIntoProfile, parseStoredProfile } from './settings-profile-storage';

describe('parseStoredProfile', () => {
  it('returns {} for null/empty input', () => {
    expect(parseStoredProfile(null)).toEqual({});
    expect(parseStoredProfile(undefined)).toEqual({});
    expect(parseStoredProfile('')).toEqual({});
  });

  it('parses a valid object', () => {
    expect(parseStoredProfile('{"notifications":true,"language":"fr"}')).toEqual({
      notifications: true,
      language: 'fr',
    });
  });

  it('returns {} for invalid JSON instead of throwing', () => {
    expect(() => parseStoredProfile('{not valid json')).not.toThrow();
    expect(parseStoredProfile('{not valid json')).toEqual({});
  });

  it("returns {} for the stale 'undefined' literal", () => {
    expect(parseStoredProfile('undefined')).toEqual({});
  });

  it('returns {} for non-object JSON values (number, string, array, null)', () => {
    expect(parseStoredProfile('42')).toEqual({});
    expect(parseStoredProfile('"hello"')).toEqual({});
    expect(parseStoredProfile('[1,2,3]')).toEqual({});
    expect(parseStoredProfile('null')).toEqual({});
  });
});

describe('mergeNotificationIntoProfile', () => {
  it('merges the new notifications value, preserving other keys', () => {
    expect(mergeNotificationIntoProfile('{"language":"de","notifications":true}', false)).toEqual({
      language: 'de',
      notifications: false,
    });
  });

  it('does not throw and still produces a usable profile when storage is corrupt', () => {
    expect(() => mergeNotificationIntoProfile('{corrupt', true)).not.toThrow();
    expect(mergeNotificationIntoProfile('{corrupt', true)).toEqual({ notifications: true });
  });

  it('handles null storage', () => {
    expect(mergeNotificationIntoProfile(null, true)).toEqual({ notifications: true });
  });
});
