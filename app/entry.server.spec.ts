import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyDocumentCacheHeaders, applyDocumentIsolationHeaders, waitForServerRenderReady } from './entry.server';

afterEach(() => {
  vi.useRealTimers();
});

describe('entry server document isolation headers', () => {
  it('uses credentialless COEP for WebContainer previews', () => {
    const headers = new Headers();

    applyDocumentIsolationHeaders(headers);

    expect(headers.get('Cross-Origin-Embedder-Policy')).toBe('credentialless');
    expect(headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });

  it('sets baseline document hardening headers', () => {
    const headers = new Headers();

    applyDocumentIsolationHeaders(headers);

    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  /*
   * The previous version of this test asserted the OPPOSITE for app paths:
   * `expect(appHeaders.has('Cache-Control')).toBe(false)`. It passed, and it
   * pinned a hole. `no-store` had been added for stale service workers on
   * marketing pages (339b86c9d), so the condition covered the documents that
   * carry no session and skipped every authenticated one.
   *
   * Measured on production 2026-09-05: GET /login answered 200 with
   * `content-type: text/html`, a `set-cookie: vc_upstream=...; HttpOnly`, and
   * no cache-control header at all.
   */
  it('marks EVERY document no-store, including the ones that hand out a session cookie', () => {
    const chemins = [
      '/community', // marketing -- the original case, must not regress
      '/login', // the measured defect: 200 text/html + set-cookie, no cache-control
      '/projects/abc/ide', // authenticated app document
      '/account-settings',
      '/', // root
      '/anything-a-future-route-adds',
    ];

    for (const chemin of chemins) {
      const headers = new Headers();
      applyDocumentCacheHeaders(new Request(`https://app.e-code.ai${chemin}`), headers);

      expect(headers.get('Cache-Control'), `${chemin} must be no-store`).toBe('no-store');
    }
  });

  /*
   * The discriminating half. The test above passes under ANY rule that happens
   * to cover those six paths -- including a re-introduced allow-list that
   * simply lists them. This one fails the moment the header is derived from
   * the request at all, which is the mechanism that produced the /login hole:
   * a condition someone can get wrong later, silently.
   */
  it('does not derive the cache header from the request, so no path can be excluded', () => {
    const aveugle = new Headers();

    const piege = new Request('https://app.e-code.ai/login', {
      headers: { cookie: 'vc_session=abc', 'user-agent': 'x', accept: 'text/html' },
    });

    applyDocumentCacheHeaders(piege, aveugle);
    expect(aveugle.get('Cache-Control')).toBe('no-store');

    // Same call, a request carrying nothing at all -- a first visitor.
    const nu = new Headers();
    applyDocumentCacheHeaders(new Request('https://app.e-code.ai/login'), nu);
    expect(nu.get('Cache-Control')).toBe('no-store');

    /*
     * And the source itself: `applyDocumentCacheHeaders` must not read the URL.
     * Anchored on the FUNCTION, not on prose -- a rewritten comment cannot turn
     * this green.
     */
    expect(applyDocumentCacheHeaders.length).toBe(2);
    expect(String(applyDocumentCacheHeaders)).not.toContain('new URL(');
  });

  it('bounds allReady so a suspended route cannot block the document forever', async () => {
    vi.useFakeTimers();

    const pendingRender = new Promise(() => undefined);
    const readiness = waitForServerRenderReady(pendingRender, 1_000);

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(readiness).resolves.toBe('timeout');
  });

  it('keeps complete SSR when allReady resolves before the timeout', async () => {
    await expect(waitForServerRenderReady(Promise.resolve(), 1_000)).resolves.toBe('ready');
  });
});
