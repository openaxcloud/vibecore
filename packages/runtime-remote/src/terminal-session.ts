/*
 * BUG-TERM-002 — identité de session d'un panneau de terminal, extraite de
 * `openTerminal()` (index.ts) pour être testable sans socket.
 *
 * `openTerminal()` forgeait son identifiant avec `Date.now()`/`Math.random()`,
 * donc chaque (re)connexion présentait une identité différente. Le workspace
 * agent indexant ses sessions sur `?sessionId`, il créait un shell neuf à
 * chaque fois : jamais de reattach, budget `maxSessions` (8) épuisé, puis 429
 * en boucle. Mesuré en réel : 12 `sessionId` distincts en 6 min pour un seul
 * IDE, dont six dans la MÊME seconde.
 *
 * POURQUOI CE FICHIER EXISTE PLUTÔT QU'UN TEST À CÔTÉ. Le garde-fou précédent
 * RECOPIAIT cette dérivation dans son propre fichier de test. Retirer le
 * correctif du vrai `openTerminal()` laissait donc ses 6 tests au VERT :
 * il épinglait sa copie, pas le produit. La dérivation vit désormais ici, et
 * `openTerminal()` comme le test consomment la MÊME fonction — c'est ce qui
 * fait qu'en retirer le correctif fait tomber le test.
 */

/**
 * Identifiant de session présenté à l'agent. DÉTERMINISTE dès qu'un
 * `sessionKey` stable par panneau est fourni : c'est la condition du reattach,
 * l'agent clé son shell sur `?sessionId`.
 *
 * Le repli aléatoire reste pour les appelants sans identité de panneau stable —
 * il fonctionne, mais ne peut jamais se rattacher.
 */
export function deriveTerminalId(sessionKey?: string): string {
  return sessionKey ? `terminal-${sessionKey}` : `terminal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Chemin WebSocket du terminal. `sessionId` est encodé : une `sessionKey`
 * portant `&` ou `=` tronquerait sinon la query et ferait repartir l'agent sur
 * une autre session — donc sur un shell neuf.
 */
export function buildTerminalPath(
  workspaceId: string,
  terminalId: string,
  cols = 80,
  rows = 24,
  managed = false,
): string {
  return `/workspaces/${workspaceId}/terminal?sessionId=${encodeURIComponent(
    terminalId,
  )}&cols=${cols}&rows=${rows}${managed ? '&managed=1' : ''}`;
}
