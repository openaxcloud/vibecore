import { describe, expect, it, beforeEach, vi } from 'vitest';

import {
  createGoogleCachingFetch,
  extractSystemInstructionText,
  googleCacheMinTokens,
  googleModelSupportsCaching,
  modelFromGoogleUrl,
  __resetGoogleCacheStore,
} from './google-cache';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const STREAM_URL = `${BASE}/models/gemini-2.5-flash:streamGenerateContent?alt=sse`;

/** A stable systemInstruction comfortably above the 2048-token (≈8192-char) Flash minimum. */
function bigSystem(): { parts: Array<{ text: string }> } {
  return { parts: [{ text: 'X'.repeat(12_000) }] };
}

function generateBody(system: unknown): string {
  return JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    systemInstruction: system,
    generationConfig: { temperature: 0 },
  });
}

/** A minimal streaming-ish Response carrying a usageMetadata blob for the tee to read. */
function okStream(cachedTokens = 0): Response {
  const payload = `data: ${JSON.stringify({
    candidates: [{ content: { parts: [{ text: 'ok' }] } }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3, cachedContentTokenCount: cachedTokens },
  })}\n\n`;

  return new Response(payload, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

describe('googleCacheMinTokens', () => {
  it('is 4096 for pro and 2048 for flash / flash-lite', () => {
    expect(googleCacheMinTokens('gemini-2.5-pro')).toBe(4096);
    expect(googleCacheMinTokens('gemini-2.5-flash')).toBe(2048);
    expect(googleCacheMinTokens('gemini-2.5-flash-lite')).toBe(2048);
    expect(googleCacheMinTokens(undefined)).toBe(2048);
  });
});

describe('googleModelSupportsCaching', () => {
  it('accepts 1.5 / 2.5 / 3.x, rejects unknown', () => {
    expect(googleModelSupportsCaching('gemini-2.5-flash')).toBe(true);
    expect(googleModelSupportsCaching('gemini-2.5-pro')).toBe(true);
    expect(googleModelSupportsCaching('gemini-3.5-flash')).toBe(true);
    expect(googleModelSupportsCaching('gemini-1.5-pro')).toBe(true);
    expect(googleModelSupportsCaching('text-bison')).toBe(false);
    expect(googleModelSupportsCaching(undefined)).toBe(false);
  });
});

describe('extractSystemInstructionText / modelFromGoogleUrl', () => {
  it('concatenates parts text', () => {
    expect(extractSystemInstructionText({ parts: [{ text: 'a' }, { text: 'b' }] })).toBe('ab');
    expect(extractSystemInstructionText('raw')).toBe('raw');
    expect(extractSystemInstructionText(undefined)).toBe('');
  });

  it('parses the model id from a generate URL', () => {
    expect(modelFromGoogleUrl(STREAM_URL)).toBe('gemini-2.5-flash');
    expect(modelFromGoogleUrl(`${BASE}/models/gemini-2.5-pro:generateContent`)).toBe('gemini-2.5-pro');
  });
});

describe('createGoogleCachingFetch', () => {
  beforeEach(() => __resetGoogleCacheStore());

  it('creates a cachedContents resource once and reuses it across turns', async () => {
    const calls: Array<{ url: string; body: any }> = [];

    const base = vi.fn(async (input: any, init: any) => {
      const url = typeof input === 'string' ? input : input.url;
      calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });

      if (url.endsWith('/cachedContents')) {
        return new Response(JSON.stringify({ name: 'cachedContents/abc' }), { status: 200 });
      }

      return okStream(9000);
    }) as unknown as typeof fetch;

    const wrapped = createGoogleCachingFetch(base, 'KEY', { baseURL: BASE });

    // Turn 1
    await wrapped(STREAM_URL, { method: 'POST', body: generateBody(bigSystem()) });

    // Turn 2 (same system → must NOT create again)
    await wrapped(STREAM_URL, { method: 'POST', body: generateBody(bigSystem()) });

    const creates = calls.filter((c) => c.url.endsWith('/cachedContents'));
    const generates = calls.filter((c) => c.url.includes('streamGenerateContent'));

    expect(creates).toHaveLength(1); // reused, not recreated
    expect(generates).toHaveLength(2);

    for (const g of generates) {
      expect(g.body.cachedContent).toBe('cachedContents/abc');
      expect(g.body.systemInstruction).toBeUndefined(); // stripped — cached prefix not re-sent
      expect(g.body.contents).toEqual([{ role: 'user', parts: [{ text: 'hi' }] }]); // tail untouched
    }
  });

  it('scopes the reuse map per API key (BYOK: identical system, different keys → no cross-key reuse)', async () => {
    let createCount = 0;

    const base = vi.fn(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;

      if (url.endsWith('/cachedContents')) {
        createCount += 1;
        return new Response(JSON.stringify({ name: `cachedContents/${createCount}` }), { status: 200 });
      }

      return okStream(9000);
    }) as unknown as typeof fetch;

    // Two BYOK users on the same warm pod send the byte-identical static Bolt system.
    const userA = createGoogleCachingFetch(base, 'KEY-A', { baseURL: BASE });
    const userB = createGoogleCachingFetch(base, 'KEY-B', { baseURL: BASE });

    await userA(STREAM_URL, { method: 'POST', body: generateBody(bigSystem()) });
    await userB(STREAM_URL, { method: 'POST', body: generateBody(bigSystem()) });

    // Distinct keys → distinct cache resources; B must not reuse A's key-scoped name.
    expect(createCount).toBe(2);
  });

  it('skips caching (forwards original) when the system is below the per-model minimum', async () => {
    const calls: string[] = [];

    const base = vi.fn(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      calls.push(url);

      return okStream();
    }) as unknown as typeof fetch;

    const wrapped = createGoogleCachingFetch(base, 'KEY', { baseURL: BASE });
    const small = { parts: [{ text: 'tiny' }] };

    const req = { method: 'POST', body: generateBody(small) };
    await wrapped(STREAM_URL, req);

    expect(calls.some((u) => u.endsWith('/cachedContents'))).toBe(false); // no create attempted

    // original body forwarded verbatim (systemInstruction still inline)
    const forwarded = (base as any).mock.calls[0][1];
    expect(JSON.parse(forwarded.body).systemInstruction).toEqual(small);
  });

  it('forwards the original request when the create fails', async () => {
    const base = vi.fn(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;

      if (url.endsWith('/cachedContents')) {
        return new Response('nope', { status: 400 });
      }

      return okStream();
    }) as unknown as typeof fetch;

    const wrapped = createGoogleCachingFetch(base, 'KEY', { baseURL: BASE });
    const res = await wrapped(STREAM_URL, { method: 'POST', body: generateBody(bigSystem()) });

    expect(res.status).toBe(200);

    const generate = (base as any).mock.calls.find((c: any[]) => String(c[0]).includes('streamGenerateContent'));
    expect(JSON.parse(generate[1].body).cachedContent).toBeUndefined(); // no cache name → inline system kept
    expect(JSON.parse(generate[1].body).systemInstruction).toBeDefined();
  });

  it('invalidates and retries the original body when the rewritten request 4xxs (stale name)', async () => {
    let generateCall = 0;

    const base = vi.fn(async (input: any, init: any) => {
      const url = typeof input === 'string' ? input : input.url;

      if (url.endsWith('/cachedContents')) {
        return new Response(JSON.stringify({ name: 'cachedContents/stale' }), { status: 200 });
      }

      generateCall += 1;

      // First generate (with cachedContent) fails; retry (original) succeeds.
      const body = JSON.parse(init.body);

      if (body.cachedContent) {
        return new Response('expired cache', { status: 403 });
      }

      return okStream();
    }) as unknown as typeof fetch;

    const wrapped = createGoogleCachingFetch(base, 'KEY', { baseURL: BASE });
    const res = await wrapped(STREAM_URL, { method: 'POST', body: generateBody(bigSystem()) });

    expect(res.status).toBe(200); // retry with original succeeded
    expect(generateCall).toBe(2); // failed rewrite + successful original retry
  });

  it('leaves non-generate requests untouched', async () => {
    const base = vi.fn(async () => new Response('[]', { status: 200 })) as unknown as typeof fetch;
    const wrapped = createGoogleCachingFetch(base, 'KEY', { baseURL: BASE });

    await wrapped(`${BASE}/models?key=x`, { method: 'GET' });

    expect((base as any).mock.calls).toHaveLength(1);
    expect((base as any).mock.calls[0][1]).toEqual({ method: 'GET' });
  });
});
