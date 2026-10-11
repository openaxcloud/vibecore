import { describe, expect, it } from 'vitest';

import { billingDisplayName, billingLedgerReason } from './billing';

describe('billing history PAYG labels', () => {
  it('labels tracking-only PAYG entries as recorded overage in both languages', () => {
    expect(billingDisplayName('PAYG_CHARGE', 'en')).toBe('Recorded PAYG overage');
    expect(billingDisplayName('PAYG_CHARGE', 'fr')).toBe('Dépassement PAYG enregistré');
  });

  it('preserves the API reason and leaves unrelated ledger labels unchanged', () => {
    for (const reason of [
      'PAYG overage recorded; invoicing status unverified',
      'Dépassement PAYG enregistré ; état de facturation non vérifié',
      'Future metering event: manual reconciliation required',
      'Ajustement demandé par le client',
    ]) {
      expect(billingLedgerReason(reason, 'en')).toBe(reason);
      expect(billingLedgerReason(reason, 'fr')).toBe(reason);
    }

    expect(billingDisplayName('CONSUMPTION', 'en')).toBe('Credit consumption');
    expect(billingDisplayName('CONSUMPTION', 'fr')).toBe('Consommation de crédits');
    expect(billingDisplayName('REFUND', 'en')).toBe('Refund');
    expect(billingDisplayName('ADJUSTMENT', 'fr')).toBe('Ajustement manuel');
  });
});
