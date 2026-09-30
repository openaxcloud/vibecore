/**
 * L'IDÉE TAPÉE SUR L'ACCUEIL, RELAYÉE JUSQU'AU COMPOSEUR DE NOUVEAU PROJET.
 *
 * L'accueil la dépose dans `sessionStorage` (jamais dans l'URL : ni historique,
 * ni Referer) avec `composerBuildIntent=1` ; `/projects/new` la soumet à
 * l'arrivée. Ce relais n'avait pas de date.
 *
 * BUG-QA0928-IDEE-PERDUE-INSCRIPTION — mesuré le 2026-09-28 : une idée restée
 * dans l'onglet (inscription arrivée sur le tableau de bord, visite abandonnée)
 * se relançait TOUTE SEULE au prochain « Nouveau projet », des heures plus
 * tard, et créait un projet que l'utilisateur n'avait pas redemandé — avec le
 * crédit consommé.
 *
 * Désormais l'accueil date le relais, et une idée sans date ou plus vieille
 * qu'une heure est oubliée au lieu d'être soumise. Une heure couvre largement
 * connexion + inscription + vérification ; au-delà, ce n'est plus la même
 * intention.
 */

export const CLE_IDEE = 'pendingAppDescription';
export const CLE_INTENTION = 'composerBuildIntent';
export const CLE_DATE = 'pendingAppDescriptionAt';
export const DUREE_DE_VALIDITE_MS = 60 * 60 * 1000;

/** Les clés du relais, à effacer ensemble. */
export const CLES_DU_RELAIS = [CLE_IDEE, CLE_INTENTION, CLE_DATE, 'pendingBuildMode', 'triggerBuildOnLanding'];

type Rangement = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** À appeler par l'accueil au moment où il dépose l'idée. */
export function daterLeRelais(rangement: Rangement, maintenant = Date.now()): void {
  rangement.setItem(CLE_DATE, String(maintenant));
}

export function oublierLeRelais(rangement: Rangement): void {
  for (const cle of CLES_DU_RELAIS) {
    rangement.removeItem(cle);
  }
}

/**
 * L'idée à soumettre, ou `null`. Une idée périmée (sans date, date illisible, ou
 * plus vieille que la durée de validité) est oubliée : elle ne ressurgira plus.
 */
export function lireIdeeRelayee(rangement: Rangement, maintenant = Date.now()): string | null {
  const idee = rangement.getItem(CLE_IDEE)?.trim();

  if (rangement.getItem(CLE_INTENTION) !== '1' || !idee) {
    return null;
  }

  const date = Number(rangement.getItem(CLE_DATE));

  const fraiche =
    Number.isFinite(date) && date > 0 && maintenant - date >= 0 && maintenant - date <= DUREE_DE_VALIDITE_MS;

  if (!fraiche) {
    oublierLeRelais(rangement);
    return null;
  }

  return idee;
}
