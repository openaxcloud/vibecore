import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * FILES-CLOBBER-001 — BUG-CREATE-010, la vraie cause.
 *
 * Trace mesurée sur la production le 2026-08-31, avec preuve à chaque saut :
 *
 *   1. `Ctrl+S` dans l'éditeur, frappe VÉRIFIÉE présente dans Monaco ;
 *   2. le navigateur émet `PUT /api/projects/<id>/ide-state`, dont la charge
 *      porte `files.entries[README.md].content` = **le contenu d'origine**, sans
 *      la frappe. Le client renvoie la photo du manifeste prise à l'ouverture ;
 *   3. côté serveur, `mergeProjectIdeState` faisait `{ ...existing, ...incoming }`
 *      — `chat`, `ui` et `collaboration` étaient protégés, `files` NON — donc la
 *      photo périmée REMPLAÇAIT le manifeste ;
 *   4. à la réouverture depuis un contexte neuf, `planReseedDeletions` fait
 *      converger le pod vers ce manifeste : le travail disparaît.
 *
 * Le commentaire du nœud `collaboration` décrivait déjà exactement ce risque :
 * « a shallow `...incoming` spread would let one user's save replace the entire
 * node ». Le même raisonnement manquait pour `files`.
 *
 * POURQUOI LE PREMIER CORRECTIF A ÉCHOUÉ, et pourquoi ce test existe : j'avais
 * accroché la persistance à `PUT /files/write`, déduite de `files.ts:881` sans
 * vérifier que `Ctrl+S` y aboutit. La trace montre que la sauvegarde normale
 * n'appelle PAS cette route — et que même quand elle l'appelle, le `PUT
 * ide-state` qui suit écrasait le résultat. Un correctif posé sur un chemin
 * déduit plutôt que mesuré.
 */

const APP = readFileSync(join(__dirname, 'app.ts'), 'utf8');

function corpsDeLaFusion() {
  const debut = APP.indexOf('function mergeProjectIdeState(');

  expect(debut, 'mergeProjectIdeState introuvable : le test ne mesure rien').toBeGreaterThan(-1);

  const suite = APP.slice(debut);
  const fin = suite.indexOf('\n}\n');

  expect(fin, 'fin de fonction introuvable').toBeGreaterThan(0);

  return suite.slice(0, fin);
}

describe('FILES-CLOBBER-001 — un manifeste périmé ne peut plus écraser le récent', () => {
  it('la sonde lit bien la fonction de fusion', () => {
    const corps = corpsDeLaFusion();

    expect(corps.length, 'corps vide').toBeGreaterThan(500);
    expect(corps).toContain('...incoming');
  });

  it('le nœud `files` est protégé, comme `chat`, `ui` et `collaboration`', () => {
    const corps = corpsDeLaFusion();

    /*
     * On vérifie le MÉCANISME, pas un nom de variable : il doit exister une
     * comparaison d'horodatage sur le manifeste et une réinjection conditionnelle
     * de la version existante. Un test accroché à un identifiant précis raterait
     * une implémentation correcte écrite autrement — l'erreur commise sur la
     * recette du premier correctif.
     */
    expect(corps).toMatch(/incoming\.files/);
    expect(corps).toMatch(/existing\.files/);
    expect(corps).toMatch(/updatedAt/);
    expect(corps).toMatch(/files: existing\.files/);
  });

  it('les trois autres nœuds gardent leur protection', () => {
    const corps = corpsDeLaFusion();

    expect(corps).toContain('chat: mergedChat');
    expect(corps).toContain('collaboration: mergedCollaboration');
    expect(corps).toMatch(/ui: \{ \.\.\.ideStateRecord\(existing\.ui\), \.\.\.ideStateRecord\(incoming\.ui\) \}/);
  });
});
