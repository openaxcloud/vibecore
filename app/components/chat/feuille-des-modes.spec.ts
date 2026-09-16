/*
 * Les deux écrans de la feuille, vérifiés sans monter un composant.
 *
 * Chaque assertion porte une promesse faite à un utilisateur :
 *   ce que je vois à droite d'un mode correspond à ce qui tournera ;
 *   ce qui est grisé est grisé pour une raison que je peux lire ;
 *   un modèle en panne ne disparaît pas — il revient dès le rechargement ;
 *   le curseur ne m'offre jamais un cran que le modèle refuse.
 */
import { CATALOGUE_INTEGRE, type SondeFournisseur } from '@vibecore/billing';
import { describe, expect, it } from 'vitest';

import { entreesDuMode, etatDuCurseur, ligneDeMode, lignesDuSelecteur, type ChoixDuMode } from './feuille-des-modes';

const catalogue = (mode: string) => CATALOGUE_INTEGRE.find((c) => c.mode === mode);

/** L'état réel du 2026-09-16. */
const EN_PANNE: SondeFournisseur[] = [
  { fournisseur: 'openai', etat: 'joignable' },
  { fournisseur: 'google', etat: 'joignable' },
  { fournisseur: 'anthropic', etat: 'sans-credit' },
  { fournisseur: 'moonshot', etat: 'sans-credit' },
];

const TOUT_VA_BIEN: SondeFournisseur[] = EN_PANNE.map((s) => ({ ...s, etat: 'joignable' }));

describe('écran 1 — la liste des modes', () => {
  it('affiche « Auto » tant que rien n’est choisi, et dit ce qu’Auto désigne', () => {
    const ligne = ligneDeMode('max', 'max', undefined, catalogue('max'), TOUT_VA_BIEN);

    expect(ligne.valeur.sorte).toBe('auto');
    expect(ligne.valeur.sorte === 'auto' && ligne.valeur.modeleResolu).toBe('kimi-k3');
  });

  it('ce qu’« Auto » désigne suit ce qui répond, pas une constante', () => {
    const ligne = ligneDeMode('max', 'max', undefined, catalogue('max'), EN_PANNE);

    expect(ligne.valeur.sorte === 'auto' && ligne.valeur.modeleResolu).toBe('gpt-5.6-sol');
  });

  it('affiche le modèle dès que l’utilisateur en a choisi un', () => {
    const choix: ChoixDuMode = { modele: 'claude-opus-5' };
    const ligne = ligneDeMode('max', 'max', choix, catalogue('max'), TOUT_VA_BIEN);

    expect(ligne.valeur).toEqual({ sorte: 'modele', model: 'claude-opus-5', serviceTier: undefined });
  });

  it('Lite verrouille ses réglages, et dit pourquoi', () => {
    const lite = ligneDeMode('lite', 'lite', undefined, catalogue('lite'), TOUT_VA_BIEN);

    expect(lite.reglagesVerrouilles).toBe(true);
    expect(lite.raisonDuVerrou).toBe('passer-a-power-ou-max');
  });

  it('Power et Max ne verrouillent rien', () => {
    for (const mode of ['power', 'max'] as const) {
      const ligne = ligneDeMode(mode, mode, undefined, catalogue(mode), TOUT_VA_BIEN);

      expect(ligne.reglagesVerrouilles, `${mode} ne devrait pas être verrouillé`).toBe(false);
      expect(ligne.raisonDuVerrou).toBeUndefined();
    }
  });

  it('les deux entrées à chevron suivent le verrou du mode', () => {
    expect(entreesDuMode('lite').every((e) => e.verrouillee)).toBe(true);
    expect(entreesDuMode('power').every((e) => e.verrouillee)).toBe(false);
    expect(entreesDuMode('lite').map((e) => e.sorte)).toEqual(['modele', 'avance']);
  });
});

