import type { Message } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chargerFilDepuisServeur, completerFilSiVide } from './serveur-fil-projet';

/*
 * Trois banques portent le fil : `ide-state.chat.messages` (client),
 * IndexedDB (local au navigateur), et `/ai/conversations/…/messages` (serveur).
 * La restauration ne consultait jamais la troisième — la seule fiable,
 * mesurée à 210 conversations sur 224 en production.
 *
 * Les deux cas que ça répare :
 *   - l'écriture cliente perd une course sur quatre pendant qu'un agent génère ;
 *   - un CONTEXTE NEUF n'a pas d'IndexedDB : rien du tout à afficher.
 */
const msg = (r: string, c: string): Message => ({ id: `${r}-1`, role: r as Message['role'], content: c });

function faussesReponses(conversations: unknown, messages: unknown) {
  return vi.fn(async (url: string) => {
    if (url.includes('/messages')) {
      return { ok: true, json: async () => messages } as unknown as Response;
    }

    return { ok: true, json: async () => conversations } as unknown as Response;
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('chargerFilDepuisServeur', () => {
  it('rend le fil que le serveur détient', async () => {
    vi.stubGlobal(
      'fetch',
      faussesReponses(
        { conversations: [{ id: 'conv-1' }] },
        {
          messages: [
            { id: 'm1', role: 'user', content: 'salut' },
            { id: 'm2', role: 'assistant', content: 'bonjour' },
          ],
        },
      ),
    );

    const fil = await chargerFilDepuisServeur('p1');

    expect(fil.messages).toHaveLength(2);
    expect(fil.conversationId, 'l’identité de la conversation est jetée — la duplication revient').toBe('conv-1');
  });

  it('rend une liste vide quand aucune conversation n’existe', async () => {
    vi.stubGlobal('fetch', faussesReponses({ conversations: [] }, { messages: [] }));
    await expect(chargerFilDepuisServeur('p1')).resolves.toEqual({ messages: [] });
  });

  /* Un repli ne doit jamais casser le chargement : les trois façons d'échouer. */
  it('avale une réponse non-ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false }) as unknown as Response),
    );
    await expect(chargerFilDepuisServeur('p1')).resolves.toEqual({ messages: [] });
  });

  it('avale un réseau qui jette', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('hors ligne');
      }),
    );
    await expect(chargerFilDepuisServeur('p1')).resolves.toEqual({ messages: [] });
  });

  it('avale un corps illisible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            json: async () => {
              throw new Error('pas du json');
            },
          }) as unknown as Response,
      ),
    );
    await expect(chargerFilDepuisServeur('p1')).resolves.toEqual({ messages: [] });
  });
});

describe('completerFilSiVide — la règle de priorité', () => {
  /*
   * LE CAS DE L'APPAREIL NEUF, explicitement : ni ide-state, ni IndexedDB,
   * seulement le serveur. C'est le scénario réel — autre téléphone, cache
   * vidé, navigation privée.
   */
  it('appareil neuf : rien en local, le serveur fournit le fil', async () => {
    const pose: Message[][] = [];

    const serveur = vi.fn(async () => ({
      messages: [msg('user', 'q'), msg('assistant', 'r')],
      conversationId: 'conv-1',
    }));

    await completerFilSiVide([], 'p1', (m) => pose.push(m), serveur);

    expect(serveur).toHaveBeenCalledWith('p1');
    expect(pose).toHaveLength(1);
    expect(pose[0]).toHaveLength(2);
  });

  /*
   * LA CONTRE-ÉPREUVE. Sans la banque serveur dans la chaîne — un chargeur qui
   * rend toujours vide, exactement le comportement d'AVANT ce correctif — le
   * même cas rend un fil vide. C'est ce test qui prouve que la correction sert.
   */
  it('SANS la banque serveur, le même cas ne rend RIEN', async () => {
    const pose: Message[][] = [];

    await completerFilSiVide(
      [],
      'p1',
      (m) => pose.push(m),
      async () => ({ messages: [] }),
    );

    expect(pose, "sans le serveur, l'appareil neuf reste sur un écran vide").toHaveLength(0);
  });

  it('des messages locaux gagnent, et le serveur n’est PAS interrogé', async () => {
    const pose: Message[][] = [];
    const serveur = vi.fn(async () => ({ messages: [msg('assistant', 'plus vieux')], conversationId: 'conv-2' }));

    await completerFilSiVide([msg('user', 'local')], 'p1', (m) => pose.push(m), serveur);

    expect(serveur, 'aucune requête inutile, et aucun écrasement du fil frais').not.toHaveBeenCalled();
    expect(pose).toHaveLength(0);
  });

  it('un serveur en échec ne pose rien — l’affichage garde ce qu’il a', async () => {
    const pose: Message[][] = [];

    await completerFilSiVide(
      [],
      'p1',
      (m) => pose.push(m),
      async () => ({ messages: [] }),
    );

    expect(pose).toHaveLength(0);
  });
});

