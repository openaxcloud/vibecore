import { describe, expect, it } from 'vitest';

import { budgetTone, centsToUsd } from './admin-cost-budget';

describe('budgetTone (F26 80/100 thresholds)', () => {
  it('is ok below 80%', () => {
    expect(budgetTone(0)).toBe('ok');
    expect(budgetTone(79.9)).toBe('ok');
  });

  it('warns from 80% up to (but not including) 100%', () => {
    expect(budgetTone(80)).toBe('warn');
    expect(budgetTone(99.9)).toBe('warn');
  });

  it('is over at or above 100%', () => {
    expect(budgetTone(100)).toBe('over');
    expect(budgetTone(250)).toBe('over');
  });

  it('treats no budget (null/undefined/NaN) as ok', () => {
    expect(budgetTone(null)).toBe('ok');
    expect(budgetTone(undefined)).toBe('ok');
    expect(budgetTone(Number.NaN)).toBe('ok');
  });

  it('honors custom thresholds', () => {
    expect(budgetTone(60, { warn: 50, over: 90 })).toBe('warn');
    expect(budgetTone(95, { warn: 50, over: 90 })).toBe('over');
  });
});

describe('centsToUsd', () => {
  it('formats cents as a 2-decimal USD string', () => {
    expect(centsToUsd(0)).toBe('$0.00');
    expect(centsToUsd(12345)).toBe('$123.45');
    expect(centsToUsd(5)).toBe('$0.05');
  });

  it('uses French decimal and currency spacing when French is selected', () => {
    expect(centsToUsd(12345, 'fr')).toBe(
      new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(123.45),
    );
  });
});
