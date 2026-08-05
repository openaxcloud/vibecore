import { afterEach, describe, expect, it, vi } from 'vitest';

import { adminLedgerKindLabel, adminLocale, adminPluralT, adminStandaloneT, localizedAdminError } from './i18n';

describe('standalone admin i18n', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the active browser preference for French copy and formatting locale', () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' });
    vi.stubGlobal('document', { cookie: '' });
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    });

    expect(adminStandaloneT('admin.standalone.users_57f2b1')).toBe('Utilisateurs');
    expect(adminLocale()).toBe('fr-FR');
  });

  it('selects plural forms and localizes unsafe API errors', () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' });
    vi.stubGlobal('document', { cookie: '' });
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    });

    expect(
      adminPluralT('admin.standalone.openSecurityEvents_one', 'admin.standalone.openSecurityEvents_other', 1),
    ).toBe('1 événement de sécurité ouvert');
    expect(
      adminPluralT('admin.standalone.openSecurityEvents_one', 'admin.standalone.openSecurityEvents_other', 3),
    ).toBe('3 événements de sécurité ouverts');
    expect(localizedAdminError(new Error('internal upstream stack'), 'admin.standalone.panelLoadFailed')).not.toContain(
      'internal upstream stack',
    );
    expect(adminLedgerKindLabel('CONSUMPTION')).toBe('Consommation');
    expect(adminLedgerKindLabel('PAYG_CHARGE')).toBe('Frais PAYG');
    expect(adminLedgerKindLabel('FUTURE_KIND')).toBe('FUTURE_KIND');
  });
});
