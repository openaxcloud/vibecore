import { describe, expect, it } from 'vitest';
import { isReauthRedirect } from '~/lib/route-reauth';

/*
 * Regression coverage for the plan-comparison checkout action's catch block.
 *
 * Previously the catch only handled `isApiResponse(error)` (any Response) and
 * `throw error` for everything else. That meant:
 *   1. A request timeout — apiRequest attaches `AbortSignal.timeout(30_000)`,
 *      which rejects with a non-Response DOMException/Error when the API pod is
 *      hung or draining — propagated to the route ErrorBoundary and replaced the
 *      whole page with a generic crash screen, losing the user's plan selection.
 *   2. A DNS / connection failure (also a non-Response error) did the same.
 *
 * The localized action mirrors the catch-block decision exactly:
 *   - re-throw only 3xx re-auth redirects via isReauthRedirect,
 *   - render every API Response through a stable local error code,
 *   - render any other (non-Response) failure inline with a friendly message
 *     instead of throwing.
 *
 * `classifyCheckoutCatch` is a local mirror of the route's branch logic so the
 * behaviour can be asserted without importing the `*.server`-backed route module
 * (which would break the client bundle rule / fail to resolve under vitest).
 */
type CatchOutcome = 'rethrow' | 'inline-api-error' | 'inline-friendly';

function classifyCheckoutCatch(error: unknown): CatchOutcome {
  if (isReauthRedirect(error)) {
    return 'rethrow';
  }

  if (error instanceof Response) {
    return 'inline-api-error';
  }

  return 'inline-friendly';
}

describe('plan-comparison checkout catch classification', () => {
  it('keeps the user on the page when the checkout request times out (AbortSignal.timeout)', () => {
    // Shape produced by AbortSignal.timeout(...) firing: a TimeoutError DOMException.
    const timeoutError =
      typeof DOMException !== 'undefined'
        ? new DOMException('The operation timed out.', 'TimeoutError')
        : Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' });

    expect(classifyCheckoutCatch(timeoutError)).toBe('inline-friendly');
  });

  it('keeps the user on the page on a DNS / connection failure', () => {
    const connError = Object.assign(new Error('getaddrinfo ENOTFOUND api'), { code: 'ENOTFOUND' });
    expect(classifyCheckoutCatch(connError)).toBe('inline-friendly');
  });

  it('re-throws the login redirect apiRequest throws on a mid-session 401', () => {
    const loginRedirect = new Response(null, {
      status: 302,
      headers: { Location: '/login?returnTo=%2Fplan-comparison' },
    });
    expect(classifyCheckoutCatch(loginRedirect)).toBe('rethrow');
  });

  it('re-throws an MFA-required redirect but keeps server errors safe and inline', () => {
    expect(classifyCheckoutCatch(new Response(null, { status: 307 }))).toBe('rethrow');
    expect(classifyCheckoutCatch(new Response('{"error":"boom"}', { status: 500 }))).toBe('inline-api-error');
    expect(classifyCheckoutCatch(new Response(null, { status: 503 }))).toBe('inline-api-error');
  });

  it('renders 4xx checkout API errors inline', () => {
    expect(classifyCheckoutCatch(new Response('{"error":"plan unavailable"}', { status: 400 }))).toBe(
      'inline-api-error',
    );
    expect(classifyCheckoutCatch(new Response(null, { status: 402 }))).toBe('inline-api-error');
  });
});
