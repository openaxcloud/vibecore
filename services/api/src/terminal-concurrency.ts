/*
 * BUG-QUOTA-001 — le quota `terminals.concurrent` était décompté PAR CONNEXION
 * WebSocket, pas par SESSION de terminal.
 *
 * Révélé par la correction de BUG-TERM-002 : une fois les identifiants
 * stabilisés, l'agent rattache bien la session existante — mais l'API comptait
 * la nouvelle connexion comme un terminal concurrent DE PLUS. Sur l'offre
 * gratuite (limite 1), la moindre reconnexion du même panneau était donc
 * rejetée. Mesuré en réel : 26× 429 sur le seul `sessionId=terminal-user-0`,
 * jauge à 1, un seul shell dans le pod. La jauge était HONNÊTE — elle comptait
 * une session réellement ouverte, et refusait la reconnexion de cette
 * même session. Le défaut n'était pas un compteur qui fuit, c'était l'unité de
 * décompte.
 *
 * Le registre ci-dessous rend le créneau propriété de la SESSION : il n'est
 * facturé qu'à la transition 0→1 de sockets vivants pour un `sessionId`, et
 * remboursé qu'à la transition 1→0. Un rattachement qui recouvre l'ancienne
 * connexion (le nouveau socket ouvre avant que l'ancien ne se ferme) passe donc
 * par 1→2 puis 2→1 : aucun mouvement de quota, et aucun 429.
 *
 * Les deux ordres d'événements donnent le même solde :
 *   - recouvrement : +1(0→1), ouvre(1→2), ferme(2→1), ferme(1→0) → -1
 *   - séquentiel   : +1(0→1), ferme(1→0) → -1, ouvre(0→1) → +1
 *
 * PORTÉE — le registre est en mémoire, donc par pod d'API. Deux connexions de
 * la même session servies par deux pods différents facturent chacune leur
 * créneau : c'est le comportement d'AVANT, pas une régression, et la fenêtre
 * glissante de `computeUsageForQuota` fait vieillir l'orphelin exactement comme
 * elle le faisait déjà pour un `onClose` perdu (redéploiement, coupure du LB).
 */

/** Sockets vivants par `organizationId` puis par `sessionId`. */
const liveSockets = new Map<string, Map<string, number>>();

/**
 * Déclare un socket ouvert. Rend `true` si un créneau de quota doit être
 * facturé — c'est-à-dire seulement pour le PREMIER socket de cette session.
 */
export function acquireTerminalSlot(organizationId: string, sessionId: string): boolean {
  const parOrg = liveSockets.get(organizationId) ?? new Map<string, number>();
  liveSockets.set(organizationId, parOrg);

  const avant = parOrg.get(sessionId) ?? 0;
  parOrg.set(sessionId, avant + 1);

  return avant === 0;
}

/**
 * Déclare un socket fermé. Rend `true` si le créneau doit être remboursé —
 * seulement quand le DERNIER socket de cette session disparaît.
 *
 * Une fermeture non appariée (socket jamais déclaré ouvert, ou fermé deux fois)
 * ne rembourse RIEN : rembourser à vide creuserait la jauge sous le réel et
 * offrirait des créneaux gratuits.
 */
export function releaseTerminalSlot(organizationId: string, sessionId: string): boolean {
  const parOrg = liveSockets.get(organizationId);
  const avant = parOrg?.get(sessionId) ?? 0;

  if (!parOrg || avant === 0) {
    return false;
  }

  if (avant > 1) {
    parOrg.set(sessionId, avant - 1);

    return false;
  }

  parOrg.delete(sessionId);

  if (parOrg.size === 0) {
    liveSockets.delete(organizationId);
  }

  return true;
}

/** Sockets vivants comptés pour une session — sonde de test et de diagnostic. */
export function liveTerminalSockets(organizationId: string, sessionId: string): number {
  return liveSockets.get(organizationId)?.get(sessionId) ?? 0;
}

/** Remise à zéro — réservée aux tests, pour qu'ils ne se contaminent pas. */
export function resetTerminalSlots(): void {
  liveSockets.clear();
}
