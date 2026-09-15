/**
 * BUG-GIT-001 — « Committer les modifications » répondait `200` et ne
 * committait RIEN.
 *
 * LA CAUSE tient en un argument manquant. Quand l'intention d'un formulaire
 * est portée par le BOUTON qui l'envoie —
 *
 *     <button type="submit" name="intent" value="commit">
 *
 * — `new FormData(form)` **ne la contient pas**. La spécification HTML
 * n'inclut la paire nom/valeur du bouton que si on lui passe ce bouton en
 * second argument. Mesuré : `new FormData(form).get('intent')` rend `null`,
 * `new FormData(form, bouton).get('intent')` rend `'commit'`.
 *
 * Conséquence en production, relevée le 15/08 sur DEUX projets sur deux :
 * l'intention partait vide, la route ne reconnaissait aucun cas, ne faisait
 * AUCUN appel git… et répondait `200`. Le panneau affichait « action
 * effectuée », vidait le champ, et `HEAD` n'avait pas bougé. L'utilisateur
 * croyait son travail versionné.
 *
 * Ce module existe pour que la question ne se repose plus : tout envoi de
 * formulaire intercepté passe par ici.
 */
export function donneesDuFormulaire(evenement: { currentTarget: HTMLFormElement; nativeEvent?: Event }): FormData {
  const formulaire = evenement.currentTarget;
  const envoyeur = boutonEnvoyeur(evenement.nativeEvent);

  /*
   * Le second paramètre de `FormData` est récent : sur un moteur qui ne le
   * connaît pas, il est ignoré en silence et l'intention disparaîtrait à
   * nouveau. On rattrape alors la paire à la main plutôt que de faire
   * confiance.
   */
  const donnees = new FormData(formulaire, envoyeur);

  if (envoyeur?.name && !donnees.has(envoyeur.name)) {
    donnees.set(envoyeur.name, envoyeur.value);
  }

  return donnees;
}

function boutonEnvoyeur(evenement: Event | undefined): HTMLButtonElement | HTMLInputElement | null {
  const candidat = (evenement as SubmitEvent | undefined)?.submitter;

  if (candidat instanceof HTMLButtonElement || candidat instanceof HTMLInputElement) {
    return candidat;
  }

  return null;
}
