import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectGalleryError } from './project-gallery.js';
import { probeGalleryFunctionalPreview } from './gallery-preview-probe.js';

const PREVIEW_URL = 'https://preview.example.com/apps/customer-hub/';

function htmlResponse(body: string, status = 200) {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function fetchUrl(input: string | URL | Request): string {
  return input instanceof Request ? input.url : String(input);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('probeGalleryFunctionalPreview', () => {
  it('accepts a server-rendered app with meaningful visible content and records bounded evidence', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        htmlResponse('<!doctype html><html><body><main>Customer operations dashboard</main></body></html>'),
      );

    const evidence = await probeGalleryFunctionalPreview(PREVIEW_URL, {
      fetchImpl,
      now: () => new Date('2026-07-16T10:00:00.000Z'),
    });

    expect(evidence).toMatchObject({
      previewUrl: PREVIEW_URL,
      checkedAt: '2026-07-16T10:00:00.000Z',
      httpStatus: 200,
      rendered: true,
      checkedAssetCount: 0,
      checkedAssetBytes: 0,
    });
    expect(evidence.marker).toMatch(/^[a-f0-9]{16}$/);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('verifies every same-origin script, module preload, and stylesheet before accepting an SPA shell', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = fetchUrl(input);

      if (url === PREVIEW_URL) {
        return htmlResponse(`<!doctype html><html><head>
          <base href="/apps/customer-hub/">
          <link rel="stylesheet" href="assets/app.css">
          <link rel="modulepreload" href="assets/vendor.js">
        </head><body><div id="root"></div><script type="module" src="assets/app.js"></script></body></html>`);
      }
      if (url.endsWith('/assets/app.css')) {
        return new Response('body { color: #fff; }', { headers: { 'content-type': 'text/css' } });
      }
      if (url.endsWith('/assets/vendor.js')) {
        return new Response('export const version = 1;', { headers: { 'content-type': 'text/javascript' } });
      }
      if (url.endsWith('/assets/app.js')) {
        return new Response("document.querySelector('#root').textContent = 'Ready';", {
          headers: { 'content-type': 'application/javascript' },
        });
      }

      return new Response('not found', { status: 404 });
    });

    const evidence = await probeGalleryFunctionalPreview(PREVIEW_URL, { fetchImpl });

    expect(evidence).toMatchObject({ rendered: true, checkedAssetCount: 3 });
    expect(fetchImpl.mock.calls.map(([input]) => fetchUrl(input))).toEqual([
      PREVIEW_URL,
      'https://preview.example.com/apps/customer-hub/assets/app.js',
      'https://preview.example.com/apps/customer-hub/assets/app.css',
      'https://preview.example.com/apps/customer-hub/assets/vendor.js',
    ]);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init).toMatchObject({ method: 'GET', redirect: 'manual' });
    }
  });

  it('rejects an otherwise non-empty SPA shell when its JavaScript entrypoint is missing', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) =>
      fetchUrl(input) === PREVIEW_URL
        ? htmlResponse(
            '<!doctype html><html><head><title>Broken CRM</title></head><body><div id="root"></div><script src="/assets/missing.js"></script></body></html>',
          )
        : new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } }),
    );

    await expect(probeGalleryFunctionalPreview(PREVIEW_URL, { fetchImpl })).rejects.toMatchObject({
      statusCode: 422,
      code: 'GALLERY_PREVIEW_ASSET_UNAVAILABLE',
      details: {
        recoverable: true,
        stage: 'asset',
        assetType: 'script',
        assetPath: '/assets/missing.js',
        httpStatus: 404,
      },
    });
  });

  it('rejects an asset route that falls back to index.html with HTTP 200', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) =>
      fetchUrl(input) === PREVIEW_URL
        ? htmlResponse(
            '<!doctype html><html><body><div id="root"></div><link rel="stylesheet" href="assets/app.css"><script src="assets/app.js"></script></body></html>',
          )
        : htmlResponse('<!doctype html><html><body>SPA fallback</body></html>'),
    );

    await expect(probeGalleryFunctionalPreview(PREVIEW_URL, { fetchImpl })).rejects.toMatchObject({
      code: 'GALLERY_PREVIEW_ASSET_INVALID',
      details: { recoverable: true, stage: 'asset' },
    });
  });

  it('rejects redirects, JSON responses, and empty shells with recoverable document diagnostics', async () => {
    const cases = [
      {
        response: new Response('', { status: 302, headers: { location: 'https://login.example.com/' } }),
        reason: 'HTTP_STATUS',
      },
      {
        response: new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }),
        reason: 'INVALID_DOCUMENT',
      },
      {
        response: htmlResponse('<!doctype html><html><body><div id="root"></div></body></html>'),
        reason: 'EMPTY_SHELL',
      },
    ];

    for (const testCase of cases) {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(testCase.response);

      await expect(probeGalleryFunctionalPreview(PREVIEW_URL, { fetchImpl })).rejects.toMatchObject({
        statusCode: 422,
        code: 'GALLERY_PREVIEW_NOT_FUNCTIONAL',
        details: { recoverable: true, stage: 'document', reason: testCase.reason },
      });
    }
  });

  it('turns timeouts and network failures into a stable retryable API error without leaking provider output', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('https://preview.example.com/?token=secret failed'));

    let failure: unknown;
    try {
      await probeGalleryFunctionalPreview(PREVIEW_URL, { fetchImpl, timeoutMs: 250 });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ProjectGalleryError);
    expect(failure).toMatchObject({
      statusCode: 422,
      code: 'GALLERY_PREVIEW_UNREACHABLE',
      details: { recoverable: true, stage: 'document' },
    });
    expect((failure as Error).message).not.toContain('secret');
  });

  it('does not server-side fetch cross-origin dependencies and refuses to use one as the only SPA proof', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        htmlResponse(
          '<!doctype html><html><body><div id="root"></div><script src="https://cdn.example.net/app.js"></script></body></html>',
        ),
      );

    await expect(probeGalleryFunctionalPreview(PREVIEW_URL, { fetchImpl })).rejects.toMatchObject({
      code: 'GALLERY_PREVIEW_NOT_FUNCTIONAL',
      details: { reason: 'EMPTY_SHELL' },
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
