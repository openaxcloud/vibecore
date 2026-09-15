/**
 * BUG-AI-002 — l'API écrasait TOUTE réponse non-ok de la passerelle en
 * `502 AI_GATEWAY_REQUEST_FAILED` / « Internal server error ».
 *
 * La passerelle prend pourtant soin de préserver le vrai statut : un
 * `403 AI_MODEL_PLAN_BLOCKED` dit « aucun modèle de ce fournisseur n'est
 * disponible sur votre plan ». L'API l'écrasait juste après. L'utilisateur
 * lisait « erreur interne » et ne pouvait RIEN faire, alors qu'avec le vrai
 * message il change de modèle ou de forfait.
 *
 * Mesuré en production le 2026-09-01 : quatre demandes avec fournisseur
 * explicite ont reçu `upstreamStatus: 403` côté journal, et
 * `502 {"error":"Internal server error"}` côté utilisateur.
 *
 * Module AUTONOME, pour que les tests portent sur la décision réellement prise
 * par la route et non sur une copie.
 */

/** Réponse d'erreur de la passerelle, telle qu'elle la sérialise. */
type CorpsAmont = { error?: unknown; code?: unknown } | undefined;

export type ErreurPasserelleMappee = {
  statusCode: number;
  code: string;
  message: string;
};

/**
 * Un statut est RÉPERCUTÉ tel quel quand il est actionnable par l'utilisateur.
 *
 * 4xx = la demande ou les droits (plan, quota, requête mal formée) : la
 * personne peut agir. 5xx = une panne de notre côté : elle n'y peut rien, et
 * lui rendre un 5xx amont laisserait croire que son entrée est en cause. On
 * garde alors 502, qui dit « l'amont a lâché ».
 */
export function estActionnableParUtilisateur(statutAmont: number): boolean {
  return statutAmont >= 400 && statutAmont < 500;
}

/**
 * Traduit une réponse non-ok de la passerelle en erreur d'API.
 *
 * `messageParDefaut` est le message public générique de l'API ; il n'est employé
 * que lorsqu'il n'y a rien de plus précis à dire.
 */
export function mapperErreurPasserelle(
  statutAmont: number,
  corps: CorpsAmont,
  messageParDefaut: string,
): ErreurPasserelleMappee {
  const codeAmont = typeof corps?.code === 'string' && corps.code.trim().length > 0 ? corps.code : undefined;
  const messageAmont = typeof corps?.error === 'string' && corps.error.trim().length > 0 ? corps.error : undefined;

  if (!estActionnableParUtilisateur(statutAmont)) {
    return { statusCode: 502, code: 'AI_GATEWAY_REQUEST_FAILED', message: messageParDefaut };
  }

  return {
    statusCode: statutAmont,
    code: codeAmont ?? 'AI_GATEWAY_REQUEST_FAILED',
    message: messageAmont ?? messageParDefaut,
  };
}
