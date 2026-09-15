/**
 * Faut-il montrer que l'agent est en train d'écrire ?
 *
 * Avi : « pendant que l'agent travaille, il n'y a aucun retour — pas de bulle
 * "en train d'écrire", le texte surgit d'un bloc ».
 *
 * Ce qui existait : un spinner nu, centré, posé sous la liste. Il dit « quelque
 * chose tourne », pas « l'agent te répond ». Et il reste affiché pendant toute
 * la réponse, y compris quand le texte arrive déjà — donc au moment où il ne
 * sert plus à rien.
 *
 * Le libellé réutilise la clé déjà traduite du statut de streaming : une
 * chaîne de plus aurait été une chaîne de plus à traduire, pour dire la même
 * chose.
 *
 * La règle : on montre la bulle tant que RIEN n'est encore lisible. Dès que les
 * premiers caractères arrivent, c'est le texte lui-même qui dit que ça avance,
 * et la bulle disparaît.
 */
export interface EtatDuFil {
  /** Une réponse est en cours de production. */
  enCours: boolean;

  /** Rôle du dernier message du fil, s'il y en a un. */
  dernierRole?: 'user' | 'assistant' | 'system' | 'data';

  /** Nombre de caractères déjà lisibles dans le dernier message de l'agent. */
  caracteresDeLAgent: number;
}

export function fautIlMontrerLAgentEnEcriture(etat: EtatDuFil): boolean {
  if (!etat.enCours) {
    return false;
  }

  /*
   * Le dernier message vient de l'utilisateur : l'agent n'a rien commencé à
   * écrire, c'est précisément le moment où l'attente est la plus visible.
   */
  if (etat.dernierRole !== 'assistant') {
    return true;
  }

  return etat.caracteresDeLAgent === 0;
}
