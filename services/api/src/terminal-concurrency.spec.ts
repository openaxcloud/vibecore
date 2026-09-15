import { beforeEach, describe, expect, it } from 'vitest';

import {
  acquireTerminalSlot,
  liveTerminalSockets,
  releaseTerminalSlot,
  resetTerminalSlots,
} from './terminal-concurrency.js';

/**
 * Régression BUG-QUOTA-001 — le créneau `terminals.concurrent` appartient à la
 * SESSION, pas au socket.
 *
 * Mesuré en réel (env d'audit, offre gratuite, limite 1) : 26× `429` sur le
 * seul `sessionId=terminal-user-0`, jauge en base à 1, un SEUL shell dans le
 * pod. Le quota faisait son travail sur la mauvaise unité — il refusait la
 * reconnexion de la session qui détenait déjà le créneau.
 *
 * `true` = un mouvement de quota doit être écrit ; `false` = rien à écrire.
 */
describe('BUG-QUOTA-001 — créneau de terminal par session', () => {
  beforeEach(() => resetTerminalSlots());

  it('ne facture que le PREMIER socket d’une session', () => {
    expect(acquireTerminalSlot('org', 'terminal-user-0'), 'première connexion').toBe(true);
    expect(acquireTerminalSlot('org', 'terminal-user-0'), 'rattachement').toBe(false);
    expect(acquireTerminalSlot('org', 'terminal-user-0'), 'second rattachement').toBe(false);
  });

  it('ne rembourse qu’au DERNIER socket de la session', () => {
    acquireTerminalSlot('org', 'terminal-user-0');
    acquireTerminalSlot('org', 'terminal-user-0');

    expect(releaseTerminalSlot('org', 'terminal-user-0'), 'il reste un socket').toBe(false);
    expect(releaseTerminalSlot('org', 'terminal-user-0'), 'dernier socket').toBe(true);
  });

  it('le RECOUVREMENT — le cas réel — ne bouge pas le quota et laisse un solde nul', () => {
    /*
     * Le nouveau socket ouvre AVANT que l'ancien ne se ferme : c'est la
     * séquence qui produisait le 429. Elle ne doit produire qu'un +1 puis un -1.
     */
    let solde = 0;

    solde += acquireTerminalSlot('org', 'terminal-user-0') ? 1 : 0; // 1re connexion
    solde += acquireTerminalSlot('org', 'terminal-user-0') ? 1 : 0; // rattachement, recouvre
    solde -= releaseTerminalSlot('org', 'terminal-user-0') ? 1 : 0; // l'ancien se ferme
    expect(solde, 'pendant le rattachement, le créneau reste pris exactement une fois').toBe(1);

    solde -= releaseTerminalSlot('org', 'terminal-user-0') ? 1 : 0; // le panneau se ferme
    expect(solde, 'solde après fermeture').toBe(0);
  });

  it('le SÉQUENTIEL donne le même solde que le recouvrement', () => {
    let solde = 0;

    solde += acquireTerminalSlot('org', 'terminal-user-0') ? 1 : 0;
    solde -= releaseTerminalSlot('org', 'terminal-user-0') ? 1 : 0;
    solde += acquireTerminalSlot('org', 'terminal-user-0') ? 1 : 0;

    expect(solde, 'une seule session vivante').toBe(1);
  });

  it('facture bien deux panneaux RÉELLEMENT distincts — le quota doit continuer de mordre', () => {
    /*
     * La contre-épreuve de l'assouplissement : si le registre confondait deux
     * sessions, il offrirait des terminaux gratuits. `user-1` doit être facturé.
     */
    expect(acquireTerminalSlot('org', 'terminal-user-0')).toBe(true);
    expect(acquireTerminalSlot('org', 'terminal-user-1')).toBe(true);
  });

  it('sépare les organisations', () => {
    expect(acquireTerminalSlot('org-a', 'terminal-user-0')).toBe(true);
    expect(acquireTerminalSlot('org-b', 'terminal-user-0'), 'autre org, autre créneau').toBe(true);
  });

  it('ne rembourse jamais une fermeture non appariée', () => {
    /*
     * Un remboursement à vide creuserait la jauge sous le réel et offrirait des
     * créneaux gratuits à l'org.
     */
    expect(releaseTerminalSlot('org', 'jamais-ouvert')).toBe(false);

    acquireTerminalSlot('org', 'terminal-user-0');
    expect(releaseTerminalSlot('org', 'terminal-user-0')).toBe(true);
    expect(releaseTerminalSlot('org', 'terminal-user-0'), 'double fermeture').toBe(false);
  });

  it('ne retient rien après la dernière fermeture', () => {
    acquireTerminalSlot('org', 'terminal-user-0');
    releaseTerminalSlot('org', 'terminal-user-0');

    expect(liveTerminalSockets('org', 'terminal-user-0'), 'pas de fuite de compteur').toBe(0);
  });
});
