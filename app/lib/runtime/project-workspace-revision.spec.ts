/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchPersistedProjectRevision } from './ProjectWorkspaceProvider';

function response(init: { ok?: boolean; etag?: string | null; body?: unknown }) {
  return {
    ok: init.ok ?? true,
    headers: { get: (k: string) => (k.toLowerCase() === 'etag' ? (init.etag ?? null) : null) },
    json: async () => init.body,
  } as unknown as Response;
}

describe('fetchPersistedProjectRevision', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('prefers the persisted ide-state ETag (the version) — cheap, no body parse', async () => {
    const json = vi.fn(async () => ({ ideState: { version: 99 } }));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ...response({ etag: '"7"' }), json })));
    await expect(fetchPersistedProjectRevision('p1')).resolves.toBe('"7"');
    expect(json).not.toHaveBeenCalled();
  });

  it('falls back to the body version when no ETag header is present', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ etag: null, body: { ideState: { version: 12 } } })));
    await expect(fetchPersistedProjectRevision('p1')).resolves.toBe('12');
  });

  it('returns undefined on a non-ok response (falls back to marker-only behaviour)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ ok: false })));
    await expect(fetchPersistedProjectRevision('p1')).resolves.toBeUndefined();
  });

  it('returns undefined when the ide-state has never been persisted (no version)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ etag: null, body: { ideState: null } })));
    await expect(fetchPersistedProjectRevision('p1')).resolves.toBeUndefined();
  });

  it('returns undefined (never throws) when the fetch itself fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network');
      }),
    );
    await expect(fetchPersistedProjectRevision('p1')).resolves.toBeUndefined();
  });
});
