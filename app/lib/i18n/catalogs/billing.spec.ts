import { describe, expect, it } from 'vitest';

import {
  billingDisplayName,
  billingEn,
  billingFr,
  billingMessage,
  billingLedgerReason,
  formatBillingCurrency,
  formatBillingDate,
  formatBillingNumber,
} from './billing';

describe('billing translation catalog', () => {
  it('keeps English and French keys and interpolation tokens in exact parity', () => {
    expect(Object.keys(billingFr).sort()).toEqual(Object.keys(billingEn).sort());

    for (const key of Object.keys(billingEn) as Array<keyof typeof billingEn>) {
      const tokens = (value: string) => [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/gu)].map((match) => match[1]).sort();
      expect(tokens(billingFr[key]), key).toEqual(tokens(billingEn[key]));
    }
  });

  it('interpolates typed server-safe messages', () => {
    expect(billingMessage('en', 'billing.spend.used', { spent: '€2.00', cap: '€5.00' })).toBe('€2.00 of €5.00 used');
    expect(billingMessage('fr', 'billing.spend.used', { spent: '2,00 €', cap: '5,00 €' })).toBe(
      '2,00 € utilisés sur 5,00 €',
    );
  });

  it('localizes known API identifiers without exposing raw keys in French', () => {
    expect(billingDisplayName('projects.count', 'en')).toBe('Projects');
    expect(billingDisplayName('projects.count', 'fr')).toBe('Projets');
    expect(billingDisplayName('CUSTOM_API_CALLS', 'fr')).toBe('Appels d’API personnalisés');
    expect(billingDisplayName('unknown.internal_key', 'fr')).toBe('Activité enregistrée');
  });

  it('localizes system-generated ledger reasons while preserving administrator notes', () => {
    expect(billingLedgerReason('rollover cap exceeded', 'fr')).toBe('Plafond de report dépassé');
    expect(billingLedgerReason('pro 2026-08 grant', 'fr')).toBe('Attribution de crédits Pro pour août 2026');
    expect(billingLedgerReason('Ajustement demandé par Avi', 'fr')).toBe('Ajustement demandé par Avi');
  });

  it('formats French numbers, UTC dates and the actual currency without conversion', () => {
    expect(formatBillingNumber(1234567.5, 'fr')).toBe('1 234 567,5');
    expect(formatBillingCurrency(123456, 'EUR', 'fr')).toBe('1 234,56 €');
    expect(formatBillingCurrency(123456, 'USD', 'fr')).toMatch(/^1 234,56 \$US$/u);
    expect(formatBillingDate('2026-08-04T18:30:00.000Z', 'fr')).toBe('04 août 2026');
  });
});
