import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectGalleryError } from './project-gallery.js';
import {
  probeGalleryFunctionalPreview,
  type GalleryPreviewHostnameResolver,
  type GalleryPreviewProbeOptions,
} from './gallery-preview-probe.js';

const PREVIEW_URL = 'https://preview.example.com/apps/customer-hub/';
const PUBLIC_ADDRESS = { address: '93.184.216.34', family: 4 } as const;
const resolvePublicHostname: GalleryPreviewHostnameResolver = async () => [PUBLIC_ADDRESS];

function htmlResponse(body: string, status = 200) {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function fetchUrl(input: string | URL | Request): string {
  return input instanceof Request ? input.url : String(input);
}

function probeOptions(fetchImpl: typeof fetch, overrides: Partial<GalleryPreviewProbeOptions> = {}) {
  return { fetchImpl, resolveHostname: resolvePublicHostname, ...overrides } satisfies GalleryPreviewProbeOptions;
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
      ...probeOptions(fetchImpl),
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
    const resolveHostname = vi.fn<GalleryPreviewHostnameResolver>(resolvePublicHostname);
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

    const evidence = await probeGalleryFunctionalPreview(PREVIEW_URL, probeOptions(fetchImpl, { resolveHostname }));

    expect(evidence).toMatchObject({ rendered: true, checkedAssetCount: 3 });
    expect(resolveHostname).toHaveBeenCalledTimes(4);
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

    await expect(probeGalleryFunctionalPreview(PREVIEW_URL, probeOptions(fetchImpl))).rejects.toMatchObject({
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

    await expect(probeGalleryFunctionalPreview(PREVIEW_URL, probeOptions(fetchImpl))).rejects.toMatchObject({
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

      await expect(probeGalleryFunctionalPreview(PREVIEW_URL, probeOptions(fetchImpl))).rejects.toMatchObject({
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
      await probeGalleryFunctionalPreview(PREVIEW_URL, probeOptions(fetchImpl, { timeoutMs: 250 }));
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

    await expect(probeGalleryFunctionalPreview(PREVIEW_URL, probeOptions(fetchImpl))).rejects.toMatchObject({
      code: 'GALLERY_PREVIEW_NOT_FUNCTIONAL',
      details: { reason: 'EMPTY_SHELL' },
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([
    'https://127.0.0.1/',
    'https://0x7f000001/',
    'https://10.0.0.1/',
    'https://168.63.129.16/',
    'https://169.254.169.254/latest/meta-data/',
    'https://192.168.1.10/',
    'https://[::1]/',
    'https://[fc00::1]/',
    'https://[fe80::1]/',
    'https://[::ffff:7f00:1]/',
    'https://metadata.google.internal/',
  ])('rejects private, loopback, link-local, metadata, and encoded targets before fetch: %s', async (url) => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(probeGalleryFunctionalPreview(url, probeOptions(fetchImpl))).rejects.toMatchObject({
      statusCode: 422,
      code: 'GALLERY_PREVIEW_UNSAFE_NETWORK_TARGET',
      details: { recoverable: true, stage: 'document' },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a mixed DNS answer when any address is private instead of selecting its public sibling', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const resolveHostname = vi
      .fn<GalleryPreviewHostnameResolver>()
      .mockResolvedValue([PUBLIC_ADDRESS, { address: '10.42.0.9', family: 4 }]);

    await expect(
      probeGalleryFunctionalPreview(PREVIEW_URL, probeOptions(fetchImpl, { resolveHostname })),
    ).rejects.toMatchObject({
      code: 'GALLERY_PREVIEW_UNSAFE_NETWORK_TARGET',
      details: { recoverable: true, stage: 'document', reason: 'BLOCKED_ADDRESS' },
    });
    expect(resolveHostname).toHaveBeenCalledWith('preview.example.com');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('revalidates DNS for every asset and blocks a rebinding answer before the second fetch', async () => {
    const resolveHostname = vi
      .fn<GalleryPreviewHostnameResolver>()
      .mockResolvedValueOnce([PUBLIC_ADDRESS])
      .mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]);
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      htmlResponse(
        '<!doctype html><html><body><div id="root"></div><script src="/assets/app.js"></script></body></html>',
      ),
    );

    await expect(
      probeGalleryFunctionalPreview(PREVIEW_URL, probeOptions(fetchImpl, { resolveHostname })),
    ).rejects.toMatchObject({
      code: 'GALLERY_PREVIEW_UNSAFE_NETWORK_TARGET',
      details: {
        recoverable: true,
        stage: 'asset',
        assetType: 'script',
        assetPath: '/assets/app.js',
        reason: 'BLOCKED_ADDRESS',
      },
    });
    expect(resolveHostname).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('never follows an asset redirect, including one pointing at cloud metadata', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      if (fetchUrl(input) === PREVIEW_URL) {
        return htmlResponse(
          '<!doctype html><html><body><div id="root"></div><script src="/assets/app.js"></script></body></html>',
        );
      }

      return new Response('', {
        status: 302,
        headers: { location: 'https://169.254.169.254/latest/meta-data/' },
      });
    });

    await expect(probeGalleryFunctionalPreview(PREVIEW_URL, probeOptions(fetchImpl))).rejects.toMatchObject({
      code: 'GALLERY_PREVIEW_ASSET_UNAVAILABLE',
      details: { recoverable: true, stage: 'asset', assetPath: '/assets/app.js', httpStatus: 302 },
    });
    expect(fetchImpl.mock.calls.map(([input]) => fetchUrl(input))).toEqual([
      PREVIEW_URL,
      'https://preview.example.com/assets/app.js',
    ]);
  });

  it('rejects URL credentials before DNS or fetch so they cannot reach logs or upstream services', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const resolveHostname = vi.fn<GalleryPreviewHostnameResolver>(resolvePublicHostname);

    await expect(
      probeGalleryFunctionalPreview(
        'https://user:secret@preview.example.com/apps/customer-hub/',
        probeOptions(fetchImpl, { resolveHostname }),
      ),
    ).rejects.toMatchObject({
      code: 'GALLERY_PREVIEW_UNSAFE_NETWORK_TARGET',
      details: { recoverable: true, stage: 'document', reason: 'BLOCKED_HOST' },
    });
    expect(resolveHostname).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed before fetch when DNS resolution fails or returns no usable address', async () => {
    const cases: GalleryPreviewHostnameResolver[] = [
      async () => {
        throw new Error('resolver output must not leak');
      },
      async () => [],
    ];

    for (const resolveHostname of cases) {
      const fetchImpl = vi.fn<typeof fetch>();

      await expect(
        probeGalleryFunctionalPreview(PREVIEW_URL, probeOptions(fetchImpl, { resolveHostname })),
      ).rejects.toMatchObject({
        code: 'GALLERY_PREVIEW_UNREACHABLE',
        details: { recoverable: true, stage: 'document' },
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });
});
