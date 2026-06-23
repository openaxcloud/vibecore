import { describe, expect, it } from 'vitest';
import { resolveTogetherCompletionTokens, TOGETHER_DEFAULT_MAX_COMPLETION_TOKENS } from './together-completion-tokens';

describe('resolveTogetherCompletionTokens', () => {
  it('clamps the default completion budget to a small context window', () => {
    // A 4k-context model must not advertise 8192 completion tokens.
    expect(resolveTogetherCompletionTokens({}, 4000)).toBe(4000);
  });

  it('uses the default ceiling when context comfortably exceeds it', () => {
    expect(resolveTogetherCompletionTokens({}, 128000)).toBe(TOGETHER_DEFAULT_MAX_COMPLETION_TOKENS);
  });

  it('honours an explicit max_completion_tokens from the API, clamped to context', () => {
    expect(resolveTogetherCompletionTokens({ max_completion_tokens: 2048 }, 128000)).toBe(2048);
    expect(resolveTogetherCompletionTokens({ max_completion_tokens: 16000 }, 8000)).toBe(8000);
  });

  it('accepts alternative field names for the output cap', () => {
    expect(resolveTogetherCompletionTokens({ max_output_tokens: 1000 }, 128000)).toBe(1000);
    expect(resolveTogetherCompletionTokens({ max_tokens: 1500 }, 128000)).toBe(1500);
    expect(resolveTogetherCompletionTokens({ config: { max_output_tokens: 1200 } }, 128000)).toBe(1200);
  });

  it('falls back to the default when context is invalid', () => {
    expect(resolveTogetherCompletionTokens({}, 0)).toBe(TOGETHER_DEFAULT_MAX_COMPLETION_TOKENS);
    expect(resolveTogetherCompletionTokens({}, Number.NaN)).toBe(TOGETHER_DEFAULT_MAX_COMPLETION_TOKENS);
  });

  it('ignores non-positive or non-numeric advertised caps', () => {
    expect(resolveTogetherCompletionTokens({ max_completion_tokens: 0 }, 128000)).toBe(
      TOGETHER_DEFAULT_MAX_COMPLETION_TOKENS,
    );
    expect(resolveTogetherCompletionTokens({ max_completion_tokens: 'lots' }, 128000)).toBe(
      TOGETHER_DEFAULT_MAX_COMPLETION_TOKENS,
    );
  });
});
