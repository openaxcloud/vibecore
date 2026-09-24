/*
 * Le cadre d'aperçu ne reste pas garé sur `about:blank`.
 *
 * Mesuré en production le 2026-09-24, sur un projet généré de bout en bout : le
 * serveur de développement tournait et servait l'application — `/`,
 * `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `@vite/client` tous en 200 —
 * la barre d'adresse affichait bien l'URL, et le cadre restait vide, `src` à
 * `about:blank`, zéro enfant.
 *
 * La cause est structurelle, pas conjoncturelle. React pose `src={iframeUrl}` ;
 * le rechargement, lui, écrit `frame.src = 'about:blank'` IMPÉRATIVEMENT
 * (`beginPreviewFrameReload`, le rebond voulu de BUG-A) puis repointe le cadre
 * après un délai. Si ce second temps n'a pas lieu — minuterie perdue, cadre
 * démonté puis remonté, `iframeUrl` momentanément absent — React ne répare
 * rien : sa prop n'a pas changé, donc il ne réécrit pas l'attribut. Le cadre
 * reste blanc pour toujours.
 *
 * Ce module ne décide de rien d'autre : il répond à « faut-il repointer ce
 * cadre, et vers quoi ». Le composant l'appelle, il ne le raisonne pas.
 */

export interface CadreAPointer {
  src: string;
}

export type DecisionDeRepointage = { repointer: false; raison: string } | { repointer: true; vers: string };

/** Un cadre est « garé » quand il ne pointe sur rien d'utile. */
export function cadreGare(src: string | null | undefined): boolean {
  if (!src) {
    return true;
  }

  const propre = src.trim();

  return propre === '' || propre === 'about:blank' || propre === 'about:srcdoc';
}

/**
 * Faut-il repointer le cadre ?
 *
 * On ne repointe QUE ce qui est garé : réécrire le `src` d'un cadre qui a déjà
 * chargé la bonne page le rechargerait pour rien, et sur un aperçu en cours de
 * démarrage ce rechargement coûte le démarrage lui-même.
 */
export function decisionDeRepointage(input: {
  src: string | null | undefined;
  urlVoulue: string | undefined;
}): DecisionDeRepointage {
  if (!input.urlVoulue) {
    return { repointer: false, raison: 'aucune URL d’aperçu connue' };
  }

  if (!cadreGare(input.src)) {
    return { repointer: false, raison: 'le cadre porte déjà une page' };
  }

  return { repointer: true, vers: input.urlVoulue };
}
