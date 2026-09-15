import { describe, expect, it } from 'vitest';

import { ReconciliationUneFois } from './reconciliation-une-fois.js';

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
});
