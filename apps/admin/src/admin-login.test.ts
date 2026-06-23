import { describe, expect, it } from 'vitest';
import { buildAdminLoginBody, errorMessage, isMfaRequiredError } from './admin-login';

describe('buildAdminLoginBody', () => {
  it('omits mfaCode when none is supplied', () => {
    expect(buildAdminLoginBody('admin@example.com', 'pw')).toEqual({
      email: 'admin@example.com',
      password: 'pw',
    });
  });

  it('includes a trimmed mfaCode so MFA-enabled admins can log in', () => {
    expect(buildAdminLoginBody(' admin@example.com ', 'pw', '  123456  ')).toEqual({
      email: 'admin@example.com',
      password: 'pw',
      mfaCode: '123456',
    });
  });

  it('treats a blank/whitespace mfaCode as absent', () => {
    expect(buildAdminLoginBody('admin@example.com', 'pw', '   ')).toEqual({
      email: 'admin@example.com',
      password: 'pw',
    });
  });
});

describe('isMfaRequiredError', () => {
  it('matches the API error message', () => {
    expect(isMfaRequiredError('MFA code is required')).toBe(true);
  });

  it('matches the API error code', () => {
    expect(isMfaRequiredError('AUTH_MFA_REQUIRED')).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isMfaRequiredError('Invalid credentials')).toBe(false);
  });
});

describe('errorMessage', () => {
  it('uses the Error message when present', () => {
    expect(errorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('uses a thrown string', () => {
    expect(errorMessage('oops', 'fallback')).toBe('oops');
  });

  it('falls back for non-error throwables (proving runAction surfaces a message)', () => {
    expect(errorMessage(undefined, 'Admin action failed')).toBe('Admin action failed');
    expect(errorMessage({}, 'Admin action failed')).toBe('Admin action failed');
  });
});
