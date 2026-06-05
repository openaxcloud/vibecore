import { describe, expect, it } from 'vitest';

import { aiModelCatalog, computeAiCostCents, findAiModel } from './ai-pricing.js';

describe('aiModelCatalog', () => {
  it('has no duplicate (provider, id) pairs', () => {
    const seen = new Set<string>();
    for (const model of aiModelCatalog) {
      const key = `${model.provider}:${model.id}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('quotes non-negative prices', () => {
    for (const model of aiModelCatalog) {
      expect(model.inputCentsPerMillion).toBeGreaterThanOrEqual(0);
      expect(model.outputCentsPerMillion).toBeGreaterThanOrEqual(0);
      expect(model.contextWindow).toBeGreaterThan(0);
    }
  });
});

describe('findAiModel', () => {
  it('returns the only matching model by id', () => {
    const model = findAiModel('claude-3-5-sonnet-latest');
    expect(model?.provider).toBe('anthropic');
  });

  it('includes the current Anthropic flagship model with real public pricing', () => {
    const model = findAiModel('claude-opus-4-8', 'anthropic');
    expect(model?.inputCentsPerMillion).toBe(500);
    expect(model?.outputCentsPerMillion).toBe(2500);
    expect(model?.contextWindow).toBe(1_000_000);
  });

  it('uses provider as a tiebreaker for shared ids', () => {
    const direct = findAiModel('gpt-4.1', 'openai');
    const proxied = findAiModel('openai/gpt-4.1', 'openrouter');
    expect(direct?.provider).toBe('openai');
    expect(proxied?.provider).toBe('openrouter');
  });

  it('returns undefined when the id is not in the catalog', () => {
    expect(findAiModel('imaginary-model-2099')).toBeUndefined();
  });
});

describe('computeAiCostCents', () => {
  it('computes Claude Sonnet 4.6 input+output cost', () => {
    // 1000 input @ 300¢/1M + 500 output @ 1500¢/1M
    // = 0.3 + 0.75 = 1.05¢ → rounded up = 2¢
    const result = computeAiCostCents({
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(result.matched).toBe(true);
    expect(result.costCents).toBe(2);
  });

  it('rounds zero-cost (free providers like ollama) to 0', () => {
    const result = computeAiCostCents({
      model: 'llama3.1',
      provider: 'ollama',
      inputTokens: 10_000,
      outputTokens: 10_000,
    });
    expect(result.matched).toBe(true);
    expect(result.costCents).toBe(0);
  });

  it('returns matched: false and 0¢ for unknown models without throwing', () => {
    const result = computeAiCostCents({
      model: 'unknown-model-v999',
      inputTokens: 100,
      outputTokens: 100,
    });
    expect(result.matched).toBe(false);
    expect(result.model).toBeUndefined();
    expect(result.costCents).toBe(0);
  });

  it('always rounds up so we never under-bill', () => {
    // 1 input @ 200¢/1M + 0 output → 0.0002¢ which rounds to 1
    const result = computeAiCostCents({
      model: 'gpt-4.1',
      provider: 'openai',
      inputTokens: 1,
      outputTokens: 0,
    });
    expect(result.costCents).toBe(1);
  });
});
