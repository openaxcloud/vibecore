import { describe, expect, it } from 'vitest';
import { totalAiUsage } from './ai-usage-totals';

describe('AI usage ledger totals', () => {
  it('converts API cents to dollars without dropping token counts', () => {
    expect(totalAiUsage([{ inputTokens: 294781, outputTokens: 696641, costCents: 123.45 }])).toEqual({
      inputTokens: 294781,
      outputTokens: 696641,
      costUsd: 1.2345,
      missingCosts: 0,
    });
  });

  it('prefers canonical cents and supports explicitly denominated legacy dollars', () => {
    expect(totalAiUsage([{ costCents: 100, costUsd: 99 }, { costUsd: 2.5 }]).costUsd).toBe(3.5);
  });

  it('retains an explicit zero estimate', () => {
    expect(totalAiUsage([{ costCents: 0 }]).costUsd).toBe(0);
  });

  it('does not label absent or partially missing costs as zero or a complete total', () => {
    expect(totalAiUsage([]).costUsd).toBeNull();
    expect(totalAiUsage([{ inputTokens: 500 }]).costUsd).toBeNull();
    expect(totalAiUsage([{ costCents: 100 }, { outputTokens: 200 }])).toMatchObject({ costUsd: null, missingCosts: 1 });
    expect(totalAiUsage([{ cost: 200 } as never]).costUsd).toBeNull();
  });

  it.each([NaN, Infinity, -1, '100', '', null])('rejects invalid cost %s', (costCents) => {
    expect(totalAiUsage([{ costCents }]).costUsd).toBeNull();
  });

  it('uses legacy token names and prevents invalid token values poisoning totals', () => {
    expect(
      totalAiUsage([
        { promptTokens: 10, completionTokens: 20 },
        { inputTokens: NaN, outputTokens: -2 },
      ]),
    ).toMatchObject({
      inputTokens: 10,
      outputTokens: 20,
    });
  });
});
