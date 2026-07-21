import { describe, expect, it } from 'vitest';

import {
  LedgerError,
  assertWithinHardLimit,
  ceilToMinor,
  convertFx,
  netByAccount,
  normalizeCurrency,
  pickFxRate,
  reverseEntries,
  validateBalanced,
  type FxRate,
  type LedgerEntryInput,
} from './ledger-core.js';

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error(`expected LedgerError ${code}`);
  } catch (e) {
    expect(e).toBeInstanceOf(LedgerError);
    expect((e as LedgerError).code).toBe(code);
  }
}

const D = (accountId: string, amount: bigint, currency = 'usd'): LedgerEntryInput => ({ accountId, direction: 'DEBIT', amountMinor: amount, currency });
const C = (accountId: string, amount: bigint, currency = 'usd'): LedgerEntryInput => ({ accountId, direction: 'CREDIT', amountMinor: amount, currency });

describe('validateBalanced — I-LED-1 double-entry', () => {
  it('accepts a balanced transaction and returns per-currency totals', () => {
    const totals = validateBalanced([D('a', 100n), C('b', 100n)]);
    expect(totals.get('usd')).toBe(100n);
  });

  it('accepts a multi-leg balanced transaction', () => {
    const totals = validateBalanced([D('reserved', 100n), C('revenue', 70n), C('tax', 5n), C('user', 25n)]);
    expect(totals.get('usd')).toBe(100n);
  });

  it('balances per-currency independently', () => {
    const totals = validateBalanced([D('a', 100n, 'usd'), C('b', 100n, 'usd'), D('c', 90n, 'eur'), C('d', 90n, 'eur')]);
    expect(totals.get('usd')).toBe(100n);
    expect(totals.get('eur')).toBe(90n);
  });

  // NEGATIVE: debit ≠ credit is refused.
  it('REFUSES an unbalanced transaction (debit ≠ credit)', () => {
    expectCode(() => validateBalanced([D('a', 100n), C('b', 99n)]), 'LEDGER_UNBALANCED');
  });

  it('REFUSES a single-sided (fewer than two entries) transaction', () => {
    expectCode(() => validateBalanced([D('a', 100n)]), 'LEDGER_TOO_FEW_ENTRIES');
  });

  it('REFUSES a non-positive amount', () => {
    expectCode(() => validateBalanced([D('a', 0n), C('b', 0n)]), 'LEDGER_NONPOSITIVE_AMOUNT');
  });

  it('REFUSES an imbalance hidden across currencies', () => {
    // Totals net to zero overall but NOT per currency → must be refused.
    expectCode(() => validateBalanced([D('a', 100n, 'usd'), C('b', 100n, 'eur')]), 'LEDGER_UNBALANCED');
  });
});

describe('reverseEntries + netByAccount — compensation nets to zero (I-LED-3)', () => {
  it('reversal flips direction and original ⊕ reversal nets to zero per account', () => {
    const original = [D('reserved', 100n), C('revenue', 70n), C('user', 30n)];
    const reversal = reverseEntries(original);
    expect(reversal[0]).toMatchObject({ accountId: 'reserved', direction: 'CREDIT', amountMinor: 100n });

    // reversal itself balances,
    expect(validateBalanced(reversal).get('usd')).toBe(100n);

    // and original + reversal nets to zero on every (account, currency).
    const net = netByAccount([...original, ...reversal]);
    for (const [, v] of net) {
      expect(v).toBe(0n);
    }
  });
});

describe('convertFx — exact rational, deterministic rounding', () => {
  it('converts with an exact rational rate (no float)', () => {
    // 100 USD cents × 0.9 (9/10) = 90 EUR cents exactly.
    const rate: FxRate = { fromCurrency: 'usd', toCurrency: 'eur', rateNum: 9n, rateDen: 10n, effectiveAt: '2026-07-01T00:00:00Z' };
    expect(convertFx(100n, rate).converted).toBe(90n);
  });

  it('rounds HALF_UP deterministically on a fractional result', () => {
    // 101 × 9/10 = 90.9 → HALF_UP 91 ; DOWN 90.
    const rate: FxRate = { fromCurrency: 'usd', toCurrency: 'eur', rateNum: 9n, rateDen: 10n, effectiveAt: '2026-07-01T00:00:00Z' };
    expect(convertFx(101n, rate, 'HALF_UP').converted).toBe(91n);
    expect(convertFx(101n, rate, 'DOWN').converted).toBe(90n);
  });

  it('rejects a non-positive rate', () => {
    const bad: FxRate = { fromCurrency: 'usd', toCurrency: 'eur', rateNum: 0n, rateDen: 10n, effectiveAt: '2026-07-01T00:00:00Z' };
    expectCode(() => convertFx(100n, bad), 'LEDGER_BAD_FX_RATE');
  });
});

describe('pickFxRate — cutoff honoured', () => {
  const rates: FxRate[] = [
    { fromCurrency: 'usd', toCurrency: 'eur', rateNum: 90n, rateDen: 100n, effectiveAt: '2026-07-01T00:00:00Z', cutoffAt: '2026-07-15T00:00:00Z' },
    { fromCurrency: 'usd', toCurrency: 'eur', rateNum: 92n, rateDen: 100n, effectiveAt: '2026-07-15T00:00:00Z' },
  ];

  it('picks the rate valid at the booking date (before cutoff)', () => {
    expect(pickFxRate(rates, 'usd', 'eur', '2026-07-10T00:00:00Z').rateNum).toBe(90n);
  });

  it('a booking at/after the cutoff must use the next rate', () => {
    expect(pickFxRate(rates, 'usd', 'eur', '2026-07-20T00:00:00Z').rateNum).toBe(92n);
  });

  it('refuses when no rate applies (never guesses)', () => {
    expectCode(() => pickFxRate(rates, 'usd', 'eur', '2026-06-01T00:00:00Z'), 'LEDGER_NO_FX_RATE');
  });
});

describe('hard limits + ceil (I-LED-4, I-BIL-2)', () => {
  it('allows a move within the limit and refuses one that breaches it', () => {
    expect(() => assertWithinHardLimit(100n, 100n)).not.toThrow();
    expectCode(() => assertWithinHardLimit(101n, 100n), 'LEDGER_HARD_LIMIT');
  });

  it('no limit set ⇒ always allowed', () => {
    expect(() => assertWithinHardLimit(10n ** 18n, null)).not.toThrow();
  });

  it('ceilToMinor rounds up with a floor of 1', () => {
    expect(ceilToMinor(0n, 1n)).toBe(1n); // floor
    expect(ceilToMinor(101n, 100n)).toBe(2n); // 1.01 → 2
    expect(ceilToMinor(200n, 100n)).toBe(2n); // exact
  });
});

describe('normalizeCurrency', () => {
  it('lowercases + validates', () => {
    expect(normalizeCurrency('USD')).toBe('usd');
    expectCode(() => normalizeCurrency('12'), 'LEDGER_BAD_CURRENCY');
  });
});
