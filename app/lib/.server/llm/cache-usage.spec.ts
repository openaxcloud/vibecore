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
});
