import { describe, expect, it } from 'vitest';

import {
  clientRuntimeResidualEn,
  clientRuntimeResidualFr,
  formatClientRuntimeResidualCopy,
  formatClientRuntimeResidualDateTime,
  formatClientRuntimeResidualNumber,
  formatClientRuntimeUndoFailure,
  getClientRuntimeConnectorError,
  getClientRuntimeResidualCopy,
} from './client-runtime-residual';

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

describe('client runtime residual catalog', () => {
  it('keeps complete English and French catalogs with matching interpolation tokens', () => {
    expect(Object.keys(clientRuntimeResidualFr).sort()).toEqual(Object.keys(clientRuntimeResidualEn).sort());

    for (const key of Object.keys(clientRuntimeResidualEn) as Array<keyof typeof clientRuntimeResidualEn>) {
      expect(clientRuntimeResidualEn[key].trim().length, key).toBeGreaterThan(0);
      expect(clientRuntimeResidualFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(clientRuntimeResidualFr[key]), key).toEqual(
        interpolationTokens(clientRuntimeResidualEn[key]),
      );
    }
  });

  it('selects French regional locales and falls back to English elsewhere', () => {
    expect(getClientRuntimeResidualCopy('fr-CA')).toBe(clientRuntimeResidualFr);
    expect(getClientRuntimeResidualCopy('de-DE')).toBe(clientRuntimeResidualEn);
  });

  it('formats French interpolation, numbers, and undo plurals', () => {
    expect(
      formatClientRuntimeResidualCopy(clientRuntimeResidualFr['clientRuntime.connection.connectedAs'], {
        provider: 'GitHub',
        account: 'avi',
      }),
    ).toBe('Connexion à GitHub établie en tant que avi.');
    expect(formatClientRuntimeResidualNumber(1234, 'fr')).toBe('1 234');
    expect(formatClientRuntimeResidualNumber(1234.5, 'fr', { minimumFractionDigits: 1 })).toBe('1 234,5');
    expect(formatClientRuntimeResidualDateTime('2026-08-05T12:34:56.000Z', 'fr')).toBe(
      new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'medium' }).format(
        new Date('2026-08-05T12:34:56.000Z'),
      ),
    );
    expect(formatClientRuntimeResidualDateTime('not-a-date', 'fr')).toBe('Non disponible');
    expect(formatClientRuntimeUndoFailure(1, 'fr')).toContain('une modification');
    expect(formatClientRuntimeUndoFailure(1234, 'fr')).toContain('1 234 modifications');
  });

  it('maps connector failures to reviewed copy without exposing provider errors', () => {
    expect(getClientRuntimeConnectorError('POPUP_BLOCKED', 'GitLab', 'fr')).toContain('fenêtre d’autorisation');
    expect(getClientRuntimeConnectorError('RAW_PROVIDER_FAILURE', 'GitLab', 'fr')).toBe(
      'Impossible de terminer la connexion à GitLab. Réessayez.',
    );
  });
});
