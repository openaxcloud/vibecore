import { describe, expect, it } from 'vitest';
import { detectedIanaTimeZone, isValidIanaTimeZone, supportedIanaTimeZones } from './time-zones';

describe('IANA time zone helpers', () => {
  it('accepts canonical time zones and rejects arbitrary text', () => {
    expect(isValidIanaTimeZone('UTC')).toBe(true);
    expect(isValidIanaTimeZone('Europe/Paris')).toBe(true);
    expect(isValidIanaTimeZone('not-a-time-zone')).toBe(false);
    expect(isValidIanaTimeZone('')).toBe(false);
  });

  it('returns a searchable, stable list with UTC first', () => {
    const timeZones = supportedIanaTimeZones(['Europe/Paris']);

    expect(timeZones[0]).toBe('UTC');
    expect(timeZones).toContain('America/New_York');
    expect(timeZones).toContain('Europe/Paris');
    expect(new Set(timeZones).size).toBe(timeZones.length);
  });

  it('detects a valid platform time zone when one is available', () => {
    const detected = detectedIanaTimeZone();

    expect(detected === null || isValidIanaTimeZone(detected)).toBe(true);
  });
});
