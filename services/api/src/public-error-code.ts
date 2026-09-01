/*
 * BUG-QA-PRISMA-CODE-LEAK-001 — le code d'erreur renvoyé au client ne doit rien
 * dire de la pile de persistance.
 *
 * Le gestionnaire d'erreurs global assainissait bien le MESSAGE (générique
 * « Internal server error » pour les 5xx) mais PAS le champ `code`. Pour une
 * `PrismaClientKnownRequestError`, `error.code` est le code Prisma : toute
 * panne de persistance non interceptée annonçait à l'appelant la classe exacte
 * du défaut — `P2002` (contrainte d'unicité), `P2003` (clé étrangère), `P2025`
 * (enregistrement absent), `P2037` (connexions épuisées).
 *
 * Deux fuites distinctes, donc deux règles :
 *
 *   1. Un code de FORME Prisma n'est jamais exposé, quel que soit le statut —
 *      une erreur de persistance mappée en 4xx fuiterait autant.
 *   2. Un 5xx n'expose son code que si l'erreur se déclare PUBLIQUE, via le
 *      même marqueur `publicMessage` que le gestionnaire utilise déjà pour
 *      décider si le message peut sortir. Sans ce marqueur, on ne peut pas
 *      savoir d'où vient le code : il est générique.
 *
 * Les 4xx gardent leur code : c'est le contrat de l'API — un client doit
 * pouvoir distinguer `FEATURE_NOT_ENABLED` de `BACKUP_SNAPSHOT_REQUIRED`, et
 * ces codes-là sont écrits par nous, pas par le pilote.
 */

/** Code générique exposé quand le vrai code ne peut pas sortir. */
export const CODE_GENERIQUE = 'API_ERROR';

/** Forme d'un code Prisma : `P` suivi de quatre chiffres. */
const CODE_PRISMA = /^P\d{4}$/;

export function publicErrorCode(entree: {
  code: string;
  statusCode: number;

  /** L'erreur porte-t-elle un message explicitement destiné au public ? */
  hasPublicMessage: boolean;
}): string {
  if (CODE_PRISMA.test(entree.code)) {
    return CODE_GENERIQUE;
  }

  if (entree.statusCode >= 500 && !entree.hasPublicMessage) {
    return CODE_GENERIQUE;
  }

  return entree.code;
}
