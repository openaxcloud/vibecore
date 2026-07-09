/**
 * Prompt-cache token accounting shared by the chat route.
 *
 * Providers report cache usage under different keys and only when they support
 * it: Anthropic exposes `cacheReadInputTokens` / `cacheCreationInputTokens` in
 * its provider metadata; OpenAI exposes `cachedPromptTokens`. This helper folds
 * whatever is present onto a running tally so the completion log can prove the
 * cache hit-rate. Anything missing or malformed leaves the counters untouched —
 * it must never throw out of the stream's onFinish.
 */
export interface CacheUsageTally {
  cachedPromptTokens: number;
  cacheWriteTokens: number;
}

export function accumulateCacheUsage(target: CacheUsageTally, providerMetadata: unknown): void {
  if (!providerMetadata || typeof providerMetadata !== 'object') {
    return;
  }

  const toInt = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

  const anthropic = (providerMetadata as Record<string, any>).anthropic;

  if (anthropic && typeof anthropic === 'object') {
    target.cachedPromptTokens += toInt(anthropic.cacheReadInputTokens);
    target.cacheWriteTokens += toInt(anthropic.cacheCreationInputTokens);
  }

  const openai = (providerMetadata as Record<string, any>).openai;

  if (openai && typeof openai === 'object') {
    target.cachedPromptTokens += toInt(openai.cachedPromptTokens);
  }
}
