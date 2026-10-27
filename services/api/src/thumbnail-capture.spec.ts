import { describe, expect, it, vi } from 'vitest';
import type { ObjectStorage } from './object-storage.js';
import { ThumbnailCapturer } from './thumbnail-capture.js';

function fakeStorage() {
  const puts: Array<{ projectId: string; key: string; bytes: number }> = [];

  const storage = {
    ensureBucket: vi.fn().mockResolvedValue({ bucket: 'fixture', created: true, location: 'test' }),
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

    const ok = await cap.capture('proj-1', 'https://ws-1.preview.e-code.ai/');

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
    expect(await cap.capture('p', 'https://x/')).toBe(false);
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

    expect(await cap.capture('p', 'https://x/')).toBe(true);
    expect(await cap.capture('p', 'https://x/')).toBe(false); // within window
    clock += 60_001;
    expect(await cap.capture('p', 'https://x/')).toBe(true); // window elapsed

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

    expect(await cap.capture('p', 'https://x/')).toBe(false);
    expect(puts).toHaveLength(0);
  });

  it('schedule() never rejects even when the render throws', async () => {
    const { storage } = fakeStorage();

    const cap = new ThumbnailCapturer({
      storage,
      screenshotterUrl: 'http://s',
      fetchImpl: (() => Promise.reject(new Error('network'))) as unknown as typeof fetch,
    });

    expect(() => cap.schedule('p', 'https://x/')).not.toThrow();
    await Promise.resolve();
  });
});

