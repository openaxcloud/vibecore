import { beforeEach, describe, expect, it } from 'vitest';
import {
  chargementMemoireProjetEnEchec,
  demanderUnNouvelEssaiMemoireProjet,
  nouvelEssaiMemoireProjet,
  reinitialiserEchecMemoireProjetPourTest,
} from './projectMemoryLoadFailure';

beforeEach(reinitialiserEchecMemoireProjetPourTest);

describe('échec de chargement de la mémoire de projet', () => {
  it('un nouvel essai efface l’échec ET relance la lecture', () => {
    /*
     * Les deux comptent. Effacer l'échec sans relancer laisserait un panneau
     * vide SANS message — pire que l'état de départ. Relancer sans effacer
     * laisserait l'avertissement affiché par-dessus une conversation revenue.
     */
    chargementMemoireProjetEnEchec.set(true);

    const avant = nouvelEssaiMemoireProjet.get();

    demanderUnNouvelEssaiMemoireProjet();

    expect(chargementMemoireProjetEnEchec.get(), 'l’avertissement doit disparaître').toBe(false);
    expect(nouvelEssaiMemoireProjet.get(), 'la lecture doit être relancée').toBe(avant + 1);
  });

  it('deux essais successifs relancent deux fois', () => {
    demanderUnNouvelEssaiMemoireProjet();
    demanderUnNouvelEssaiMemoireProjet();

    expect(nouvelEssaiMemoireProjet.get()).toBe(2);
  });
});
