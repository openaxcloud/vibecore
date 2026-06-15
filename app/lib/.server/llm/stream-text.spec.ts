import { describe, expect, it } from 'vitest';
import {
  applyContextOptimizedHistoryWindow,
  DEFAULT_STREAM_MAX_RETRIES,
  getCompletionTokenLimit,
  resolveStreamMaxRetries,
} from './stream-text';

describe('resolveStreamMaxRetries', () => {
  it('auto-retries transient provider failures by default (more than the SDK default of 2)', () => {
    expect(resolveStreamMaxRetries(undefined)).toBe(DEFAULT_STREAM_MAX_RETRIES);
    expect(DEFAULT_STREAM_MAX_RETRIES).toBeGreaterThan(2);
  });

  it('honors a valid STREAM_MAX_RETRIES override and clamps it to a sane bound', () => {
    expect(resolveStreamMaxRetries({ STREAM_MAX_RETRIES: '6' })).toBe(6);
    expect(resolveStreamMaxRetries({ STREAM_MAX_RETRIES: '0' })).toBe(0);
    expect(resolveStreamMaxRetries({ STREAM_MAX_RETRIES: '99' })).toBe(8);
  });

  it('falls back to the default for missing or invalid values', () => {
    expect(resolveStreamMaxRetries({ STREAM_MAX_RETRIES: 'abc' })).toBe(DEFAULT_STREAM_MAX_RETRIES);
    expect(resolveStreamMaxRetries({ STREAM_MAX_RETRIES: '-3' })).toBe(DEFAULT_STREAM_MAX_RETRIES);
    expect(resolveStreamMaxRetries({})).toBe(DEFAULT_STREAM_MAX_RETRIES);
  });
});

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
