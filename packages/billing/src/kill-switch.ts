/*
 * KILL-SWITCH FACTURATION — source de vérité UNIQUE, fail-closed.
 *
 * Décision produit : « gratuit d'abord ». Tant que ce drapeau n'est pas
 * explicitement activé, la plateforme ne doit ni encaisser, ni afficher quoi que
 * ce soit de payant, ni bloquer un utilisateur sur un compteur.
 *
 * Trois propriétés portent la sûreté de ce module :
 *
 *  1. FAIL-CLOSED. Absent, vide, illisible, valeur inattendue, environnement qui
 *     lève à la lecture — tout ce qui n'est pas un « oui » explicite vaut NON.
 *     Un kill-switch qui s'ouvre sur une erreur de configuration ne protège
 *     rien : c'est précisément le jour où la variable manque qu'on ne veut pas
 *     encaisser.
 *
 *  2. UN SEUL drapeau. Deux drapeaux, c'est deux vérités possibles, donc une
 *     surface qui reste allumée pendant qu'une autre s'éteint. Toute décision —
 *     serveur, route Remix, composant — dérive d'ici.
 *
 *  3. Lecture via `globalThis.process.env`. Le bundle SSR passe par
 *     `vite-plugin-node-polyfills`, qui remplace `process.env` par un objet VIDE :
 *     un `process.env.X` nu y rend `undefined` quelles que soient les variables
 *     réelles du pod. Le piège est connu et documenté (voir `readRuntimeEnv`) ;
 *     ici il aurait été silencieux ET fail-closed, donc invisible — la
 *     facturation serait restée éteinte après un futur passage au payant, sans
 *     que rien ne le signale.
 */

/** Nom de la variable d'environnement, unique et explicite. */
export const BILLING_ENABLED_ENV = 'BILLING_ENABLED';

/** Les seules valeurs qui ACTIVENT la facturation. Tout le reste vaut OFF. */
const AFFIRMATIVE = new Set(['true', '1', 'on', 'yes', 'enabled']);

export type EnvLike = Record<string, string | undefined>;

/**
 * Lit la variable dans l'environnement d'exécution réel.
 *
 * `globalThis.process.env` et non `process.env` : voir la note 3 ci-dessus.
 */
function ambientEnv(): EnvLike | undefined {
  try {
    return (globalThis as { process?: { env?: EnvLike } }).process?.env;
  } catch {
    return undefined;
  }
}

/**
 * La facturation est-elle activée ?
 *
 * @param env environnement explicite ; par défaut celui du runtime.
 */
export function billingEnabled(env: EnvLike | undefined = ambientEnv()): boolean {
  let raw: unknown;

  try {
    raw = env?.[BILLING_ENABLED_ENV];
  } catch {
    /*
     * Un objet d'environnement peut lever à l'accès (proxy, getter). On ne
     * distingue pas ce cas d'une absence : les deux valent OFF.
     */
    return false;
  }

  if (typeof raw !== 'string') {
    return false;
  }

  return AFFIRMATIVE.has(raw.trim().toLowerCase());
}

/** Inverse lisible : vrai quand le kill-switch est ARMÉ (plateforme gratuite). */
export function billingKillSwitchArmed(env?: EnvLike): boolean {
  return !billingEnabled(env);
}

/**
 * Erreur unique levée par les chemins serveur de paiement quand le kill-switch
 * est armé.
 *
 * Le statut est **404** et non 403 : à OFF, ces routes ne doivent pas seulement
 * refuser, elles ne doivent pas EXISTER. Un 403 confirmerait à un appelant —
 * ou à un scanner — qu'un point d'entrée de paiement est là, simplement fermé.
 */
export class BillingDisabledError extends Error {
  readonly statusCode = 404;
  readonly code = 'BILLING_DISABLED';

  constructor(surface?: string) {
    super(surface ? `Billing is disabled (${surface}).` : 'Billing is disabled.');
    this.name = 'BillingDisabledError';
  }
}
