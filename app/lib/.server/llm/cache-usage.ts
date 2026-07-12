/**
 * Prompt-cache token accounting shared by the chat route.
 *
 * Providers report cache usage under DIFFERENT native keys (Rév.3 provider guide):
 *   - Anthropic  → cacheReadInputTokens / cacheCreationInputTokens
 *   - OpenAI     → cachedPromptTokens
 *   - Google     → cachedContentTokenCount (implicit + explicit cachedContents)
 *   - xAI        → cached_tokens (OpenAI-compatible usage.prompt_tokens_details)
 *   - DeepSeek   → prompt_cache_hit_tokens / cached_tokens (disk cache)
 *   - OpenAI-compatible (Groq, Together, Perplexity, Mistral, OpenRouter, …) →
 *                  cached_tokens under their own provider-metadata key
 *
 * This helper NORMALIZES all of them onto a single running tally so the one
 * `chat.completion.usage` log reports `cachedPromptTokens` / `cacheWriteTokens`
 * uniformly for every provider (Priority-1 telemetry normalization). It scans every
 * provider-metadata entry and, per entry, takes the FIRST matching alias (so a
 * provider that happens to expose two aliases for the same count is not
 * double-counted). Read-only + total: anything missing/malformed leaves the counters
 * untouched — it must never throw out of the stream's onFinish.
 */
export interface CacheUsageTally {
  cachedPromptTokens: number;
  cacheWriteTokens: number;
}

/**
 * Cache-READ token field aliases across providers, most-specific first. The first
 * present-and-non-zero alias on a provider's metadata entry is taken (no summing of
 * aliases within one entry).
 */
const CACHE_READ_ALIASES = [
  'cacheReadInputTokens', // Anthropic
  'cachedPromptTokens', // OpenAI (+ our openai wire mapping)
  'cachedContentTokenCount', // Google / Gemini
  'promptCacheHitTokens', // DeepSeek (camel)
  'prompt_cache_hit_tokens', // DeepSeek (snake, raw)
  'cachedTokens', // generic camel
  'cached_tokens', // xAI / OpenAI-compatible (raw usage.prompt_tokens_details)
] as const;

/** Cache-WRITE (creation) token field aliases across providers. */
const CACHE_WRITE_ALIASES = [
  'cacheCreationInputTokens', // Anthropic
  'cacheWriteTokens', // generic
  'cacheCreationTokens', // generic camel
  'cache_creation_input_tokens', // Anthropic (snake, raw)
] as const;

function firstAlias(record: Record<string, unknown>, aliases: readonly string[]): number {
  for (const key of aliases) {
    const value = record[key];

    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return 0;
}

export function accumulateCacheUsage(target: CacheUsageTally, providerMetadata: unknown): void {
  if (!providerMetadata || typeof providerMetadata !== 'object') {
    return;
  }

  for (const entry of Object.values(providerMetadata as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const record = entry as Record<string, unknown>;
    target.cachedPromptTokens += firstAlias(record, CACHE_READ_ALIASES);
    target.cacheWriteTokens += firstAlias(record, CACHE_WRITE_ALIASES);
  }
}
