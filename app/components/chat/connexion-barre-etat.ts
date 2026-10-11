/*
 * Pastille « connexion » de la barre d'état de l'IDE.
 *
 * Extraite de BaseChat pour être tenue par un test. La décision tient en une
 * ligne de priorité : hors ligne, puis erreur, puis démarrage, sinon connecté.
 *
 * BUG-QA0928-COSMETIQUES (point 3) — l'issue « erreur » manquait : un workspace
 * qui n'avait pas pu démarrer affichait « Connected » en vert à côté de
 * « Workspace Error ». L'état d'erreur est lu dans `workspaceUiState`, celui-là
 * même qui colore la pastille Workspace voisine : les deux ne peuvent plus se
 * contredire.
 */
export type EtatDeConnexion = 'offline' | 'error' | 'reconnecting' | 'connected';

export function etatDeConnexionBarre(entree: {
  enLigne: boolean;
  chargement: boolean;
  statutWorkspace: string | undefined;
  etatRuntime: string;
}): EtatDeConnexion {
  if (!entree.enLigne) {
    return 'offline';
  }

  if (entree.etatRuntime === 'error') {
    return 'error';
  }

  if (entree.chargement || ['starting', 'booting', 'pending'].includes(entree.statutWorkspace?.toLowerCase() ?? '')) {
    return 'reconnecting';
  }

  return 'connected';
}