describe('écran 2 — le choix du modèle', () => {
  it('« Choisir pour moi » est toujours en tête, et nomme le modèle qu’il désigne', () => {
    const lignes = lignesDuSelecteur(catalogue('max')!, TOUT_VA_BIEN, undefined);

    expect(lignes[0].sorte).toBe('automatique');
    expect(lignes[0].choisie, 'sélectionnée tant que l’utilisateur n’a rien choisi').toBe(true);
    expect(lignes[0].modeleResolu).toBe('kimi-k3');
  });

  it('les modèles en panne RESTENT dans la liste, marqués', () => {
    const lignes = lignesDuSelecteur(catalogue('max')!, EN_PANNE, undefined);
    const modeles = lignes.filter((l) => l.sorte === 'modele');

    expect(modeles).toHaveLength(catalogue('max')!.modeles.length);

    const opus = modeles.find((m) => m.model === 'claude-opus-5' && !m.serviceTier)!;

    expect(opus.etat).toBe('momentanement-indisponible');
    expect(opus.raison).toBe('credit-fournisseur');
  });

  it('les deux entrées « fast » se distinguent de leur modèle standard', () => {
    const lignes = lignesDuSelecteur(catalogue('max')!, TOUT_VA_BIEN, { modele: 'claude-opus-5', serviceTier: 'fast' });
    const choisies = lignes.filter((l) => l.choisie);

    expect(choisies, 'une seule ligne cochée').toHaveLength(1);
    expect(choisies[0].serviceTier).toBe('fast');
  });

  it('choisir un modèle décoche « Choisir pour moi »', () => {
    const lignes = lignesDuSelecteur(catalogue('power')!, TOUT_VA_BIEN, { modele: 'claude-sonnet-5' });

    expect(lignes[0].choisie).toBe(false);
  });
});

describe('le curseur d’effort', () => {
  it('cinq crans sur un modèle qui en déclare cinq', () => {
    const etat = etatDuCurseur(catalogue('max'), TOUT_VA_BIEN, { modele: 'claude-opus-5' });

    expect(etat.actif).toBe(true);
    expect(etat.crans).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });

  it('quatre crans sur Sonnet 4.6 — un curseur figé à cinq proposerait xhigh, refusé', () => {
    const etat = etatDuCurseur(catalogue('power'), TOUT_VA_BIEN, { modele: 'claude-sonnet-4-6' });

    expect(etat.crans).toHaveLength(4);
    expect(etat.crans).not.toContain('xhigh');
  });

  it('désactivé quand le modèle ne déclare aucun cran', () => {
    const etat = etatDuCurseur(catalogue('lite'), TOUT_VA_BIEN, { modele: 'claude-haiku-4-5' });

    expect(etat.actif).toBe(false);
    expect(etat.crans).toEqual([]);
  });

  it('un cran choisi que le modèle refuse ne survit pas au changement de modèle', () => {
    const etat = etatDuCurseur(catalogue('power'), TOUT_VA_BIEN, {
      modele: 'claude-sonnet-4-6',
      effort: 'xhigh',
    });

    expect(etat.valeur, 'xhigh n’est pas dans l’échelle de Sonnet 4.6').not.toBe('xhigh');
    expect(etat.crans).toContain(etat.valeur);
  });

  it('sans choix, il suit le modèle qu’« Auto » désigne', () => {
    const etat = etatDuCurseur(catalogue('max'), EN_PANNE, undefined);

    // Auto retient gpt-5.6-sol quand Anthropic et Moonshot sont à sec.
    expect(etat.crans).toEqual(['minimal', 'low', 'medium', 'high']);
  });

  it('aucun modèle joignable : pas de curseur, et pas de faux cran', () => {
    const toutEnPanne: SondeFournisseur[] = EN_PANNE.map((s) => ({ ...s, etat: 'sans-credit' }));
    const etat = etatDuCurseur(catalogue('max'), toutEnPanne, undefined);

    expect(etat.actif).toBe(false);
    expect(etat.valeur).toBeUndefined();
  });
});
