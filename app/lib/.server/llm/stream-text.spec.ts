import { describe, expect, it } from 'vitest';
import { applyContextOptimizedHistoryWindow, getCompletionTokenLimit } from './stream-text';

describe('applyContextOptimizedHistoryWindow', () => {
  it('keeps the full recent conversation when no slice is needed', () => {
    const messages = ['first user request', 'assistant response', 'follow-up request'];

    expect(applyContextOptimizedHistoryWindow(messages, 0)).toEqual(messages);
    expect(applyContextOptimizedHistoryWindow(messages)).toEqual(messages);
  });

  it('keeps the requested recent history window when the conversation is long', () => {
    const messages = ['m1', 'm2', 'm3', 'm4', 'm5'];

    expect(applyContextOptimizedHistoryWindow(messages, 2)).toEqual(['m4', 'm5']);
  });
});

describe('getCompletionTokenLimit', () => {
  it('uses model-specific completion limits instead of the context window', () => {
    expect(
      getCompletionTokenLimit({
        provider: 'Anthropic',
        maxTokenAllowed: 200_000,
        maxCompletionTokens: 64_000,
      }),
    ).toBe(64_000);
  });
});
