import { describe, expect, it } from 'vitest';
import { shouldRethrowActionError } from '~/lib/route-reauth';

/**
 * Regression: the payment-method action's catch block treated ANY thrown
 * Response as an inline API error — it called apiErrorMessage(error) and
 * rendered the message inline at error.status. But apiRequest (default
 * redirectOn401:true) throws a react-router redirect() Response — a body-less
 * 3xx with a Location header — when the session expired mid-flight (login
 * redirect on 401) or step-up MFA is required (redirect to the MFA path on a
 * 403 MFA_REQUIRED), because the '/payment-method' route path is a page
 * navigation. The isApiResponse branch matched that 302 too, so the user saw a
 * misleading "The Stripe customer portal is unavailable right now." banner at
 * status 302 and was NEVER sent to re-authenticate — the "Manage payment
 * method" form was stuck. 5xx server failures were likewise swallowed inline
 * instead of reaching the error boundary.
 *
 * The action now re-throws re-auth (3xx) and server (5xx) Responses via
 * shouldRethrowActionError BEFORE the inline-error handling, so the framework
 * performs the redirect / the boundary handles the failure. 4xx Responses
 * (e.g. a forbidden/validation body from the billing portal endpoint) still
 * fall through to the inline banner. This spec pins that contract.
 */
describe('payment-method action re-auth handling', () => {
  it('re-throws a 302 login redirect (expired session) instead of rendering it inline', () => {
    const redirect = new Response(null, { status: 302, headers: { Location: '/login' } });

    expect(shouldRethrowActionError(redirect)).toBe(true);
  });

  it('re-throws a 302 MFA-required step-up redirect', () => {
    const redirect = new Response(null, { status: 302, headers: { Location: '/mfa-setup' } });

    expect(shouldRethrowActionError(redirect)).toBe(true);
  });

  it('re-throws across the whole 3xx range and all 5xx server errors', () => {
    expect(shouldRethrowActionError(new Response(null, { status: 300 }))).toBe(true);
    expect(shouldRethrowActionError(new Response(null, { status: 307 }))).toBe(true);
    expect(shouldRethrowActionError(new Response(null, { status: 399 }))).toBe(true);
    expect(shouldRethrowActionError(new Response('boom', { status: 500 }))).toBe(true);
    expect(shouldRethrowActionError(new Response('down', { status: 503 }))).toBe(true);
  });

  it('does NOT re-throw 4xx billing-portal errors — those stay inline banners with their body message', () => {
    expect(shouldRethrowActionError(new Response('forbidden', { status: 403 }))).toBe(false);
    expect(shouldRethrowActionError(new Response('unauthorized', { status: 401 }))).toBe(false);
    expect(shouldRethrowActionError(new Response('no customer', { status: 404 }))).toBe(false);
    expect(shouldRethrowActionError(new Response('bad request', { status: 400 }))).toBe(false);
  });

  it('does NOT re-throw plain Errors or arbitrary thrown values (timeouts surface inline)', () => {
    expect(shouldRethrowActionError(new Error('AbortError'))).toBe(false);
    expect(shouldRethrowActionError('redirect')).toBe(false);
    expect(shouldRethrowActionError({ status: 302 })).toBe(false);
    expect(shouldRethrowActionError(null)).toBe(false);
    expect(shouldRethrowActionError(undefined)).toBe(false);
  });
});
