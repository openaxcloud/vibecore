/**
 * Gemini EXPLICIT context caching (`cachedContents`) — the mirror of the proven
 * Anthropic `cache_control` path for Google.
 *
 * WHY explicit and not implicit. Gemini 2.5+ has *implicit* server-side caching,
 * but it did not measurably hit on our short, independent turns (0 cached tokens
 * observed live 2026-07-12). Explicit caching lets us pin the large, turn-stable
 * prefix (the Bolt SYSTEM instruction, ~5k tokens) as a `cachedContents` resource
 * and reference it by name on every subsequent turn, so Google serves it from
 * cache at ~25% of the input price instead of re-billing it in full each turn.
 *
 * HOW. `@ai-sdk/google@0.0.52` sends `POST …/models/<id>:streamGenerateContent`
 * with a body of `{ contents, systemInstruction, generationConfig, … }` and
 * natively understands a top-level `cachedContent: "cachedContents/<id>"`. We wrap
 * `fetch` (exactly like `createAnthropicCachingFetch`) and, on the outgoing
 * generate call:
 *   1. read the `systemInstruction` (the stable prefix),
 *   2. if it clears the per-model minimum, get-or-create a `cachedContents`
 *      resource for it (one create per stable prefix, reused across turns via an
 *      in-memory TTL map),
 *   3. REMOVE `systemInstruction` from the body and add `cachedContent: <name>`
 *      (the cached prefix is prepended server-side — it must NOT be re-sent), then
 *   4. forward the rewritten request.
 *
 * FAIL-SAFE — this is the key difference from Anthropic. A bad Anthropic
 * breakpoint just fails to cache; a bad/stale Gemini `cachedContent` name makes
 * the whole generate call 4xx. So we:
 *   - never touch the body unless we hold a freshly-validated cache name,
 *   - swallow every error in create/rewrite and forward the ORIGINAL request, and
 *   - if the rewritten request comes back non-OK, invalidate the entry and RETRY
 *     once with the original (systemInstruction-inline) body.
 * Net effect: worst case is one wasted round-trip; the generation always runs.
 *
 * TELEMETRY. Like Anthropic, the SDK's usage mapping reads only
 * `promptTokenCount`/`candidatesTokenCount` and DISCARDS `cachedContentTokenCount`,
 * so we tee the SSE stream, read the cached-token count off the wire, and report it
 * into the per-request cache tally (the same store the Anthropic wire reader uses —
 * it is per-request and only one provider runs per request). `api.chat.ts` folds it
 * into `cachedPromptTokens` when the SDK surfaced no cache metadata.
 */
import { reportWireCacheUsage } from '~/lib/modules/llm/anthropic-cache-report';
import { createScopedLogger } from '~/utils/logger';

const googleCacheLogger = createScopedLogger('google-cache');

const GOOGLE_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Server-side lifetime of a created `cachedContents` resource. We ask Google to
 * keep it 1h and locally treat it as usable for a shorter window so we always
 * recreate BEFORE Google would expire it (a request that references an
 * already-expired name would 4xx — the retry path covers that too, but avoiding
 * it is cheaper).
 */
const CACHE_TTL_SECONDS = 3600;
const LOCAL_REUSE_MS = 45 * 60 * 1000; // 45 min < 1h server TTL

/**
 * Minimum cacheable prefix length (tokens) for EXPLICIT `cachedContents`, per
 * model (Rév.3 / Google context-caching docs): Pro = 4096, Flash / Flash-Lite =
 * 2048. Below this Google rejects the create, so we skip it (no wasted round-trip).
 * The Bolt SYSTEM prompt (~5k tokens) clears both.
 */
export function googleCacheMinTokens(model: string | undefined): number {
  if (typeof model === 'string' && /pro/i.test(model)) {
    return 4096;
  }

  return 2048;
}

/**
 * Which Gemini models support context caching. Explicit `cachedContents` is a
 * 1.5 / 2.5 / 3.x feature; anything else (or an unknown id) is left untouched so we
 * never pay a failing create round-trip on a model that can't cache.
 */
