import { describe, expect, it, vi } from 'vitest';
import type { ObjectStorage } from './object-storage.js';
import { ThumbnailCapturer } from './thumbnail-capture.js';

function fakeStorage() {
  const puts: Array<{ projectId: string; key: string; bytes: number }> = [];
  const storage = {
    async ensureBucket(projectId: string) {
      return { bucket: `vc-${projectId}`, created: false, location: 'EU' };
    },
    async putObject(projectId: string, input: { key: string; body: Uint8Array }) {
      puts.push({ projectId, key: input.key, bytes: input.body.byteLength });

      return { key: input.key, size: input.body.byteLength };
    },
  } as unknown as ObjectStorage;

  return { storage, puts };
}

function pngResponse() {
  return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'content-type': 'image/png' } });
}

describe('ThumbnailCapturer', () => {
  it('renders via the screenshotter and stores the PNG under the pinned key', async () => {
    const { storage, puts } = fakeStorage();
    const fetchImpl = vi.fn().mockResolvedValue(pngResponse());

    const cap = new ThumbnailCapturer({
      storage,
      screenshotterUrl: 'http://screenshotter:3030/',
      sharedSecret: 'sek',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const ok = await cap.capture(
      { projectId: 'proj-1', expectedOrganizationId: 'org-1' },
      'https://ws-1.preview.e-code.ai/',
    );

    expect(ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://screenshotter:3030/capture'); // trailing slash normalised
    expect(init.headers.authorization).toBe('Bearer sek');
    expect(JSON.parse(init.body)).toEqual({ url: 'https://ws-1.preview.e-code.ai/', projectId: 'proj-1' });
    expect(puts).toEqual([{ projectId: 'proj-1', key: 'thumbnails/preview.png', bytes: 4 }]);
  });

  it('is a no-op when disabled (no screenshotter URL) — never fetches or stores', async () => {
    const { storage, puts } = fakeStorage();
    const fetchImpl = vi.fn();

    const cap = new ThumbnailCapturer({ storage, fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(cap.enabled).toBe(false);
    expect(await cap.capture({ projectId: 'p', expectedOrganizationId: 'org' }, 'https://x/')).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(puts).toHaveLength(0);
  });

  it('debounces repeat captures within the window', async () => {
    const { storage, puts } = fakeStorage();
    const fetchImpl = vi.fn().mockImplementation(async () => pngResponse());
    let clock = 1_000_000;

    const cap = new ThumbnailCapturer({
      storage,
      screenshotterUrl: 'http://s',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => clock,
      debounceMs: 60_000,
    });

    expect(await cap.capture({ projectId: 'p', expectedOrganizationId: 'org' }, 'https://x/')).toBe(true);
    expect(await cap.capture({ projectId: 'p', expectedOrganizationId: 'org' }, 'https://x/')).toBe(false); // within window
    clock += 60_001;
    expect(await cap.capture({ projectId: 'p', expectedOrganizationId: 'org' }, 'https://x/')).toBe(true); // window elapsed

    expect(puts).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('swallows a screenshotter failure (no store, no throw)', async () => {
    const { storage, puts } = fakeStorage();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 502 }));

    const cap = new ThumbnailCapturer({
      storage,
      screenshotterUrl: 'http://s',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(await cap.capture({ projectId: 'p', expectedOrganizationId: 'org' }, 'https://x/')).toBe(false);
    expect(puts).toHaveLength(0);
  });

  it('schedule() never rejects even when the render throws', async () => {
    const { storage } = fakeStorage();
    const cap = new ThumbnailCapturer({
      storage,
      screenshotterUrl: 'http://s',
      fetchImpl: (() => Promise.reject(new Error('network'))) as unknown as typeof fetch,
    });

    expect(() => cap.schedule({ projectId: 'p', expectedOrganizationId: 'org' }, 'https://x/')).not.toThrow();
    await Promise.resolve();
  });
});
