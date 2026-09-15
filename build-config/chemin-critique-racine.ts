/**
 * Le CHEMIN CRITIQUE de la route racine — ce que TOUTE page télécharge, y
 * compris la page d'accueil marketing d'un visiteur qui n'ouvrira jamais l'IDE.
 *
 * POURQUOI CE MODULE EXISTE, et pourquoi `manual-chunks.spec.ts` ne suffisait
 * pas. Cette spec-là teste la FONCTION : elle prouve que
 * `manualChunks('\0vite/preload-helper.js')` rend bien `'vendor-vite-helpers'`.
 * Elle ne prouve PAS que le `root-*.js` construit a cessé d'importer
 * `vendor-monaco-core`. Rollup peut remonter monaco dans le chunk racine pour
 * une raison entièrement différente — et les quatre tests resteraient verts
 * pendant que les 654 Ko reviennent sur chaque page.
 *
 * C'est la moitié qui n'était pas tenue : un correctif juste, une garde qui
 * regarde à côté. Ce module mesure l'ARTEFACT.
 *
 * MESURÉ sur des builds locaux (`pnpm run build`, arbre propre), à comparer à
 * la mesure de production du 2026-08-12 :
 *
 *              | prod 12/08              | build 10/09 (`64fb6b51`) | build 14/09 (i18n)
 *   ---------- | ----------------------- | ------------------------ | ------------------
 *   root.imports | 96                    | 28                       | 22
 *   dont lourds  | monaco 573 Ko + terminal 81 Ko | AUCUN           | AUCUN
 *   octets bruts | —                     | 3 334 307                | 1 971 273
 *
 * Le pas du 14/09 est BUG-PERF-I18N-RACINE-001 : les 150 catalogues i18n
 * (en + fr, 1,4 Mo de texte) sortis du graphe JavaScript pour un JSON par
 * langue, chargé avant l'hydratation. Ce qui reste : `vendor-react` 723 Ko
 * (légitime) et ~800 Ko de chunks partagés nommés d'après des routes
 * (`licensing`, `LandingTestimonials`, `signup`…) — non traité, chiffré.
 *
 * Témoin qui dit que la mesure porte sur la bonne chose : `vendor-monaco-core`
 * pèse 2 283 041 octets bruts — les « 2,28 Mo » relevés à l'inventaire.
 */

/**
 * Les chunks qui n'ont RIEN à faire sur le chemin critique d'une page
 * marketing. Ce ne sont pas des noms arbitraires : ce sont exactement ceux que
 * la mesure de production du 2026-08-12 y a trouvés, plus leurs voisins de même
 * nature (un éditeur de code, un terminal).
 */
export const CHUNKS_INTERDITS_SUR_LA_RACINE = [/monaco/i, /terminal/i, /xterm/i, /codemirror/i] as const;

/**
 * Plafond d'octets BRUTS du chemin critique racine — un cliquet, pas une cible.
 *
 * Réglé au-dessus de la mesure du 2026-09-14 (1 971 273) avec une marge
 * volontairement ÉTROITE : le défaut qu'on garde est une croissance SILENCIEUSE.
 * Un chunk de la taille de monaco (2,28 Mo) le franchit instantanément, le
 * retour des catalogues i18n (+1,36 Mo) aussi ; une addition légitime le
 * franchit également, et c'est voulu — il faut alors REGARDER ce qui a grossi
 * et relever le cliquet délibérément, pas par accident.
 */
export const PLAFOND_CHEMIN_CRITIQUE_OCTETS = 2_100_000;

/**
 * Les imports statiques de la route racine, lus dans le manifeste React Router.
 *
 * Rend `undefined` quand le motif n'est pas trouvé — un « zéro import » inventé
 * ferait passer la garde sur un manifeste qu'on n'a pas su lire (règle 14).
 */
export function lireCheminCritiqueRacine(manifeste: string): string[] | undefined {
  const debutRacine = manifeste.indexOf('"root":{');

  if (debutRacine === -1) {
    return undefined;
  }

  const debutImports = manifeste.indexOf('"imports":[', debutRacine);

  if (debutImports === -1) {
    return undefined;
  }

  const finImports = manifeste.indexOf(']', debutImports);

  if (finImports === -1) {
    return undefined;
  }

  return manifeste
    .slice(debutImports + '"imports":['.length, finImports)
    .split(',')
    .map((entree) => entree.replace(/"/g, '').trim())
    .filter(Boolean);
}

/** Ceux des imports qui n'ont rien à faire là. Liste vide = chemin sain. */
export function chunksInterdits(imports: readonly string[]): string[] {
  return imports.filter((chunk) => CHUNKS_INTERDITS_SUR_LA_RACINE.some((motif) => motif.test(chunk)));
}
