/**
 * RP-DB-07 — la note « où sont passées mes données ? ».
 *
 * Replit affiche une bulle sur le sélecteur de base : « Not sure where your
 * data went? Check your Production database. » Elle répond à une confusion
 * réelle — on écrit une ligne en développement, on la cherche en production,
 * et on conclut qu'elle a disparu.
 *
 * Elle n'a de sens que si la confusion est POSSIBLE. Sur un projet qui n'a
 * qu'une seule base, elle n'explique rien et occupe la place : la question
 * « laquelle des deux ? » ne se pose pas. C'est la règle tenue ici, et c'est
 * la seule décision de ce module — le reste (rendu, texte) est ailleurs.
 *
 * Le rejet est PERSISTANT et par projet : une note qu'on doit écarter à
 * chaque ouverture devient un défaut à son tour.
 */

/** Clé de rangement du rejet, par projet — un projet n'en congédie pas un autre. */
export function cleDeRejet(projectId: string): string {
  return `vibecore.db.note-dev-prod.${projectId}`;
}

export function noteEstPertinente(input: { environnements: readonly { key: string }[]; rejetee: boolean }): boolean {
  if (input.rejetee) {
    return false;
  }

  /*
   * Deux bases DISTINCTES, pas deux lignes : la liste peut porter deux fois la
   * même clé si un connecteur se répète, et la note n'aurait alors rien à
   * expliquer.
   */
  const distinctes = new Set(input.environnements.map((e) => e.key));

  return distinctes.size > 1;
}

/** Lecture tolérante : un magasin indisponible (navigation privée) ne doit rien casser. */
export function rejetEnregistre(projectId: string, magasin?: Pick<Storage, 'getItem'>): boolean {
  try {
    return (magasin ?? window.localStorage).getItem(cleDeRejet(projectId)) === '1';
  } catch {
    return false;
  }
}

export function enregistrerLeRejet(projectId: string, magasin?: Pick<Storage, 'setItem'>): void {
  try {
    (magasin ?? window.localStorage).setItem(cleDeRejet(projectId), '1');
  } catch {
    /* Un magasin refusé n'est pas une erreur : la note reparaîtra, c'est tout. */
  }
}
