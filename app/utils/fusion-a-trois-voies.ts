import { diffArrays } from 'diff';

/**
 * FUSION À TROIS VOIES, PAR LIGNES.
 *
 * Mesuré en production le 2026-10-01, trois fois sur trois : l'utilisateur
 * enregistre `src/App.tsx` pendant que l'agent l'écrit, et sa modification
 * disparaît — l'agent applique la version qu'il avait calculée à partir de ce
 * qu'il avait LU, sans voir ce qui a changé depuis. Décision d'Avi : ce que
 * l'utilisateur enregistre fait foi.
 *
 * `base` est ce que l'agent avait lu, `agent` ce qu'il veut écrire, `utilisateur`
 * ce qui est enregistré maintenant. Les deux modifications se combinent quand
 * elles touchent des régions DISTINCTES de la base. Deux régions qui se
 * chevauchent ou se TOUCHENT sont un conflit — la prudence est voulue : un
 * conflit renvoie la proposition en revue, une fusion fausse écraserait en
 * silence, ce qu'on cherche justement à empêcher.
 */
export type ResultatDeFusion = { propre: true; contenu: string } | { propre: false };

interface Region {
  /** Indices de lignes dans la base : [debut, fin[ est remplacé par `lignes`. */
  debut: number;
  fin: number;
  lignes: string[];
}

function decouper(texte: string): string[] {
  return texte.length === 0 ? [] : texte.split(/(?<=\n)/);
}

function regionsModifiees(base: string[], autre: string[]): Region[] {
  const regions: Region[] = [];

  let indice = 0;
  let courante: Region | null = null;

  for (const morceau of diffArrays(base, autre)) {
    if (!morceau.added && !morceau.removed) {
      if (courante) {
        regions.push(courante);
        courante = null;
      }

      indice += morceau.count ?? morceau.value.length;
      continue;
    }

    courante ??= { debut: indice, fin: indice, lignes: [] };

    if (morceau.removed) {
      indice += morceau.count ?? morceau.value.length;
      courante.fin = indice;
    } else {
      courante.lignes.push(...morceau.value);
    }
  }

  if (courante) {
    regions.push(courante);
  }

  return regions;
}

function memeModification(a: Region, b: Region): boolean {
  return a.debut === b.debut && a.fin === b.fin && a.lignes.join('') === b.lignes.join('');
}

export function fusionnerATroisVoies(base: string, agent: string, utilisateur: string): ResultatDeFusion {
  if (agent === utilisateur || utilisateur === base) {
    return { propre: true, contenu: agent };
  }

  if (agent === base) {
    return { propre: true, contenu: utilisateur };
  }

  const lignesDeBase = decouper(base);
  const cotesAgent = regionsModifiees(lignesDeBase, decouper(agent));
  const cotesUtilisateur = regionsModifiees(lignesDeBase, decouper(utilisateur));
  const retenues: Region[] = [...cotesUtilisateur];

  for (const a of cotesAgent) {
    const voisine = cotesUtilisateur.find((u) => a.debut <= u.fin && u.debut <= a.fin);

    if (!voisine) {
      retenues.push(a);
      continue;
    }

    if (!memeModification(a, voisine)) {
      return { propre: false };
    }
  }

  retenues.sort((x, y) => x.debut - y.debut);

  const sortie: string[] = [];

  let indice = 0;

  for (const region of retenues) {
    sortie.push(...lignesDeBase.slice(indice, region.debut), ...region.lignes);
    indice = region.fin;
  }

  sortie.push(...lignesDeBase.slice(indice));

  return { propre: true, contenu: sortie.join('') };
}
