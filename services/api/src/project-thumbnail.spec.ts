import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ListObjectsResult, ObjectStorage } from './object-storage.js';
import {
  captureProjectThumbnail,
  HttpThumbnailRenderer,
  THUMBNAIL_DEBOUNCE_MS,
  type ThumbnailRenderer,
} from './project-thumbnail.js';

const PNG = new Uint8Array([137, 80, 78, 71]);

/* A minimal ObjectStorage fake that records the last putObject + serves a list. */
function fakeStorage(overrides: Partial<ObjectStorage> & { listing?: ListObjectsResult } = {}) {
  const puts: Array<{ key: string; size: number }> = [];
  const ensured: string[] = [];

  const storage = {
    active: overrides.active ?? true,
    async listObjects() {
      return overrides.listing ?? { objects: [], folders: [] };
    },
    async ensureBucket(projectId: string) {
      ensured.push(projectId);
      return { bucket: `vc-${projectId}`, created: false, location: 'EU' };
    },
    async putObject(_projectId: string, input: { key: string; body: Uint8Array }) {
      const record = { key: input.key, size: input.body.byteLength };
      puts.push(record);
      return record;
    },
  } as unknown as ObjectStorage;

  return { storage, puts, ensured };
}

const renderOk: ThumbnailRenderer = {
  async render() {
    return PNG;
  },
};
const renderNull: ThumbnailRenderer = {
  async render() {
    return null;
  },
};

function listingWith(updatedIso: string): ListObjectsResult {
  return {
    objects: [
      {
        key: 'thumbnails/preview.png',
        size: 10,
        updated: updatedIso,
        contentType: 'image/png',
        etag: 'e',
        generation: '1',
        contentHash: 'md5:e',
      },
    ],
    folders: [],
  };
}

describe('captureProjectThumbnail', () => {
  it('renders and stores the PNG under the pinned key when none exists', async () => {
    const { storage, puts, ensured } = fakeStorage();

    const result = await captureProjectThumbnail(
      { storage, renderer: renderOk },
      { projectId: 'proj-1', url: 'https://x.preview.e-code.ai/' },
    );

    expect(result).toBe('stored');
    expect(ensured).toEqual(['proj-1']);
    expect(puts).toEqual([{ key: 'thumbnails/preview.png', size: PNG.byteLength }]);
  });

  it('no-ops when object storage is disabled (never renders)', async () => {
    const { storage, puts } = fakeStorage({ active: false });
    const render = vi.fn(renderOk.render);

    const result = await captureProjectThumbnail({ storage, renderer: { render } }, { projectId: 'p', url: 'u' });

    expect(result).toBe('disabled');
    expect(render).not.toHaveBeenCalled();
    expect(puts).toHaveLength(0);
  });

  it('debounces when a thumbnail was stored within the window', async () => {
    const now = 1_000_000_000_000;
    const { storage, puts } = fakeStorage({ listing: listingWith(new Date(now - 60_000).toISOString()) });

    const result = await captureProjectThumbnail(
      { storage, renderer: renderOk, now: () => now },
      { projectId: 'p', url: 'u' },
    );

    expect(result).toBe('debounced');
    expect(puts).toHaveLength(0);
  });

  it('re-captures once the debounce window has elapsed', async () => {
    const now = 1_000_000_000_000;
    const { storage, puts } = fakeStorage({
      listing: listingWith(new Date(now - THUMBNAIL_DEBOUNCE_MS - 1).toISOString()),
    });

    const result = await captureProjectThumbnail(
      { storage, renderer: renderOk, now: () => now },
      { projectId: 'p', url: 'u' },
    );

    expect(result).toBe('stored');
    expect(puts).toHaveLength(1);
  });

  it('force bypasses the debounce', async () => {
    const now = 1_000_000_000_000;
    const { storage, puts } = fakeStorage({ listing: listingWith(new Date(now).toISOString()) });

    const result = await captureProjectThumbnail(
      { storage, renderer: renderOk, now: () => now },
      { projectId: 'p', url: 'u', force: true },
    );

    expect(result).toBe('stored');
    expect(puts).toHaveLength(1);
  });

  it('reports render-failed and stores nothing when the renderer returns null', async () => {
    const { storage, puts } = fakeStorage();

    const result = await captureProjectThumbnail({ storage, renderer: renderNull }, { projectId: 'p', url: 'u' });

    expect(result).toBe('render-failed');
    expect(puts).toHaveLength(0);
  });
});

describe('HttpThumbnailRenderer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is inert (returns null, no fetch) when no base url is configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const bytes = await new HttpThumbnailRenderer(undefined).render({ url: 'u', projectId: 'p' });

    expect(bytes).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs {url, projectId} to /capture and returns the PNG bytes on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(PNG, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const bytes = await new HttpThumbnailRenderer('https://shooter.internal/', 'sekret').render({
      url: 'https://x.preview.e-code.ai/',
      projectId: 'proj-1',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://shooter.internal/capture');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer sekret');
    expect(JSON.parse(init.body)).toEqual({ url: 'https://x.preview.e-code.ai/', projectId: 'proj-1' });
    expect(bytes && Array.from(bytes)).toEqual(Array.from(PNG));
  });

  it('returns null on a non-2xx render', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    const bytes = await new HttpThumbnailRenderer('https://shooter.internal').render({ url: 'u', projectId: 'p' });

    expect(bytes).toBeNull();
  });
});
