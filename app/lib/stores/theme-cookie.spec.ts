import { describe, expect, it } from 'vitest';
import { themeCookieDomain } from './theme-cookie';

describe('themeCookieDomain', () => {
  it('shares across app + apex via the registrable parent domain', () => {
    /*
     * The whole point: the marketing site and the app must resolve to the SAME
     * Domain so the cookie is sent to both origins.
     */
    expect(themeCookieDomain('app.e-code.ai')).toBe('.e-code.ai');
    expect(themeCookieDomain('e-code.ai')).toBe('.e-code.ai');
    expect(themeCookieDomain('www.e-code.ai')).toBe('.e-code.ai');
    expect(themeCookieDomain('preview.e-code.ai')).toBe('.e-code.ai');
  });

  it('returns a host-only cookie (null) for localhost and bare hosts', () => {
    expect(themeCookieDomain('localhost')).toBeNull();
    expect(themeCookieDomain('app')).toBeNull();
    expect(themeCookieDomain('')).toBeNull();
  });

  it('returns null for IP hosts where a Domain attribute is invalid', () => {
    expect(themeCookieDomain('127.0.0.1')).toBeNull();
    expect(themeCookieDomain('10.0.0.1')).toBeNull();
    expect(themeCookieDomain('::1')).toBeNull();
    expect(themeCookieDomain('[::1]')).toBeNull();
  });
});
