import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureAndUploadThumbnail,
  capturePreviewPng,
  uploadThumbnailBlob,
  type ThumbnailUploadTarget,
} from './thumbnail-capture';

/*
 * Browser lifecycle APIs below are synthetic: they establish bounded settlement
 * and cleanup, not a live screen-sharing permission or pixel-identity proof.
 */
const PNG = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });

describe('uploadThumbnailBlob', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('PUTs the blob to the signed url with the provided method + headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const target: ThumbnailUploadTarget = {
      ok: true,
      url: 'https://storage.example/signed-put',
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
    };

    await uploadThumbnailBlob(target, PNG);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://storage.example/signed-put');
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({ 'Content-Type': 'image/png' });
    expect(init.body).toBe(PNG);
  });

  it('refuses to upload when object storage is disabled (never touches the network)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadThumbnailBlob({ enabled: false }, PNG)).rejects.toThrow(/not enabled/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws the backend error when no signed url was minted', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadThumbnailBlob({ ok: false, error: 'nope' }, PNG)).rejects.toThrow('nope');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a failed PUT (non-2xx) instead of silently succeeding', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })));

    await expect(uploadThumbnailBlob({ ok: true, url: 'https://storage.example/signed-put' }, PNG)).rejects.toThrow(
      /403/,
    );
  });
});

describe('capture and upload deadlines (synthetic browser APIs)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('times out a stalled picker and stops a stream acquired after the deadline', async () => {
    vi.useFakeTimers();

    let acquire!: (stream: MediaStream) => void;

    const stop = vi.fn();
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getDisplayMedia: () =>
          new Promise<MediaStream>((resolve) => {
            acquire = resolve;
          }),
      },
    });

    const result = capturePreviewPng({} as HTMLElement);
    const rejected = expect(result).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    acquire({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await Promise.resolve();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('aborts a stalled upload and reports timeout rather than user cancellation', async () => {
    vi.useFakeTimers();

    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, init: RequestInit) => {
        signal = init.signal ?? undefined;
        return new Promise(() => {
          /* Intentionally never settles: browser/network hang fixture. */
        });
      }),
    );

    const result = uploadThumbnailBlob({ ok: true, url: 'https://storage.example/put' }, PNG);
    const rejected = expect(result).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(signal?.aborted).toBe(true);
  });
});

// These are deterministic lifecycle tests, not proof of browser permission/capture UX.
describe('capture lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function browser(stage: 'play' | 'frame' | 'encode' | 'success', surface = 'browser') {
    const stop = vi.fn();
    const pause = vi.fn();

    const video = {
      srcObject: null,
      muted: false,
      videoWidth: 100,
      videoHeight: 100,
      pause,
      play: () =>
        stage === 'play'
          ? new Promise<void>(() => {
              /* Intentionally never settles: browser/network hang fixture. */
            })
          : Promise.resolve(),
    };

    const drawImage = vi.fn();

    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob: (callback: BlobCallback) => {
        if (stage !== 'encode') {
          callback(PNG);
        }
      },
    };
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop }],
          getVideoTracks: () => [{ getSettings: () => ({ displaySurface: surface }) }],
        }),
      },
    });
    vi.stubGlobal('document', { createElement: (tag: string) => (tag === 'video' ? video : canvas) });
    vi.stubGlobal('window', { innerWidth: 100, innerHeight: 100 });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      if (stage !== 'frame') {
        callback(0);
      }

      return 7;
    });

    const cancel = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancel);

    const target = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 50, height: 50 }) } as HTMLElement;

    return { target, stop, pause, video, drawImage, cancel };
  }

  it.each(['play', 'frame', 'encode'] as const)('cleans up after stalled %s', async (stage) => {
    vi.useFakeTimers();

    const fixture = browser(stage);
    const rejected = expect(capturePreviewPng(fixture.target)).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(fixture.stop).toHaveBeenCalledOnce();
    expect(fixture.pause).toHaveBeenCalledOnce();
    expect(fixture.video.srcObject).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    if (stage !== 'play') {
      expect(fixture.cancel).toHaveBeenCalledWith(7);
    }
  });

  it('returns real canvas blob and releases resources on success', async () => {
    const fixture = browser('success');
    await expect(capturePreviewPng(fixture.target)).resolves.toBe(PNG);
    expect(fixture.drawImage).toHaveBeenCalledOnce();
    expect(fixture.stop).toHaveBeenCalledOnce();
  });

  it.each(['monitor', 'window'])(
    'rejects explicit %s capture instead of cropping unrelated pixels',
    async (surface) => {
      const fixture = browser('success', surface);
      await expect(capturePreviewPng(fixture.target)).rejects.toThrow('Select the current browser tab');
      expect(fixture.drawImage).not.toHaveBeenCalled();
      expect(fixture.stop).toHaveBeenCalledOnce();
    },
  );

  it.each(['request', 'body'] as const)('bounds a stalled signed-target %s without uploading', async (stage) => {
    vi.useFakeTimers();

    const fixture = browser('success');

    let signal: AbortSignal | undefined;

    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return stage === 'request'
        ? new Promise<Response>(() => {
            /* Intentionally never settles: browser/network hang fixture. */
          })
        : Promise.resolve({
            json: () =>
              new Promise(() => {
                /* Intentionally never settles: browser/network hang fixture. */
              }),
          });
    });
    vi.stubGlobal('fetch', fetchMock);

    const rejected = expect(captureAndUploadThumbnail('synthetic-project', fixture.target)).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fixture.stop).toHaveBeenCalledOnce();
  });

  it('preserves user cancellation distinctly from timeout', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getDisplayMedia: vi.fn().mockRejectedValue(new DOMException('Cancelled', 'NotAllowedError')) },
    });
    await expect(capturePreviewPng({} as HTMLElement)).rejects.toMatchObject({ name: 'NotAllowedError' });
  });
});
