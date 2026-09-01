import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * QUOTA-FANTOMES-001 — BUG-CREATE-001 : le quota comptait des lignes de base de
 * données, pas des espaces de travail qui tournent.
 *
 * MESURÉ EN PRODUCTION le 2026-09-01 :
 *
 *   | espaces comptés ACTIFS par le quota          | 198 |
 *   | pods d'espace réellement en cours (cluster)  |   2 |
 *
 * Un facteur 99. Répartition en base : 125 `RUNNING`, 63 `PENDING`,
 * 10 `STARTING` — et **196 non touchés depuis plus de 24 h**, le plus récent des
 * morts datant de onze jours. Chaque ligne morte retenait son créneau
 * indéfiniment ; un utilisateur au plafond ne pouvait plus créer un seul projet,
 * et rien ne le lui disait (BUG-CREATE-002).
 *
 * LE SEUIL N'EST PAS ARBITRAIRE. Les données montrent une séparation nette :
 *
 *   |  1 h |    0 actifs |
 *   |  6 h |    2 actifs |  ← les deux qui ont un pod
 *   | 24 h |    2 actifs |
 *   | 72 h |    2 actifs |
 *
 * Aucun seuil entre 6 h et 72 h ne change le résultat. 6 h est retenu comme le
 * plus conservateur de ce palier.
 *
 * DEUX MOITIÉS, là encore. Corriger le comptage empêche le problème de grossir ;
 * il ne libère pas les 196 créneaux déjà bloqués. La réconciliation remet les
 * lignes mortes à STOPPED. **Sans elle, personne n'est débloqué.**
 */

const STORE = readFileSync(join(__dirname, 'prisma-store.ts'), 'utf8');

function corpsDeMethode(nom: string): string {
  const debut = STORE.indexOf(`async ${nom}(`);

  expect(debut, `${nom} introuvable : le test ne mesure rien`).toBeGreaterThan(-1);

  /*
   * Le corps commence après la parenthèse FERMANTE des paramètres, pas au
   * premier `{` : une signature comme `(options: { dryRun?: boolean } = {})`
   * contient une accolade AVANT le corps. Partir du premier `{` capturait
   * l'objet de paramètres — le test échouait alors sur une extraction fausse,
   * pas sur le code.
   */
  let profParen = 0;
  let finParams = -1;

  for (let i = STORE.indexOf('(', debut); i < STORE.length; i += 1) {
    if (STORE[i] === '(') {
      profParen += 1;
    } else if (STORE[i] === ')') {
      profParen -= 1;

      if (profParen === 0) {
        finParams = i;
        break;
      }
    }
  }

  expect(finParams, `signature de ${nom} illisible`).toBeGreaterThan(-1);

  const ouvrante = STORE.indexOf('{', finParams);

  let profondeur = 0;

  for (let i = ouvrante; i < STORE.length; i += 1) {
    if (STORE[i] === '{') {
      profondeur += 1;
    } else if (STORE[i] === '}') {
      profondeur -= 1;

      if (profondeur === 0) {
        return STORE.slice(ouvrante, i);
      }
    }
  }

  return STORE.slice(ouvrante);
}

describe('QUOTA-FANTOMES-001 — le quota ne compte plus les espaces morts', () => {
  it('la sonde lit bien le store', () => {
    expect(corpsDeMethode('countActiveWorkspaces').length, 'corps vide').toBeGreaterThan(50);
  });

  it('le comptage exclut les lignes périmées', () => {
    const corps = corpsDeMethode('countActiveWorkspaces');

    /*
     * On vérifie le MÉCANISME — une borne de fraîcheur sur `updatedAt` — et non
     * un nom de constante, pour ne pas rater une implémentation correcte écrite
     * autrement.
     */
    expect(corps).toMatch(/updatedAt/);
    expect(corps).toMatch(/gte/);
    expect(corps, 'le comptage doit rester borné aux statuts actifs').toMatch(/PENDING/);
  });


  it('AUCUNE écriture en base : le correctif ne doit rien armer', () => {
    /*
     * `STOPPED` n'est pas un état neutre : le ramasse-miettes supprime un espace
     * STOPPED après 24 h, PVC compris. Une réconciliation qui remettrait les 196
     * lignes périmées à STOPPED armerait donc leur suppression. Vérifié AVANT de
     * livrer, pas après. Ce test empêche de la réintroduire sans y penser.
     */
    expect(STORE).not.toMatch(/reconcileStaleWorkspaces/);
    expect(corpsDeMethode('countActiveWorkspaces')).not.toMatch(/updateMany|update\(/);
  });
});
