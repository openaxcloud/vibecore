/**
 * BUG-AI-001 — le garde-fou anti-gaspillage tuait ce qu'il devait protéger.
 *
 * Les routes câblaient `request.raw.on('close', () => abortController.abort())`
 * pour annuler un appel fournisseur payant quand le client s'en va. Mais sous
 * Node, `close` sur la requête ENTRANTE se déclenche quand le flux de requête
 * est consommé — pas seulement quand le client se déconnecte. Pour un POST dont
 * Fastify a déjà bufférisé le corps, cela arrive immédiatement : chaque appel
 * s'auto-annulait.
 *
 * Mesuré en production le 2026-09-01, sur le même pod, dans le même processus,
 * au même instant, avec le même corps :
 *   - appel direct à `gateway.complete()` : SUCCÈS en 1182 ms
 *   - le même corps via la route HTTP     : 500 en 98 ms
 * et en rejouant `complete()` avec un signal avorté après 50 ms : `AbortError`
 * en 66 ms, sans `statusCode` — donc mappé en 500 générique. La signature
 * correspond.
 *
 * La branche streaming était touchée plus gravement encore : HTTP 200, zéro
 * morceau produit, zéro octet — un succès apparent au contenu vide, sans
 * erreur, sans journal, sans métrique.
 *
 * Le bon signal est la RÉPONSE, pas la requête : `close` sur la réponse se
 * déclenche à la fin de l'échange, et seule une fermeture survenue AVANT que
 * nous ayons fini d'écrire signifie que le client est réellement parti.
 */

type ReponseBrute = {
  on(evenement: 'close', ecouteur: () => void): unknown;
  off(evenement: 'close', ecouteur: () => void): unknown;
  readonly writableEnded: boolean;
};

/**
 * `true` seulement si la fermeture traduit un départ RÉEL du client.
 *
 * Exporté pour être testé directement : c'est cette décision-là qui portait le
 * défaut, et un test qui ne l'appelle pas ne la tient pas.
 */
export function estUneDeconnexionReelle(reponse: Pick<ReponseBrute, 'writableEnded'>): boolean {
  return !reponse.writableEnded;
}

/**
 * Branche `onDeconnexion` sur un départ réel du client, et rend la fonction de
 * débranchement à appeler dans le `finally` de la route.
 */
export function surDeconnexionClient(reponse: ReponseBrute, onDeconnexion: () => void): () => void {
  const ecouteur = () => {
    if (estUneDeconnexionReelle(reponse)) {
      onDeconnexion();
    }
  };

  reponse.on('close', ecouteur);

  return () => {
    reponse.off('close', ecouteur);
  };
}
