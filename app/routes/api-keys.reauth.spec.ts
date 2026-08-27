import { describe, expect, it } from 'vitest';
import { shouldRethrowActionError } from '~/lib/route-reauth';

/**
 * Regression: the api-keys action's catch block treated ANY thrown Response as
 * an inline API error — it called error.json() and rendered the message inline
 * at error.status. But apiRequest throws a react-router redirect() Response (a
 * body-less 3xx with a Location header) when the session expired mid-flight
 * (login redirect on 401) or MFA is required (redirect to /mfa-setup on 403),
 * because the '/api-keys' route path is a page navigation. On such a 3xx,
 * error.json() rejects, so the user saw a generic inline error alert at
 * status 302 and was never sent to re-authenticate — the create/revoke form was
 * stuck and broken. 5xx server failures were likewise swallowed inline instead
 * of reaching the error boundary.
 *
 * The action now re-throws re-auth (3xx) and server (5xx) Responses via
 * shouldRethrowActionError BEFORE the inline-error handling, so the framework
 * performs the redirect / the boundary handles the failure. 4xx Responses
 * (validation / not-found / forbidden) still fall through to the inline banner,
 * where their status is mapped to a reviewed catalog code rather than exposing
 * the upstream body. This spec pins that contract for both the create (POST
 * /api/keys) and revoke (DELETE /api/keys/:id) paths.
 */
describe('api-keys action re-auth handling', () => {
  it('re-throws a 302 login redirect (expired session) instead of rendering it inline', () => {
    const redirect = new Response(null, { status: 302, headers: { Location: '/login' } });

    expect(shouldRethrowActionError(redirect)).toBe(true);
  });

  it('re-throws a 302 MFA-required redirect (/mfa-setup)', () => {
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

  it('does NOT re-throw 4xx API errors — those stay inline as safe catalog codes', () => {
    // Create-path validation / forbidden / not-found statuses are mapped by the route.
    expect(shouldRethrowActionError(new Response('forbidden', { status: 403 }))).toBe(false);
    expect(shouldRethrowActionError(new Response('unauthorized', { status: 401 }))).toBe(false);
    expect(shouldRethrowActionError(new Response('no such key', { status: 404 }))).toBe(false);
    expect(shouldRethrowActionError(new Response('bad request', { status: 400 }))).toBe(false);
  });

  it('does NOT re-throw plain Errors or arbitrary thrown values', () => {
    expect(shouldRethrowActionError(new Error('network down'))).toBe(false);
    expect(shouldRethrowActionError('redirect')).toBe(false);
    expect(shouldRethrowActionError({ status: 302 })).toBe(false);
    expect(shouldRethrowActionError(null)).toBe(false);
    expect(shouldRethrowActionError(undefined)).toBe(false);
  });
});
