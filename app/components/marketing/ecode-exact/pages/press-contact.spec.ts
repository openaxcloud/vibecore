import { describe, it, expect } from 'vitest';
import { PRESS_CONTACT_EMAIL, PRESS_CONTACT_MAILTO } from './press-contact';

describe('press contact details', () => {
  it('uses the public E-Code brand domain', () => {
    expect(PRESS_CONTACT_EMAIL).toBe('press@e-code.ai');
    expect(PRESS_CONTACT_EMAIL.endsWith('@e-code.ai')).toBe(true);
  });

  it('does not leak the internal "vibecore" codename', () => {
    expect(PRESS_CONTACT_EMAIL).not.toMatch(/vibecore/i);
    expect(PRESS_CONTACT_MAILTO).not.toMatch(/vibecore/i);
  });

  it('builds a mailto href from the contact email', () => {
    expect(PRESS_CONTACT_MAILTO).toBe(`mailto:${PRESS_CONTACT_EMAIL}`);
  });
});
