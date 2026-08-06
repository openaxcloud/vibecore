import { describe, expect, it } from 'vitest';
import { accountInitials, resolveAccountDisplay, ACCOUNT_DISPLAY_PLACEHOLDER } from './account-identity';

describe('resolveAccountDisplay (BUG-USR-001 — show the signed-in identity)', () => {
  it('prefers the viewer displayName', () => {
    const r = resolveAccountDisplay({ displayName: 'Ada Lovelace', name: 'Ada L', email: 'ada@example.com' }, '');
    expect(r.displayName).toBe('Ada Lovelace');
    expect(r.isPlaceholder).toBe(false);
    expect(r.initials).toBe('AL');
    expect(r.secondary).toBe('ada@example.com');
  });

  it('falls back to name, then username, then email', () => {
    expect(resolveAccountDisplay({ name: 'Grace Hopper' }, '').displayName).toBe('Grace Hopper');
    expect(resolveAccountDisplay({ username: 'ghopper' }, '').displayName).toBe('ghopper');
    expect(resolveAccountDisplay({ email: 'grace@navy.mil' }, '').displayName).toBe('grace@navy.mil');
  });

  it('uses the email initials (first two letters) when only an email is present', () => {
    const r = resolveAccountDisplay({ email: 'grace@navy.mil' }, '');
    expect(r.initials).toBe('GR');
    expect(r.secondary).toBe('');
  });

  it('uses the legacy profile username ONLY as a last resort', () => {
    expect(resolveAccountDisplay(null, 'legacy-name').displayName).toBe('legacy-name');

    // a real viewer identity always wins over the legacy localStorage profile
    expect(resolveAccountDisplay({ name: 'Real User' }, 'legacy-name').displayName).toBe('Real User');
  });

  it('regression: a real user (name from /auth/me, empty legacy profile) is NOT the placeholder', () => {
    const r = resolveAccountDisplay({ name: 'QA Reviewer', email: 'qa@e-code.test', displayName: 'QA Reviewer' }, '');
    expect(r.displayName).toBe('QA Reviewer');
    expect(r.isPlaceholder).toBe(false);
  });

  it('falls back to the placeholder ONLY when nothing is available', () => {
    for (const empty of [null, undefined, {}, { name: '  ' }, { email: '' }]) {
      const r = resolveAccountDisplay(empty as never, '');
      expect(r.displayName).toBe(ACCOUNT_DISPLAY_PLACEHOLDER);
      expect(r.isPlaceholder).toBe(true);
      expect(r.initials).toBe('');
    }
  });

  it('trims whitespace-only fields', () => {
    expect(resolveAccountDisplay({ displayName: '   ', name: 'Real' }, '').displayName).toBe('Real');
  });
});

describe('accountInitials', () => {
  it('takes the first letter of the first two words', () => {
    expect(accountInitials('Ada Lovelace')).toBe('AL');
    expect(accountInitials('Grace Brewster Murray Hopper')).toBe('GB');
  });
  it('handles a single name', () => {
    expect(accountInitials('Cher')).toBe('C');
  });
  it('handles an email', () => {
    expect(accountInitials('grace@navy.mil')).toBe('GR');
  });
  it('empty for blank input', () => {
    expect(accountInitials('   ')).toBe('');
  });
});
