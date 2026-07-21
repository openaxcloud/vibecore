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
  const reserved = reserveReservation(undefined, {
    key: 'k',
    organizationId: 'o',
    importJobId: 'j',
    reservedCredits: 5,
  });

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
  const reserved = reserveReservation(undefined, {
    key: 'k',
    organizationId: 'o',
    importJobId: 'j',
    reservedCredits: 5,
  });

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
    const reserved = reserveReservation(undefined, {
      key: 'k',
      organizationId: 'o',
      importJobId: 'j',
      reservedCredits: 5,
    });
    expect(() => assertNoDebitWithoutCommit(reserved)).not.toThrow();
    expect(() => assertNoDebitWithoutCommit(compensateReservation(reserved))).not.toThrow();
    expect(() => assertNoDebitWithoutCommit(settleReservation(reserved, true, 2))).not.toThrow();
  });

  it('throws if a positive debit exists outside SETTLED', () => {
    const bogus = {
      key: 'k',
      organizationId: 'o',
      importJobId: 'j',
      reservedCredits: 5,
      debitedCredits: 2,
      state: 'RESERVED' as const,
    };
    expectCode(() => assertNoDebitWithoutCommit(bogus), 'BILLING_DEBIT_WITHOUT_COMMIT');
  });
});

describe('ImportCreditLedger — in-memory backend (org-scoped keys, ownership, atomic reserve)', () => {
  it('reserve → attach → settle on commit records the debit', async () => {
    const ledger = new ImportCreditLedger();
    await ledger.reserve({ organizationId: 'o', key: 'k', reservedCredits: 4 });
    await ledger.attachJob('o', 'k', 'job1');

    const settled = await ledger.settleByJob('o', 'job1', true, 4);
    expect(settled.state).toBe('SETTLED');
    expect(settled.debitedCredits).toBe(4);
    expect((await ledger.getByJob('o', 'job1'))?.debitedCredits).toBe(4);
  });

  it('reserve → compensate on cleanup leaves zero debit', async () => {
    const ledger = new ImportCreditLedger();
    await ledger.reserve({ organizationId: 'o', key: 'k', reservedCredits: 4 });
    await ledger.attachJob('o', 'k', 'job2');

    const comp = await ledger.compensateByJob('job2', 'cancel');
    expect(comp?.state).toBe('COMPENSATED');
    expect(comp?.debitedCredits).toBe(0);
  });

  it('compensateByJob is a safe no-op when nothing was reserved', async () => {
    const ledger = new ImportCreditLedger();
    expect(await ledger.compensateByJob('never-reserved', 'failure')).toBeUndefined();
  });

  it('replaying the same key never double-reserves: exactly one created', async () => {
    const ledger = new ImportCreditLedger();
    const a = await ledger.reserve({ organizationId: 'o', key: 'same', reservedCredits: 4 });
    const b = await ledger.reserve({ organizationId: 'o', key: 'same', reservedCredits: 4 });

    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.reservation.key).toBe(a.reservation.key);
  });

  it('EXPERT #27-1 — the same key in two organizations gives two INDEPENDENT reservations', async () => {
    const ledger = new ImportCreditLedger();
    const orgA = await ledger.reserve({ organizationId: 'org-a', key: 'shared-key', reservedCredits: 3 });
    const orgB = await ledger.reserve({ organizationId: 'org-b', key: 'shared-key', reservedCredits: 7 });

    // BOTH are fresh creations — no cross-org sharing via the raw key.
    expect(orgA.created).toBe(true);
    expect(orgB.created).toBe(true);
    expect(orgA.reservation.organizationId).toBe('org-a');
    expect(orgB.reservation.organizationId).toBe('org-b');
    expect(orgA.reservation.reservedCredits).toBe(3);
    expect(orgB.reservation.reservedCredits).toBe(7);

    // Settling org-a's import never touches org-b's reservation.
    await ledger.attachJob('org-a', 'shared-key', 'job-a');
    await ledger.attachJob('org-b', 'shared-key', 'job-b');
    await ledger.settleByJob('org-a', 'job-a', true, 3);
    expect((await ledger.findByKey('org-b', 'shared-key'))?.state).toBe('RESERVED');
  });

  it('EXPERT #27-4 — ownership: another organization cannot settle or read the reservation', async () => {
    const ledger = new ImportCreditLedger();
    await ledger.reserve({ organizationId: 'org-owner', key: 'k', reservedCredits: 2 });
    await ledger.attachJob('org-owner', 'k', 'job-x');

    await expect(ledger.settleByJob('org-intruder', 'job-x', true, 2)).rejects.toMatchObject({
      code: 'BILLING_RESERVATION_FOREIGN',
    });
    expect(await ledger.getByJob('org-intruder', 'job-x')).toBeUndefined();
    expect((await ledger.getByJob('org-owner', 'job-x'))?.state).toBe('RESERVED');
  });

  it('settleByJob throws when no reservation exists', async () => {
    const ledger = new ImportCreditLedger();
    await expect(ledger.settleByJob('o', 'missing', true, 1)).rejects.toMatchObject({
      code: 'BILLING_RESERVATION_MISSING',
    });
  });
});

describe('estimateImportReservation', () => {
  it('is at least 1 credit and scales with staged file count', () => {
    expect(estimateImportReservation(0)).toBe(1);
    expect(estimateImportReservation(3)).toBe(3);
    expect(estimateImportReservation(-5)).toBe(1);
  });
});
