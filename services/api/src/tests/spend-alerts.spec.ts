import { describe, expect, it } from 'vitest';
import { nextSpendAlertPct, spendAlertEmailContent } from '../spend-alerts.js';

const PERIOD = 1_700_000_000_000;
const PREV_PERIOD = 1_690_000_000_000;

describe('nextSpendAlertPct', () => {
  it('returns null when there is no budget cap', () => {
    expect(
      nextSpendAlertPct({
        paygSpentCents: 9999,
        budgetCapCents: null,
        lastAlertPct: null,
        periodStartMs: PERIOD,
        lastAlertPeriodStartMs: null,
      }),
    ).toBeNull();
  });

  it('fires at each rung as spend climbs, never twice for the same rung', () => {
    const base = { budgetCapCents: 1000, periodStartMs: PERIOD, lastAlertPeriodStartMs: PERIOD };

    expect(nextSpendAlertPct({ ...base, paygSpentCents: 400, lastAlertPct: null })).toBeNull();
    expect(nextSpendAlertPct({ ...base, paygSpentCents: 500, lastAlertPct: null })).toBe(50);
    // Already alerted 50 this period → 60% does not re-fire.
    expect(nextSpendAlertPct({ ...base, paygSpentCents: 600, lastAlertPct: 50 })).toBeNull();
    expect(nextSpendAlertPct({ ...base, paygSpentCents: 800, lastAlertPct: 50 })).toBe(80);
    expect(nextSpendAlertPct({ ...base, paygSpentCents: 1000, lastAlertPct: 80 })).toBe(100);
    expect(nextSpendAlertPct({ ...base, paygSpentCents: 1200, lastAlertPct: 100 })).toBeNull();
  });

  it('jumps straight to the highest rung crossed', () => {
    expect(
      nextSpendAlertPct({
        paygSpentCents: 950,
        budgetCapCents: 1000,
        lastAlertPct: null,
        periodStartMs: PERIOD,
        lastAlertPeriodStartMs: PERIOD,
      }),
    ).toBe(80);
  });

  it('resets the ladder when the billing period changes', () => {
    // Last period we alerted at 100%, but this is a new period → 50% fires again.
    expect(
      nextSpendAlertPct({
        paygSpentCents: 500,
        budgetCapCents: 1000,
        lastAlertPct: 100,
        periodStartMs: PERIOD,
        lastAlertPeriodStartMs: PREV_PERIOD,
      }),
    ).toBe(50);
  });
});

describe('spendAlertEmailContent', () => {
  it('phrases the 80% warning with spend and cap', () => {
    const content = spendAlertEmailContent({ pct: 80, paygSpentCents: 800, budgetCapCents: 1000 });
    expect(content.subject).toContain('80%');
    expect(content.text).toContain('$8.00');
    expect(content.text).toContain('$10.00');
  });

  it('phrases the 100% mail as a hard limit / paused services', () => {
    const content = spendAlertEmailContent({ pct: 100, paygSpentCents: 1000, budgetCapCents: 1000 });
    expect(content.subject).toMatch(/usage limit/i);
    expect(content.text).toMatch(/paused/i);
  });

  it('uses French number formatting while preserving the wallet currency', () => {
    const content = spendAlertEmailContent({
      pct: 80,
      paygSpentCents: 800,
      budgetCapCents: 1000,
      currency: 'usd',
      locale: 'fr',
    });

    expect(content.subject).toContain('80 %');
    expect(content.text).toContain('8,00');
    expect(content.text).toMatch(/\$US|USD/);
    expect(content.text).not.toContain('€');
  });
});
