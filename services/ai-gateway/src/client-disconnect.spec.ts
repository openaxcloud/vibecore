/*
 * BUG-AI-001 — deux mécanismes SÉPARÉS, et il ne faut troquer ni l'un ni
 * l'autre :
 *   1. une requête qui va jusqu'au bout ne doit PAS être annulée ;
 *   2. une déconnexion RÉELLE doit toujours l'annuler — le garde-fou
 *      anti-gaspillage doit continuer de protéger l'appel payant.
 *
 * Les tests montent un VRAI serveur : `app.inject` ne reproduit pas le défaut
 * (light-my-request ne déclenche pas `close` comme un socket). Mesuré : par
 * `inject`, statut 200 et signal non avorté, alors que par un socket réel le
 * même code rendait 500 avec le signal avorté. Un test qui passe par `inject`
 * serait resté vert sur le code fautif.
 */
import { describe, expect, it } from 'vitest';

import { buildAiGatewayApp } from './app.js';
import { estUneDeconnexionReelle } from './client-disconnect.js';
import type { AiGateway } from './gateway.js';

function passerelleObservante(vu: { avorte?: boolean }) {
  return {
    health: async () => [],
    models: () => [],
    async *stream(_corps: unknown, signal: AbortSignal) {
      for (let i = 0; i < 3; i += 1) {
        await new Promise((r) => setTimeout(r, 40));
        vu.avorte = signal.aborted;

        if (signal.aborted) {
          return;
        }

        yield { type: 'text', value: 'a' };
      }
    },
    complete: async (_corps: unknown, signal: AbortSignal) => {
      await new Promise((r) => setTimeout(r, 60));
      vu.avorte = signal.aborted;

      if (signal.aborted) {
        const erreur = new Error('aborted');
        erreur.name = 'AbortError';
        throw erreur;
      }

      return {
        provider: 'openai',
        model: 'm',
        content: 'ok',
        usage: { inputTokens: 1, outputTokens: 1, estimatedCostCents: 0 },
      };
    },
  } as unknown as AiGateway;
}

async function serveur(vu: { avorte?: boolean }) {
  const app = await buildAiGatewayApp({
    gateway: passerelleObservante(vu),
    logger: false,
    env: {},
    agentRunPersistence: null,
  });
  await app.listen({ port: 0, host: '127.0.0.1' });

  const { port } = app.server.address() as { port: number };

  return { app, url: `http://127.0.0.1:${port}/chat/completions` };
}

describe('annulation sur déconnexion du client', () => {
  it('1. décide sur la RÉPONSE, pas sur la consommation de la requête', () => {
    // Réponse déjà écrite en entier : la fermeture est normale, pas un départ.
    expect(estUneDeconnexionReelle({ writableEnded: true })).toBe(false);
    // Fermeture avant la fin de l'écriture : le client est réellement parti.
    expect(estUneDeconnexionReelle({ writableEnded: false })).toBe(true);
  });

  it('2. une complétion menée à son terme n’est PAS annulée', async () => {
    const vu: { avorte?: boolean } = {};
    const { app, url } = await serveur(vu);

    const reponse = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }),
    });

    expect(reponse.status).toBe(200);
    expect(vu.avorte).toBe(false);

    await app.close();
  }, 20_000);

  it('3. un flux mené à son terme produit RÉELLEMENT des octets', async () => {
    /*
     * Le défaut d'origine rendait 200 avec ZÉRO morceau : un succès apparent au
     * contenu vide. Vérifier le seul statut serait resté vert.
     */
    const vu: { avorte?: boolean } = {};
    const { app, url } = await serveur(vu);

    const reponse = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'x' }] }),
    });
    const corps = await reponse.text();

    expect(reponse.status).toBe(200);
    expect(vu.avorte).toBe(false);
    expect(corps.length).toBeGreaterThan(0);

    await app.close();
  }, 20_000);

  it('4. CONTRE-ÉPREUVE — une déconnexion réelle annule toujours', async () => {
    /*
     * Sans ce test, on troquerait un défaut contre l'autre : ne plus jamais
     * annuler laisserait tourner l'appel fournisseur PAYANT après le départ du
     * client, ce que le câblage d'origine cherchait précisément à éviter.
     */
    const vu: { avorte?: boolean } = {};
    const { app, url } = await serveur(vu);

    const controleur = new AbortController();
    const envoi = fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }),
      signal: controleur.signal,
    }).catch(() => undefined);

    // On coupe pendant que `complete()` est encore en vol (il dure 60 ms).
    await new Promise((r) => setTimeout(r, 20));
    controleur.abort();
    await envoi;

    // Laisser la complétion atteindre son point d'observation.
    await new Promise((r) => setTimeout(r, 120));

    expect(vu.avorte).toBe(true);

    await app.close();
  }, 20_000);
});
