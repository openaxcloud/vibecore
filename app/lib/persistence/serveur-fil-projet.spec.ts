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

    await expect(chargerFilDepuisServeur('p1')).resolves.toHaveLength(2);
  });

  it('rend une liste vide quand aucune conversation n’existe', async () => {
    vi.stubGlobal('fetch', faussesReponses({ conversations: [] }, { messages: [] }));
    await expect(chargerFilDepuisServeur('p1')).resolves.toEqual([]);
  });

  /* Un repli ne doit jamais casser le chargement : les trois façons d'échouer. */
  it('avale une réponse non-ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false }) as unknown as Response),
    );
    await expect(chargerFilDepuisServeur('p1')).resolves.toEqual([]);
  });

  it('avale un réseau qui jette', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('hors ligne');
      }),
    );
    await expect(chargerFilDepuisServeur('p1')).resolves.toEqual([]);
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
    await expect(chargerFilDepuisServeur('p1')).resolves.toEqual([]);
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
    const serveur = vi.fn(async () => [msg('user', 'q'), msg('assistant', 'r')]);

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
      async () => [],
    );

    expect(pose, "sans le serveur, l'appareil neuf reste sur un écran vide").toHaveLength(0);
  });

  it('des messages locaux gagnent, et le serveur n’est PAS interrogé', async () => {
    const pose: Message[][] = [];
    const serveur = vi.fn(async () => [msg('assistant', 'plus vieux')]);

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
      async () => [],
    );

    expect(pose).toHaveLength(0);
  });
});
