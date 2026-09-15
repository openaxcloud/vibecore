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

/**
 * Les routes de MUTATION de fichier exposées par l'API runtime.
 *
 * ⚠️ Cette constante existait déjà — DÉCLARÉE MAIS JAMAIS UTILISÉE. C'est très
 * exactement le trou par lequel BUG-RUNTIME-DIVERGENCE est passé : la durabilité
 * n'avait été posée que sur `/files/write`, et rien ne s'en apercevait puisque
 * la liste des routes à couvrir n'était bouclée nulle part. On la boucle
 * maintenant, renommage inclus.
 */
const ROUTES_MUTATION = [
  "app.put('/api/runtime/workspaces/:workspaceId/files/write'",
  "app.post('/api/runtime/workspaces/:workspaceId/files'",
  "app.delete('/api/runtime/workspaces/:workspaceId/files'",
  "app.post('/api/runtime/workspaces/:workspaceId/files/move'",
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

  it.each(ROUTES_MUTATION)('%s rend l’archive durable', (ancre) => {
    /*
     * BUG-RUNTIME-DIVERGENCE — les trois routes autres que l'écriture
     * n'atteignaient que le pod. Au réamorçage, le fichier créé était détruit,
     * le supprimé ressuscitait, le renommage revenait en arrière.
     */
    const corps = corpsDuHandler(ancre);

    expect(corps, `aucune persistance du manifeste sur ${ancre}`).toMatch(
      /(persistProjectFileEntry|removeProjectFileEntries|moveProjectFileEntries)\(/,
    );
  });

  it.each(ROUTES_MUTATION)('%s reste hors du trajet du flux de génération', (ancre) => {
    expect(corpsDuHandler(ancre)).toMatch(/!estEcritureDeFlux\(request\)/);
  });

  it('aucune mutation unitaire ne FABRIQUE un manifeste à partir de rien', () => {
    /*
     * LE garde-fou du manifeste autoritaire. `listProjectFilesIncludingIdeState`
     * traite `Array.isArray(files.entries)` comme « ce manifeste fait foi » et
     * appelle `restoreSnapshot`, qui VIDE l'arbre avant de réécrire les seules
     * entrées reçues. Un manifeste d'UNE entrée né d'une sauvegarde unitaire
     * détruisait donc tous les autres fichiers du projet à la lecture suivante.
     *
     * Les quatre mutations unitaires passent par un seul point, et ce point
     * renonce quand il n'y a pas déjà un manifeste.
     */
    const bloc = APP.slice(
      APP.indexOf('function entreesDuManifeste('),
      APP.indexOf('function cheminDansLeSousArbre('),
    );

    expect(bloc, 'le point de passage unique a disparu').not.toHaveLength(0);

    /* `entreesDuManifeste` ne rend un tableau que s'il en existe DÉJÀ un… */
    expect(bloc).toMatch(/Array\.isArray\(racine\.files\?\.entries\)\s*\?/);

    /* …et le point de passage renonce quand il n'y en a pas. */
    expect(bloc).toMatch(/if \(!entreesActuelles \|\| !manifesteChange\(/);
  });

  it('une mutation SANS effet n’écrit pas — la version du blob partagé ne monte pas pour rien', () => {
    /*
     * `mutateProjectIdeState` appelle `upsertProjectIdeState` SANS comparer :
     * un « rien à faire » exprimé à l'intérieur produirait quand même une
     * écriture et une montée de version. Or l'IDE revalide ce blob par
     * `If-None-Match` (AUDX-167) et il n'est pas borné — une montée gratuite
     * fait repayer le rechargement complet à chaque suppression sans effet.
     */
    const bloc = APP.slice(
      APP.indexOf('async function mutateProjectFileManifestEntries('),
      APP.indexOf('function cheminDansLeSousArbre('),
    );

    /* La décision est prise AVANT d'entrer dans la boucle qui écrit. */
    expect(bloc.indexOf('manifesteChange(')).toBeLessThan(bloc.indexOf('await mutateProjectIdeState('));
  });

  it('la suppression d’un sous-arbre est ancrée sur le séparateur', () => {
    /*
     * `startsWith('src')` emporterait `src-old/`. Sur un manifeste autoritaire,
     * un voisin retiré par erreur est un fichier DÉTRUIT sur tous les appareils
     * au réamorçage suivant, pas un affichage faux.
     */
    const bloc = APP.slice(APP.indexOf('function cheminDansLeSousArbre('));

    expect(bloc.slice(0, 900)).toContain('startsWith(`${racine}/`)');
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
