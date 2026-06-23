import { describe, expect, it } from 'vitest';
import { computeChatTitleInputWidth } from './ChatDescription.client';

describe('computeChatTitleInputWidth', () => {
  it('uses the minimum width for short titles', () => {
    expect(computeChatTitleInputWidth(0)).toBe(100);
    expect(computeChatTitleInputWidth(5)).toBe(100);
  });

  it('grows with the title length in the mid range', () => {
    expect(computeChatTitleInputWidth(20)).toBe(160);
    expect(computeChatTitleInputWidth(30)).toBe(240);
  });

  it('clamps to the maximum width for long titles', () => {
    // The rename validator allows up to 100 chars; without a cap this would be 800px.
    expect(computeChatTitleInputWidth(100)).toBe(320);
    expect(computeChatTitleInputWidth(1000)).toBe(320);
  });

  it('never exceeds the upper bound for any length', () => {
    for (let len = 0; len <= 200; len++) {
      expect(computeChatTitleInputWidth(len)).toBeLessThanOrEqual(320);
      expect(computeChatTitleInputWidth(len)).toBeGreaterThanOrEqual(100);
    }
  });
});
