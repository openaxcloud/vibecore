/*
 * LA CAPACITÉ SE MESURE SUR LE RÉSULTAT, PAS SUR LA DISPONIBILITÉ.
 *
 * `provider-fallback.ts` écarte un fournisseur qui REFUSE de répondre — crédit,
 * authentification, quota, panne, délai. Tous ces signaux arrivent AVANT la
 * génération, et c'est leur limite : un fournisseur qui répond `200`, produit du
 * texte, et n'écrit aucun fichier est traité comme une réussite. L'utilisateur
 * reçoit une application vide et la plateforme n'a rien à signaler.
 *
 * Avi tranche le 2026-09-10 : « un fournisseur qui rend zéro fichier sur une
 * consigne de construction est inapte à cette tâche et la chaîne doit avancer au
 * maillon suivant ».
 *
 * TROIS LIMITES, POSÉES AVANT DE MESURER, ET TENUES PAR LES TESTS :
 *
 *  1. UNE GÉNÉRATION EST PERDUE pour établir l'inaptitude. On ne peut pas le
 *     savoir d'avance : c'est le prix, et il est assumé. En échange le tour
 *     SUIVANT part sur un maillon capable au lieu de répéter le vide.
 *
 *  2. LE CRITÈRE NE VAUT QU'EN MODE CONSTRUCTION. « Explique-moi ce fichier »
 *     n'écrit aucun fichier et c'est la bonne réponse : appliquer le critère là
 *     déclarerait inapte un fournisseur qui a parfaitement travaillé.
 *
 *  3. SI AUCUN MAILLON NE CONVIENT, ON ÉCHOUE FRANCHEMENT. Une erreur visible
 *     vaut mieux qu'une application vide présentée comme une réussite — c'est
 *     tout le défaut que ce module existe pour supprimer.
 */

export type ConstatDeTour = Readonly<{
  /** Le tour DEMANDAIT des fichiers (mode construction), par opposition à une question. */
  modeConstruction: boolean;

  /** Fichiers réellement écrits par ce tour. */
  fichiersEcrits: number;

  /**
   * Le flux s'est terminé normalement. Un flux coupé (réseau, annulation,
   * plafond de jetons) n'établit RIEN sur la capacité du fournisseur : il n'a
   * pas eu l'occasion de finir. Le confondre avec une inaptitude écarterait un
   * fournisseur sain sur un incident de transport.
   */
  termine: boolean;
}>;

/** Vrai quand ce tour établit que le fournisseur est inapte À CETTE TÂCHE. */
export function fournisseurInapte(constat: ConstatDeTour): boolean {
  if (!constat.modeConstruction) {
    return false;
  }

  if (!constat.termine) {
    return false;
  }

  return constat.fichiersEcrits === 0;
}

export type Maillon = Readonly<{ provider: string; model: string }>;

export type DecisionDeChaine =
  | Readonly<{ action: 'garder' }>
  | Readonly<{ action: 'avancer'; maillon: Maillon }>
  | Readonly<{ action: 'echouer'; raison: 'aucun-maillon-apte' }>;

/**
 * Décide de la suite après un tour, connaissant les maillons déjà jugés inaptes.
 *
 * `chaine` est parcourue DANS L'ORDRE : on ne revient jamais en arrière sur un
 * maillon déjà déclaré inapte pendant la même fenêtre, sinon la chaîne boucle
 * sur le premier vide.
 */
export function decisionDeChaine(
  constat: ConstatDeTour,
  chaine: readonly Maillon[],
  courant: string,
  inaptes: ReadonlySet<string>,
): DecisionDeChaine {
  if (!fournisseurInapte(constat)) {
    return { action: 'garder' };
  }

  const dejaInaptes = new Set(inaptes);
  dejaInaptes.add(courant);

  const indexCourant = chaine.findIndex((maillon) => maillon.provider === courant);
  const suivants = indexCourant === -1 ? chaine : chaine.slice(indexCourant + 1);
  const suivant = suivants.find((maillon) => !dejaInaptes.has(maillon.provider));

  if (!suivant) {
    return { action: 'echouer', raison: 'aucun-maillon-apte' };
  }

  return { action: 'avancer', maillon: suivant };
}
