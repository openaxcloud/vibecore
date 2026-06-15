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

  it('marks public marketing documents as no-store so stale service workers cannot preserve old pages', () => {
    const marketingHeaders = new Headers();
    const appHeaders = new Headers();

    applyDocumentCacheHeaders(new Request('https://e-code.ai/community'), marketingHeaders);
    applyDocumentCacheHeaders(new Request('https://e-code.ai/projects/abc/ide'), appHeaders);

    expect(marketingHeaders.get('Cache-Control')).toBe('no-store');
    expect(appHeaders.has('Cache-Control')).toBe(false);
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
