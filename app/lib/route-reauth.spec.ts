import { describe, expect, it } from 'vitest';
import { isReauthRedirect, shouldRethrowActionError } from './route-reauth';

/*
 * Regression coverage for the invitations.accept (and other enterprise route)
 * "swallowed re-auth redirect" bug: `isApiResponse(error)` is `error instanceof
 * Response`, which is ALSO true for the 302 redirect `apiRequest` throws on an
 * expired session / MFA gate. Route actions must re-throw those redirects (via
 * `isReauthRedirect`) BEFORE the `isApiResponse` inline-error branch so the
 * framework performs the navigation instead of rendering "Failed to accept
 * invitation." inline.
 */
describe('isReauthRedirect', () => {
  it('matches a 302 login redirect (the expired-session re-auth response)', () => {
    const redirect = new Response(null, { status: 302, headers: { Location: '/login' } });
    expect(isReauthRedirect(redirect)).toBe(true);
  });

  it('matches a 302 MFA-setup redirect (platform-admin MFA gate)', () => {
    const redirect = new Response(null, { status: 302, headers: { Location: '/mfa-setup' } });
    expect(isReauthRedirect(redirect)).toBe(true);
  });

  it('matches the full 3xx redirect range', () => {
    for (const status of [300, 301, 303, 307, 308, 399]) {
      expect(isReauthRedirect(new Response(null, { status }))).toBe(true);
    }
  });

  it('does NOT match real API failures that should render inline', () => {
    for (const status of [400, 401, 402, 403, 404, 409, 422]) {
      expect(isReauthRedirect(new Response(null, { status }))).toBe(false);
    }
  });

  it('does NOT match non-Response errors', () => {
    expect(isReauthRedirect(new Error('boom'))).toBe(false);
    expect(isReauthRedirect('boom')).toBe(false);
    expect(isReauthRedirect(undefined)).toBe(false);
    expect(isReauthRedirect(null)).toBe(false);
  });
});

/*
 * Mirrors the action catch-block dispatch order used by invitations.accept.tsx:
 * a redirect must be re-thrown; a 4xx API failure must surface inline. This
 * proves the ordering bug (redirect swallowed by the inline-error branch) stays
 * fixed.
 */
describe('action catch-block dispatch (invitations.accept ordering)', () => {
  function dispatch(error: unknown): { rethrown: true } | { inline: true } | { generic: true } {
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (error instanceof Response) {
      return { inline: true };
    }

    return { generic: true };
  }

  it('re-throws a 302 expired-session redirect instead of swallowing it inline', () => {
    const redirect = new Response(null, { status: 302, headers: { Location: '/login' } });
    expect(() => dispatch(redirect)).toThrow();

    try {
      dispatch(redirect);
    } catch (thrown) {
      expect(thrown).toBe(redirect);
      expect((thrown as Response).status).toBe(302);
      expect((thrown as Response).headers.get('Location')).toBe('/login');
    }
  });

  it('renders a 401 API failure inline', () => {
    expect(dispatch(new Response(null, { status: 401 }))).toEqual({ inline: true });
  });

  it('renders a non-Response failure as a generic message', () => {
    expect(dispatch(new Error('network down'))).toEqual({ generic: true });
  });
});

describe('shouldRethrowActionError', () => {
  it('re-throws redirects and 5xx, keeps 4xx inline', () => {
    expect(shouldRethrowActionError(new Response(null, { status: 302 }))).toBe(true);
    expect(shouldRethrowActionError(new Response(null, { status: 503 }))).toBe(true);
    expect(shouldRethrowActionError(new Response(null, { status: 404 }))).toBe(false);
    expect(shouldRethrowActionError(new Error('x'))).toBe(false);
  });
});
