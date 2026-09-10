/**
 * BUG-URL-FETCH-DUMP-001 — « Récupérer une URL » rendait un pavé illisible.
 *
 * Avi, 09/09, sur `volt-watt.com` : « ça affiche le contenu pas organisé c'est
 * incompréhensible ». Sa capture montre le menu de langues, les slogans, les
 * boutons et les chiffres recollés en UNE phrase continue :
 *
 *   « … en English Français Deutsch Español Italiano Global Leader in
 *     Renewable Energy Powering Tomorrow's Energy Today Leading the renewable
 *     energy transition with innovative solar, wind, and storage solutions
 *     across global markets. Discover Our Solutions View Our Projects … »
 *
 * LA CAUSE, mesurée dans l'extracteur d'origine : il remplaçait CHAQUE balise
 * par une espace (`/<[^>]+>/g → ' '`), puis écrasait tout blanc, retours à la
 * ligne compris (`/\s+/g → ' '`). Un titre, un bouton et un paragraphe
 * devenaient donc indiscernables — la structure du document était détruite
 * avant même d'arriver à l'écran.
 *
 * Ici, la structure est CONSERVÉE : les titres deviennent des titres, les
 * listes des puces, les blocs des paragraphes. Le texte reste du texte brut
 * (aucun balisage n'est inventé) mais il redevient lisible, pour l'utilisateur
 * comme pour le modèle qui le reçoit en contexte.
 */

/** Blocs qui ne portent aucun texte utile pour un lecteur. */
const BLOCS_MUETS = ['head', 'script', 'style', 'noscript', 'svg', 'template', 'iframe', 'form'];

/** Blocs de navigation : utiles à la page, du bruit dans un extrait. */
const BLOCS_DE_NAVIGATION = ['nav', 'header', 'footer', 'aside'];

function retirerBlocs(html: string, balises: readonly string[]): string {
  return balises.reduce(
    (acc, balise) =>
      acc.replace(new RegExp(`<${balise}\\b[^<]*(?:(?!<\\/${balise}>)<[^<]*)*<\\/${balise}>`, 'gi'), '\n'),
    html,
  );
}

function decoderEntites(texte: string): string {
  return texte
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

export function extraireContenuLisible(html: string): string {
  const sansBruit = retirerBlocs(retirerBlocs(html, BLOCS_MUETS), BLOCS_DE_NAVIGATION);

  const structure = sansBruit
    /*
     * Une espace à CHAQUE frontière entre deux balises. Sans elle, deux liens
     * voisins se collent : mesuré sur la page d'Avi, « Discover Our Solutions »
     * et « View Our Projects » sortaient en « Discover Our SolutionsView Our
     * Projects ». La frontière `><` n'existe qu'entre deux balises — jamais au
     * milieu d'un mot.
     */
    .replace(/>\s*</g, '> <')
    /*
     * Les titres portent le plan de la page : c'est ce qui manquait le plus.
     * On les rend en Markdown, à un niveau modeste — un extrait ne doit pas
     * crier plus fort que le fil qui l'accueille.
     */
    .replace(/<h1\b[^>]*>/gi, '\n\n## ')
    .replace(/<h[2-6]\b[^>]*>/gi, '\n\n### ')
    .replace(/<\/h[1-6]>/gi, '\n\n')

    // Les listes deviennent des puces, pas une énumération collée.
    /*
     * Une puce par ligne, SANS ligne vide entre elles : `<li>` ouvre déjà la
     * ligne, donc fermer `</li>` par un retour en ajoutait un second et la
     * liste se retrouvait aérée comme des paragraphes.
     */
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '')

    // Tout bloc ferme une ligne : sans ça, deux paragraphes n'en font qu'un.
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|main|tr|blockquote|dd|dt|h[1-6]|ul|ol|table)>/gi, '\n\n')
    .replace(/<(p|div|section|article|main|tr|blockquote|dd|dt|ul|ol|table)\b[^>]*>/gi, '\n')

    // Les cellules restent sur leur ligne, séparées.
    .replace(/<\/t[dh]>/gi, ' · ')

    // Ce qui reste est en ligne (a, span, strong…) : il ne coupe pas la phrase.
    .replace(/<[^>]+>/g, '');

  return (
    decoderEntites(structure)
      /*
       * On n'écrase QUE les blancs horizontaux. Écraser aussi les retours à la
       * ligne est précisément ce qui produisait le pavé.
       */
      .replace(/[ \t\f\v ]+/g, ' ')
      .split('\n')
      .map((ligne) => ligne.trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/(?:^|\n)-\s*(?=\n|$)/g, '')
      .trim()
  );
}
