import { describe, expect, it } from 'vitest';
import { shouldRethrowActionError } from '~/lib/route-reauth';

/*
 * Regression for the downgrade action's catch block. apiRequest for the billing
 * portal (free downgrade) and billing checkout (paid plan switch) throws a real
 * 3xx redirect Response when the session expired or MFA is required mid-action.
 * The catch previously only checked `isApiResponse(error)` — which is true for
 * ANY Response, including 3xx redirects — and converted them to inline json
 * errors, swallowing the re-auth redirect. The action now delegates to
 * shouldRethrowActionError before falling back to inline error rendering.
 */
describe('downgrade action: shouldRethrowActionError contract', () => {
  it('re-throws the login re-auth redirect thrown by the portal/checkout apiRequest', () => {
    const loginRedirect = new Response(null, {
      status: 302,
      headers: { Location: '/login?returnTo=%2Fdowngrade' },
    });

    expect(shouldRethrowActionError(loginRedirect)).toBe(true);
  });

  it('re-throws the MFA-required redirect (303/307) so the browser can re-authenticate', () => {
    expect(shouldRethrowActionError(new Response(null, { status: 303 }))).toBe(true);
    expect(shouldRethrowActionError(new Response(null, { status: 307 }))).toBe(true);
  });

  it('re-throws 5xx billing-service errors to the route error boundary', () => {
    expect(shouldRethrowActionError(new Response('{"error":"boom"}', { status: 500 }))).toBe(true);
    expect(shouldRethrowActionError(new Response(null, { status: 503 }))).toBe(true);
  });

  it('surfaces 4xx subscription-change errors inline rather than re-throwing', () => {
    expect(shouldRethrowActionError(new Response('{"error":"plan unavailable"}', { status: 400 }))).toBe(false);
    expect(shouldRethrowActionError(new Response(null, { status: 402 }))).toBe(false);
    expect(shouldRethrowActionError(new Response(null, { status: 409 }))).toBe(false);
  });

  it('treats 2xx and non-Response errors as inline (not re-thrown)', () => {
    expect(shouldRethrowActionError(new Response(null, { status: 200 }))).toBe(false);
    expect(shouldRethrowActionError(new Error('network down'))).toBe(false);
    expect(shouldRethrowActionError(undefined)).toBe(false);
  });
});
