/**
 * Gemini EXPLICIT context caching (`cachedContents`) for the AI GATEWAY.
 *
 * The gateway serves the heaviest token consumer in the platform: multi-agent
 * runs fan a byte-identical shared context (SHARED_AGENT_SYSTEM_PREAMBLE + the
 * caller's system/spec messages) across N specialist lanes. On Anthropic that
 * shared prefix is already cached (anthropicPayload sets `cache_control`); on
 * Gemini it was re-billed in full on every lane. This module closes that gap the
 * same way the web app's `google-cache.ts` does — it just talks plain `fetch`
 * (the gateway has no `@ai-sdk/google`).
 *
 * Flow: pin the stable `systemInstruction` as a `cachedContents` resource
 * (`POST …/v1beta/cachedContents`, ttl 1h), reference it by name via
 * `cachedContent` on each lane's generate call, and STRIP the inline
 * systemInstruction (the cached prefix is prepended server-side — it must not be
 * re-sent). Google then serves it at ~25% input price.
 *
 * FAIL-SAFE (a stale/invalid `cachedContent` name 4xxs the whole generate call):
 *   - only rewrite when we hold a freshly-created cache name,
 *   - swallow every create/parse error and use the ORIGINAL body, and
 *   - the caller retries the original body once if the rewritten request 4xxs.
 * Worst case = one wasted round-trip; the generation always runs.
 */

const GEMINI_CACHE_TTL_SECONDS = 3600;
const LOCAL_REUSE_MS = 45 * 60 * 1000; // 45 min < 1h server TTL

/**
 * Minimum cacheable prefix length (tokens) for explicit `cachedContents`, per
 * model: Pro = 4096, Flash / Flash-Lite = 2048. Below this Google rejects the
 * create, so we skip it. Mirrors the web app's thresholds.
 */
export function geminiCacheMinTokens(model: string | undefined): number {
  if (typeof model === 'string' && /pro/i.test(model)) {
    return 4096;
  }

  return 2048;
}

/** Explicit caching is a Gemini 1.5 / 2.5 / 3.x feature; leave anything else untouched. */
export function geminiModelSupportsCaching(model: string | undefined): boolean {
  return typeof model === 'string' && /gemini-(1\.5|2\.5|3(?:\.\d+)?)/i.test(model);
}

/** chars≈tokens/4 estimate (never for billing) — gates the create against the per-model minimum. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** djb2 — keys the reuse map by prefix bytes. */
function hashText(text: string): string {
  let h = 5381;

  for (let i = 0; i < text.length; i++) {
    h = (h * 33) ^ text.charCodeAt(i);
  }

  return (h >>> 0).toString(36);
}

function systemInstructionText(systemInstruction: unknown): string {
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

interface CacheEntry {
  name: string;
  expiresAt: number;
}

/**
 * Reuse map + in-flight dedupe. Keyed by `<key-fingerprint>::<model>::<hash(system)>`
 * so a byte-stable shared prefix reuses the first lane's cachedContents across every
 * later lane. The key fingerprint scopes entries per API key (a cachedContents name
 * is owned by the key/project that created it, so a different key must not reuse it).
 */
const cacheStore = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string | null>>();

function cacheKeyFor(apiKey: string, model: string, systemText: string): string {
  return `${hashText(apiKey)}::${model}::${hashText(systemText)}`;
}

/** Test seam — drop all reuse state so specs start clean. */
export function __resetGeminiCacheStore(): void {
  cacheStore.clear();
  inFlight.clear();
}

/** Invalidate a specific (apiKey, model, system) entry — called after a 4xx on a rewritten request. */
export function invalidateGeminiCache(apiKey: string, model: string, systemText: string): void {
  cacheStore.delete(cacheKeyFor(apiKey, model, systemText));
}

/**
 * Return a live `cachedContents/<id>` name for this (apiKey, model,
 * systemInstruction), creating it if we don't hold a fresh one. Never throws — on
 * any failure returns null and the caller sends the original (uncached) request.
 */
export async function getOrCreateGeminiCachedContent(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemInstruction: unknown,
  now: number = Date.now(),
): Promise<string | null> {
  const systemText = systemInstructionText(systemInstruction);

  if (!systemText || !geminiModelSupportsCaching(model) || estimateTokens(systemText) < geminiCacheMinTokens(model)) {
    return null;
  }

  const key = cacheKeyFor(apiKey, model, systemText);
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
      const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/cachedContents?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: `models/${model}`,
          systemInstruction,
          ttl: `${GEMINI_CACHE_TTL_SECONDS}s`,
        }),
      });

      if (!res.ok) {
        return null;
      }

      const body = (await res.json()) as { name?: unknown };

      if (typeof body?.name !== 'string' || !body.name) {
        return null;
      }

      cacheStore.set(key, { name: body.name, expiresAt: now + LOCAL_REUSE_MS });

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
 * Given a built gemini generate payload, return a possibly-rewritten payload that
 * references a cachedContents resource for its systemInstruction (systemInstruction
 * stripped, `cachedContent` added). Returns the original payload unchanged when
 * caching doesn't apply or the create failed. `usedCache` lets the caller run the
 * 4xx-retry-with-original fallback.
 */
export async function applyGeminiCache(
  baseUrl: string,
  apiKey: string,
  model: string,
  payload: Record<string, unknown>,
  now: number = Date.now(),
): Promise<{ payload: Record<string, unknown>; usedCache: boolean; systemText: string }> {
  const systemInstruction = payload.systemInstruction;
  const systemText = systemInstructionText(systemInstruction);

  if (!systemInstruction || payload.cachedContent) {
    return { payload, usedCache: false, systemText };
  }

  const name = await getOrCreateGeminiCachedContent(baseUrl, apiKey, model, systemInstruction, now);

  if (!name) {
    return { payload, usedCache: false, systemText };
  }

  const { systemInstruction: _stripped, ...rest } = payload;

  return { payload: { ...rest, cachedContent: name }, usedCache: true, systemText };
}

/**
 * Log Gemini's real cache accounting from a `:generateContent` response so the
 * hit-rate is observable (mirrors logAnthropicCacheUsage). Best-effort.
 */
export function logGeminiCacheUsage(json: unknown): void {
  try {
    const usage = (json as { usageMetadata?: Record<string, unknown> } | null)?.usageMetadata;

    if (!usage || typeof usage !== 'object') {
      return;
    }

    const cached = typeof usage.cachedContentTokenCount === 'number' ? usage.cachedContentTokenCount : 0;

    if (cached > 0) {
      console.info(JSON.stringify({ event: 'ai-gateway.gemini.cache', cachedContentTokenCount: cached }));
    }
  } catch {
    // Never let cache logging affect the completion path.
  }
}
