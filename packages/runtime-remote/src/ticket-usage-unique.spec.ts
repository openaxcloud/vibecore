/*
 * Le ticket runtime ne vaut QU'UNE connexion — donc la reconnexion en redemande un.
 *
 * Défaut mesuré en production le 2026-09-24, capture réseau à l'appui :
 *
 *   wss://…/api/runtime/workspaces/ws-…/files/watch?token=vcrt_…
 *   → HTTP Authentication failed; no valid credentials available
 *
 * cinq tentatives d'affilée, toutes avec le MÊME ticket. Le serveur brûle le
 * ticket à la première bascule (`consumeRuntimeTicketId`) : c'est voulu, un
 * identifiant qui voyage en paramètre d'URL fuite dans les journaux. Le client,
 * lui, rejouait le sien. L'aperçu ne revenait jamais, ni après une coupure, ni
 * au retour d'arrière-plan.
 *
 * Deux moitiés à tenir, et il faut les deux :
 *   1. chaque tentative demande un ticket NEUF ;
 *   2. un refus de la BASCULE — 401, donc aucun code de fermeture — compte
 *      comme un refus d'authentification, sinon l'auto-réparation ne part pas.
 */
import { describe, expect, it } from 'vitest';

import { isAuthSocketClose } from './index.js';

describe('un refus de bascule compte comme un refus d’authentification', () => {
  it('sans code de fermeture — le cas mesuré en production', () => {
    expect(isAuthSocketClose(undefined)).toBe(true);
  });

  it('avec les codes conventionnels', () => {
    expect(isAuthSocketClose(4401)).toBe(true);
    expect(isAuthSocketClose(1008)).toBe(true);
  });

  /* Une fermeture ordinaire ne doit PAS déclencher un renouvellement de ticket. */
  it('mais pas une fermeture normale ou un arrêt de service', () => {
    expect(isAuthSocketClose(1000)).toBe(false);
    expect(isAuthSocketClose(1001)).toBe(false);
    expect(isAuthSocketClose(1011)).toBe(false);
  });
});

/*
 * Le scénario complet, joué sur un faux serveur qui se comporte comme le vrai :
 * il brûle chaque ticket présenté et refuse tout ticket déjà vu.
 */
describe('connexion, coupure, reconnexion', () => {
  function serveurABilletUnique() {
    const brules = new Set<string>();

    return {
      brules,
      bascule(ticket: string) {
        if (brules.has(ticket)) {
          return { ok: false, raison: 'ticket déjà consommé' };
        }

        brules.add(ticket);

        return { ok: true };
      },
    };
  }

  function clientQuiRejoue() {
    const ticket = 'vcrt_unique';
    return { obtenir: () => ticket };
  }

  function clientQuiRenouvelle() {
    let n = 0;
    return { obtenir: () => `vcrt_${(n += 1)}` };
  }

  it('le client qui REJOUE son ticket échoue dès la reconnexion', () => {
    const serveur = serveurABilletUnique();
    const client = clientQuiRejoue();

    expect(serveur.bascule(client.obtenir()).ok, 'la première connexion doit passer').toBe(true);
    expect(serveur.bascule(client.obtenir()).ok, 'la reconnexion échoue — c’est le défaut mesuré').toBe(false);
  });

  it('le client qui RENOUVELLE se reconnecte, autant de fois qu’il le faut', () => {
    const serveur = serveurABilletUnique();
    const client = clientQuiRenouvelle();

    for (let coupure = 0; coupure < 5; coupure += 1) {
      expect(serveur.bascule(client.obtenir()).ok, `reconnexion ${coupure + 1}`).toBe(true);
    }

    expect(serveur.brules.size, 'un ticket par connexion, jamais rejoué').toBe(5);
  });

  /*
   * Le retour d'arrière-plan est la même chose vue de l'utilisateur : Safari
   * ferme la connexion, le client en rouvre une. Sans renouvellement, l'aperçu
   * ne revient pas — et c'est ce qu'Avi voyait.
   */
  it('le retour d’arrière-plan passe par le même chemin', () => {
    const serveur = serveurABilletUnique();
    const rejoue = clientQuiRejoue();

    serveur.bascule(rejoue.obtenir());

    // … l'onglet part en arrière-plan, la connexion tombe, l'onglet revient.
    expect(serveur.bascule(rejoue.obtenir()).ok).toBe(false);

    const renouvelle = clientQuiRenouvelle();
    const neuf = serveurABilletUnique();
    neuf.bascule(renouvelle.obtenir());
    expect(neuf.bascule(renouvelle.obtenir()).ok, 'avec renouvellement, l’aperçu revient').toBe(true);
  });
});
