import { describe, expect, it } from 'vitest';

import { netByAccount, validateBalanced } from './ledger-core.js';
import {
  compensateEntries,
  releaseEntries,
  reserveEntries,
  settleEntries,
  type ReservationAccounts,
} from './ledger-reservation.js';

const A: ReservationAccounts = {
  userCreditsAccountId: 'user',
  reservedAccountId: 'reserved',
  revenueAccountId: 'revenue',
  taxPayableAccountId: 'tax',
};

describe('reservation lifecycle entries — every step balances', () => {
  it('reserve balances (user_credits → reserved)', () => {
    expect(validateBalanced(reserveEntries(A, 100n, 'usd')).get('usd')).toBe(100n);
  });

  it('settle balances and recognises revenue + refunds the remainder', () => {
    const entries = settleEntries(A, 100n, 70n, 'usd');
    expect(validateBalanced(entries).get('usd')).toBe(100n);
    // revenue 70, user refund 30, from reserved 100.
    const net = netByAccount(entries);
    expect(net.get('reserved:usd')).toBe(100n); // debited (consumed)
    expect(net.get('revenue:usd')).toBe(-70n); // credited (recognised)
    expect(net.get('user:usd')).toBe(-30n); // credited (refunded remainder)
  });

  it('settle with tax splits revenue and tax_payable', () => {
    const entries = settleEntries(A, 100n, 100n, 'usd', 8n);
    expect(validateBalanced(entries).get('usd')).toBe(100n);
    const net = netByAccount(entries);
    expect(net.get('revenue:usd')).toBe(-92n);
    expect(net.get('tax:usd')).toBe(-8n);
  });

  it('release returns the whole hold to available credits', () => {
    const entries = releaseEntries(A, 100n, 'usd');
    expect(validateBalanced(entries).get('usd')).toBe(100n);
    expect(netByAccount(entries).get('user:usd')).toBe(-100n);
  });

  it('rejects committed > max', () => {
    expect(() => settleEntries(A, 100n, 101n, 'usd')).toThrow(/within/);
  });
});

describe('MONEY CONSERVATION — reserve → settle → compensate nets to ZERO', () => {
  it('every account returns to zero after compensation (the user is made whole)', () => {
    const reserve = reserveEntries(A, 100n, 'usd');
    const settle = settleEntries(A, 100n, 70n, 'usd');
    const compensate = compensateEntries(A, 70n, 'usd');

    // Each transaction balances on its own.
    expect(validateBalanced(reserve).get('usd')).toBe(100n);
    expect(validateBalanced(settle).get('usd')).toBe(100n);
    expect(validateBalanced(compensate).get('usd')).toBe(70n);

    // The union of all three nets to zero on every account.
    const net = netByAccount([...reserve, ...settle, ...compensate]);
    for (const [account, value] of net) {
      expect(value, `account ${account} should net to zero`).toBe(0n);
    }
  });

  it('reserve → settle (no compensation): user is charged exactly committed, remainder refunded', () => {
    const reserve = reserveEntries(A, 100n, 'usd');
    const settle = settleEntries(A, 100n, 70n, 'usd');
    const net = netByAccount([...reserve, ...settle]);
    /*
     * user_credits is a LIABILITY (normal CREDIT). In netByAccount DEBIT=+, so a
     * positive net = a net DEBIT = the liability was reduced = the user was
     * CHARGED. reserve DEBITs user 100, settle CREDITs back 30 → net +70 charged.
     * revenue CREDIT 70 → net −70 (revenue recognised). reserved nets to 0.
     */
    expect(net.get('user:usd')).toBe(70n);
    expect(net.get('revenue:usd')).toBe(-70n);
    expect(net.get('reserved:usd')).toBe(0n);
  });

  it('reserve → release (no commit): user is charged NOTHING', () => {
    const reserve = reserveEntries(A, 100n, 'usd');
    const release = releaseEntries(A, 100n, 'usd');
    const net = netByAccount([...reserve, ...release]);
    expect(net.get('user:usd')).toBe(0n); // fully returned
    expect(net.get('reserved:usd')).toBe(0n);
    expect(net.get('revenue:usd')).toBeUndefined(); // revenue never touched
  });

  it('reserve → settle-with-tax → compensate-with-tax nets to zero incl. tax_payable', () => {
    const reserve = reserveEntries(A, 100n, 'usd');
    const settle = settleEntries(A, 100n, 100n, 'usd', 8n);
    const compensate = compensateEntries(A, 100n, 'usd', 8n);
    const net = netByAccount([...reserve, ...settle, ...compensate]);
    for (const [account, value] of net) {
      expect(value, `account ${account} should net to zero`).toBe(0n);
    }
  });
});
