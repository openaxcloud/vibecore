import { describe, expect, it } from 'vitest';
import { isReauthRedirect } from './projects.$projectId.snapshots';

/**
 * Regression: both snapshot actions (create/restore) caught every thrown value
 * and ran it through apiErrorMessage. When the session expired (401) or MFA was
 * required (403), apiRequest throws a react-router redirect() Response (a
 * body-less 3xx with a Location header). That Response was turned into
 * json({ error: 'Snapshot … failed.' }, { status: 302 }), so the login/MFA
 * redirect was swallowed and the user was stranded on a broken snapshots page.
 * The actions must detect a redirect Response and re-throw it so the browser
 * follows the redirect to sign in / complete MFA.
 */
describe('isReauthRedirect', () => {
  it('matches a react-router redirect Response (302 with Location)', () => {
    const redirect = new Response(null, {
      status: 302,
      headers: { Location: '/login?returnTo=%2Fprojects%2Fp1%2Fsnapshots' },
    });

    expect(isReauthRedirect(redirect)).toBe(true);
  });

  it('matches the whole 3xx range (300 inclusive, 399 inclusive)', () => {
    expect(isReauthRedirect(new Response(null, { status: 300 }))).toBe(true);
    expect(isReauthRedirect(new Response(null, { status: 303 }))).toBe(true);
    expect(isReauthRedirect(new Response(null, { status: 307 }))).toBe(true);
    expect(isReauthRedirect(new Response(null, { status: 399 }))).toBe(true);
  });

  it('does NOT match a non-redirect error Response (those stay inline banners)', () => {
    // 401/403/409/500 carry an actionable body message and must render inline.
    expect(isReauthRedirect(new Response('forbidden', { status: 403 }))).toBe(false);
    expect(isReauthRedirect(new Response('unauthorized', { status: 401 }))).toBe(false);
    expect(isReauthRedirect(new Response('storage missing', { status: 409 }))).toBe(false);
    expect(isReauthRedirect(new Response('boom', { status: 500 }))).toBe(false);
    expect(isReauthRedirect(new Response('ok', { status: 200 }))).toBe(false);
  });

  it('does NOT match plain Errors or arbitrary thrown values', () => {
    expect(isReauthRedirect(new Error('network down'))).toBe(false);
    expect(isReauthRedirect('redirect')).toBe(false);
    expect(isReauthRedirect({ status: 302 })).toBe(false);
    expect(isReauthRedirect(null)).toBe(false);
    expect(isReauthRedirect(undefined)).toBe(false);
  });
});
