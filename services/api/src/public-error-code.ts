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
 * ON FILTRE SUR LA FORME DU CODE, PAS SUR LE STATUT.
 *
 * ⚠️ Ma première version masquait AUSSI tout code de 5xx qui ne se déclarait
 * pas public. C'était trop large, et la CI l'a prouvé : `credit-packs-billing`
 * attend `code === 'CREDIT_PACKS_DISABLED'` sur un **503**. Le produit utilise
 * légitimement des codes PARLANTS sur des 5xx — 503 « fonctionnalité
 * indisponible » en est le cas normal — et des clients en dépendent. Ma
 * contre-garde ne testait que des 4xx : elle ne pouvait pas voir le trou.
 *
 * La fuite réelle n'a jamais été « un code sur un 5xx », c'est « un code dont
 * la FORME appartient au pilote ». Ces formes ne peuvent pas entrer en
 * collision avec un code applicatif : `P` + 4 chiffres (Prisma) et 5 chiffres
 * (SQLSTATE PostgreSQL) ne ressemblent à aucun `SCREAMING_SNAKE_CASE`.
 */

/** Code générique exposé quand le vrai code ne peut pas sortir. */
export const CODE_GENERIQUE = 'API_ERROR';

/** Formes appartenant à la couche de persistance, jamais exposables. */
const FORMES_PERSISTANCE = [
  /* Prisma : `P` suivi de quatre chiffres — P2002, P2003, P2025, P2037… */
  /^P\d{4}$/,

  /* SQLSTATE PostgreSQL : cinq caractères alphanumériques tout en chiffres. */
  /^\d{5}$/,
];

export function publicErrorCode(entree: {
  code: string;
  statusCode: number;

  /** L'erreur porte-t-elle un message explicitement destiné au public ? */
  hasPublicMessage: boolean;
}): string {
  return FORMES_PERSISTANCE.some((forme) => forme.test(entree.code)) ? CODE_GENERIQUE : entree.code;
}
