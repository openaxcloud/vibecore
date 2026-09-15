/**
 * BUG-DB-003 — le panneau Database affichait « Status unavailable » pour une
 * base pourtant ACTIVE et connectée.
 *
 * `GET /projects/:id/databases` renvoie les connexions SANS aucun champ
 * `status`. Côté interface, `DatabaseWorkbench.tsx` ne renseigne `env.status`
 * que `if (o.status)` ; `localizedStatus` tombe donc dans sa branche `default`
 * et rend `databaseWorkbench.status.unknown`. L'utilisateur ne peut pas
 * distinguer une base saine d'une base en panne — mesuré en production le
 * 2026-09-01 sur un projet dont l'instance est `ACTIVE`.
 *
 * Module AUTONOME à dessein, comme `database-provisioning-staleness` : les
 * tests doivent porter sur le code RÉELLEMENT exécuté par la route, pas sur une
 * copie de sa logique restée dans `app.ts`.
 */

/**
 * Clé de secret qu'une instance gérée alimente, selon son environnement.
 *
 * Cette correspondance n'est pas inventée ici : c'est déjà celle qu'emploient
 * la réconciliation de `/databases` et le repli `databases` de la même route.
 */
export function cleSecretPourEnvironnement(environment?: string): string {
  return environment === 'production' ? 'PROD_DATABASE_URL' : 'DATABASE_URL';
}

/**
 * Statut à joindre à une connexion, ou `undefined` quand il est INCONNU.
 *
 * On ne renvoie un statut que lorsqu'une instance gérée alimente précisément
 * cette clé. Une connexion saisie à la main par l'utilisateur pointe vers une
 * base dont nous ne savons rien : prétendre « connectée » serait inventer un
 * fait, et c'est exactement le travers que ce correctif combat. Dans ce cas
 * l'absence de statut est la réponse juste, et « Status unavailable » devient
 * une information exacte au lieu d'un mensonge.
 */
export function statutConnexion(
  connectionKey: string,
  instance: { status: string; environment?: string } | undefined,
): string | undefined {
  if (!instance) {
    return undefined;
  }

  return cleSecretPourEnvironnement(instance.environment) === connectionKey
    ? instance.status.toLowerCase()
    : undefined;
}
