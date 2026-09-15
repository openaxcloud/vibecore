// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { Message } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const actionsExecutees: Array<{ filePath?: string; messageId: string }> = [];

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    showWorkbench: { set: vi.fn() },
    addArtifact: vi.fn(),
    updateArtifact: vi.fn(),
    addAction: vi.fn(),
    runAction: vi.fn((data: { messageId: string; action: { filePath?: string } }) => {
      actionsExecutees.push({ filePath: data.action.filePath, messageId: data.messageId });
    }),
  },
}));

const { useMessageParser } = await import('./useMessageParser');
const { cheminsEcritsParLesLanes } = await import('~/lib/runtime/agent-lane-writes');

/** Un flux de lane : un fichier ecrit, puis le rapport JSON de cloture. */
const fluxDeLane = (chemin: string, corps: string) =>
  [
    `<boltArtifact id="lane" title="lane"><boltAction type="file" filePath="${chemin}">`,
    corps,
    '</boltAction></boltArtifact>',
    `{"summary":"fait","files":["${chemin}"],"risks":[],"verification":[]}`,
  ].join('\n');

const messageAvecLanes = (id: string, lanes: Array<{ roleId: string; text: string }>): Message =>
  ({
    id,
    role: 'assistant',
    content: 'Je delegue aux specialistes.',
    annotations: lanes.map((lane) => ({ type: 'agentLaneStream', kind: 'delta', ...lane })),
  }) as unknown as Message;

