import { describe, it, expect, afterEach } from 'vitest';
import { buildTimezoneOptions } from './timezone-options';

const realSupportedValuesOf = (Intl as { supportedValuesOf?: unknown }).supportedValuesOf;

afterEach(() => {
  if (realSupportedValuesOf === undefined) {
    delete (Intl as { supportedValuesOf?: unknown }).supportedValuesOf;
  } else {
    (Intl as { supportedValuesOf?: unknown }).supportedValuesOf = realSupportedValuesOf;
  }
});

describe('buildTimezoneOptions', () => {
  it('enumerates the full IANA universe, not just the current zone', () => {
    const options = buildTimezoneOptions('America/New_York', 'America/New_York');

    // The whole point of the bug fix: many selectable choices, not one.
    expect(options.length).toBeGreaterThan(50);
    expect(options).toContain('Europe/Paris');
    expect(options).toContain('Asia/Tokyo');
  });

  it('keeps the detected/current zone present and at the top', () => {
    const options = buildTimezoneOptions('Asia/Kolkata', 'Asia/Kolkata');

    expect(options[0]).toBe('Asia/Kolkata');
    expect(options.filter((tz) => tz === 'Asia/Kolkata')).toHaveLength(1);
  });

  it('pins both the detected and the saved zone when they differ', () => {
    const options = buildTimezoneOptions('America/Los_Angeles', 'Europe/Berlin');

    expect(options.slice(0, 2)).toEqual(['America/Los_Angeles', 'Europe/Berlin']);
    expect(options.filter((tz) => tz === 'Europe/Berlin')).toHaveLength(1);
  });

  it('de-duplicates and ignores empty/nullish preferred values', () => {
    const options = buildTimezoneOptions('', null, undefined, 'UTC');

    expect(options[0]).toBe('UTC');
    expect(options).not.toContain('');
    expect(new Set(options).size).toBe(options.length);
  });

  it('falls back to a static list when Intl.supportedValuesOf is unavailable', () => {
    delete (Intl as { supportedValuesOf?: unknown }).supportedValuesOf;

    const options = buildTimezoneOptions('Europe/London');

    expect(options.length).toBeGreaterThan(20);
    expect(options[0]).toBe('Europe/London');
    expect(options).toContain('UTC');
    expect(options).toContain('Asia/Tokyo');
  });
});
