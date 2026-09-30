/**
 * Recouvrement bas du navigateur — la grandeur qu'`env(safe-area-inset-bottom)`
 * ne donne pas.
 *
 * Sur iOS, la barre d'outils de Safari recouvre le bas de la fenêtre de MISE EN
 * PAGE. Un panneau en `position: fixed` ancré à
 * `bottom: calc(nav + env(safe-area-inset-bottom))` se place donc SOUS elle, et
 * `env(safe-area-inset-bottom)` vaut 0 tant que la barre est affichée : ce n'est
 * pas une encoche, c'est du chrome de navigateur.
 *
 * La seule grandeur qui le décrit est l'écart entre la fenêtre de mise en page
 * et la fenêtre VISUELLE.
 */
export function recouvrementBasDuNavigateur(
  hauteurMiseEnPage: number,
  vue: { height: number; offsetTop: number } | undefined,
): number {
  if (!vue) {
    return 0;
  }

  return Math.max(0, hauteurMiseEnPage - vue.height - vue.offsetTop);
}

/*
 * Le clavier logiciel est la seule chose qui reprenne PLUS de 150 px au bas
 * de la fenêtre : la barre d'outils de Safari en prend 44 à 84. Captures
 * iPhone d'Avi, 06/09 11:04 : clavier levé, le composeur restait posé 90 px
 * au-dessus de lui — il réservait la place du socle, passé SOUS le clavier —
 * et sur l'état de départ le socle flottait au-dessus du clavier pendant que
 * le composeur était hors de vue. Quand le clavier est là, le socle n'y est
 * plus : le composeur se colle au clavier.
 */
export const SEUIL_CLAVIER_PX = 150;

export function clavierProbablementOuvert(recouvrementBas: number): boolean {
  return recouvrementBas >= SEUIL_CLAVIER_PX;
}

/**
 * BUG-KEYBOARD-ZOOM-001 — le rétrécissement TOTAL de la fenêtre visuelle,
 * indépendant de son décalage.
 *
 * Quand le clavier iOS se lève, Safari fait aussi DÉFILER le document pour
 * garder le champ focalisé visible (`offsetTop` > 0). Le recouvrement bas
 * (mise en page − hauteur − décalage) tombe alors vers 0 alors que le clavier
 * est là : le socle restait affiché, le composeur restait soulevé de
 * « barre + 8 », et la coque, calée sur la hauteur visuelle mais posée en haut
 * du document, sortait de l'écran — capture d'Avi du 08/09 07:58 : page
 * blanche, socle flottant au-dessus du clavier, zone de saisie invisible.
 * Ce que le clavier prend ne dépend PAS du défilement : c'est la hauteur de
 * mise en page moins la hauteur visuelle.
 */
export function retrecissementDeLaVue(hauteurMiseEnPage: number, vue: { height: number } | undefined): number {
  if (!vue) {
    return 0;
  }

  return Math.max(0, hauteurMiseEnPage - vue.height);
}

/**
 * Le décalage à annuler quand le clavier est ouvert : la coque tient dans la
 * fenêtre visuelle, elle doit donc être vue depuis le HAUT du document ; tout
 * défilement de Safari la sort de l'écran.
 */
export function decalageAAnnulerClavierOuvert(
  hauteurMiseEnPage: number,
  vue: { height: number; offsetTop: number } | undefined,
): number {
  if (!vue || !clavierProbablementOuvert(retrecissementDeLaVue(hauteurMiseEnPage, vue))) {
    return 0;
  }

  return Math.max(0, Math.round(vue.offsetTop));
}

/**
 * HAUTEUR DE MISE EN PAGE AU REPOS — la référence du rétrécissement.
 *
 * Mesuré le 2026-09-30 sur Safari iOS 26 (simulateur, 390 pt), dans l'IDE :
 * clavier levé, Safari rétrécit AUSSI la fenêtre de mise en page
 * (`innerHeight` 699 → 362) et fait défiler le document de 337. « Mise en page
 * moins vue » vaut alors 362 − 362 = 0 : le clavier n'était jamais vu, le socle
 * d'onglets restait affiché au bas de la fenêtre rétrécie (y 347–391) et le
 * défilement de 337 n'était jamais annulé — zone de saisie repoussée en haut
 * (y 61–109), fil hors de l'écran.
 *
 * Ce que le clavier prend se mesure donc depuis la plus grande hauteur de mise
 * en page vue AU REPOS, à largeur égale ; un changement de largeur (rotation)
 * repart de la hauteur du moment. La barre d'outils de Safari qui se replie ne
 * fait que monter la référence (plus grande hauteur) : jamais un faux clavier.
 */
export interface HauteurDeRepos {
  largeur: number;
  hauteur: number;
}

export function suivreHauteurDeRepos(
  precedente: HauteurDeRepos | undefined,
  largeur: number,
  hauteurMiseEnPage: number,
): HauteurDeRepos {
  if (!precedente || precedente.largeur !== largeur) {
    return { largeur, hauteur: hauteurMiseEnPage };
  }

  return { largeur, hauteur: Math.max(precedente.hauteur, hauteurMiseEnPage) };
}

/**
 * Clavier levé et défilement de Safari annulé : le champ ACTIF doit rester visible.
 *
 * Mesuré le 2026-09-30 (Safari iOS 26, banc XCUITest) : une fois le clavier vu,
 * `window.scrollTo(0, 0)` annule le défilement que Safari faisait pour montrer le
 * champ — voulu pour le composeur, collé au bas de la vue. Mais « Nom du projet »
 * (Paramètres, y 446–484) restait alors SOUS la barre ∧ ∨ ✓ et la pastille
 * d'adresse (bas visible 409). On ramène le champ dans SA zone de défilement ;
 * `nearest` ne bouge rien quand il est déjà visible.
 */
export function champSaisissable(element: Element | null): element is HTMLElement {
  if (!element || !('scrollIntoView' in element)) {
    return false;
  }

  const balise = element.tagName;

  return (
    balise === 'TEXTAREA' ||
    balise === 'SELECT' ||
    (balise === 'INPUT' &&
      !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color', 'image'].includes(
        ((element as HTMLInputElement).type || '').toLowerCase(),
      )) ||
    (element as HTMLElement).isContentEditable === true
  );
}

export function revelerLeChampActif(doc: Document): boolean {
  const actif = doc.activeElement;

  if (!champSaisissable(actif)) {
    return false;
  }

  actif.scrollIntoView({ block: 'nearest', inline: 'nearest' });

  return true;
}
