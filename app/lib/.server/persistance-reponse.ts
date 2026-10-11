/*
 * LA RÉPONSE DE L'AGENT SURVIT AU NAVIGATEUR.
 *
 * Mesuré le 2026-09-30 en production (projet `cmunqgqny000z0na5jda54tas`) : la
 * connexion du client coupée 42 s après l'envoi, le serveur a CONTINUÉ le tour
 * jusqu'à sa fin normale (`finishReason: stop`, 19 932 caractères, facturés) —
 * mais la base n'en gardait que 1 080 : le fil n'était poussé que par le
 * NAVIGATEUR. L'utilisateur revenait sur une réponse tronquée, sans rien pour
 * le dire. C'est le cas de l'onglet Safari passé en arrière-plan.
 *
 * Le serveur écrit donc lui-même la réponse complète à la fin du tour, sur la
 * MÊME ligne que le navigateur : l'API rattache un message à
 * `sha256(conversationId:clientId)` avec un `upsert`, et `clientId` est
 * l'identifiant stable du message de réponse, celui que le navigateur reprend.
 * Jamais de doublon, quel que soit l'ordre des deux écritures.
 *
 * Étape 2 sur 3. L'étape 1 (#581) écrit la DEMANDE avant l'appel au modèle.
 * Épinglé par `persistance-reponse.spec.ts` et `persistance-reponse-cablage.spec.ts`.
 */
import { sansReflexion } from '~/lib/chat/rattrapage-reprise';

export interface ReponseAPersister {
  conversationId: string;
  clientId: string;
  content: string;
}

export function reponseAPersister(input: {
  conversationId?: string | null;
  clientId?: string | null;
  contenu?: string | null;
}): ReponseAPersister | null {
  const conversationId = typeof input.conversationId === 'string' ? input.conversationId.trim() : '';
  const clientId = typeof input.clientId === 'string' ? input.clientId.trim() : '';

  /*
   * JAMAIS DE RAISONNEMENT dans la version du serveur : c'est ainsi que le
   * rattrapage, côté navigateur, la distingue de la copie partielle que le
   * navigateur enregistre lui-même pendant le tour (`estLaVersionDuServeur`).
   * Le texte du modèle n'en porte pas aujourd'hui ; ce retrait garantit qu'il
   * n'en portera pas demain.
   */
  const content = typeof input.contenu === 'string' ? sansReflexion(input.contenu).texte : '';

  /*
   * Une réponse vide ne s'écrit pas : elle écraserait la ligne que le
   * navigateur a peut-être déjà remplie, et un message d'assistant vide est un
   * défaut déjà corrigé ailleurs (#312).
   */
  if (!conversationId || !clientId || content.trim().length === 0) {
    return null;
  }

  return { conversationId, clientId, content };
}
