import { describe, expect, it } from 'vitest';
import { isRedirectResponse } from './project-ide-loader.server';

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