export function googleModelSupportsCaching(model: string | undefined): boolean {
  return typeof model === 'string' && /gemini-(1\.5|2\.5|3(?:\.\d+)?)/i.test(model);
}

/** Cheap deterministic hash (djb2) — keys the reuse map by prefix bytes. Never for billing. */
function hashText(text: string): string {
  let h = 5381;

  for (let i = 0; i < text.length; i++) {
    h = (h * 33) ^ text.charCodeAt(i);
  }

  // >>> 0 → unsigned; base36 keeps the key short.
  return (h >>> 0).toString(36);
}

/** chars≈tokens/4 estimate (never for billing) — gates the create against the per-model minimum. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Concatenate the text of a Gemini `systemInstruction` ({ parts:[{text}] } or a bare string). */
export function extractSystemInstructionText(systemInstruction: unknown): string {
  if (typeof systemInstruction === 'string') {
    return systemInstruction;
  }

  if (systemInstruction && typeof systemInstruction === 'object') {
    const parts = (systemInstruction as { parts?: unknown }).parts;

    if (Array.isArray(parts)) {
      return parts
        .map((p) =>
          p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string'
            ? (p as { text: string }).text
            : '',
        )
        .join('');
    }
  }

  return '';
}

/** Parse `models/<id>` (or `<id>`) out of a generate URL. */
export function modelFromGoogleUrl(url: string): string | undefined {
  const m = url.match(/models\/([^:?/]+)/);

  return m ? m[1] : undefined;
}

function isGenerateUrl(url: string): boolean {
  return /:(streamGenerateContent|generateContent)/.test(url);
}

function isStreamUrl(url: string): boolean {
  return url.includes(':streamGenerateContent');
}

interface CacheEntry {
  name: string;
  expiresAt: number;
}

/**
 * The reuse map + in-flight dedupe are module-level so they persist across turns
 * within one server process (a warm web pod). Keyed by `<model>::<hash(system)>`
 * so a byte-stable system prompt reuses turn-1's cachedContents on every later turn.
 */
const cacheStore = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string | null>>();

function cacheKeyFor(model: string, systemText: string): string {
  return `${model}::${hashText(systemText)}`;
}

/** Test seam — drop all reuse state so specs start clean. */
export function __resetGoogleCacheStore(): void {
  cacheStore.clear();
  inFlight.clear();
}

/**
 * Return a live `cachedContents/<id>` name for this (model, systemInstruction),
 * creating it if we don't hold a fresh one. Never throws — on any failure returns
 * null and the caller sends the original (uncached but working) request.
 */
async function getOrCreateCachedContent(
  baseFetch: typeof fetch,
  baseURL: string,
  apiKey: string,
  model: string,
  systemInstruction: unknown,
  systemText: string,
  now: number,
): Promise<string | null> {
  const key = cacheKeyFor(model, systemText);

  const existing = cacheStore.get(key);

  if (existing && now < existing.expiresAt) {
    return existing.name;
  }

  const pending = inFlight.get(key);

  if (pending) {
    return pending;
  }

  const create = (async (): Promise<string | null> => {
    try {
      const res = await baseFetch(`${baseURL}/cachedContents`, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: `models/${model}`,
          systemInstruction,
          ttl: `${CACHE_TTL_SECONDS}s`,
        }),
      });

      if (!res.ok) {
        // Model doesn't support caching, prefix below the real minimum, quota, etc.
        googleCacheLogger.info(JSON.stringify({ event: 'google.cache.create.skip', model, status: res.status }));
        return null;
      }

      const body = (await res.json()) as { name?: unknown };

      if (typeof body?.name !== 'string' || !body.name) {
        return null;
      }

      cacheStore.set(key, { name: body.name, expiresAt: now + LOCAL_REUSE_MS });
      googleCacheLogger.info(JSON.stringify({ event: 'google.cache.create.ok', model, name: body.name }));

      return body.name;
    } catch {
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, create);

  return create;
}

/**
 * Tee the SSE response and report Gemini's `cachedContentTokenCount` (which the
 * SDK drops) into the per-request cache tally. Read-only, best-effort, memory-capped
 * — never delays or breaks the stream the SDK consumes.
 */
