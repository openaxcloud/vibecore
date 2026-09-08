import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  clavierProbablementOuvert,
  decalageAAnnulerClavierOuvert,
  recouvrementBasDuNavigateur,
  retrecissementDeLaVue,
  SEUIL_CLAVIER_PX,
} from './visual-viewport-bottom';

/*
 * La fonction est IMPORTÉE du module que le composant utilise. Une première
 * version la redéfinissait dans le fichier de test : elle aurait été verte quoi
 * qu'il arrive au produit — c'est le défaut de méthode le plus coûteux qu'on ait
 * identifié aujourd'hui, un test qui protège sa propre copie.
 */

describe('recouvrement bas du navigateur', () => {
  it('vaut la hauteur de la barre Safari quand elle est affichée', () => {
    // iPhone 15 Pro : 852 de mise en page, 765 de visuel quand la barre est là.
    expect(recouvrementBasDuNavigateur(852, { height: 765, offsetTop: 0 })).toBe(87);
  });

  it('retombe à zéro quand la barre est masquée', () => {
    expect(recouvrementBasDuNavigateur(852, { height: 852, offsetTop: 0 })).toBe(0);
  });

  it('tient compte du décalage quand la page est zoomée ou décalée', () => {
    expect(recouvrementBasDuNavigateur(852, { height: 700, offsetTop: 50 })).toBe(102);
  });

  it('ne rend jamais de valeur négative — une réserve négative repousserait le panneau SOUS la barre', () => {
    expect(recouvrementBasDuNavigateur(600, { height: 800, offsetTop: 0 })).toBe(0);
  });

  it('vaut zéro sans `visualViewport` — on ne réserve pas ce qu’on ne sait pas mesurer', () => {
    expect(recouvrementBasDuNavigateur(852, undefined)).toBe(0);
  });
});

describe('clavier probablement ouvert', () => {
  it('la barre Safari seule (44 à 84 px) n’est pas un clavier', () => {
    expect(clavierProbablementOuvert(0)).toBe(false);
    expect(clavierProbablementOuvert(44)).toBe(false);
    expect(clavierProbablementOuvert(84)).toBe(false);
  });

  it('un clavier iPhone (260 à 340 px) l’est, dès le seuil', () => {
    expect(clavierProbablementOuvert(SEUIL_CLAVIER_PX)).toBe(true);
    expect(clavierProbablementOuvert(260)).toBe(true);
    expect(clavierProbablementOuvert(340)).toBe(true);
  });
});

describe('BUG-KEYBOARD-ZOOM-001 — clavier iOS : détection par le rétrécissement, décalage annulé', () => {
  /*
   * Capture d'Avi du 08/09 07:58 : clavier levé, Safari a fait défiler le
   * document (offsetTop 475 sur une mise en page de 844, vue de 369). Le
   * recouvrement bas vaut 0 : l'ancienne détection disait « pas de clavier ».
   */
  it('voit le clavier même quand Safari a fait défiler le document', () => {
    const vue = { height: 369, offsetTop: 475 };

    expect(recouvrementBasDuNavigateur(844, vue)).toBe(0);
    expect(clavierProbablementOuvert(recouvrementBasDuNavigateur(844, vue))).toBe(false);
    expect(retrecissementDeLaVue(844, vue)).toBe(475);
    expect(clavierProbablementOuvert(retrecissementDeLaVue(844, vue))).toBe(true);
  });

  it('ne prend pas la barre Safari (87 px) pour un clavier, ni un défilement sans clavier', () => {
    expect(clavierProbablementOuvert(retrecissementDeLaVue(852, { height: 765, offsetTop: 0 }))).toBe(false);
    expect(decalageAAnnulerClavierOuvert(852, { height: 765, offsetTop: 200 })).toBe(0);
    expect(decalageAAnnulerClavierOuvert(844, undefined)).toBe(0);
  });

  it('rend le décalage à annuler quand le clavier est ouvert', () => {
    expect(decalageAAnnulerClavierOuvert(844, { height: 369, offsetTop: 475 })).toBe(475);
    expect(decalageAAnnulerClavierOuvert(844, { height: 369, offsetTop: 0 })).toBe(0);
    expect(decalageAAnnulerClavierOuvert(844, { height: 369, offsetTop: 12.6 })).toBe(13);
  });

  it('BaseChat détecte par le rétrécissement et remonte le document quand le clavier est ouvert', () => {
    const baseChat = readFileSync(new URL('./BaseChat.tsx', import.meta.url).pathname, 'utf8');

    expect(baseChat).toContain(
      'clavierProbablementOuvert(retrecissementDeLaVue(window.innerHeight, vue ?? undefined))',
    );
    expect(baseChat).toContain('decalageAAnnulerClavierOuvert(window.innerHeight, vue ?? undefined)');
    expect(baseChat).toContain('window.scrollTo(0, 0);');
  });
});