/*
 * CONV-001 (moitié DUPLICATION) — l'identité de la conversation, pas seulement
 * le fil.
 *
 * LE DÉGÂT NE SE VOYAIT PAS À L'ÉCRAN, et c'est ce qui l'a laissé passer : le
 * fil s'affichait parfaitement. Il apparaissait au message SUIVANT, EN BASE.
 *
 * La chaîne, lue ligne à ligne dans le produit (règle 1) :
 *   1. `chargerFilDepuisServeur` extrayait `conversationId` pour construire
 *      l'URL des messages… puis ne rendait que les messages. L'identité était
 *      JETÉE.
 *   2. `useChatHistory` posait donc le fil sans rien noter, et
 *      `chatMetadata.set(storedMessages?.metadata ?? memory.chat?.metadata)`
 *      valait `undefined` sur un contexte neuf.
 *   3. `Chat.client.tsx:502` — `ensureProjectAiConversation` lit
 *      `backendAiConversationIdRef.current ?? chatMetadata.get()?.aiConversationId`.
 *      Les deux vides : il POST une conversation NEUVE.
 *   4. `syncProjectAiTranscript` y PUT la transcription ENTIÈRE.
 *
 * Résultat : le même fil deux fois en base, et deux entrées dans l'historique.
 * Un défaut de DONNÉES silencieux — la pire espèce, parce que rien à l'écran
 * n'invite à le chercher.
 */
describe('CONV-001 — le fil restauré reprend SA conversation', () => {
  it('adopte l’identité rendue par le serveur, et l’adopte AVANT de poser le fil', async () => {
    const evenements: string[] = [];

    await completerFilSiVide(
      [],
      'p1',
      () => evenements.push('pose'),
      async () => ({ messages: [msg('user', 'q')], conversationId: 'conv-42' }),
      (id) => evenements.push(`adopte:${id}`),
    );

    /*
     * L'ORDRE EST LE CORRECTIF. Adopter après avoir posé laisserait une fenêtre
     * où le fil est affiché sans identité : un envoi dans cette fenêtre
     * dupliquerait quand même.
     */
    expect(evenements).toEqual(['adopte:conv-42', 'pose']);
  });

  it('n’adopte RIEN quand il n’y a pas de fil à poser', async () => {
    /*
     * Adopter une conversation dont on n'affiche pas le fil ferait pointer
     * l'identité sur autre chose que ce que voit l'utilisateur — on
     * remplacerait une duplication par un MÉLANGE, ce qui est pire.
     */
    const adoptes: string[] = [];

    await completerFilSiVide(
      [],
      'p1',
      () => undefined,
      async () => ({ messages: [], conversationId: 'conv-42' }),
      (id) => adoptes.push(id),
    );

    expect(adoptes).toEqual([]);
  });

  it('n’adopte rien quand des messages LOCAUX gagnent — le serveur n’est même pas lu', async () => {
    const adoptes: string[] = [];
    const serveur = vi.fn(async () => ({ messages: [msg('assistant', 'vieux')], conversationId: 'conv-vieille' }));

    await completerFilSiVide(
      [msg('user', 'local')],
      'p1',
      () => undefined,
      serveur,
      (id) => adoptes.push(id),
    );

    expect(serveur).not.toHaveBeenCalled();
    expect(adoptes, 'on adopterait une conversation dont le fil n’est pas affiché').toEqual([]);
  });

  it('pose le fil même si le serveur ne rend pas d’identité — l’affichage prime', async () => {
    /*
     * Contre-épreuve dans l'autre sens (règle 6) : la prudence ci-dessus ne
     * doit pas se retourner en « pas d'identité, pas d'affichage ». Un serveur
     * plus ancien qui ne rendrait pas le champ doit toujours réparer l'écran
     * vide de l'appareil neuf, qui est le défaut d'origine de ce module.
     */
    const poses: Message[][] = [];
    const adoptes: string[] = [];

    await completerFilSiVide(
      [],
      'p1',
      (m) => poses.push(m),
      async () => ({ messages: [msg('user', 'q')] }),
      (id) => adoptes.push(id),
    );

    expect(poses).toHaveLength(1);
    expect(adoptes).toEqual([]);
  });

  it('l’adoption reste facultative — un appelant qui n’en passe pas ne casse pas', async () => {
    const poses: Message[][] = [];

    await completerFilSiVide(
      [],
      'p1',
      (m) => poses.push(m),
      async () => ({
        messages: [msg('user', 'q')],
        conversationId: 'conv-42',
      }),
    );

    expect(poses).toHaveLength(1);
  });
});
