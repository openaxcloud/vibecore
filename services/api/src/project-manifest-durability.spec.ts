import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MANIFEST-DURABILITY-001 — **la preuve, écrite AVANT le correctif.**
 *
 * `BUG-CREATE-010`, reproduit sur la production le 2026-08-31 : tout le travail
 * fait dans l'IDE est perdu à la première ouverture depuis un autre appareil.
 *
 * Le mécanisme tient en deux faits, tous deux vérifiés ici sur la source :
 *
 *   1. `persistProjectFileManifest` n'est appelée que par des chemins EN MASSE —
 *      création de projet, imports, `/files/import/zip` (déclenché à la fermeture
 *      d'un artefact de l'agent), restaurations, duplication. **Aucune route
 *      d'écriture fichier par fichier ne la rappelle**, donc une modification
 *      faite à la main dans l'éditeur n'atteint jamais l'archive.
 *   2. Au rechargement, `planReseedDeletions` fait converger le pod VERS cette
 *      archive : « fichier du pod absent de l'archive → supprimé ».
 *
 * Mesure de production à l'appui : après un `Ctrl+S` dont la frappe avait été
 * vérifiée dans l'éditeur, le runtime contenait le marqueur et l'archive restait
 * à **23 octets, `updatedAt` 08:07:35** — la valeur de la création. Après
 * réouverture depuis un contexte neuf, le marqueur avait disparu.
 *
 * Ce fichier sert de HARNAIS DE RECETTE : le jour où le correctif arrive,
 * `it.fails` passe au rouge et force à retirer la description du défaut. On saura
 * donc que le correctif marche, au lieu de l'espérer.
 */

const APP = readFileSync(join(__dirname, 'app.ts'), 'utf8');

/** Les routes d'écriture de fichier exposées par l'API runtime. */
const ROUTES_ECRITURE = [
  "app.put('/api/runtime/workspaces/:workspaceId/files/write'",
  "app.post('/api/runtime/workspaces/:workspaceId/files'",
  "app.delete('/api/runtime/workspaces/:workspaceId/files'",
];

/** Corps d'un handler, du `app.<verbe>(` jusqu'au début du suivant. */
function corpsDuHandler(ancre: string): string {
  const debut = APP.indexOf(ancre);

  expect(debut, `route introuvable : ${ancre}`).toBeGreaterThan(-1);

  const suite = APP.slice(debut + ancre.length);
  const fin = suite.search(/\n {2}app\.(get|put|post|patch|delete)\(/);

  return fin === -1 ? suite : suite.slice(0, fin);
}

/**
 * Version FIX de la spec : sur la branche de préparation elle prouvait le défaut
 * (`it.fails`), ici elle impose l'invariant.
 *
 * ⚠️ La première version cherchait littéralement `persistProjectFileManifest`
 * dans le corps de la route. Le correctif utilise `persistProjectFileEntry` — la
 * variante INCRÉMENTALE, parce que la première remplace le manifeste entier et
 * qu'une sauvegarde unitaire ne connaît qu'un chemin. La recette ne basculait
 * donc pas, alors que le correctif était bien là : **un test accroché à un nom
 * précis rate la bonne implémentation**. Il vérifie maintenant le PRÉFIXE
 * commun, et surtout le comportement observable — le marqueur d'origine.
 */
describe('MANIFEST-DURABILITY-001 — l’archive du projet suit les écritures humaines', () => {
  it('la route d’écriture rend l’archive durable', () => {
    const corps = corpsDuHandler("app.put('/api/runtime/workspaces/:workspaceId/files/write'");

    expect(corps, 'aucune persistance du manifeste sur la route d’écriture').toMatch(
      /persistProjectFile(Entry|Manifest)\(/,
    );
  });

  it('mais PAS sur le trajet du flux de génération', () => {
    /*
     * Le garde-fou de coût. Sans lui, un correctif « qui marche » mettrait ~37
     * mutations du blob `ide-state` partagé par fichier généré.
     */
    const corps = corpsDuHandler("app.put('/api/runtime/workspaces/:workspaceId/files/write'");

    expect(corps).toMatch(/!estEcritureDeFlux\(request\)/);
  });

  it('le client marque ses écritures de flux, et seulement elles', () => {
    const runner = readFileSync(join(__dirname, '..', '..', '..', 'app', 'lib', 'runtime', 'action-runner.ts'), 'utf8');

    expect(runner).toMatch(/writeFile\(relativePath, payload, \{ streaming: isStreaming \}\)/);

    const remote = readFileSync(
      join(__dirname, '..', '..', '..', 'packages', 'runtime-remote', 'src', 'index.ts'),
      'utf8',
    );

    expect(remote).toMatch(/'x-vc-write-origin': 'stream'/);
  });

  it('l’échec de persistance ne fait pas échouer l’écriture', () => {
    /*
     * Le fichier est déjà dans le pod : rendre 5xx ferait reprendre l'appelant
     * sur une écriture qui a réussi, et la reprise est justement ce qui a produit
     * la tempête de 468 requêtes du 21/08.
     */
    const corps = corpsDuHandler("app.put('/api/runtime/workspaces/:workspaceId/files/write'");

    /*
     * Ancré sur l'APPEL, pas sur la première mention : le commentaire au-dessus
     * cite le nom, et partir de là mesurait de la prose.
     */
    const bloc = corps.slice(corps.indexOf('await persistProjectFileEntry('));

    expect(bloc.slice(0, 400)).toMatch(/catch \(error\)/);
    expect(bloc.slice(0, 400)).toMatch(/request\.log\.error/);
  });

  it('le plan de reseed supprime toujours ce que l’archive ignore', () => {
    /*
     * Inchangé, et c'est voulu : une fois l'archive à jour, cette convergence
     * devient la bonne opération. C'est elle qui retire du pod ce que
     * l'utilisateur a réellement supprimé.
     */
    const reseed = readFileSync(
      join(__dirname, '..', '..', '..', 'app', 'lib', 'runtime', 'workspace-reseed.ts'),
      'utf8',
    );

    const plan = reseed.slice(reseed.indexOf('export function planReseedDeletions'));

    expect(plan).toMatch(/if \(!archivePaths\.has\(relative\)\) \{\s*deletions\.push\(node\.path\);/);
  });
});
