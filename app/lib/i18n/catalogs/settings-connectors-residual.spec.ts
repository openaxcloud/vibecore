import { describe, expect, it } from 'vitest';

import {
  formatDebugIssueSummary,
  formatGitHubProfileMetric,
  formatSettingsConnectorsResidualCopy,
  formatSettingsConnectorsResidualDateTime,
  getSafeDebugIssueMessage,
  getSettingsConnectorsResidualCopy,
  settingsConnectorsResidualEn,
  settingsConnectorsResidualFr,
} from './settings-connectors-residual';

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

describe('settings connectors residual catalog', () => {
  it('keeps complete English and French catalogs with matching interpolation tokens', () => {
    expect(Object.keys(settingsConnectorsResidualFr).sort()).toEqual(Object.keys(settingsConnectorsResidualEn).sort());

    for (const key of Object.keys(settingsConnectorsResidualEn) as Array<keyof typeof settingsConnectorsResidualEn>) {
      expect(settingsConnectorsResidualEn[key].trim().length, key).toBeGreaterThan(0);
      expect(settingsConnectorsResidualFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(settingsConnectorsResidualFr[key]), key).toEqual(
        interpolationTokens(settingsConnectorsResidualEn[key]),
      );
    }
  });

  it('falls back to English for unsupported locales', () => {
    expect(getSettingsConnectorsResidualCopy('de-DE')).toBe(settingsConnectorsResidualEn);
    expect(getSettingsConnectorsResidualCopy('fr-CA')).toBe(settingsConnectorsResidualFr);
  });

  it('formats interpolation, numbers, plurals, and locale-aware dates', () => {
    expect(
      formatSettingsConnectorsResidualCopy(settingsConnectorsResidualFr['settingsResidual.apiKey.connect'], {
        provider: 'Vercel',
      }),
    ).toBe('Se connecter à Vercel (clé API)');
    expect(formatGitHubProfileMetric('repositories', 1, 'fr')).toBe('1 dépôt public');
    expect(formatGitHubProfileMetric('repositories', 2, 'fr')).toBe('2 dépôts publics');
    expect(formatGitHubProfileMetric('followers', 1234, 'fr')).toContain('1 234');
    expect(formatDebugIssueSummary(2, 'fr')).toBe('2 problèmes détectés');
    expect(formatSettingsConnectorsResidualDateTime('not-a-date', 'fr')).toBeNull();
    expect(formatSettingsConnectorsResidualDateTime('2026-08-05T10:30:00.000Z', 'fr')).toContain('2026');
  });

  it('maps known and arbitrary debug issues to reviewed copy', () => {
    expect(getSafeDebugIssueMessage({ id: 'high-memory-usage', type: 'warning' }, 'fr')).toBe(
      'Utilisation élevée de la mémoire détectée',
    );
    expect(getSafeDebugIssueMessage({ id: 'error-private', type: 'error' }, 'fr')).toBe(
      'Une erreur de l’application a été enregistrée',
    );
  });
});
