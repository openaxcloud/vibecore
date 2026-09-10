import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * BUG-E2E-BEFOREALL-BUDGET-001 — un montage qui dépasse son délai fait échouer
 * des tests qui n'ont JAMAIS ÉTÉ TENTÉS.
 *
 * Mesuré le 2026-09-10, dans le canari WebKit iPhone du run E2E de #527 :
 *
 *     "beforeAll" hook timeout of 30000ms exceeded.
 *       > 142 |   test.beforeAll(async ({ request }) => {
 *     1 flaky · 9 passed
 *
 * Le fil de test n'a jamais été semé. Le test a donc été compté `flaky` alors
 * qu'aucune assertion produit n'avait été tentée — un rouge qui ne dit rien du
 * produit, et pire, qui use la tolérance qu'on accorde aux vrais rouges.
 *
 * LE MÉCANISME, et il est structurel, pas accidentel : `playwright.config.ts`
 * fixe `timeout: 30_000`. Les tests s'accordent ensuite 180 s chacun par
 * `test.setTimeout` — mais un `test.setTimeout` posé DANS un test n'atteint pas
 * le hook. Tout `beforeAll` qui fait du réseau (inscription limitée par IP,
 * création de projet, semis d'une transcription) travaille donc sous un budget
 * six fois plus court que les tests qu'il prépare.
 *
 * LA RÈGLE, PAS L'OCCURRENCE (règle 7). `agent-composer-panel-viewport` avait
 * DÉJÀ rencontré ce piège et l'avait corrigé chez lui, avec un commentaire qui
 * l'explique très bien. Trois autres fichiers portaient exactement le même
 * défaut, et le commentaire n'en a protégé aucun — parce qu'un commentaire ne
 * protège que le fichier où il est écrit (règle 15).
 */

const E2E = join(__dirname, '..', 'e2e');

/** Les hooks `beforeAll` de la suite E2E, avec leur corps. */
function hooksDeMontage(): Array<{ fichier: string; ligne: number; corps: string }> {
  const trouves: Array<{ fichier: string; ligne: number; corps: string }> = [];

  for (const nom of readdirSync(E2E).filter((f) => f.endsWith('.spec.ts'))) {
    const source = readFileSync(join(E2E, nom), 'utf8');

    for (
      let index = source.indexOf('test.beforeAll(');
      index !== -1;
      index = source.indexOf('test.beforeAll(', index + 1)
    ) {
      /*
       * Le corps s'arrête à la fermeture du hook, indentée de deux espaces —
       * la forme qu'impose prettier dans toute cette suite. Sans borne, on
       * lirait le fichier entier et n'importe quel `test.setTimeout` d'un test
       * situé plus bas ferait passer la garde : le vert creux exact qu'on
       * cherche à éviter.
       */
      const fin = source.indexOf('\n  });', index);

      trouves.push({
        fichier: nom,
        ligne: source.slice(0, index).split('\n').length,
        corps: source.slice(index, fin === -1 ? source.length : fin),
      });
    }
  }

  return trouves;
}

describe('BUG-E2E-BEFOREALL-BUDGET-001 — un montage E2E a le budget de ce qu’il fait', () => {
  const hooks = hooksDeMontage();

  it('la recherche a porté — sinon « aucun hook fautif » ne voudrait rien dire', () => {
    /*
     * Règle 14. Une liste vide passerait la boucle suivante sans rien vérifier,
     * et un renommage de `test.beforeAll` suffirait à rendre cette garde muette
     * pour toujours.
     */
    expect(
      hooks.length,
      'aucun `test.beforeAll` trouvé dans tests/e2e — la garde ne mesure plus rien',
    ).toBeGreaterThanOrEqual(4);

    // Témoin positif : le fichier qui a corrigé le piège le premier est bien lu.
    const temoin = hooks.find((h) => h.fichier === 'agent-composer-panel-viewport.spec.ts');
    expect(temoin, 'le hook témoin est introuvable').toBeDefined();
    expect(temoin!.corps).toContain('test.setTimeout(');
  });

  it('le corps extrait s’arrête bien au hook, pas au fichier entier', () => {
    /*
     * Contrôle de la MESURE elle-même (règle 4) : un corps qui déborderait
     * jusqu'aux tests attraperait leur `test.setTimeout` et rendrait la garde
     * vide de sens. Aucun corps de hook n'a de raison d'être long.
     */
    for (const hook of hooks) {
      expect(hook.corps.length, `${hook.fichier}:${hook.ligne} — corps de hook anormalement long`).toBeLessThan(2_000);
    }
  });

  it('chaque `beforeAll` relève son propre délai — le défaut du canari WebKit', () => {
    const fautifs = hooks
      .filter((hook) => !hook.corps.includes('test.setTimeout('))
      .map((hook) => `${hook.fichier}:${hook.ligne}`);

    expect(
      fautifs,
      `ces montages travaillent sous les 30 s par défaut alors que leurs tests s’accordent 180 s : ${fautifs.join(', ')}`,
    ).toEqual([]);
  });
});
