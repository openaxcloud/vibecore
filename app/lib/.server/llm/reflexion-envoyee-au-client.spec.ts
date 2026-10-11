import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createDataStream, streamText } from 'ai';
import { MockLanguageModelV1, simulateReadableStream } from 'ai/test';
import { describe, expect, it } from 'vitest';

/*
 * LE RAISONNEMENT DOIT ATTEINDRE LE NAVIGATEUR — PAS SEULEMENT LE SERVEUR.
 *
 * Mesuré le 2026-09-28 en production, après avoir activé la réflexion sur le
 * fil (#592) : un vrai tour opus rendait encore ZÉRO ligne `g:` au client. Le
 * second verrou est dans le SDK : `ai@4.3.16` déclare `sendReasoning = false`
 * par défaut dans `mergeIntoDataStream`, et la route l'appelait sans option.
 *
 * Ce fichier tient les deux moitiés : le COMPORTEMENT du SDK installé (sans
 * l'option, rien ne passe ; avec, le raisonnement passe), et le BRANCHEMENT
 * dans la route — les deux appels au modèle.
 */
function modeleQuiRaisonne() {
  return new MockLanguageModelV1({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'reasoning', textDelta: 'Je pèse les options.' },
          { type: 'text-delta', textDelta: 'Réponse.' },
          { type: 'finish', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 2 } },
        ],
      }),
      rawCall: { rawPrompt: null, rawSettings: {} },
    }),
  });
}

async function fluxRecu(options?: { sendReasoning?: boolean }): Promise<string> {
  const flux = createDataStream({
    execute: (dataStream) => {
      streamText({ model: modeleQuiRaisonne(), prompt: 'x' }).mergeIntoDataStream(dataStream, options);
    },
  });

  let texte = '';

  const lecteur = flux.getReader();

  for (;;) {
    const { done, value } = await lecteur.read();

    if (done) {
      return texte;
    }

    texte += value;
  }
}

describe('le raisonnement atteint le client', () => {
  it('TÉMOIN — le texte passe dans les deux cas : la mesure mesure quelque chose', async () => {
    expect(await fluxRecu()).toContain('0:"Réponse."');
  });

  it('LE PIÈGE DU SDK — sans `sendReasoning`, AUCUNE ligne de raisonnement ne part', async () => {
    expect(await fluxRecu()).not.toMatch(/^g:/mu);
  });

  it('avec `sendReasoning: true`, le raisonnement part au client', async () => {
    expect(await fluxRecu({ sendReasoning: true })).toMatch(/^g:"Je pèse les options\."/mu);
  });

  it('LA ROUTE — les deux appels au modèle envoient le raisonnement', () => {
    const route = readFileSync(join(__dirname, '../../../routes/api.chat.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    expect(route.split('mergeIntoDataStream(').length - 1, 'témoin : deux fusions dans la route').toBe(2);
    expect(route.split('mergeIntoDataStream(dataStream, { sendReasoning: true })').length - 1).toBe(2);
  });
});
