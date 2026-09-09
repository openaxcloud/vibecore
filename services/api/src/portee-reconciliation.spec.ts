import { describe, expect, it } from 'vitest';

import { doitEcrireDansWorkspace } from './portee-reconciliation.js';

describe('la réconciliation ne remplace jamais un fichier vivant qui diffère', () => {
  it('LA GARDE — un fichier présent au contenu DIFFÉRENT n’est pas écrasé sur un workspace chaud', () => {
    const ecrire = doitEcrireDansWorkspace({ present: true, contenuIdentique: false, workspaceChaud: true });

    expect(ecrire, 'src/App.tsx édité par l’utilisateur serait écrasé par la version du stockage').toBe(false);
  });

  it('NON-ÉVÉNEMENT — un workspace complet ne produit AUCUNE écriture', () => {
    const fichiers = Array.from({ length: 32 }, () => ({
      present: true,
      contenuIdentique: true,
      workspaceChaud: true,
    }));

    expect(fichiers.filter(doitEcrireDansWorkspace), 'zéro écriture, donc zéro rechargement Vite').toEqual([]);
  });

  it('le cas d’Avi reste réparé : un fichier ABSENT est posé même à chaud', () => {
    expect(doitEcrireDansWorkspace({ present: false, workspaceChaud: true })).toBe(true);
  });

  it('à FROID, un divergent est encore écrit — le pod part de vide, c’est l’ensemencement', () => {
    expect(doitEcrireDansWorkspace({ present: true, contenuIdentique: false, workspaceChaud: false })).toBe(true);
  });

  it('un fichier identique n’est jamais réécrit, à froid comme à chaud', () => {
    expect(doitEcrireDansWorkspace({ present: true, contenuIdentique: true, workspaceChaud: false })).toBe(false);
    expect(doitEcrireDansWorkspace({ present: true, contenuIdentique: true, workspaceChaud: true })).toBe(false);
  });

  it('un absent est posé à froid aussi', () => {
    expect(doitEcrireDansWorkspace({ present: false, workspaceChaud: false })).toBe(true);
  });
});