function teeAndReportGoogleWireUsage(response: Response): Response {
  try {
    if (!response.ok || !response.body) {
      return response;
    }

    const [forward, inspect] = response.body.tee();

    void (async () => {
      try {
        const reader = inspect.getReader();
        const decoder = new TextDecoder();

        let buf = '';
        let reported = false;

        for (;;) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buf += decoder.decode(value, { stream: true });

          if (!reported) {
            const m = buf.match(/"cachedContentTokenCount"\s*:\s*(\d+)/);

            if (m) {
              const cached = Number(m[1]);

              if (cached > 0) {
                // Explicit cache has read tokens only (no separate write count on the stream).
                reportWireCacheUsage(cached, 0);
                reported = true;
              }
            }
          }

          if (buf.length > 200_000) {
            buf = buf.slice(-50_000);
          }
        }

        googleCacheLogger.info(JSON.stringify({ event: 'google.wire.usage', reported }));
      } catch {
        // diagnostics only — swallow
      }
    })();

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');

    return new Response(forward, { status: response.status, statusText: response.statusText, headers });
  } catch {
    return response;
  }
}

/**
 * Wrap `fetch` so every Gemini generate call references a `cachedContents` resource
 * for its stable `systemInstruction`. See the module header for the fail-safe
 * contract. `apiKey` is needed for the out-of-band create call (same key/header the
 * SDK uses). `now`/`baseFetch` are injectable for tests.
 */
export function createGoogleCachingFetch(
  baseFetch: typeof fetch,
  apiKey: string,
  options: { baseURL?: string; now?: () => number } = {},
): typeof fetch {
  const baseURL = options.baseURL ?? GOOGLE_DEFAULT_BASE_URL;
  const nowFn = options.now ?? (() => Date.now());

  return async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : ((input as Request)?.url ?? String(input));

    let rewritten = init;
    let didRewrite = false;

    try {
      if (isGenerateUrl(url) && init && typeof init.body === 'string' && init.body.includes('"systemInstruction"')) {
        const parsed = JSON.parse(init.body);
        const model = modelFromGoogleUrl(url);

        if (
          model &&
          googleModelSupportsCaching(model) &&
          parsed &&
          typeof parsed === 'object' &&
          parsed.systemInstruction &&
          !parsed.cachedContent
        ) {
          const systemText = extractSystemInstructionText(parsed.systemInstruction);

          if (systemText && estimateTokens(systemText) >= googleCacheMinTokens(model)) {
            const name = await getOrCreateCachedContent(
              baseFetch,
              baseURL,
              apiKey,
              model,
              parsed.systemInstruction,
              systemText,
              nowFn(),
            );

            if (name) {
              delete parsed.systemInstruction;
              parsed.cachedContent = name;
              rewritten = { ...init, body: JSON.stringify(parsed) };
              didRewrite = true;
            }
          }
        }
      }
    } catch {
      // Never let the rewrite break the generation — send exactly what the SDK built.
      rewritten = init;
      didRewrite = false;
    }

    const response = await baseFetch(input as any, rewritten);

    // Stale/invalid cachedContent name → 4xx. Invalidate and retry the ORIGINAL body once.
    if (didRewrite && !response.ok) {
      try {
        const model = modelFromGoogleUrl(url);
        const parsed = init && typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
        const systemText = parsed ? extractSystemInstructionText(parsed.systemInstruction) : '';

        if (model && systemText) {
          cacheStore.delete(cacheKeyFor(model, systemText));
        }
      } catch {
        // ignore — the retry below is the real safety net
      }

      try {
        await response.body?.cancel();
      } catch {
        // ignore
      }

      googleCacheLogger.info(JSON.stringify({ event: 'google.cache.retry', status: response.status }));

      const retry = await baseFetch(input as any, init);

      return isStreamUrl(url) ? teeAndReportGoogleWireUsage(retry) : retry;
    }

    return isStreamUrl(url) ? teeAndReportGoogleWireUsage(response) : response;
  };
}
