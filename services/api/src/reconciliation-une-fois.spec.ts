import { describe, expect, it } from 'vitest';

import { INTERVALLE_FORCAGE_MS, ReconciliationUneFois } from './reconciliation-une-fois.js';

describe('une réconciliation par ouverture, pas par lecture d’arborescence', () => {
  it('rend vrai la première fois', () => {
    expect(new ReconciliationUneFois().doitReconcilier('ws-1')).toBe(true);
  });

  it('les 54 lectures suivantes ne déclenchent RIEN — c’est la limitation', () => {
    const garde = new ReconciliationUneFois();

    expect(garde.doitReconcilier('ws-1')).toBe(true);
    expect(Array.from({ length: 54 }, () => garde.doitReconcilier('ws-1')).filter(Boolean)).toEqual([]);
  });

  it('deux workspaces sont indépendants', () => {
    const garde = new ReconciliationUneFois();

    expect(garde.doitReconcilier('ws-1')).toBe(true);
    expect(garde.doitReconcilier('ws-2'), 'un autre projet a droit à la sienne').toBe(true);
  });

  it('un reprovisionnement rend le workspace de nouveau éligible', () => {
    const garde = new ReconciliationUneFois();

    garde.doitReconcilier('ws-1');
    garde.oublier('ws-1');

    expect(garde.doitReconcilier('ws-1'), 'pod neuf = fichiers peut-être manquants').toBe(true);
  });

  it('un identifiant vide ne consomme pas de place', () => {
    const garde = new ReconciliationUneFois();

    expect(garde.doitReconcilier('')).toBe(false);
    expect(garde.taille).toBe(0);
  });

  it('oublier un workspace jamais vu ne casse rien', () => {
    const garde = new ReconciliationUneFois();
    garde.oublier('jamais-vu');

    expect(garde.doitReconcilier('jamais-vu')).toBe(true);
  });

  /*
   * BUG-IDE-007 — « Actualiser les fichiers » demandé par l'utilisateur.
   * Mesuré le 15/08 : Bibliothèque 9 → 10 fichiers après le clic, Git 20, le
   * stockage 20. La réconciliation d'ouverture avait déjà eu lieu ; rien ne
   * réparait une désynchronisation survenue après.
   */
  it('un rafraîchissement demandé par l’utilisateur peut forcer, même après la réconciliation d’ouverture', () => {
    const garde = new ReconciliationUneFois();

    expect(garde.doitReconcilier('ws-1')).toBe(true);
    expect(garde.doitReconcilier('ws-1'), 'la garde d’ouverture est consommée').toBe(false);
    expect(garde.peutForcer('ws-1', 1_000), 'le clic de l’utilisateur passe quand même').toBe(true);
  });

  it('deux forçages rapprochés ne relisent pas deux fois le projet — un par intervalle', () => {
    const garde = new ReconciliationUneFois();

    expect(garde.peutForcer('ws-1', 1_000)).toBe(true);
    expect(garde.peutForcer('ws-1', 1_000 + INTERVALLE_FORCAGE_MS - 1), 'double-clic : refusé').toBe(false);
    expect(garde.peutForcer('ws-1', 1_000 + INTERVALLE_FORCAGE_MS), 'intervalle écoulé : accepté').toBe(true);
  });

  it('un forçage vaut aussi pour l’ouverture : pas de seconde réconciliation d’ouverture derrière', () => {
    const garde = new ReconciliationUneFois();

    expect(garde.peutForcer('ws-1', 1_000)).toBe(true);
    expect(garde.doitReconcilier('ws-1')).toBe(false);
  });

  it('le reprovisionnement remet aussi le forçage à zéro', () => {
    const garde = new ReconciliationUneFois();

    garde.peutForcer('ws-1', 1_000);
    garde.oublier('ws-1');

    expect(garde.peutForcer('ws-1', 1_001), 'pod neuf : le prochain clic répare tout de suite').toBe(true);
  });

  it('un identifiant vide ne force rien', () => {
    expect(new ReconciliationUneFois().peutForcer('', 1_000)).toBe(false);
  });
});
