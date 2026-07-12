import { describe, expect, it } from 'vitest';
import { accumulateCacheUsage, type CacheUsageTally } from './cache-usage';

const fresh = (): CacheUsageTally => ({ cachedPromptTokens: 0, cacheWriteTokens: 0 });

describe('accumulateCacheUsage', () => {
  it('reads Anthropic cache read + creation tokens', () => {
    const tally = fresh();
    accumulateCacheUsage(tally, { anthropic: { cacheReadInputTokens: 1200, cacheCreationInputTokens: 300 } });
    expect(tally).toEqual({ cachedPromptTokens: 1200, cacheWriteTokens: 300 });
  });

  it('reads OpenAI cached prompt tokens', () => {
    const tally = fresh();
    accumulateCacheUsage(tally, { openai: { cachedPromptTokens: 800 } });
    expect(tally).toEqual({ cachedPromptTokens: 800, cacheWriteTokens: 0 });
  });

  it('accumulates across multiple calls (continuation segments)', () => {
    const tally = fresh();
    accumulateCacheUsage(tally, { anthropic: { cacheReadInputTokens: 100, cacheCreationInputTokens: 50 } });
    accumulateCacheUsage(tally, { anthropic: { cacheReadInputTokens: 400 } });
    expect(tally).toEqual({ cachedPromptTokens: 500, cacheWriteTokens: 50 });
  });

  it('is a no-op for missing / malformed metadata', () => {
    const tally = fresh();
    accumulateCacheUsage(tally, undefined);
    accumulateCacheUsage(tally, null);
    accumulateCacheUsage(tally, 'nope');
    accumulateCacheUsage(tally, { anthropic: { cacheReadInputTokens: 'x' } });
    expect(tally).toEqual({ cachedPromptTokens: 0, cacheWriteTokens: 0 });
  });

  // Priority-1 telemetry normalization — every provider's native field → cachedPromptTokens.
  it('reads Google/Gemini cachedContentTokenCount', () => {
    const tally = fresh();
    accumulateCacheUsage(tally, { google: { cachedContentTokenCount: 2048 } });
    expect(tally).toEqual({ cachedPromptTokens: 2048, cacheWriteTokens: 0 });
  });

  it('reads xAI / OpenAI-compatible cached_tokens', () => {
    const tally = fresh();
    accumulateCacheUsage(tally, { xai: { cached_tokens: 640 } });
    expect(tally.cachedPromptTokens).toBe(640);
  });

  it('reads DeepSeek prompt_cache_hit_tokens', () => {
    const tally = fresh();
    accumulateCacheUsage(tally, { deepseek: { prompt_cache_hit_tokens: 512 } });
    expect(tally.cachedPromptTokens).toBe(512);
  });

  it('does NOT double-count when one provider entry exposes two read aliases', () => {
    const tally = fresh();

    // Same count under two aliases → counted ONCE (first alias wins per entry).
    accumulateCacheUsage(tally, { openai: { cachedPromptTokens: 300, cached_tokens: 300 } });
    expect(tally.cachedPromptTokens).toBe(300);
  });

  it('normalizes an unknown OpenAI-compatible provider key by field name', () => {
    const tally = fresh();
    accumulateCacheUsage(tally, { groq: { cached_tokens: 128 }, together: { cachedTokens: 64 } });
    expect(tally.cachedPromptTokens).toBe(192);
  });
});
