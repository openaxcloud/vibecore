import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * Sept specs remplacent `FilesStore` par une classe écrite à la main, et rien
 * ne les relie à la vraie. Une méthode ajoutée à `FilesStore` puis appelée
 * depuis `WorkbenchStore` ne les fait pas rougir : elle fait REJETER une
 * promesse hors de tout test.
 *
 * Mesuré sur #349 — `setSelectedFile` s'est mis à appeler `adoptRemoteContent`,
 * et l'intégration continue a rendu « 44 unhandled errors » qui ne désignaient
 * AUCUNE assertion, sur six suites sans rapport avec le changement. Le coût
 * n'est pas le rouge : c'est le temps perdu à chercher d'où il vient.
 *
 * POURQUOI UN FIL-PIÈGE ET PAS UNE VÉRIFICATION D'INTERFACE. Premier essai :
 * exiger que chaque doublure expose TOUS les membres appelés. Mesuré : 112
 * manques, parce qu'une doublure n'implémente que la tranche que sa spec
 * exerce — et c'est très bien ainsi. La garde aurait imposé trente méthodes
 * mortes par fichier pour se taire.
 *
 * Ce qui manquait n'était pas une interface, c'était un MOMENT : celui où
 * quelqu'un ajoute un appel et ne pense pas aux doublures. La liste ci-dessous
 * est ce moment. L'allonger coûte dix secondes ; ne pas y penser coûte une
 * demi-journée de journaux illisibles.
 */
const MEMBRES_CONNUS: readonly string[] = [
  'adoptRemoteContent',
  'createFile',
  'createFolder',
  'deleteFile',
  'deleteFolder',
  'files',
  'filesCount',
  'getDeletedPaths',
  'getFile',
  'getFileModifications',
  'getModifiedFiles',
  'isFileLocked',
  'isFolderLocked',
  'lockFile',
  'lockFolder',
  'reloadFromRuntime',
  'replaceWithProjectStorageFiles',
  'resetFileModifications',
  'saveFile',
  'setDeletedPaths',
  'setRuntime',
  'unlockFile',
  'unlockFolder',
];

const STORES = new URL('.', import.meta.url).pathname;

function membresAppeles(): string[] {
  const source = readFileSync(join(STORES, 'workbench.ts'), 'utf8');

  return [
    ...new Set([...source.matchAll(/this\.#filesStore\.([A-Za-z_$][\w$]*)/gu)].map((trouve) => trouve[1])),
  ].sort();
}

function specsAvecDoublure(): string[] {
  return readdirSync(STORES)
    .filter((nom) => nom.endsWith('.spec.ts') || nom.endsWith('.spec.tsx'))
    .filter((nom) => readFileSync(join(STORES, nom), 'utf8').includes('FilesStore: class {'));
}

describe('les doublures de FilesStore restent au courant', () => {
  it('la mesure a bien mesuré quelque chose', () => {
    expect(membresAppeles().length).toBeGreaterThan(15);
    expect(specsAvecDoublure().length).toBeGreaterThan(3);
  });

  it(
    'aucun membre nouveau n’est appelé sur #filesStore sans passer par la liste — ' +
      'si ce test rougit : ajoutez le membre ci-dessus ET vérifiez les doublures qu’il traverse',
    () => {
      expect(membresAppeles().filter((membre) => !MEMBRES_CONNUS.includes(membre))).toEqual([]);
    },
  );

  it('la liste ne garde pas un membre que plus personne n’appelle', () => {
    const appeles = membresAppeles();

    expect(MEMBRES_CONNUS.filter((membre) => !appeles.includes(membre))).toEqual([]);
  });
});
