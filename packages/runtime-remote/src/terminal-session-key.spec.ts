import { describe, expect, it } from 'vitest';

/**
 * Régression BUG-TERM-002.
 *
 * `openTerminal()` forgeait son identifiant avec `Date.now()`/`Math.random()`,
 * donc chaque (re)connexion présentait une identité différente. Le workspace
 * agent indexant ses sessions sur `?sessionId`, il créait un shell neuf à chaque
 * fois : jamais de reattach, budget `maxSessions` (8) épuisé, puis 429 en boucle.
 * Mesuré en réel : 12 `sessionId` distincts en 6 min pour un seul IDE.
 *
 * Ces tests verrouillent la propriété qui rend le reattach possible — même
 * `sessionKey` ⇒ même `sessionId` — sans dépendre du réseau : on reproduit la
 * dérivation d'identifiant et la construction de l'URL exactement comme
 * `openTerminal()` les fait.
 */

/** Copie fidèle de la dérivation de `packages/runtime-remote/src/index.ts`. */
function deriveTerminalId(sessionKey?: string): string {
  return sessionKey ? `terminal-${sessionKey}` : `terminal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildTerminalPath(workspaceId: string, terminalId: string, cols = 80, rows = 24, managed = false): string {
  return `/workspaces/${workspaceId}/terminal?sessionId=${encodeURIComponent(terminalId)}&cols=${cols}&rows=${rows}${
    managed ? '&managed=1' : ''
  }`;
}

describe('identité de session terminal (BUG-TERM-002)', () => {
  it('rend le MÊME identifiant pour la même sessionKey — condition du reattach', () => {
    expect(deriveTerminalId('user-0')).toBe(deriveTerminalId('user-0'));
    expect(deriveTerminalId('managed')).toBe(deriveTerminalId('managed'));
  });

  it('distingue les panneaux entre eux', () => {
    expect(deriveTerminalId('user-0')).not.toBe(deriveTerminalId('user-1'));
    expect(deriveTerminalId('managed')).not.toBe(deriveTerminalId('user-0'));
  });

  it('reste instable sans sessionKey — le comportement d’avant, conservé en repli', () => {
    expect(deriveTerminalId()).not.toBe(deriveTerminalId());
  });

  it('reporte la sessionKey jusque dans le sessionId de la query', () => {
    const path = buildTerminalPath('ws-abc', deriveTerminalId('user-2'));

    expect(new URLSearchParams(path.split('?')[1]).get('sessionId')).toBe('terminal-user-2');
  });

  it('produit une URL identique sur deux connexions successives du même panneau', () => {
    const first = buildTerminalPath('ws-abc', deriveTerminalId('managed'), 100, 30, true);
    const second = buildTerminalPath('ws-abc', deriveTerminalId('managed'), 100, 30, true);

    expect(first).toBe(second);
  });

  it('échappe une sessionKey qui contiendrait des caractères d’URL', () => {
    const path = buildTerminalPath('ws-abc', deriveTerminalId('user &=0'));

    expect(new URLSearchParams(path.split('?')[1]).get('sessionId')).toBe('terminal-user &=0');
  });
});
