import { describe, expect, it } from 'vitest';
import { resolvePendingSelectedFile } from './pending-selected-file';

/*
 * BUG-PANEL-PERF-004. Le correctif retire `projectFiles` des dépendances de
 * l'effet de restauration : celui-ci ne rejoue donc PLUS quand les fichiers
 * arrivent. Tout le rattrapage repose maintenant sur ce résolveur. S'il casse,
 * le symptôme utilisateur est « mon fichier ne se rouvre pas », et plus rien
 * d'autre ne l'attrape.
 */
describe('resolvePendingSelectedFile', () => {
  const files = {
    '/home/project/src/App.tsx': { type: 'file' },
    '/home/project/src': { type: 'folder' },
    '/home/project/README.md': { type: 'file' },
  };

  it('resolves an exact path once the file has arrived', () => {
    expect(resolvePendingSelectedFile(files, '/home/project/src/App.tsx')).toBe('/home/project/src/App.tsx');
  });

  it('returns nothing while the map is still empty (the deferral must keep waiting)', () => {
    expect(resolvePendingSelectedFile({}, '/home/project/src/App.tsx')).toBeUndefined();
  });

  it('falls back to a suffix match when the persisted path is relative', () => {
    expect(resolvePendingSelectedFile(files, 'src/App.tsx')).toBe('/home/project/src/App.tsx');
  });

  it('never resolves to a folder', () => {
    expect(resolvePendingSelectedFile(files, '/home/project/src')).toBeUndefined();
    expect(resolvePendingSelectedFile(files, 'src')).toBeUndefined();
  });

  it('returns nothing when nothing is pending', () => {
    expect(resolvePendingSelectedFile(files, undefined)).toBeUndefined();
  });
});