describe('ThumbnailCapturer provisioning and retry', () => {
  it('provisions the bucket before writing a first thumbnail', async () => {
    const calls: string[] = [];

    const storage = {
      ensureBucket: async () => {
        calls.push('ensure');
      },
      putObject: async () => {
        expect(calls).toEqual(['ensure']);
        calls.push('put');
      },
    } as unknown as ObjectStorage;
    const cap = new ThumbnailCapturer({
      storage,
      screenshotterUrl: 'http://fixture',
      fetchImpl: async () => pngResponse(),
    });
    expect(await cap.capture('new-project', 'https://fixture/')).toBe(true);
    expect(calls).toEqual(['ensure', 'put']);
  });

  it('retries a failed render after a short cooldown, not five minutes', async () => {
    const { storage } = fakeStorage();

    let clock = 1_000_000;

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockImplementation(async () => pngResponse());

    const cap = new ThumbnailCapturer({ storage, screenshotterUrl: 'http://fixture', fetchImpl, now: () => clock });
    expect(await cap.capture('p', 'https://fixture/')).toBe(false);
    expect(await cap.capture('p', 'https://fixture/')).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clock += 5_001;
    expect(await cap.capture('p', 'https://fixture/')).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not start a late write when bucket provisioning outlives the capture budget', async () => {
    vi.useFakeTimers();

    try {
      let release!: () => void;

      const ensureBucket = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );

      const putObject = vi.fn();
      const storage = { ensureBucket, putObject } as unknown as ObjectStorage;
      const fetchImpl = vi.fn(async () => pngResponse());
      const cap = new ThumbnailCapturer({ storage, screenshotterUrl: 'http://fixture', fetchImpl, timeoutMs: 10 });
      const pending = cap.capture('p', 'https://fixture/');
      await vi.advanceTimersByTimeAsync(11);
      expect(ensureBucket).toHaveBeenCalledTimes(1);
      expect(await cap.capture('p', 'https://fixture/')).toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      release();
      expect(await pending).toBe(false);
      expect(putObject).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it('keeps the lock during an expired write and never reports its late completion as success', async () => {
    vi.useFakeTimers();

    try {
      let release!: () => void;

      const { storage } = fakeStorage();
      storage.putObject = vi.fn(
        () =>
          new Promise<{ key: string; size: number }>((resolve) => {
            release = () => resolve({ key: 'thumbnails/preview.png', size: 4 });
          }),
      );

      const log = { info: vi.fn(), warn: vi.fn() };
      const fetchImpl = vi.fn(async () => pngResponse());
      const cap = new ThumbnailCapturer({ storage, screenshotterUrl: 'http://fixture', fetchImpl, timeoutMs: 10, log });
      const pending = cap.capture('p', 'https://fixture/');
      await vi.advanceTimersByTimeAsync(11);
      expect(await cap.capture('p', 'https://fixture/')).toBe(false);
      expect(storage.putObject).toHaveBeenCalledTimes(1);
      release();
      expect(await pending).toBe(false);
      expect(log.info).not.toHaveBeenCalled();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('can recover from a bucket provisioning failure without writing before it succeeds', async () => {
    const { storage, puts } = fakeStorage();
    storage.ensureBucket = vi
      .fn()
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValue({ bucket: 'fixture' });

    let clock = 0;

    const cap = new ThumbnailCapturer({
      storage,
      screenshotterUrl: 'http://fixture',
      fetchImpl: async () => pngResponse(),
      now: () => clock,
    });
    expect(await cap.capture('p', 'https://fixture/')).toBe(false);
    expect(puts).toHaveLength(0);
    clock += 5_001;
    expect(await cap.capture('p', 'https://fixture/')).toBe(true);
    expect(puts).toHaveLength(1);
  });
});

describe('ThumbnailCapturer observed outcomes', () => {
  it('distinguishes a stored write from a historical-success skip and known failure', async () => {
    const { storage } = fakeStorage();

    const cap = new ThumbnailCapturer({
      storage,
      screenshotterUrl: 'http://fixture',
      fetchImpl: vi.fn().mockImplementation(async () => pngResponse()),
    });
    expect(await cap.captureResult('p', 'http://preview/')).toEqual({ status: 'stored' });
    expect(await cap.captureResult('p', 'http://preview/')).toEqual({ status: 'skipped', reason: 'recent-success' });

    const failing = new ThumbnailCapturer({
      storage,
      screenshotterUrl: 'http://fixture',
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 422 })),
    });
    expect(await failing.captureResult('p', 'http://preview/')).toEqual({ status: 'failed', reason: 'capture-error' });
    expect(await failing.captureResult('p', 'http://preview/')).toEqual({
      status: 'skipped',
      reason: 'failure-cooldown',
    });
  });

  it('returns pending at the HTTP deadline while retaining the noncancellable storage lock', async () => {
    vi.useFakeTimers();

    try {
      const { storage } = fakeStorage();

      let finish!: () => void;
      storage.putObject = vi.fn(
        () =>
          new Promise<{ key: string; size: number }>((resolve) => {
            finish = () => resolve({ key: 'thumbnails/preview.png', size: 4 });
          }),
      );

      const cap = new ThumbnailCapturer({
        storage,
        screenshotterUrl: 'http://fixture',
        fetchImpl: vi.fn().mockImplementation(async () => pngResponse()),
      });

      const pending = cap.captureResultWithinDeadline('p', 'http://preview/', 25_000);
      await vi.advanceTimersByTimeAsync(25_000);
      expect(await pending).toEqual({ status: 'pending', reason: 'deadline' });
      expect(await cap.captureResult('p', 'http://preview/')).toEqual({ status: 'pending', reason: 'in-flight' });
      expect(storage.putObject).toHaveBeenCalledOnce();
      finish();
      await vi.advanceTimersByTimeAsync(0);
      expect(await cap.captureResult('p', 'http://preview/')).toEqual({ status: 'skipped', reason: 'recent-success' });
    } finally {
      vi.useRealTimers();
    }
  });
  it('keeps an expired late storage write ambiguous instead of reporting a known failure', async () => {
    vi.useFakeTimers();

    try {
      const { storage } = fakeStorage();

      let finish!: () => void;
      storage.putObject = vi.fn(
        () =>
          new Promise<{ key: string; size: number }>((resolve) => {
            finish = () => resolve({ key: 'thumbnails/preview.png', size: 4 });
          }),
      );

      const cap = new ThumbnailCapturer({
        storage,
        screenshotterUrl: 'http://fixture',
        fetchImpl: vi.fn().mockImplementation(async () => pngResponse()),
      });

      const result = cap.captureResult('p', 'http://preview/');
      await vi.advanceTimersByTimeAsync(31_000);
      expect(await cap.captureResult('p', 'http://preview/')).toEqual({ status: 'pending', reason: 'in-flight' });
      expect(storage.putObject).toHaveBeenCalledOnce();
      finish();
      expect(await result).toEqual({ status: 'pending', reason: 'deadline' });
      expect(await cap.captureResult('p', 'http://preview/')).toEqual({
        status: 'skipped',
        reason: 'failure-cooldown',
      });
    } finally {
      vi.useRealTimers();
    }
  });
  it('does not call an unconfirmed storage acknowledgement a known failed write', async () => {
    const { storage } = fakeStorage();
    storage.putObject = vi.fn().mockRejectedValue(new Error('Synthetic lost write acknowledgement'));

    const cap = new ThumbnailCapturer({
      storage,
      screenshotterUrl: 'http://fixture',
      fetchImpl: vi.fn().mockImplementation(async () => pngResponse()),
    });
    expect(await cap.captureResult('p', 'http://preview/')).toEqual({
      status: 'pending',
      reason: 'storage-unconfirmed',
    });
  });
});
