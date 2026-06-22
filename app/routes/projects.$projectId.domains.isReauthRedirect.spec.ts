import { describe, expect, it } from 'vitest';
import { isReauthRedirect } from '~/lib/route-reauth';

describe('isReauthRedirect', () => {
  it('re-throws the login redirect apiRequest throws on a mid-session 401', () => {
    /*
     * Regression: when the session expired, apiRequest throws
     * `redirect('/login?returnTo=…')` — a 302 Response with a Location header
     * and an empty body. The domains action's `instanceof Response` branch
     * previously caught it, found no JSON body, and rendered a generic
     * "Domain verification failed" / "Unable to add domain" message instead of
     * letting the browser follow the re-auth redirect.
     */
    const loginRedirect = new Response(null, {
      status: 302,
      headers: { Location: '/login?returnTo=%2Fprojects%2Fp1%2Fdomains' },
    });

    expect(isReauthRedirect(loginRedirect)).toBe(true);
  });

  it('re-throws the MFA-required redirect (303/307)', () => {
    expect(isReauthRedirect(new Response(null, { status: 303 }))).toBe(true);
    expect(isReauthRedirect(new Response(null, { status: 307 }))).toBe(true);
  });

  it('surfaces validation/auth client errors (4xx) inline rather than re-throwing', () => {
    // DNS-not-visible-yet (422) and duplicate/invalid host (400) must stay inline.
    expect(isReauthRedirect(new Response('{"error":"DNS record not found"}', { status: 422 }))).toBe(false);
    expect(isReauthRedirect(new Response('{"error":"already added"}', { status: 400 }))).toBe(false);
    expect(isReauthRedirect(new Response(null, { status: 401 }))).toBe(false);
    expect(isReauthRedirect(new Response(null, { status: 403 }))).toBe(false);
  });

  it('treats successful 2xx, 5xx and non-Response errors as not a re-auth redirect', () => {
    expect(isReauthRedirect(new Response(null, { status: 200 }))).toBe(false);
    expect(isReauthRedirect(new Response(null, { status: 500 }))).toBe(false);
    expect(isReauthRedirect(new Error('network down'))).toBe(false);
    expect(isReauthRedirect('plain string error')).toBe(false);
    expect(isReauthRedirect(undefined)).toBe(false);
  });
});
