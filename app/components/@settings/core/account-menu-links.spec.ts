import { describe, it, expect } from 'vitest';
import { ACCOUNT_MENU_LINKS, resolveAccountMenuLink } from './account-menu-links';

describe('account menu links', () => {
  it('does not reference the upstream bolt.diy codename', () => {
    for (const value of Object.values(ACCOUNT_MENU_LINKS)) {
      expect(value).not.toMatch(/bolt\.diy/i);
      expect(value).not.toMatch(/stackblitz/i);
    }
  });

  it('points Report Bug and Help & Documentation at first-party E-Code pages', () => {
    expect(ACCOUNT_MENU_LINKS.reportBug).toBe('/contact');
    expect(ACCOUNT_MENU_LINKS.helpDocs).toBe('/docs');
  });

  it('resolves relative links against the provided origin', () => {
    expect(resolveAccountMenuLink('/contact', 'https://app.e-code.ai')).toBe('https://app.e-code.ai/contact');
    expect(resolveAccountMenuLink('/docs', 'https://app.e-code.ai')).toBe('https://app.e-code.ai/docs');
  });

  it('keeps absolute links unchanged', () => {
    expect(resolveAccountMenuLink('https://e-code.ai/help', 'https://app.e-code.ai')).toBe('https://e-code.ai/help');
  });

  it('falls back to the raw link when no origin is available', () => {
    expect(resolveAccountMenuLink('/contact', undefined)).toBe('/contact');
  });
});
