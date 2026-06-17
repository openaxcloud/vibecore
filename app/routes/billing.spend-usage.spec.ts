import { describe, expect, it } from 'vitest';
import { spendUsageState } from './billing';

describe('spendUsageState (in-app spend-vs-cap indicator)', () => {
  it('is "none" when no cap is configured', () => {
    expect(spendUsageState(1234, null)).toEqual({ tone: 'none', pct: 0 });
    expect(spendUsageState(1234, 0)).toEqual({ tone: 'none', pct: 0 });
  });

  it('tracks the 50/80/100 ladder used by the email alerts', () => {
    expect(spendUsageState(0, 1000)).toEqual({ tone: 'ok', pct: 0 });
    expect(spendUsageState(490, 1000)).toEqual({ tone: 'ok', pct: 49 });
    expect(spendUsageState(500, 1000)).toEqual({ tone: 'warn', pct: 50 });
    expect(spendUsageState(800, 1000)).toEqual({ tone: 'critical', pct: 80 });
    expect(spendUsageState(1000, 1000)).toEqual({ tone: 'reached', pct: 100 });
  });

  it('clamps over-cap spend to 100%', () => {
    expect(spendUsageState(5000, 1000)).toEqual({ tone: 'reached', pct: 100 });
  });
});
