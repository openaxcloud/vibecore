/**
 * Prompt-cache support registry — the single source of truth for HOW each provider
 * in our catalog caches, so the CACHE_MATRIX and any runtime decision read the same
 * facts. Every provider in `KNOWN_LLM_PROVIDERS` MUST have an entry (enforced by the
 * spec) so nothing is silently "supposed OK". Per Avi's Rév.3 guide + the provider
 * docs; providers with no public cache contract are marked `support-only`
 * explicitly (budget = NOT cached), never guessed.
 */

export type CacheMechanism =
  | 'impl-explicit' // OUR code drives the cache (breakpoints / conv-id / cache key)
  | 'provider-auto' // provider caches server-side with no per-request opt-in from us
  | 'support-only'; // no public prompt-cache contract → treated as uncached

export interface ProviderCacheSupport {
  /** Provider name as in KNOWN_LLM_PROVIDERS. */
  provider: string;
  mechanism: CacheMechanism;

  /** Where OUR code implements it (impl-explicit) or why not (support-only). */
  ref: string;

  /**
   * Minimum cacheable prompt length (tokens) per model. Function of the model id
   * because thresholds differ within a provider (e.g. Anthropic Haiku 2048 vs
   * Sonnet/Opus 1024). Returns null when there is no threshold concept.
   */
  minCacheTokens: (model: string | undefined) => number | null;

  /** Native usage field(s) → normalized cachedPromptTokens (mapped in cache-usage.ts). */
  telemetryField: string | null;
}

const NO_THRESHOLD = () => null;

export const PROVIDER_CACHE_SUPPORT: Record<string, ProviderCacheSupport> = {
  OpenAI: {
    provider: 'OpenAI',
    mechanism: 'impl-explicit',
    ref: 'providers/openai.ts createOpenAiCacheFetch (prompt_cache_key) + wire-diagnostics.ts',
    minCacheTokens: () => 1024, // OpenAI auto-cache minimum, 128-token blocks
    telemetryField: 'cachedPromptTokens',
  },
  Anthropic: {
    provider: 'Anthropic',
    mechanism: 'impl-explicit',
    ref: 'providers/anthropic.ts createAnthropicCachingFetch (system head 1h + tail 5m + message-history breakpoint)',
    minCacheTokens: (model) => (model && /haiku/i.test(model) ? 2048 : 1024),
    telemetryField: 'cacheReadInputTokens/cacheCreationInputTokens',
  },
  xAI: {
    provider: 'xAI',
    mechanism: 'impl-explicit',
    ref: "providers/xai.ts getModelInstance headers { 'x-grok-conv-id': cacheAffinityKey }",
    minCacheTokens: NO_THRESHOLD,
    telemetryField: 'cached_tokens',
  },
  OpenRouter: {
    provider: 'OpenRouter',
    mechanism: 'provider-auto', // passthrough to the underlying model's cache
    ref: 'providers/open-router.ts (Anthropic-backed models also get the breakpoint via shouldInsertCacheBreakpoint)',
    minCacheTokens: NO_THRESHOLD,
    telemetryField: 'cached_tokens',
  },
  Google: {
    provider: 'Google',
    mechanism: 'provider-auto', // Gemini 2.5+ IMPLICIT caching (server-side). Explicit cachedContents = tracked enhancement.
    ref: 'implicit (Gemini 2.5+) — benefits from the transverse levers; explicit cachedContents NOT yet wired',
    minCacheTokens: (model) => (model && /2\.5-pro|3\./i.test(model) ? 4096 : 2048),
    telemetryField: 'cachedContentTokenCount',
  },
  Deepseek: {
    provider: 'Deepseek',
    mechanism: 'provider-auto', // disk cache, automatic, exact prefix from token 0, 64-token units — nothing to wire
    ref: 'provider-automatic disk cache (benefits from the transverse levers)',
    minCacheTokens: NO_THRESHOLD,
    telemetryField: 'prompt_cache_hit_tokens',
  },
  Github: {
    provider: 'Github',
    mechanism: 'provider-auto', // GitHub Models proxies OpenAI-compat (gpt-4o etc.)
    ref: 'OpenAI-compatible proxy — cached_tokens if the upstream returns it',
    minCacheTokens: () => 1024,
    telemetryField: 'cached_tokens',
  },

  // --- SUPPORT-ONLY: no public prompt-cache contract → budget NOT cached ---
  AmazonBedrock: sup('AmazonBedrock', 'Bedrock prompt caching not wired'),
  Cerebras: sup('Cerebras'),
  Cohere: sup('Cohere'),
  Fireworks: sup('Fireworks'),
  Groq: sup('Groq', 'OpenAI-compat; cached_tokens mapped if returned', 'cached_tokens'),
  HuggingFace: sup('HuggingFace'),
  Hyperbolic: sup('Hyperbolic'),
  LMStudio: sup('LMStudio', 'local / self-hosted'),
  Mistral: sup('Mistral'),
  Moonshot: sup('Moonshot'),
  Ollama: sup('Ollama', 'local / self-hosted'),
  OpenAILike: sup('OpenAILike', 'generic OpenAI-compat; cached_tokens mapped if returned', 'cached_tokens'),
  Perplexity: sup('Perplexity'),
  Together: sup('Together', 'OpenAI-compat; cached_tokens mapped if returned', 'cached_tokens'),
  'Z.ai': sup('Z.ai'),
};

function sup(
  provider: string,
  reason = 'no public prompt-cache contract',
  telemetryField: string | null = null,
): ProviderCacheSupport {
  return {
    provider,
    mechanism: 'support-only',
    ref: `SUPPORT-ONLY — ${reason}`,
    minCacheTokens: NO_THRESHOLD,
    telemetryField,
  };
}

/** Lookup with a safe default (unknown provider → support-only, uncached). */
export function providerCacheSupport(provider: string | undefined): ProviderCacheSupport {
  if (provider && PROVIDER_CACHE_SUPPORT[provider]) {
    return PROVIDER_CACHE_SUPPORT[provider];
  }

  return sup(provider ?? 'unknown', 'not in the cache-support registry');
}
