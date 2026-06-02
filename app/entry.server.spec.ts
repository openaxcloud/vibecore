import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyDocumentIsolationHeaders, waitForServerRenderReady } from './entry.server';

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
