import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyGeminiCache,
  geminiCacheMinTokens,
  geminiModelSupportsCaching,
  getOrCreateGeminiCachedContent,
  invalidateGeminiCache,
  __resetGeminiCacheStore,
} from './gemini-cache.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** systemInstruction comfortably above the 2048-token (≈8192-char) Flash minimum. */
function bigSystem() {
  return { parts: [{ text: 'S'.repeat(12_000) }] };
}

function payload(system: unknown) {
  return {
    contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    systemInstruction: system,
    generationConfig: { maxOutputTokens: 100 },
  };
}

describe('geminiCacheMinTokens / geminiModelSupportsCaching', () => {
  it('applies per-model minimums', () => {
    expect(geminiCacheMinTokens('gemini-2.5-pro')).toBe(4096);
    expect(geminiCacheMinTokens('gemini-2.5-flash')).toBe(2048);
    expect(geminiCacheMinTokens('gemini-3.5-flash')).toBe(2048);
  });

  it('recognises cacheable model families only', () => {
    expect(geminiModelSupportsCaching('gemini-2.5-flash')).toBe(true);
    expect(geminiModelSupportsCaching('gemini-3.5-flash')).toBe(true);
    expect(geminiModelSupportsCaching('text-bison')).toBe(false);
  });
});

describe('gemini gateway cache', () => {
  beforeEach(() => __resetGeminiCacheStore());
  afterEach(() => vi.unstubAllGlobals());

  it('creates once and reuses across lanes; applyGeminiCache strips systemInstruction', async () => {
    let creates = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: any) => {
        if (String(url).includes('/cachedContents')) {
          creates += 1;
          return new Response(JSON.stringify({ name: 'cachedContents/xyz' }), { status: 200 });
        }

        return new Response('{}', { status: 200 });
      }),
    );

    const a = await applyGeminiCache(BASE, 'KEY', 'gemini-2.5-flash', payload(bigSystem()));
    const b = await applyGeminiCache(BASE, 'KEY', 'gemini-2.5-flash', payload(bigSystem()));

    expect(creates).toBe(1); // reused across the two lanes

    for (const r of [a, b]) {
      expect(r.usedCache).toBe(true);
      expect(r.payload.cachedContent).toBe('cachedContents/xyz');
      expect(r.payload.systemInstruction).toBeUndefined();
      expect(r.payload.contents).toBeDefined();
    }
  });

  it('scopes the reuse map per API key (a cache name is owned by its key)', async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: any, init: any) => {
        if (String(url).includes('/cachedContents')) {
          seen.push(JSON.parse(init.body).model);
          return new Response(JSON.stringify({ name: `cachedContents/${seen.length}` }), { status: 200 });
        }

        return new Response('{}', { status: 200 });
      }),
    );

    const k1 = await applyGeminiCache(BASE, 'KEY-A', 'gemini-2.5-flash', payload(bigSystem()));
    const k2 = await applyGeminiCache(BASE, 'KEY-B', 'gemini-2.5-flash', payload(bigSystem()));

    // Same system + model but different keys → two distinct cache resources, no cross-key reuse.
    expect(k1.payload.cachedContent).not.toBe(k2.payload.cachedContent);
  });

  it('skips caching below the per-model minimum (no create, systemInstruction kept)', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const r = await applyGeminiCache(BASE, 'KEY', 'gemini-2.5-flash', payload({ parts: [{ text: 'tiny' }] }));

    expect(r.usedCache).toBe(false);
    expect(r.payload.systemInstruction).toEqual({ parts: [{ text: 'tiny' }] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the original payload when the create fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: any) =>
        String(url).includes('/cachedContents')
          ? new Response('quota', { status: 429 })
          : new Response('{}', { status: 200 }),
      ),
    );

    const r = await applyGeminiCache(BASE, 'KEY', 'gemini-2.5-flash', payload(bigSystem()));

    expect(r.usedCache).toBe(false);
    expect(r.payload.systemInstruction).toBeDefined();
    expect(r.payload.cachedContent).toBeUndefined();
  });

  it('getOrCreateGeminiCachedContent returns null below the minimum and a name above it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ name: 'cachedContents/ok' }), { status: 200 })),
    );

    expect(
      await getOrCreateGeminiCachedContent(BASE, 'KEY', 'gemini-2.5-flash', { parts: [{ text: 'x' }] }),
    ).toBeNull();
    expect(await getOrCreateGeminiCachedContent(BASE, 'KEY', 'gemini-2.5-flash', bigSystem())).toBe(
      'cachedContents/ok',
    );
  });

  it('invalidate forces a fresh create on the next call', async () => {
    let creates = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: any) => {
        if (String(url).includes('/cachedContents')) {
          creates += 1;
          return new Response(JSON.stringify({ name: `cachedContents/${creates}` }), { status: 200 });
        }

        return new Response('{}', { status: 200 });
      }),
    );

    await applyGeminiCache(BASE, 'KEY', 'gemini-2.5-flash', payload(bigSystem()));
    invalidateGeminiCache('KEY', 'gemini-2.5-flash', 'S'.repeat(12_000));
    await applyGeminiCache(BASE, 'KEY', 'gemini-2.5-flash', payload(bigSystem()));

    expect(creates).toBe(2); // invalidation dropped the reuse entry
  });
});
