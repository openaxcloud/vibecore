/**
 * UNE GÉNÉRATION QUI NE PEUT PAS DÉMARRER NE S'ANNONCE PAS COMME RÉUSSIE.
 *
 * Mesuré en production le 2026-09-08 sur les quatorze générations des trois
 * derniers jours : six sans point d'entrée, dont deux applications
 * substantielles — 24 et 28 fichiers, tous les composants d'une boutique — et
 * l'interface affichait « The agent patches were applied successfully ».
 *
 * La cause n'est ni la consigne ni le chemin d'écriture. Les deux réponses
 * fautives sont TRONQUÉES : `<boltArtifact>` ouvert et jamais fermé, une
 * `<boltAction>` non terminée (21 ouvertes / 20 fermées, puis 22 / 21), et le
 * texte s'arrête au milieu d'un attribut JSX. Le modèle écrivait encore quand
 * le flux a été coupé ; `src/main.tsx` arrive plus loin dans son plan. La
 * génération saine du même jour ferme proprement (12 / 12) et déclare bien
 * `src/main.tsx` et `src/App.tsx`.
 *
 * Le filet de fin de flux (`fermerArtefactsOuverts`) sauve déjà les fichiers —
 * c'est pourquoi les 24 fichiers existent sur le disque. Ce qu'il ne fait pas,
 * c'est le DIRE. Ce module tient cette moitié manquante, et il la tient sans
 * modèle : la vérification est mécanique, elle relit `index.html`.
 */

export interface ConstatDeGeneration {
  /** L'artefact a été fermé par le filet, pas par une balise reçue. */
  tronquee: boolean;

  /** Modules réclamés par `index.html` qu'aucun fichier écrit ne fournit. */
  entreesManquantes: string[];
}

/** Extensions essayées quand `index.html` pointe un module sans extension. */
const EXTENSIONS = ['', '.tsx', '.ts', '.jsx', '.js', '.mjs'];

const normaliser = (chemin: string): string => chemin.replace(/^\.?\//, '');

/**
 * Les modules qu'`index.html` réclame. On ne retient que les sources locales :
 * une URL absolue est servie par autre chose que le disque du projet.
 */
export function modulesReclames(indexHtml: string): string[] {
  const reclames: string[] = [];

  for (const balise of indexHtml.match(/<script\b[^>]*>/gi) ?? []) {
    const src = balise.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];

    if (src && !/^([a-z]+:)?\/\//i.test(src) && !src.startsWith('data:')) {
      reclames.push(normaliser(src));
    }
  }

  return [...new Set(reclames)];
}

export function analyserGeneration(
  fichiers: Readonly<Record<string, string>>,
  options: { readonly fermetureDeSecours: boolean },
): ConstatDeGeneration {
  const index = fichiers['index.html'] ?? fichiers['./index.html'];
  const present = new Set(Object.keys(fichiers).map(normaliser));

  /*
   * On essaie les extensions parce qu'`index.html` a le droit de pointer un
   * module sans la sienne — c'est la résolution de Vite, pas une approximation.
   * Un chemin est manquant seulement si AUCUNE forme ne correspond : la garde
   * doit accuser un vrai vide, jamais une écriture qu'elle n'a pas su lire.
   */
  const entreesManquantes = index
    ? modulesReclames(index).filter((module) => !EXTENSIONS.some((extension) => present.has(module + extension)))
    : [];

  return { tronquee: options.fermetureDeSecours, entreesManquantes };
}

/** Vrai quand la génération peut honnêtement s'annoncer comme réussie. */
export function generationEstHonnete(constat: ConstatDeGeneration): boolean {
  return !constat.tronquee && constat.entreesManquantes.length === 0;
}
