import { describe, expect, it } from 'vitest';
import {
  applyContextOptimizedHistoryWindow,
  DEFAULT_STREAM_MAX_RETRIES,
  fingerprintPrompt,
  getCompletionTokenLimit,
  resolveStreamMaxRetries,
} from './stream-text';

describe('fingerprintPrompt', () => {
  it('is deterministic for identical strings (byte-stable head → same fingerprint)', () => {
    const head = 'You are E-Code, a senior engineer. '.repeat(50);
    expect(fingerprintPrompt(head)).toBe(fingerprintPrompt(head));
  });

  it('changes when a single byte of the head changes', () => {
    const head = 'You are E-Code, a senior engineer. '.repeat(50);
    expect(fingerprintPrompt(head)).not.toBe(fingerprintPrompt(head + 'x'));
  });
});

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

  it('falls back to the provider default when the model omits a completion limit', () => {
    /*
     * Regression: the OpenAI/Github default was 4096, which truncated multi-file
     * generations mid-file. It must now be a modern, non-truncating floor.
     */
    expect(getCompletionTokenLimit({ provider: 'OpenAI', maxTokenAllowed: 128_000 })).toBe(16384);
    expect(getCompletionTokenLimit({ provider: 'Github', maxTokenAllowed: 128_000 })).toBe(16384);
  });

  it('never falls back below a generation-safe floor for known providers', () => {
    for (const provider of ['OpenAI', 'Github', 'Anthropic', 'Google', 'Mistral', 'xAI']) {
      expect(getCompletionTokenLimit({ provider, maxTokenAllowed: 128_000 })).toBeGreaterThanOrEqual(8192);
    }
  });

  it('honours a low model ceiling so a 4096-cap model never asks for more (gpt-4-turbo bug)', () => {
    /*
     * gpt-4-turbo really supports only 4096 completion tokens. Its model entry
     * now carries maxCompletionTokens: 4096, and the sent max_tokens must equal
     * that ceiling — not the old inferred 8192, which the OpenAI API rejects.
     */
    expect(
      getCompletionTokenLimit({
        provider: 'OpenAI',
        name: 'gpt-4-turbo',
        maxTokenAllowed: 128_000,
        maxCompletionTokens: 4096,
      }),
    ).toBe(4096);
  });
});
