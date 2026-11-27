import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

import { describe, expect, it } from 'vitest';

/*
 * Des specs remplacent `FilesStore` par une classe écrite à la main, et rien
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
  'hasPendingSaves',
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

function membresAppeles(source = readFileSync(join(STORES, 'workbench.ts'), 'utf8')): string[] {
  const tree = ts.createSourceFile('workbench.ts', source, ts.ScriptTarget.Latest, true);
  const membres = new Set<string>();

  function visite(node: ts.Node) {
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const store = node.expression;

      if (
        ts.isPropertyAccessExpression(store) &&
        store.expression.kind === ts.SyntaxKind.ThisKeyword &&
        ts.isPrivateIdentifier(store.name) &&
        store.name.text === '#filesStore'
      ) {
        if (ts.isPropertyAccessExpression(node)) {
          membres.add(node.name.text);
        } else if (ts.isStringLiteralLike(node.argumentExpression)) {
          membres.add(node.argumentExpression.text);
        } else {
          throw new Error('Cannot verify which FilesStore member a computed access uses');
        }
      }
    }

    ts.forEachChild(node, visite);
  }

  visite(tree);

  return [...membres].sort();
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

  it('reconnaît les accès coupés par le formatage sans compter les commentaires ou chaînes', () => {
    expect(
      membresAppeles(`
      class Workbench {
        #filesStore;
        example() {
          this.#filesStore
            /* commentaire entre la cible et la méthode */
            .adoptRemoteContent('audit.txt');
          this.#filesStore?.hasPendingSaves();
          this.#filesStore['saveFile']();
          // this.#filesStore.fakeMethod();
          return "this.#filesStore.anotherFake";
        }
      }
    `),
    ).toEqual(['adoptRemoteContent', 'hasPendingSaves', 'saveFile']);
    expect(() => membresAppeles('this.#filesStore[unknownMember]()')).toThrow();
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
