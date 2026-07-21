import { describe, expect, it } from 'vitest';

import {
  ImportBillingError,
  ImportCreditLedger,
  assertNoDebitWithoutCommit,
  compensateReservation,
  estimateImportReservation,
  reserveReservation,
  settleReservation,
} from './import-billing.js';

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error(`expected ImportBillingError ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ImportBillingError);
    expect((error as ImportBillingError).code).toBe(code);
  }
}

describe('reserveReservation — idempotent, before any paid work', () => {
  const input = { key: 'k1', organizationId: 'org', importJobId: 'job', reservedCredits: 5 };

  it('creates a RESERVED reservation with zero debit', () => {
    const r = reserveReservation(undefined, input);
    expect(r).toMatchObject({ key: 'k1', state: 'RESERVED', reservedCredits: 5, debitedCredits: 0 });
  });

  it('is idempotent on the same key (no double reserve)', () => {
    const first = reserveReservation(undefined, input);
    const second = reserveReservation(first, input);
    expect(second).toBe(first); // same object, unchanged
  });

  it('rejects a missing idempotency key (mandatory)', () => {
    expectCode(() => reserveReservation(undefined, { ...input, key: '  ' }), 'BILLING_KEY_REQUIRED');
  });

  it('rejects a different key for an already-reserved job', () => {
    const first = reserveReservation(undefined, input);
    expectCode(() => reserveReservation(first, { ...input, key: 'other' }), 'BILLING_KEY_CONFLICT');
  });

  it('rejects a negative / non-integer amount', () => {
    expectCode(() => reserveReservation(undefined, { ...input, reservedCredits: -1 }), 'BILLING_BAD_AMOUNT');
    expectCode(() => reserveReservation(undefined, { ...input, reservedCredits: 1.5 }), 'BILLING_BAD_AMOUNT');
  });
});

describe('settleReservation — the ONLY debit, only when committed', () => {
  const reserved = reserveReservation(undefined, { key: 'k', organizationId: 'o', importJobId: 'j', reservedCredits: 5 });

  it('records the debit when committed === true', () => {
    const s = settleReservation(reserved, true, 3);
    expect(s).toMatchObject({ state: 'SETTLED', debitedCredits: 3 });
  });

  it('REFUSES to settle when the import did not commit (no commit, no debit)', () => {
    expectCode(() => settleReservation(reserved, false, 3), 'BILLING_SETTLE_WITHOUT_COMMIT');
  });

  it('is idempotent when re-settled with the same amount', () => {
    const s1 = settleReservation(reserved, true, 3);
    const s2 = settleReservation(s1, true, 3);
    expect(s2).toBe(s1);
  });

  it('rejects re-settling at a different amount', () => {
    const s1 = settleReservation(reserved, true, 3);
    expectCode(() => settleReservation(s1, true, 4), 'BILLING_RESETTLE_MISMATCH');
  });

  it('cannot settle a compensated reservation', () => {
    const comp = compensateReservation(reserved);
    expectCode(() => settleReservation(comp, true, 3), 'BILLING_SETTLE_AFTER_COMPENSATE');
  });
});

describe('compensateReservation — release with zero debit', () => {
  const reserved = reserveReservation(undefined, { key: 'k', organizationId: 'o', importJobId: 'j', reservedCredits: 5 });

  it('releases to COMPENSATED with zero debit', () => {
    expect(compensateReservation(reserved)).toMatchObject({ state: 'COMPENSATED', debitedCredits: 0 });
  });

  it('is idempotent', () => {
    const c1 = compensateReservation(reserved);
    expect(compensateReservation(c1)).toBe(c1);
  });

  it('cannot compensate a settled (already committed + debited) reservation', () => {
    const settled = settleReservation(reserved, true, 3);
    expectCode(() => compensateReservation(settled), 'BILLING_COMPENSATE_AFTER_SETTLE');
  });
});

describe('assertNoDebitWithoutCommit — the core safety invariant', () => {
  it('passes for RESERVED/COMPENSATED with zero debit and SETTLED with a debit', () => {
    const reserved = reserveReservation(undefined, { key: 'k', organizationId: 'o', importJobId: 'j', reservedCredits: 5 });
    expect(() => assertNoDebitWithoutCommit(reserved)).not.toThrow();
    expect(() => assertNoDebitWithoutCommit(compensateReservation(reserved))).not.toThrow();
    expect(() => assertNoDebitWithoutCommit(settleReservation(reserved, true, 2))).not.toThrow();
  });

  it('throws if a positive debit exists outside SETTLED', () => {
    const bogus = { key: 'k', organizationId: 'o', importJobId: 'j', reservedCredits: 5, debitedCredits: 2, state: 'RESERVED' as const };
    expectCode(() => assertNoDebitWithoutCommit(bogus), 'BILLING_DEBIT_WITHOUT_COMMIT');
  });
});

describe('ImportCreditLedger — in-process, keyed by job + idempotency key', () => {
  it('reserve → settle on commit records the debit', () => {
    const ledger = new ImportCreditLedger();
    ledger.reserve({ key: 'k', organizationId: 'o', importJobId: 'job1', reservedCredits: 4 });
    const settled = ledger.settleByJob('job1', true, 4);
    expect(settled.state).toBe('SETTLED');
    expect(settled.debitedCredits).toBe(4);
    expect(ledger.getByJob('job1')?.debitedCredits).toBe(4);
  });

  it('reserve → compensate on cleanup leaves zero debit', () => {
    const ledger = new ImportCreditLedger();
    ledger.reserve({ key: 'k', organizationId: 'o', importJobId: 'job2', reservedCredits: 4 });
    const comp = ledger.compensateByJob('job2');
    expect(comp?.state).toBe('COMPENSATED');
    expect(comp?.debitedCredits).toBe(0);
  });

  it('compensateByJob is a safe no-op when nothing was reserved', () => {
    const ledger = new ImportCreditLedger();
    expect(ledger.compensateByJob('never-reserved')).toBeUndefined();
  });

  it('double reserve with the same key never double-charges', () => {
    const ledger = new ImportCreditLedger();
    const a = ledger.reserve({ key: 'same', organizationId: 'o', importJobId: 'job3', reservedCredits: 4 });
    const b = ledger.reserve({ key: 'same', organizationId: 'o', importJobId: 'job3', reservedCredits: 4 });
    expect(b).toBe(a);
  });

  it('settleByJob throws when no reservation exists', () => {
    const ledger = new ImportCreditLedger();
    expectCode(() => ledger.settleByJob('missing', true, 1), 'BILLING_RESERVATION_MISSING');
  });
});

describe('estimateImportReservation', () => {
  it('is at least 1 credit and scales with staged file count', () => {
    expect(estimateImportReservation(0)).toBe(1);
    expect(estimateImportReservation(3)).toBe(3);
    expect(estimateImportReservation(-5)).toBe(1);
  });
});
