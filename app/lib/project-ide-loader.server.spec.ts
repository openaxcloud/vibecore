import { describe, expect, it } from 'vitest';
import { isRedirectResponse, shouldRethrowResolveError } from './project-ide-loader.server';

describe('isRedirectResponse', () => {
  it('returns true for a 302 login redirect Response', () => {
    const redirect = new Response(null, { status: 302, headers: { location: '/login' } });

    expect(isRedirectResponse(redirect)).toBe(true);
  });

  it('returns true across the full 3xx range', () => {
    for (const status of [300, 301, 303, 307, 308, 399]) {
      expect(isRedirectResponse(new Response(null, { status }))).toBe(true);
    }
  });

  it('returns false for a 401 unauthorized Response', () => {
    expect(isRedirectResponse(new Response(null, { status: 401 }))).toBe(false);
  });

  it('returns false for a 500 error Response (folded into the soft shell)', () => {
    expect(isRedirectResponse(new Response(null, { status: 500 }))).toBe(false);
  });

  it('returns false for a 200 Response', () => {
    expect(isRedirectResponse(new Response(null, { status: 200 }))).toBe(false);
  });

  it('returns false for non-Response thrown values', () => {
    expect(isRedirectResponse(new Error('boom'))).toBe(false);
    expect(isRedirectResponse('redirect')).toBe(false);
    expect(isRedirectResponse(null)).toBe(false);
    expect(isRedirectResponse(undefined)).toBe(false);
    expect(isRedirectResponse({ status: 302 })).toBe(false);
  });
});

describe('shouldRethrowResolveError', () => {
  /*
   * Regression guard: the IDE loader used to swallow genuine authz/not-found
   * failures into a soft IDE shell that echoed the raw project id as its name.
   * A 403 (no permission) and 404 (project not found) MUST be re-thrown so the
   * route renders a clean forbidden/not-found page.
   */
  it('re-throws 401/403/404 client-facing answers', () => {
    expect(shouldRethrowResolveError(new Response(null, { status: 401 }))).toBe(true);
    expect(shouldRethrowResolveError(new Response(null, { status: 403 }))).toBe(true);
    expect(shouldRethrowResolveError(new Response(null, { status: 404 }))).toBe(true);
  });

  it('re-throws 3xx login/MFA redirects', () => {
    expect(shouldRethrowResolveError(new Response(null, { status: 302 }))).toBe(true);
    expect(shouldRethrowResolveError(new Response(null, { status: 303 }))).toBe(true);
  });

  it('does NOT re-throw transient 5xx Responses (soft shell handles them)', () => {
    expect(shouldRethrowResolveError(new Response(null, { status: 500 }))).toBe(false);
    expect(shouldRethrowResolveError(new Response(null, { status: 502 }))).toBe(false);
    expect(shouldRethrowResolveError(new Response(null, { status: 503 }))).toBe(false);
  });

  it('does NOT re-throw plain network/timeout errors', () => {
    expect(shouldRethrowResolveError(new Error('fetch failed'))).toBe(false);
    expect(shouldRethrowResolveError(new TypeError('network timeout'))).toBe(false);
    expect(shouldRethrowResolveError(undefined)).toBe(false);
    expect(shouldRethrowResolveError(null)).toBe(false);
    expect(shouldRethrowResolveError({ status: 403 })).toBe(false);
  });
});
