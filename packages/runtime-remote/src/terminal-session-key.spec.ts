import { describe, expect, it } from 'vitest';

import { buildTerminalPath, deriveTerminalId } from './terminal-session.js';

/**
 * Régression BUG-TERM-002.
 *
 * `openTerminal()` forgeait son identifiant avec `Date.now()`/`Math.random()`,
 * donc chaque (re)connexion présentait une identité différente. Le workspace
 * agent indexant ses sessions sur `?sessionId`, il créait un shell neuf à chaque
 * fois : jamais de reattach, budget `maxSessions` (8) épuisé, puis 429 en boucle.
 * Mesuré en réel : 12 `sessionId` distincts en 6 min pour un seul IDE.
 *
 * ⚠️ CE FICHIER NE TENAIT PAS LE CORRECTIF. Il RECOPIAIT la dérivation de
 * `index.ts` au lieu de l'importer — « copie fidèle », disait le commentaire.
 * Contre-épreuve faite : en retirant le correctif du vrai `openTerminal()`, les
 * 6 tests restaient au VERT. Un garde-fou qui épingle sa propre copie rassure
 * sans protéger, ce qui est pire que pas de garde-fou.
 *
 * Les fonctions viennent désormais de `terminal-session.ts`, celles-là mêmes que
 * `openTerminal()` appelle : retirer le correctif fait maintenant tomber ces
 * tests.
 */

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
