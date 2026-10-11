/**
 * Les propositions empilées, et celles qui se sont fermées toutes seules.
 *
 * Règle 28. GitHub ferme automatiquement une proposition dont la branche de
 * base est supprimée — et on supprime la branche APRÈS l'avoir fusionnée. La
 * fille se ferme donc à l'instant où le travail dont elle dépendait arrive.
 * Mesuré : #321 fusionnée à 03:12:52, #326 fermée à 03:12:54. Deux secondes,
 * quinze jours de perte, sept fichiers.
 *
 * Ce module ne décide rien : il RÉPOND à deux questions qu'on oublie de poser.
 */

/** Une seconde en millisecondes — l'unité dans laquelle se mesure ce piège. */
const MILLISECONDES = 1000;

/**
 * Les propositions ouvertes qu'une fusion de `base` fermerait.
 *
 * On les veut AVANT de fusionner : une fille trouvée se rebase sur `main` ou
 * change de base. Après, il est trop tard — et rien ne le signale.
 */
export function fillesDe(propositions, base) {
  return propositions.filter((pr) => pr.state === 'OPEN' && pr.baseRefName === base).map((pr) => pr.number);
}

/**
 * Les propositions ouvertes empilées sur une branche que PLUS AUCUNE
 * proposition ouverte ne porte vers `main`.
 *
 * C'est l'état terminal du piège : le travail existe, il est sur une branche,
 * et rien ne l'emmène nulle part.
 */
export function empilementsSansPorteur(propositions) {
  const ouvertes = propositions.filter((pr) => pr.state === 'OPEN');
  const portees = new Set(ouvertes.map((pr) => pr.headRefName));

  return ouvertes
    .filter((pr) => pr.baseRefName !== 'main' && !portees.has(pr.baseRefName))
    .map((pr) => ({ numero: pr.number, base: pr.baseRefName }));
}

/**
 * Les fermetures survenues à quelques secondes d'une fusion.
 *
 * Une fermeture à la seconde près d'une fusion n'est pas une décision humaine.
 * `fenetreSecondes` est volontairement étroite : on cherche la signature de
 * l'automatisme, pas toutes les fermetures d'une journée.
 */
export function fermeturesSuspectes(propositions, fenetreSecondes = 10) {
  const fusions = propositions
    .filter((pr) => pr.mergedAt)
    .map((pr) => ({ numero: pr.number, branche: pr.headRefName, quand: Date.parse(pr.mergedAt) }));

  const suspectes = [];

  for (const pr of propositions) {
    if (pr.state !== 'CLOSED' || pr.mergedAt || !pr.closedAt) {
      continue;
    }

    const ferme = Date.parse(pr.closedAt);

    for (const fusion of fusions) {
      const ecart = (ferme - fusion.quand) / MILLISECONDES;

      if (ecart >= 0 && ecart <= fenetreSecondes && fusion.branche === pr.baseRefName) {
        suspectes.push({ numero: pr.number, fermeeApres: fusion.numero, ecartSecondes: ecart });
      }
    }
  }

  return suspectes;
}
