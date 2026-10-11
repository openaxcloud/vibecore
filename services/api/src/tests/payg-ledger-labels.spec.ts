import { afterEach, describe, expect, it, vi } from 'vitest';

import { localizeCreditLedgerReason } from '../app-public-copy.js';

const persistedReason = 'PAYG overage (billed to Stripe metered usage)';
const expected = {
  en: 'PAYG overage recorded; invoicing status unverified',
  fr: 'Dépassement PAYG enregistré ; état de facturation non vérifié',
} as const;

describe('PAYG ledger labels do not claim an unverified invoice', () => {
  afterEach(() => vi.unstubAllEnvs());

  for (const locale of ['en', 'fr'] as const) {
    for (const enabled of ['true', 'false']) {
      it(`renders existing rows without inferring their historical status from creditsEnabled=${enabled} (${locale})`, () => {
        vi.stubEnv('BILLING_CREDITS_ENABLED', enabled);
        vi.stubEnv('BILLING_CREDITS_SHADOW', enabled === 'true' ? 'false' : 'true');

        // The same persisted reason is written for shadow, skipped, failed and
        // reported metering. It is never evidence of an invoice or payment.
        expect(localizeCreditLedgerReason(persistedReason, 'PAYG_CHARGE', locale)).toBe(expected[locale]);
      });
    }

    it(`preserves new or operator-authored reasons rather than inventing their status (${locale})`, () => {
      for (const reason of ['', 'Future metering event: manual reconciliation required', 'Customer adjustment']) {
        expect(localizeCreditLedgerReason(reason, 'PAYG_CHARGE', locale)).toBe(reason);
      }

      expect(localizeCreditLedgerReason(persistedReason, 'ADJUSTMENT', locale)).toBe(persistedReason);
      expect(localizeCreditLedgerReason(persistedReason, 'UNKNOWN_NEW_KIND', locale)).toBe(persistedReason);
    });
  }

  it('keeps non-PAYG consumption and grant localization intact', () => {
    expect(localizeCreditLedgerReason('workspace compute', 'CONSUMPTION', 'en')).toBe('Workspace compute');
    expect(localizeCreditLedgerReason('workspace compute', 'CONSUMPTION', 'fr')).toBe('Calcul de l’espace de travail');
    expect(localizeCreditLedgerReason('pro monthly grant', 'GRANT', 'fr')).toBe('Attribution mensuelle du forfait pro');
    expect(localizeCreditLedgerReason('rollover cap exceeded', 'EXPIRY', 'fr')).toBe('Plafond de report dépassé');
  });
});
