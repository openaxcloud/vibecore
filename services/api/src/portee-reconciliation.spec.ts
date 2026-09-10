import { describe, expect, it } from 'vitest';

import { doitEcrireDansWorkspace, espaceStabilise } from './portee-reconciliation.js';

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

  describe('un espace en cours de démarrage n’est pas un espace amputé', () => {
    /*
     * Un fichier ABSENT pendant que le pod démarre n'est pas un fichier perdu :
     * c'est un fichier pas encore arrivé. La réconciliation ne sait pas faire la
     * différence — elle voit « absent » et écrit. Sur un pod en cours
     * d'ensemencement, elle écrit donc tout, et déclenche le rechargement que
     * `ide-panel-smoke` interdit.
     *
     * Rien ne presse : un fichier réellement perdu le sera encore dans dix
     * secondes.
     */
    it('un workspace VIDE n’est pas stabilisé — on ne réconcilie pas', () => {
      expect(espaceStabilise({ fichiersPresents: 0, workspaceChaud: true })).toBe(false);
    });

    it('TÉMOIN POSITIF — dès qu’un fichier est arrivé, l’espace est stabilisé', () => {
      expect(espaceStabilise({ fichiersPresents: 1, workspaceChaud: true })).toBe(true);
    });

    it('à FROID, un espace vide est au contraire le cas NORMAL de l’ensemencement', () => {
      expect(espaceStabilise({ fichiersPresents: 0, workspaceChaud: false }), 'le pod part de vide').toBe(true);
    });

    it('le cas d’Avi reste couvert : 30 fichiers présents, 3 manquants', () => {
      expect(espaceStabilise({ fichiersPresents: 30, workspaceChaud: true })).toBe(true);
    });
  });
});
