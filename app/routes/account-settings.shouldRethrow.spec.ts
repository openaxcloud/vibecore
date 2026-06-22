import { describe, expect, it } from 'vitest';
import { shouldRethrowActionError } from '~/lib/route-reauth';

describe('shouldRethrowActionError', () => {
  it('re-throws the login redirect apiRequest throws on a mid-session 401', () => {
    /*
     * Regression: when the session expired, apiRequest throws
     * `redirect('/login?returnTo=…')` — a 302 Response with a Location header
     * and an empty body. The action previously only re-threw `status >= 500`,
     * so the 302 was passed to apiErrorMessage, whose `error.clone().json()`
     * failed on the empty body and returned a generic dead-end message instead
     * of letting the browser follow the re-auth redirect.
     */
    const loginRedirect = new Response(null, {
      status: 302,
      headers: { Location: '/login?returnTo=%2Faccount-settings' },
    });

    expect(shouldRethrowActionError(loginRedirect)).toBe(true);
  });

  it('re-throws the MFA-required redirect (303/307)', () => {
    expect(shouldRethrowActionError(new Response(null, { status: 303 }))).toBe(true);
    expect(shouldRethrowActionError(new Response(null, { status: 307 }))).toBe(true);
  });

  it('re-throws server errors (5xx) to the route error boundary', () => {
    expect(shouldRethrowActionError(new Response('{"error":"boom"}', { status: 500 }))).toBe(true);
    expect(shouldRethrowActionError(new Response(null, { status: 503 }))).toBe(true);
  });

  it('surfaces validation/auth client errors (4xx) inline rather than re-throwing', () => {
    expect(shouldRethrowActionError(new Response('{"error":"bad"}', { status: 400 }))).toBe(false);
    expect(shouldRethrowActionError(new Response(null, { status: 401 }))).toBe(false);
    expect(shouldRethrowActionError(new Response(null, { status: 403 }))).toBe(false);
  });

  it('treats successful 2xx and non-Response errors as inline (not re-thrown)', () => {
    expect(shouldRethrowActionError(new Response(null, { status: 200 }))).toBe(false);
    expect(shouldRethrowActionError(new Error('network down'))).toBe(false);
    expect(shouldRethrowActionError('plain string error')).toBe(false);
    expect(shouldRethrowActionError(undefined)).toBe(false);
  });
});
