import { describe, expect, it } from 'vitest';

import { reconcile, type ReconciliationLine } from './ledger-reconciliation.js';

const L = (key: string, amount: bigint, currency = 'usd'): ReconciliationLine => ({ key, amountMinor: amount, currency });

describe('reconcile — ledger vs external', () => {
  it('reports OK when every key matches per currency', () => {
    const ledger = [L('invoice:1', 100n), L('invoice:2', 250n)];
    const external = [L('invoice:1', 100n), L('invoice:2', 250n)];
    const result = reconcile(ledger, external);
    expect(result.status).toBe('OK');
    expect(result.discrepancies).toEqual([]);
    expect(result.ledgerTotals).toEqual({ usd: '350' });
  });

  it('DETECTS an amount mismatch (the required proof)', () => {
    const ledger = [L('invoice:1', 100n), L('payout:9', 500n)];
    const external = [L('invoice:1', 100n), L('payout:9', 480n)]; // Stripe short by 20
    const result = reconcile(ledger, external);
    expect(result.status).toBe('DISCREPANCY');
    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0]).toMatchObject({ key: 'payout:9', kind: 'AMOUNT_MISMATCH', deltaMinor: 20n });
  });

  it('detects a line missing on either side', () => {
    const ledger = [L('a', 10n), L('b', 20n)];
    const external = [L('a', 10n), L('c', 30n)];
    const result = reconcile(ledger, external);
    const kinds = result.discrepancies.map((d) => `${d.key}:${d.kind}`).sort();
    expect(kinds).toEqual(['b:MISSING_IN_EXTERNAL', 'c:MISSING_IN_LEDGER']);
  });

  it('honours a tolerance (rounding slack)', () => {
    const ledger = [L('a', 100n)];
    const external = [L('a', 99n)];
    expect(reconcile(ledger, external, 1n).status).toBe('OK'); // within 1
    expect(reconcile(ledger, external, 0n).status).toBe('DISCREPANCY'); // exact
  });

  it('treats different currencies on the same key as separate lines', () => {
    const ledger = [L('x', 100n, 'usd'), L('x', 90n, 'eur')];
    const external = [L('x', 100n, 'usd')]; // eur leg missing
    const result = reconcile(ledger, external);
    expect(result.status).toBe('DISCREPANCY');
    expect(result.discrepancies).toEqual([
      expect.objectContaining({ key: 'x', currency: 'eur', kind: 'MISSING_IN_EXTERNAL' }),
    ]);
  });
});
