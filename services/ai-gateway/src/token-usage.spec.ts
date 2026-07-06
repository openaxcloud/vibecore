import { describe, expect, it } from 'vitest';
import { summarizeRunTokenUsage } from './token-usage.js';

describe('summarizeRunTokenUsage', () => {
  it('sums per-lane input/output/cost and totals', () => {
    const summary = summarizeRunTokenUsage([
      { inputTokens: 1000, outputTokens: 200, estimatedCostCents: 3 },
      { inputTokens: 1000, outputTokens: 150, estimatedCostCents: 2 },
    ]);

    expect(summary.laneCount).toBe(2);
    expect(summary.inputTokens).toBe(2000);
    expect(summary.outputTokens).toBe(350);
    expect(summary.totalTokens).toBe(2350);
    expect(summary.estimatedCostCents).toBe(5);
  });

  it('surfaces the shared-context duplication across N lanes', () => {
    // 5 lanes, each re-sending a 1000-token shared context → 4000 duplicated.
    const summary = summarizeRunTokenUsage(
      Array.from({ length: 5 }, () => ({ inputTokens: 1200, outputTokens: 100, estimatedCostCents: 1 })),
      1000,
    );

    expect(summary.laneCount).toBe(5);
    expect(summary.sharedContextTokens).toBe(1000);
    expect(summary.duplicatedInputTokens).toBe(4000);
  });

  it('ignores failed lanes (no usage) and never counts duplication below zero', () => {
    const summary = summarizeRunTokenUsage(
      [{ inputTokens: 500, outputTokens: 50, estimatedCostCents: 1 }, undefined],
      800,
    );

    expect(summary.laneCount).toBe(1);
    expect(summary.inputTokens).toBe(500);
    // Only one lane produced usage → no duplication.
    expect(summary.duplicatedInputTokens).toBe(0);
  });

  it('treats a missing/invalid shared-context count as zero', () => {
    const summary = summarizeRunTokenUsage([{ inputTokens: 100, outputTokens: 10, estimatedCostCents: 0 }]);
    expect(summary.sharedContextTokens).toBe(0);
    expect(summary.duplicatedInputTokens).toBe(0);
  });
});
