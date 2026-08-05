import { translateAdmin, type AdminTranslationKey } from '~/lib/i18n/catalogs/admin';
import { detectUserLanguage, setUserLanguagePreference, type SupportedLanguage } from '~/lib/i18n/language';

export type AdminLanguage = 'en' | 'fr';

export function getAdminLanguage(): AdminLanguage {
  return detectUserLanguage() === 'fr' ? 'fr' : 'en';
}

export function adminStandaloneT(key: AdminTranslationKey, values?: Readonly<Record<string, string | number>>): string {
  return translateAdmin(getAdminLanguage(), key, values);
}

export function adminPluralT(singularKey: AdminTranslationKey, pluralKey: AdminTranslationKey, count: number): string {
  return adminStandaloneT(count === 1 ? singularKey : pluralKey, { count });
}

export function localizedAdminError(error: unknown, fallbackKey: AdminTranslationKey): string {
  const message = error instanceof Error ? error.message : '';

  if (/mfa[_\s-]*(?:code[_\s-]*)?required/i.test(message)) {
    return adminStandaloneT('admin.standalone.mfaRequired');
  }

  return adminStandaloneT(fallbackKey);
}

export function adminStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return '—';
  }

  const labels: Readonly<Record<string, AdminTranslationKey>> = {
    active: 'admin.standalone.status.active',
    disabled: 'admin.standalone.status.disabled',
    expired: 'admin.standalone.status.expired',
    resolved: 'admin.standalone.status.resolved',
    open: 'admin.standalone.status.open',
    pending: 'admin.standalone.status.pending',
    running: 'admin.standalone.status.running',
    starting: 'admin.standalone.status.starting',
    healthy: 'admin.standalone.status.healthy',
    configured: 'admin.standalone.status.ready',
    ready: 'admin.standalone.status.ready',
    degraded: 'admin.standalone.status.degraded',
    failed: 'admin.standalone.status.failed',
  };

  const key = labels[status.trim().toLowerCase()];

  return key ? adminStandaloneT(key) : status;
}

/** Present stable credit-ledger kind codes as localized operator-facing labels. */
export function adminLedgerKindLabel(kind: string | null | undefined): string {
  if (!kind) {
    return '—';
  }

  const labels: Readonly<Record<string, AdminTranslationKey>> = {
    ADJUSTMENT: 'admin.standalone.ledgerKind.adjustment',
    CONSUMPTION: 'admin.standalone.ledgerKind.consumption',
    GRANT: 'admin.standalone.ledgerKind.grant',
    EXPIRY: 'admin.standalone.ledgerKind.expiry',
    PAYG_CHARGE: 'admin.standalone.ledgerKind.paygCharge',
  };
  const normalized = kind.trim().toUpperCase();
  const key = labels[normalized];

  return key ? adminStandaloneT(key) : kind;
}

export function selectAdminLanguage(language: AdminLanguage): void {
  setUserLanguagePreference(language as SupportedLanguage);

  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
    document.documentElement.dir = 'ltr';
  }
}

export function initializeAdminLanguage(): AdminLanguage {
  const language = getAdminLanguage();

  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
    document.documentElement.dir = 'ltr';
  }

  return language;
}

export function adminLocale(language = getAdminLanguage()): string {
  return language === 'fr' ? 'fr-FR' : 'en-US';
}
