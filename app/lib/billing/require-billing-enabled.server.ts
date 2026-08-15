import { billingEnabled } from '@vibecore/billing';

/*
 * KILL-SWITCH FACTURATION — garde des ROUTES Remix.
 *
 * Symétrique de la garde Fastify côté API : à OFF, une page de facturation ne
 * doit pas seulement être vide ou rediriger, elle ne doit pas EXISTER. Une
 * redirection laisserait l'URL découvrable et confirmerait qu'il y a quelque
 * chose derrière ; un rendu vide laisserait le loader s'exécuter, donc appeler
 * l'API de facturation.
 *
 * Le `throw new Response` interrompt AVANT tout travail du loader — aucune
 * requête vers l'API, aucune donnée de plan chargée, aucune surface rendue.
 *
 * Corps vide et 404 sec, pour la même raison que côté API : un message ou un
 * code de refus apprendrait à un visiteur que la page existe et qu'elle est
 * seulement éteinte.
 */
export function requireBillingEnabled(): void {
  if (!billingEnabled()) {
    throw new Response(null, { status: 404 });
  }
}
