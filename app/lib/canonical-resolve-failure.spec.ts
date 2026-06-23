import { describe, expect, it } from 'vitest';
import { shouldRethrowResolveError } from './canonical-resolve-failure';

describe('shouldRethrowResolveError', () => {
  it('returns true for a genuine 404 project-not-found Response', () => {
    expect(shouldRethrowResolveError(new Response('Project not found', { status: 404 }))).toBe(true);
  });

  it('returns true for login/MFA re-auth redirect Responses (3xx)', () => {
    for (const status of [301, 302, 303, 307, 308]) {
      expect(shouldRethrowResolveError(new Response(null, { status, headers: { location: '/login' } }))).toBe(true);
    }
  });

  it('returns true for 401/403 Responses (handled upstream as login/MFA)', () => {
    expect(shouldRethrowResolveError(new Response(null, { status: 401 }))).toBe(true);
    expect(shouldRethrowResolveError(new Response(null, { status: 403 }))).toBe(true);
  });

  it('returns false for transient 5xx upstream Responses (degrade to dashboard)', () => {
    for (const status of [500, 502, 503, 504]) {
      expect(shouldRethrowResolveError(new Response(null, { status }))).toBe(false);
    }
  });

  it('returns false for a raw AbortSignal timeout DOMException-style error', () => {
    // AbortSignal.timeout rejects with a TimeoutError DOMException, not a Response.
    const timeoutError = new DOMException('The operation timed out.', 'TimeoutError');
    expect(shouldRethrowResolveError(timeoutError)).toBe(false);
  });

  it('returns false for a network failure TypeError', () => {
    expect(shouldRethrowResolveError(new TypeError('fetch failed'))).toBe(false);
  });

  it('returns false for non-Response thrown values', () => {
    expect(shouldRethrowResolveError(new Error('boom'))).toBe(false);
    expect(shouldRethrowResolveError('not found')).toBe(false);
    expect(shouldRethrowResolveError(null)).toBe(false);
    expect(shouldRethrowResolveError(undefined)).toBe(false);
    expect(shouldRethrowResolveError({ status: 404 })).toBe(false);
  });
});
