import { describe, expect, it } from 'vitest';

import { errorRateTone, moveItem } from './admin-provider-metrics';

describe('errorRateTone (F18 thresholds)', () => {
  it('is ok below the 2% warn threshold', () => {
    expect(errorRateTone(0)).toBe('ok');
    expect(errorRateTone(1.99)).toBe('ok');
  });

  it('warns from 2% up to (but not including) 5%', () => {
    expect(errorRateTone(2)).toBe('warn');
    expect(errorRateTone(4.99)).toBe('warn');
  });

  it('is danger at or above 5%', () => {
    expect(errorRateTone(5)).toBe('danger');
    expect(errorRateTone(42)).toBe('danger');
  });

  it('treats non-finite input as ok (no data)', () => {
    expect(errorRateTone(Number.NaN)).toBe('ok');
  });

  it('honors custom thresholds from the API payload', () => {
    expect(errorRateTone(3, { warnErrorPct: 5, errorErrorPct: 10 })).toBe('ok');
    expect(errorRateTone(6, { warnErrorPct: 5, errorErrorPct: 10 })).toBe('warn');
    expect(errorRateTone(11, { warnErrorPct: 5, errorErrorPct: 10 })).toBe('danger');
  });
});

describe('moveItem', () => {
  it('moves an element up', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
  });

  it('moves an element down', () => {
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('is a no-op (same reference) at the top edge', () => {
    const items = ['a', 'b', 'c'];
    expect(moveItem(items, 0, -1)).toBe(items);
  });

  it('is a no-op (same reference) at the bottom edge', () => {
    const items = ['a', 'b', 'c'];
    expect(moveItem(items, 2, 1)).toBe(items);
  });

  it('does not mutate the input', () => {
    const items = ['a', 'b', 'c'];
    moveItem(items, 0, 1);
    expect(items).toEqual(['a', 'b', 'c']);
  });
});
