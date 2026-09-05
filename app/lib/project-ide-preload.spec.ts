import { afterEach, describe, expect, it } from 'vitest';
import {
  PANNEAUX_PRECHARGES,
  __chargerPanneauPourTests,
  __setChargeurRoutePanneauForTests,
} from './project-ide-loader.server';

/*
 * Précharger un panneau avec le document remplace un aller-retour navigateur
 * (~800 ms en production) par un appel en processus. Ce qui doit être tenu :
 *
 *  1. la LISTE reste celle des panneaux réellement demandés à froid — élargir
 *     à douze gonflerait un document en `no-store`, jamais mis en cache ;
 *  2. une enveloppe d'ERREUR n'est jamais semée (BUG-PANEL-CACHE-003 à
 *     l'envers : semer une erreur peint un panneau vide) ;
 *  3. une défaillance quelconque ne casse JAMAIS le rendu du document.
 */
const requete = new Request('https://e-code.ai/projects/p1/ide');
const contexte = {} as never;

const chargeurQuiRend = (charge: unknown) => () =>
  Promise.resolve({ loader: async () => new Response(JSON.stringify(charge), { status: 200 }) });

afterEach(() => __setChargeurRoutePanneauForTests(null));

describe('préchargement des panneaux avec le document', () => {
  it('ne précharge QUE les panneaux demandés à froid', () => {
    expect([...PANNEAUX_PRECHARGES]).toEqual(['snapshots', 'settings']);
  });

  it('rend la charge quand le panneau répond du contenu', async () => {
    __setChargeurRoutePanneauForTests(chargeurQuiRend({ panel: 'settings', status: 'ok', data: { a: 1 } }));

    const r = await __chargerPanneauPourTests(requete, 'p1', 'settings', contexte);

    expect(r).toEqual({ panel: 'settings', status: 'ok', data: { a: 1 } });
  });

  it("garde un panneau légitimement VIDE — `empty` est du contenu chargé", async () => {
    __setChargeurRoutePanneauForTests(chargeurQuiRend({ panel: 'snapshots', status: 'empty', data: {} }));

    await expect(__chargerPanneauPourTests(requete, 'p1', 'snapshots', contexte)).resolves.not.toBeNull();
  });

  it("refuse une enveloppe d'erreur au lieu de la semer", async () => {
    __setChargeurRoutePanneauForTests(chargeurQuiRend({ panel: 'settings', status: 'error', data: null }));

    await expect(__chargerPanneauPourTests(requete, 'p1', 'settings', contexte)).resolves.toBeNull();
  });

  it('refuse une charge sans données, même sans statut error', async () => {
    __setChargeurRoutePanneauForTests(chargeurQuiRend({ panel: 'settings', data: null }));

    await expect(__chargerPanneauPourTests(requete, 'p1', 'settings', contexte)).resolves.toBeNull();
  });

  /*
   * Les trois façons dont l'appel peut mal tourner. Aucune ne doit propager :
   * le document se rend, le client retombe sur son chargement actuel.
   */
  it('avale un import qui échoue', async () => {
    __setChargeurRoutePanneauForTests(() => Promise.reject(new Error('module introuvable')));
    await expect(__chargerPanneauPourTests(requete, 'p1', 'settings', contexte)).resolves.toBeNull();
  });

  it('avale un loader qui jette', async () => {
    __setChargeurRoutePanneauForTests(() => Promise.resolve({ loader: async () => { throw new Error('boum'); } }));
    await expect(__chargerPanneauPourTests(requete, 'p1', 'settings', contexte)).resolves.toBeNull();
  });

  it('avale une réponse au JSON invalide', async () => {
    __setChargeurRoutePanneauForTests(() =>
      Promise.resolve({ loader: async () => new Response('pas du json', { status: 200 }) }),
    );
    await expect(__chargerPanneauPourTests(requete, 'p1', 'settings', contexte)).resolves.toBeNull();
  });
});
