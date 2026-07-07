import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadThumbnailBlob, type ThumbnailUploadTarget } from './thumbnail-capture';

/*
 * capturePreviewPng() drives the Screen Capture API (getDisplayMedia + canvas)
 * which jsdom can't run, so the browser capture is verified live. Here we lock
 * down the upload CONTRACT — the pure half that decides whether/where to PUT the
 * PNG — which is where correctness bugs (uploading when disabled, ignoring a
 * failed PUT) would actually bite.
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
