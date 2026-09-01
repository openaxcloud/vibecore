import { describe, expect, it } from 'vitest';
import { recouvrementBasDuNavigateur } from './visual-viewport-bottom';

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
