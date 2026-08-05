import { describe, expect, it } from 'vitest';
import {
  formatProjectEnvCopy,
  getProjectEnvCopy,
  getProjectEnvPluralKey,
  getProjectEnvScopeLabel,
  projectEnvEn,
  projectEnvFr,
} from './project-env';

describe('project environment i18n catalog', () => {
  it('keeps exact English and French key parity', () => {
    expect(Object.keys(projectEnvFr).sort()).toEqual(Object.keys(projectEnvEn).sort());
  });

  it('uses English as the fallback and resolves French explicitly', () => {
    expect(getProjectEnvCopy('de')).toBe(projectEnvEn);
    expect(getProjectEnvCopy()).toBe(projectEnvEn);
    expect(getProjectEnvCopy('fr-CA')).toBe(projectEnvFr);
  });

  it('formats localized scopes and plurals without changing interpolated values', () => {
    const copy = getProjectEnvCopy('fr');
    expect(getProjectEnvScopeLabel('development', copy)).toBe('Développement');
    expect(getProjectEnvPluralKey('projectEnv.diff.summary', 1, 'fr')).toBe('projectEnv.diff.summary_one');
    expect(getProjectEnvPluralKey('projectEnv.diff.summary', 2, 'fr')).toBe('projectEnv.diff.summary_other');
    expect(
      formatProjectEnvCopy(copy['projectEnv.delete.ariaLabel'], {
        key: 'VITE_API_URL',
        scope: 'Production',
      }),
    ).toBe('Supprimer VITE_API_URL de l’environnement Production');
  });
});
