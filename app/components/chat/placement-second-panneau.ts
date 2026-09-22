/*
 * Où poser le SECOND panneau, sur bureau.
 *
 * Décision d'Avi, d'après ses captures : le panneau des modes reste en place et
 * garde son contenu ; le sélecteur de modèle s'ouvre À SA DROITE, légèrement
 * plus bas, les deux visibles en même temps. C'est exactement ce qui distingue
 * le bureau du téléphone, où le second écran REMPLACE le premier.
 *
 * Le repli va à gauche quand la place manque à droite — jamais un débordement
 * hors de l'écran.
 *
 * Tout est ici, en nombres, et rien dans le JSX : un placement qui ne se teste
 * qu'au rendu est un placement qu'on ne teste pas.
 */

/** Décalage vertical du second panneau, pour qu'il se lise comme un enfant du premier. */
export const DECALAGE_VERTICAL = 24;

/** Gouttière entre les deux panneaux. */
export const GOUTTIERE = 8;

/** Marge minimale conservée contre le bord de la fenêtre. */
export const MARGE_BORD = 12;

export interface AncrePremierPanneau {
  left: number;
  top: number;
  width: number;
}

export interface PlacementSecondPanneau {
  cote: 'droite' | 'gauche';
  left: number;
  top: number;
}

/**
 * Le seuil de bascule n'est PAS défini ici : il vient de `TABLET_MAX_WIDTH`
 * (packages/editor), le point de rupture qui décide déjà partout ailleurs entre
 * disposition mobile et disposition large. Un seuil de plus créerait une zone où
 * le panneau ne ressemblerait ni à l'un ni à l'autre.
 */
export function placerSecondPanneau(
  ancre: AncrePremierPanneau,
  largeurSecond: number,
  largeurFenetre: number,
): PlacementSecondPanneau {
  const aDroite = ancre.left + ancre.width + GOUTTIERE;
  const tientADroite = aDroite + largeurSecond + MARGE_BORD <= largeurFenetre;

  if (tientADroite) {
    return { cote: 'droite', left: aDroite, top: ancre.top + DECALAGE_VERTICAL };
  }

  /*
   * Repli à gauche. On borne aussi ce côté : sur une fenêtre étroite, le panneau
   * partirait sous zéro et la première colonne deviendrait illisible.
   */
  const aGauche = ancre.left - GOUTTIERE - largeurSecond;

  return { cote: 'gauche', left: Math.max(MARGE_BORD, aGauche), top: ancre.top + DECALAGE_VERTICAL };
}
