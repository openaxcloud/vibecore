import { describe, expect, it } from 'vitest';
import { isReauthRedirect } from '~/lib/route-reauth';

/**
 * Regression: the recovery-codes rotation action's catch block treated ANY
 * thrown Response (`isApiResponse`) as an inline API error — it read the body
 * via apiErrorMessage and returned `json({ error }, { status: error.status })`.
 * But apiRequest throws a react-router redirect() Response (a body-less 3xx with
 * a Location header) when the session expired mid-flight (login redirect on 401)
 * or MFA is required (redirect to /mfa-setup on 403), because '/auth/recovery-
 * codes' is a page navigation that does not start with '/auth/mfa'. On such a
 * 3xx the redirect was converted into a JSON `{ error }` body returned WITH
 * status 302, which the browser will not follow — so the user saw a generic
 * "Failed to rotate recovery codes." inline message instead of being sent to
 * re-authenticate, leaving the rotation form stuck.
 *
 * The action now re-throws re-auth (3xx) Responses via isReauthRedirect BEFORE
 * the inline-error handling, so the framework performs the redirect. 4xx
 * Responses (e.g. forbidden / not-found with an actionable body) still fall
 * through to the inline banner. This spec pins that contract.
 */
describe('recovery-codes action re-auth handling', () => {
  it('re-throws a 302 login redirect (expired session) instead of rendering it inline', () => {
    const redirect = new Response(null, { status: 302, headers: { Location: '/login' } });

    expect(isReauthRedirect(redirect)).toBe(true);
  });

  it('re-throws a 302 MFA-required redirect (/mfa-setup)', () => {
    const redirect = new Response(null, { status: 302, headers: { Location: '/mfa-setup' } });

    expect(isReauthRedirect(redirect)).toBe(true);
  });

  it('re-throws across the whole 3xx redirect range', () => {
    expect(isReauthRedirect(new Response(null, { status: 300 }))).toBe(true);
    expect(isReauthRedirect(new Response(null, { status: 307 }))).toBe(true);
    expect(isReauthRedirect(new Response(null, { status: 399 }))).toBe(true);
  });

  it('does NOT re-throw 4xx API errors — those stay inline banners with their body message', () => {
    expect(isReauthRedirect(new Response('forbidden', { status: 403 }))).toBe(false);
    expect(isReauthRedirect(new Response('unauthorized', { status: 401 }))).toBe(false);
    expect(isReauthRedirect(new Response('no such resource', { status: 404 }))).toBe(false);
    expect(isReauthRedirect(new Response('bad request', { status: 400 }))).toBe(false);
  });

  it('does NOT re-throw 5xx server errors — recovery-codes renders those inline at their status', () => {
    /*
     * This route keeps the isApiResponse inline branch for non-3xx Responses,
     * so a 500/503 is surfaced inline rather than re-thrown by isReauthRedirect.
     */
    expect(isReauthRedirect(new Response('boom', { status: 500 }))).toBe(false);
    expect(isReauthRedirect(new Response('down', { status: 503 }))).toBe(false);
  });

  it('does NOT re-throw plain Errors or arbitrary thrown values', () => {
    expect(isReauthRedirect(new Error('network down'))).toBe(false);
    expect(isReauthRedirect('redirect')).toBe(false);
    expect(isReauthRedirect({ status: 302 })).toBe(false);
    expect(isReauthRedirect(null)).toBe(false);
    expect(isReauthRedirect(undefined)).toBe(false);
  });
});
