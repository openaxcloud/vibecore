import { describe, expect, it } from 'vitest';
import {
  MODEL_PRICING,
  estimatePromptCost,
  estimatePromptTokens,
  formatEstimatedCost,
  resolveModelPricing,
} from './prompt-cost';

describe('estimatePromptTokens', () => {
  it('returns 0 for null / undefined / empty input', () => {
    expect(estimatePromptTokens(null)).toBe(0);
    expect(estimatePromptTokens(undefined)).toBe(0);
    expect(estimatePromptTokens('')).toBe(0);
  });

  it('uses the chars/4 industry heuristic, ceiling rounded', () => {
    expect(estimatePromptTokens('a')).toBe(1);
    expect(estimatePromptTokens('abcd')).toBe(1);
    expect(estimatePromptTokens('abcde')).toBe(2);
    expect(estimatePromptTokens('a'.repeat(400))).toBe(100);
    expect(estimatePromptTokens('a'.repeat(401))).toBe(101);
  });
});

describe('resolveModelPricing', () => {
  it('returns the exact pricing row for canonical model names', () => {
    expect(resolveModelPricing('claude-opus-4-7')).toEqual(MODEL_PRICING['claude-opus-4-7']);
    expect(resolveModelPricing('gpt-4o-mini')).toEqual(MODEL_PRICING['gpt-4o-mini']);
  });

  it('matches versioned / dated suffixes via prefix fallback', () => {
    expect(resolveModelPricing('claude-opus-4-7-20260501')).toEqual(MODEL_PRICING['claude-opus-4-7']);
    expect(resolveModelPricing('claude-haiku-4-5-20251001')).toEqual(MODEL_PRICING['claude-haiku-4-5']);
    expect(resolveModelPricing('gpt-4o-2024-08-06')).toEqual(MODEL_PRICING['gpt-4o']);
  });

  it('matches case-insensitively', () => {
    expect(resolveModelPricing('Claude-Opus-4-7')).toEqual(MODEL_PRICING['claude-opus-4-7']);
  });

  it('returns null for unknown models', () => {
    expect(resolveModelPricing('mistral-future-99x')).toBeNull();
    expect(resolveModelPricing('totally-made-up')).toBeNull();
  });

  it('returns null defensively for empty / non-string input', () => {
    expect(resolveModelPricing('')).toBeNull();
    expect(resolveModelPricing(null)).toBeNull();
    expect(resolveModelPricing(undefined)).toBeNull();
    expect(resolveModelPricing('   ')).toBeNull();
  });

  it('prefers o1-mini over o1 when both could match', () => {
    expect(resolveModelPricing('o1-mini-2025-01')).toEqual(MODEL_PRICING['o1-mini']);
  });
});

describe('estimatePromptCost', () => {
  it('returns hasPricing=false and inputUsd=null for unknown models', () => {
    const result = estimatePromptCost('Build a polished portfolio site', 'mistral-large-99x');
    expect(result.hasPricing).toBe(false);
    expect(result.inputUsd).toBeNull();
    expect(result.pricing).toBeNull();
    expect(result.tokens).toBeGreaterThan(0);
  });

  it('returns a non-null inputUsd for a known model', () => {
    const result = estimatePromptCost('a'.repeat(4_000), 'claude-opus-4-7');
    expect(result.hasPricing).toBe(true);
    expect(result.tokens).toBe(1_000);

    // 1_000 tokens at $15 / 1M = $0.015.
    expect(result.inputUsd).toBeCloseTo(0.015, 6);
    expect(result.pricing).toEqual(MODEL_PRICING['claude-opus-4-7']);
  });

  it('returns inputUsd=0 for an empty prompt', () => {
    const result = estimatePromptCost('', 'gpt-4o');
    expect(result.tokens).toBe(0);
    expect(result.inputUsd).toBe(0);
    expect(result.hasPricing).toBe(true);
  });

  it('handles a dated model suffix via the prefix lookup', () => {
    const result = estimatePromptCost('a'.repeat(40), 'claude-sonnet-4-6-20260112');
    expect(result.hasPricing).toBe(true);
    expect(result.tokens).toBe(10);
    expect(result.inputUsd).toBeCloseTo((10 * 3) / 1_000_000, 9);
  });
});

describe('formatEstimatedCost', () => {
  it('returns $0.00 for zero', () => {
    expect(formatEstimatedCost(0)).toBe('$0.00');
  });

  it('returns <$0.01 for sub-cent amounts', () => {
    expect(formatEstimatedCost(0.001)).toBe('<$0.01');
    expect(formatEstimatedCost(0.0099)).toBe('<$0.01');
  });

  it('formats cent-range amounts with three decimals', () => {
    expect(formatEstimatedCost(0.012)).toBe('$0.012');
    expect(formatEstimatedCost(0.5)).toBe('$0.500');
  });

  it('formats dollar-range amounts with two decimals', () => {
    expect(formatEstimatedCost(1.234)).toBe('$1.23');
    expect(formatEstimatedCost(12.5)).toBe('$12.50');
  });

  it('treats negative inputs as zero', () => {
    expect(formatEstimatedCost(-1)).toBe('$0.00');
  });
});
