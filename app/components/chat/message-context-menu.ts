/**
 * Ouverture du menu contextuel d'un message : appui long au doigt, clic droit
 * à la souris.
 *
 * Avi, sur ses captures : le crayon d'édition posé en permanence dans la bulle
 * et toute la rangée « copier / relancer / éditer / pouce haut / pouce bas »
 * affichée sous chaque message, occupant une bande entière même quand la bulle
 * est vide. « Pourquoi perdre tant de place dans les bubbles. En mobile ou
 * tablet ça doit être comme WhatsApp quand on appuie longtemps ; en desktop on
 * clique droit. »
 *
 * Deux pièges déjà payés ailleurs dans ce produit, traités ici :
 *
 * 1. Safari iOS ne focalise pas un conteneur non interactif. Le geste ne peut
 *    donc pas reposer sur le focus ; il repose sur les événements de POINTEUR,
 *    qui, eux, arrivent sur n'importe quel élément.
 *
 * 2. L'appui long déclenche par défaut le menu système de sélection de texte.
 *    On le neutralise sur la BULLE (`-webkit-touch-callout`), jamais sur les
 *    blocs de code : y sélectionner du texte est un geste volontaire et utile.
 */

/** Durée au-delà de laquelle un appui devient un appui long. */
export const DELAI_APPUI_LONG_MS = 500;

/**
 * Tolérance de déplacement, en pixels.
 *
 * Un doigt n'est jamais parfaitement immobile. Trop serré, l'appui long ne se
 * déclenche jamais ; trop large, un défilement du fil ouvre le menu par
 * accident. 10px est la valeur usuelle des piles tactiles.
 */
export const TOLERANCE_DEPLACEMENT_PX = 10;

export interface AppuiEnCours {
  x: number;
  y: number;
  pointerId: number;
}

/**
 * Un déplacement au-delà de la tolérance annule l'appui long : l'utilisateur
 * fait défiler, il ne demande pas le menu.
 */
export function leDeplacementAnnuleLAppui(depart: AppuiEnCours, x: number, y: number): boolean {
  return Math.abs(x - depart.x) > TOLERANCE_DEPLACEMENT_PX || Math.abs(y - depart.y) > TOLERANCE_DEPLACEMENT_PX;
}

/**
 * Faut-il armer un appui long pour cet événement ?
 *
 * Uniquement le doigt ou le stylet, et uniquement le bouton principal. La
 * souris a le clic droit, qui est immédiat et sans ambiguïté ; lui imposer un
 * appui long serait une régression pour elle.
 */
export function fautIlArmerLAppuiLong(evenement: { pointerType: string; button: number; isPrimary: boolean }): boolean {
  if (evenement.button !== 0 || !evenement.isPrimary) {
    return false;
  }

  return evenement.pointerType === 'touch' || evenement.pointerType === 'pen';
}

/**
 * Place le menu à l'écran sans qu'il en sorte.
 *
 * Le point de contact est un coin, pas un centre : on ouvre vers le bas et la
 * droite quand la place existe, et on retourne le menu sinon. La marge évite
 * qu'il colle au bord — et, en bas, qu'il passe sous la barre du navigateur.
 */
export function placerLeMenu(
  point: { x: number; y: number },
  menu: { largeur: number; hauteur: number },
  ecran: { largeur: number; hauteur: number },
  marge = 12,
): { x: number; y: number } {
  const x = Math.min(Math.max(marge, point.x), Math.max(marge, ecran.largeur - menu.largeur - marge));
  const debordeEnBas = point.y + menu.hauteur + marge > ecran.hauteur;
  const y = debordeEnBas ? Math.max(marge, point.y - menu.hauteur) : point.y;

  return { x: Math.round(x), y: Math.round(y) };
}
