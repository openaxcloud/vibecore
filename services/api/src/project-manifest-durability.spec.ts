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

describe('MANIFEST-DURABILITY-001 — l’archive du projet suit-elle les écritures ?', () => {
  it('DÉFAUT CONSTATÉ : la persistance du manifeste n’existe que sur les chemins en masse', () => {
    const appels = [...APP.matchAll(/await persistProjectFileManifest\(/g)].length;

    expect(appels, 'la fonction doit exister et être utilisée').toBeGreaterThan(0);

    /*
     * Onze appels, TOUS sur des chemins en masse : création (vide, modèle, IA),
     * imports (commit, GitHub ×2, zip), `/files/import/zip`, restauration de
     * point de sauvegarde, duplication, restauration d'instantané. Si ce compte
     * change, quelqu'un a touché à la persistance — et il faut relire ce fichier.
     *
     * Le compte a d'abord été lu à 5 sur un `head -6` tronqué. Il est ici pour
     * que la prochaine lecture soit exacte, pas approximative.
     */
    expect(appels, 'appels à persistProjectFileManifest').toBe(11);
  });

  it.each(ROUTES_ECRITURE)('DÉFAUT CONSTATÉ : %s n’écrit pas dans le manifeste', (ancre) => {
    expect(corpsDuHandler(ancre)).not.toContain('persistProjectFileManifest');
  });

  it('DÉFAUT CONSTATÉ : le plan de reseed supprime ce que l’archive ignore', () => {
    const reseed = readFileSync(join(__dirname, '..', '..', '..', 'app', 'lib', 'runtime', 'workspace-reseed.ts'), 'utf8');
    const plan = reseed.slice(reseed.indexOf('export function planReseedDeletions'));

    /* La ligne exacte qui provoque la perte : absent de l'archive → supprimé. */
    expect(plan).toMatch(/if \(!archivePaths\.has\(relative\)\) \{\s*deletions\.push\(node\.path\);/);
  });

  /*
   * L'INVARIANT VISÉ. Rouge tant que le défaut est là, ce qui est voulu :
   * `it.fails` réussit tant que le corps échoue. Le jour où une route d'écriture
   * persiste le manifeste, CE test devient rouge et force à retirer les
   * « DÉFAUT CONSTATÉ » ci-dessus. C'est la recette du correctif.
   */
  it.fails('INVARIANT VISÉ : au moins une route d’écriture doit rendre l’archive durable', () => {
    const durable = ROUTES_ECRITURE.some((ancre) => corpsDuHandler(ancre).includes('persistProjectFileManifest'));

    expect(durable, 'aucune route d’écriture ne persiste le manifeste du projet').toBe(true);
  });
});