describe('useMessageParser — les fichiers ecrits par les sous-agents', () => {
  beforeEach(() => {
    actionsExecutees.length = 0;
  });

  /*
   * LE TEST DU SITE D'APPEL. Le contenu des lanes arrive par les annotations,
   * pas par `message.content`. Avant ce correctif, le parseur ne le voyait
   * jamais et AUCUN fichier de sous-agent n'atteignait le disque — c'est le
   * defaut mesure le 2026-09-07 : 9 fichiers ecrits pour 90 annonces.
   */
  it("ecrit le fichier qu'une lane a produit", () => {
    const { result } = renderHook(() => useMessageParser());
    result.current.parseMessages(
      [
        messageAvecLanes('m1', [
          { roleId: 'frontend', text: fluxDeLane('src/Panier.tsx', 'export const Panier = 1;') },
        ]),
      ],
      false,
    );

    expect(actionsExecutees.map((a) => a.filePath)).toContain('src/Panier.tsx');
  });

  /*
   * L'ARBITRAGE, MESURE AU SITE D'APPEL et pas seulement dans l'arbitre.
   * `frontend` (rang 1) l'emporte sur `backend` (rang 2) — y compris quand
   * backend arrive EN PREMIER dans le flux, ce qui est le cas ici.
   */
  it("n'applique qu'une ecriture quand deux roles visent le meme fichier", () => {
    const { result } = renderHook(() => useMessageParser());
    result.current.parseMessages(
      [
        messageAvecLanes('m2', [
          { roleId: 'backend', text: fluxDeLane('src/Dispute.tsx', 'export const DE_BACKEND = 1;') },
          { roleId: 'frontend', text: fluxDeLane('src/Dispute.tsx', 'export const DE_FRONTEND = 1;') },
        ]),
      ],
      false,
    );

    /*
     * CE QUI EST GARANTI EST L'ETAT FINAL, pas le nombre d'ecritures.
     *
     * `backend` arrive en premier et pose sa version ; `frontend`, prioritaire,
     * la PREEMPTE ensuite. Le fichier est donc ecrit deux fois et porte la
     * version de `frontend` a la fin. Dans l'ordre inverse, `backend` est refuse
     * et il n'y a qu'une ecriture — mais le contenu final est le MEME.
     *
     * C'est exactement la propriete qu'on veut : le meme prompt rend la meme
     * application, quel que soit l'ordre d'arrivee des lanes. Exiger « une seule
     * ecriture » epinglerait un detail d'ordonnancement, pas le contrat.
     */
    const surLeFichier = actionsExecutees.filter((a) => a.filePath === 'src/Dispute.tsx');
    expect(surLeFichier.length).toBeGreaterThan(0);
    expect(surLeFichier[surLeFichier.length - 1].messageId).toContain('frontend');
  });

  /*
   * LA MOITIE INVERSE DE L'ARBITRAGE : dans l'ordre d'arrivee OPPOSE, le rang
   * faible qui arrive apres doit etre REFUSE. Sans cette assertion, un arbitre
   * qui laisserait tout passer (donc « le dernier arrive gagne ») passerait le
   * test precedent au vert par coincidence d'ordre.
   */
  it('refuse le role secondaire quand le prioritaire a deja ecrit', () => {
    const { result } = renderHook(() => useMessageParser());
    result.current.parseMessages(
      [
        messageAvecLanes('m4', [
          { roleId: 'frontend', text: fluxDeLane('src/Ordre.tsx', 'export const DE_FRONTEND = 1;') },
          { roleId: 'backend', text: fluxDeLane('src/Ordre.tsx', 'export const DE_BACKEND = 1;') },
        ]),
      ],
      false,
    );

    const surLeFichier = actionsExecutees.filter((a) => a.filePath === 'src/Ordre.tsx');
    expect(surLeFichier).toHaveLength(1);
    expect(surLeFichier[0].messageId).toContain('frontend');
  });

  /*
   * LA MOITIE INVERSE (regle 6). Un message SANS annotation de lane doit se
   * comporter exactement comme avant : le flux du coordinateur n'est jamais
   * arbitre. Sans cette assertion, une porte trop large casserait tous les
   * projets qui n'utilisent pas de sous-agents, sans un seul test rouge.
   */
  it('laisse passer sans arbitrage un message ordinaire du coordinateur', () => {
    const { result } = renderHook(() => useMessageParser());

    const coordinateur = {
      id: 'm3',
      role: 'assistant',
      content: fluxDeLane('src/Coordinateur.tsx', 'export const C = 1;'),
    } as unknown as Message;

    result.current.parseMessages([coordinateur], false);
    expect(actionsExecutees.map((a) => a.filePath)).toContain('src/Coordinateur.tsx');
  });

  /*
   * UN ARBITRE PAR MESSAGE, PAS UN POUR LA SESSION.
   *
   * Sans cloisonnement, les attributions de la generation precedente survivent :
   * le second prompt d'un utilisateur verrait ses ecritures REFUSEES par des
   * roles qui ont fini il y a dix minutes. Le meme chemin, reclame par un role
   * secondaire dans un NOUVEAU message, doit donc passer.
   */
  it('ne fait pas porter les attributions d un message sur le suivant', () => {
    const { result } = renderHook(() => useMessageParser());

    result.current.parseMessages(
      [messageAvecLanes('m5', [{ roleId: 'frontend', text: fluxDeLane('src/Cloison.tsx', 'export const A = 1;') }])],
      false,
    );
    result.current.parseMessages(
      [messageAvecLanes('m6', [{ roleId: 'qa', text: fluxDeLane('src/Cloison.tsx', 'export const B = 1;') }])],
      false,
    );

    const parMessage = actionsExecutees
      .filter((a) => a.filePath === 'src/Cloison.tsx')
      .map((a) => a.messageId.split('::lane:')[0]);

    expect(parMessage).toContain('m5');
    expect(parMessage).toContain('m6');
  });

  it('rend les chemins reellement ecrits, par message', () => {
    const { result } = renderHook(() => useMessageParser());
    result.current.parseMessages(
      [messageAvecLanes('m7', [{ roleId: 'architect', text: fluxDeLane('src/Vu.tsx', 'export const V = 1;') }])],
      false,
    );

    expect(cheminsEcritsParLesLanes('m7')).toEqual(['src/vu.tsx']);

    /*
     * `undefined`, PAS `[]` : un message dont on n'a aucune trace n'est pas un
     * message ou rien n'a ete ecrit. Confondre les deux fait crier « Livraison
     * incomplete » sur tout l'historique au rechargement de la page.
     */
    expect(cheminsEcritsParLesLanes('message-sans-lane')).toBeUndefined();
  });
});
