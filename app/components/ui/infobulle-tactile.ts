/**
 * Le survol n'existe pas au doigt — l'infobulle non plus.
 *
 * `GlobalTooltip` affiche le texte de `data-vc-tooltip` au survol et au
 * focus. Au toucher, les deux se produisent sans que personne ne « survole »
 * rien : iOS comme Chromium laissent `:hover` collé à l'élément touché et
 * posent le focus dessus. Mesuré sur les captures d'Avi du 06/09 : « Copier
 * le message » au-dessus du menu contextuel (13:35), « Modifier et renvoyer
 * ce message » sous le menu du message utilisateur (17:57), « Mode de
 * l'agent : Économique… » sous le composeur après l'appui (sonde Chromium).
 *
 * Règle : un événement de pointeur tactile ou stylet ne montre pas
 * d'infobulle ; un focus qui suit un toucher non plus ; et sur un appareil
 * sans survol (`hover: none`), aucun focus ne le fait.
 */

/** Fenêtre après un toucher pendant laquelle un focus est considéré comme sa conséquence. */
export const FENETRE_FOCUS_APRES_TOUCHER_MS = 1000;

export function pointeurSansSurvol(pointerType: string | undefined): boolean {
  return pointerType === 'touch' || pointerType === 'pen';
}

export function infobulleAutoriseeAuFocus(etat: { sansSurvol: boolean; dernierToucherIlYA: number | null }): boolean {
  if (etat.sansSurvol) {
    return false;
  }

  return etat.dernierToucherIlYA === null || etat.dernierToucherIlYA > FENETRE_FOCUS_APRES_TOUCHER_MS;
}
