import { describe, expect, it } from 'vitest';

import {
  clientVisibleErrorsEn,
  clientVisibleErrorsFr,
  formatAutoApplyFailure,
  formatBedrockConfigFailure,
  formatClientVisibleErrorCopy,
  formatLocalModelHealthFailure,
  formatSnapshotRestoreFailure,
  formatTerminalSpawnFailure,
  getClientVisibleErrorsCopy,
} from './client-visible-errors';

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

describe('client visible errors catalog', () => {
  it('keeps complete English and French catalogs with matching interpolation tokens', () => {
    expect(Object.keys(clientVisibleErrorsFr).sort()).toEqual(Object.keys(clientVisibleErrorsEn).sort());

    for (const key of Object.keys(clientVisibleErrorsEn) as Array<keyof typeof clientVisibleErrorsEn>) {
      expect(clientVisibleErrorsEn[key].trim().length, key).toBeGreaterThan(0);
      expect(clientVisibleErrorsFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(clientVisibleErrorsFr[key]), key).toEqual(
        interpolationTokens(clientVisibleErrorsEn[key]),
      );
    }
  });

  it('selects French regional locales and falls back to English elsewhere', () => {
    expect(getClientVisibleErrorsCopy('fr-CA')).toBe(clientVisibleErrorsFr);
    expect(getClientVisibleErrorsCopy('de-DE')).toBe(clientVisibleErrorsEn);
  });

  it('formats terminal, rollback and Bedrock validation failures in both languages', () => {
    expect(formatTerminalSpawnFailure('managed', 'fr')).toBe('Impossible de démarrer le shell géré.');
    expect(formatSnapshotRestoreFailure('snapshotMissing', 'fr')).toContain('n’est plus disponible');
    expect(formatBedrockConfigFailure('invalidFormat', 'fr')).toContain('accessKeyId');
    expect(formatBedrockConfigFailure('missingCredentials', 'en')).toContain('secretAccessKey');
  });

  it('preserves paths, providers, HTTP codes and CORS_ERROR while translating the surrounding copy', () => {
    expect(formatAutoApplyFailure('src/Écran.tsx', 'permission', 'fr')).toContain('src/Écran.tsx');
    expect(formatLocalModelHealthFailure({ kind: 'http', provider: 'Ollama', status: 503 }, 'fr')).toBe(
      'Le point de terminaison Ollama a renvoyé le code HTTP 503.',
    );

    const cors = formatLocalModelHealthFailure({ kind: 'cors', provider: 'LM Studio' }, 'fr');
    expect(cors).toContain('CORS_ERROR');
    expect(cors).toContain('LM Studio');
    expect(cors).toContain('E-Code');
  });

  it('does not emit raw interpolation tokens when all values are supplied', () => {
    expect(
      formatClientVisibleErrorCopy(clientVisibleErrorsFr['clientErrors.autoApply.review'], {
        file: 'src/App.tsx',
      }),
    ).toBe('Impossible d’appliquer les modifications à src/App.tsx — vérifiez-les.');
  });
});
