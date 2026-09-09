import { json } from '~/lib/enterprise-api.server';

/**
 * BUG-STORAGE-001 — le panneau « Stockage d'objets » annonçait une cause FAUSSE.
 *
 * Object Storage (GCS) est derrière un drapeau (`OBJECT_STORAGE_ENABLED`) :
 * éteint, chaque route interne rend 404 avec le code `FEATURE_NOT_ENABLED`. On
 * traduit CE cas en `{ enabled: false }` pour que le panneau affiche un état
 * clair plutôt qu'un 502 ; toute autre erreur remonte.
 *
 * LE FOURRE-TOUT QUI FAISAIT MENTIR LE PANNEAU. La condition acceptait aussi
 * `payload.code === undefined` : N'IMPORTE QUEL 404 sans champ `code` devenait
 * « le stockage d'objets n'a pas été activé par un administrateur ». Une panne
 * amont — passerelle, route absente pendant un déploiement, proxy — se
 * présentait donc à l'écran comme une cause PRÉCISE ET FAUSSE, et envoyait
 * l'utilisateur faire activer ce qui l'était déjà. Mesuré le 15/08 : la
 * fonctionnalité était active, et c'est l'amont qui ne répondait pas.
 *
 * Vérifié avant de resserrer, plutôt que supposé : notre API met TOUJOURS le
 * code quand la fonctionnalité est éteinte (`OBJECT_STORAGE_DISABLED` →
 * `code: 'FEATURE_NOT_ENABLED'`), et le seul autre 404 du domaine
 * (`BUCKET_NOT_PROVISIONED`) porte le sien. Aucun cas légitime ne passait par
 * la branche `undefined` — elle n'attrapait que des pannes, pour les déguiser.
 *
 * Une erreur qu'on ne sait pas nommer se remonte comme une erreur : un message
 * faux coûte plus cher qu'un message générique, parce qu'il envoie chercher au
 * mauvais endroit.
 *
 * ⚠️ Ce module vit HORS du module de route. React Router considère TOUT export
 * d'un module de route comme un export de route, et refuse de construire quand
 * il dépend de code serveur — c'est exactement ce que j'ai cassé en exportant
 * cette fonction depuis la route pour la tester.
 */
export async function objectStorageResultOrDisabled(error: unknown): Promise<ReturnType<typeof json>> {
  if (error instanceof Response && error.status === 404) {
    const payload = (await error
      .clone()
      .json()
      .catch(() => ({}))) as { code?: string };

    if (payload.code === 'FEATURE_NOT_ENABLED') {
      return json({ enabled: false, objects: [], folders: [] });
    }
  }

  throw error;
}
