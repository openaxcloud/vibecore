import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  accountDataEn,
  accountDataFr,
  formatAccountDataDate,
  formatAccountDataNumber,
  formatAccountDataPlural,
  getAccountDataPageCopy,
  getAccountSettingsLayoutCopy,
  localizeDeletionScopeItem,
  resolveAccountDataActionErrorCode,
} from './account-data';

const sourceFiles = [
  'app/routes/account-settings.tsx',
  'app/routes/account-settings._index.tsx',
  'app/routes/account-settings.data.tsx',
] as const;

function leafPaths(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') {
    return [prefix];
  }

  if (Array.isArray(value)) {
    return value.flatMap((nested, index) => leafPaths(nested, `${prefix}.${index}`));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value).flatMap(([key, nested]) => leafPaths(nested, prefix ? `${prefix}.${key}` : key));
}

function stringLeaves(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(stringLeaves);
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.values(value).flatMap(stringLeaves);
}

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

describe('account data EN/FR catalog', () => {
  it('keeps complete leaf and interpolation-token parity', () => {
    expect(leafPaths(accountDataFr).sort()).toEqual(leafPaths(accountDataEn).sort());

    const english = stringLeaves(accountDataEn);
    const french = stringLeaves(accountDataFr);

    expect(french).toHaveLength(english.length);

    for (const [index, value] of english.entries()) {
      expect(interpolationTokens(french[index] ?? ''), value).toEqual(interpolationTokens(value));
      expect(french[index]?.trim().length, value).toBeGreaterThan(0);
    }

    expect(french.filter((value, index) => value === english[index])).toEqual(['Ada Lovelace', 'ada@example.com']);
  });

  it('falls back to English for unsupported locales', () => {
    expect(getAccountSettingsLayoutCopy('de').tabs.data).toBe('Data & privacy');
    expect(getAccountDataPageCopy('es').status.title).toBe('Account status');
  });

  it('uses reviewed French account, privacy and deletion terminology', () => {
    expect(getAccountSettingsLayoutCopy('fr').tabs.connected).toBe('Comptes connectés');
    expect(getAccountSettingsLayoutCopy('fr').tabs.data).toBe('Données et confidentialité');
    expect(getAccountDataPageCopy('fr').status.labels.grace_period).toBe('Suppression en attente');
    expect(getAccountDataPageCopy('fr').dialog.requestDeletion).toBe('Demander la suppression du compte');
  });

  it('formats dates, numbers and grace-period plurals with French Intl rules', () => {
    const copy = getAccountDataPageCopy('fr');

    expect(formatAccountDataNumber(1234567.5, 'fr')).toBe('1 234 567,5');
    expect(formatAccountDataDate('2026-08-04T12:30:00.000Z', 'fr')).toBe('4 août 2026, 12:30');
    expect(
      formatAccountDataPlural('fr', 1, {
        one: copy.status.daysToCancel_one,
        other: copy.status.daysToCancel_other,
      }),
    ).toBe('Vous avez 1 jour pour annuler.');
    expect(
      formatAccountDataPlural('fr', 14, {
        one: copy.status.daysToCancel_one,
        other: copy.status.daysToCancel_other,
      }),
    ).toBe('Vous avez 14 jours pour annuler.');
  });

  it('localizes fixed server scope labels and masks unknown French values', () => {
    expect(localizeDeletionScopeItem('Projects and workspaces', 'deleted', 'fr')).toBe('Projets et espaces de travail');
    expect(localizeDeletionScopeItem('Security audit logs (limited window)', 'retained', 'fr')).toBe(
      'Journaux d’audit de sécurité (durée limitée)',
    );
    expect(localizeDeletionScopeItem('New server-only English category', 'deleted', 'fr')).toBe(
      'Autres données du compte',
    );
    expect(localizeDeletionScopeItem('New server-only English category', 'deleted', 'en')).toBe(
      'New server-only English category',
    );
  });

  it('maps client failures to safe catalog codes', () => {
    expect(resolveAccountDataActionErrorCode(403, 'request')).toBe('requestRejected');
    expect(resolveAccountDataActionErrorCode(409, 'cancel')).toBe('cannotCancel');
    expect(resolveAccountDataActionErrorCode(429, 'request')).toBe('rateLimited');
    expect(resolveAccountDataActionErrorCode(400, 'request')).toBe('requestFailed');
  });

  it('has zero source-scanner findings in both rendered routes', async () => {
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');

    const findings = sourceFiles.flatMap((file) => {
      const result = scanSource(readFileSync(file, 'utf8'), file);

      expect(result.parseErrors, file).toEqual([]);

      return result.findings;
    });

    expect(findings).toEqual([]);
  });
});
