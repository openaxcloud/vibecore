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
import { atom } from 'nanostores';

export const DELAI_APPUI_LONG_MS = 500;

/*
 * BUG-MESSAGE-MENU-IOS-001 (Avi, 08/09 07:47) — UN SEUL menu de message ouvert
 * à la fois, dans tout le fil. Chaque message tenait son propre état : un
 * appui long sur un second message ouvrait un second menu sans fermer le
 * premier — la barre de l'agent ET le rond « Modifier » du message utilisateur
 * flottaient ensemble sur ses captures. Le magasin porte l'identifiant du seul
 * message dont le menu est ouvert ; en ouvrir un autre ferme le précédent.
 */
export const menuDeMessageOuvert = atom<string | null>(null);

/**
 * Où s'ouvre le menu. Sur téléphone, TOUJOURS au même endroit par rapport au
 * message — au-dessus de sa ligne, centré —, pas sous le doigt : « ça
 * s'affiche pas toujours au même endroit pour chaque message » (Avi, 08/09).
 * À la souris, sous le pointeur, comme tout menu contextuel.
 */
export function pointDOuverture(
  ligne: { left: number; top: number; width: number } | null | undefined,
  pointeur: { x: number; y: number },
  surTelephone: boolean,
): { x: number; y: number } {
  if (!surTelephone || !ligne) {
    return { x: pointeur.x, y: pointeur.y };
  }

  return { x: Math.round(ligne.left + ligne.width / 2), y: Math.round(ligne.top) };
}

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

/**
 * Ramène un menu DÉJÀ RENDU dans l'écran, à partir de sa taille réelle.
 *
 * `placerLeMenu` travaille sur une estimation (232 px), la seule connue avant
 * le rendu. Depuis que chaque entrée porte son libellé, le menu s'élargit
 * jusqu'à sa `max-width` — 366 px sur un iPhone de 390. Capture d'Avi du
 * 06/09 à 13:35 : posé à 165 px du bord gauche pour une largeur de 366, il
 * sortait de l'écran et rognait « Régénérer à partir de ce promp… ».
 *
 * Ici on ne retourne rien : la position est déjà du bon côté du point de
 * contact. On glisse seulement, en gardant la marge de chaque côté.
 */
export function ramenerDansLEcran(
  position: { x: number; y: number },
  taille: { largeur: number; hauteur: number },
  ecran: { largeur: number; hauteur: number },
  marge = 12,
): { x: number; y: number } {
  const x = Math.max(marge, Math.min(position.x, ecran.largeur - taille.largeur - marge));
  const y = Math.max(marge, Math.min(position.y, ecran.hauteur - taille.hauteur - marge));

  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * LA BARRE D'ICÔNES DU TÉLÉPHONE se pose AU-DESSUS du doigt, centrée sur lui,
 * et jamais hors de la zone utile : sous l'en-tête, au-dessus de la zone de
 * saisie. Avi, 07/09 08:03 : « parfois on la voit pas si je prends le premier
 * ou le dernier message, c'est caché ». Mesuré sur WebKitGTK : sur le dernier
 * message, le menu descendait à 744 px pour une zone de saisie à 647 — les
 * trois dernières entrées sous le composeur.
 *
 * S'il n'y a pas la place au-dessus (premier message sous l'en-tête), elle
 * passe sous le doigt ; et si même là elle sortirait de la zone utile, elle
 * est ramenée à l'intérieur.
 */
export function placerLaBarre(
  point: { x: number; y: number },
  taille: { largeur: number; hauteur: number },
  bornes: { largeur: number; haut: number; bas: number },
  marge = 12,
): { x: number; y: number } {
  const x = Math.max(marge, Math.min(point.x - taille.largeur / 2, bornes.largeur - taille.largeur - marge));
  const auDessus = point.y - taille.hauteur - marge;
  const enDessous = point.y + marge;
  const plancher = bornes.haut + marge;
  const plafond = bornes.bas - taille.hauteur - marge;
  const y = auDessus >= plancher ? auDessus : Math.max(plancher, Math.min(enDessous, plafond));

  return { x: Math.round(x), y: Math.round(y) };
}
