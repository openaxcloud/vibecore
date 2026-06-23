import { describe, expect, it } from 'vitest';
import { APPEALS_EMAIL, describeConsequence } from './strike-system.js';

describe('moderation appeals contact', () => {
  it('uses the public-facing E-Code brand, not the internal codename', () => {
    expect(APPEALS_EMAIL).not.toMatch(/vibecore/i);
    expect(APPEALS_EMAIL).toContain('e-code.ai');
  });

  it('surfaces the E-Code appeals address in the fallback consequence copy', () => {
    const copy = describeConsequence('UNKNOWN_ACTION' as never);
    expect(copy).toContain(APPEALS_EMAIL);
    expect(copy).not.toMatch(/vibecore/i);
  });
});
