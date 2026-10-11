// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { Message } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * LA BARRIÈRE À L'EXÉCUTION, au site d'appel réel (`useMessageParser`).
 *
 * Mesuré en production le 2026-09-30 : « N'écris aucun fichier », l'agent
 * principal obéit, deux sous-agents écrivent `docs/ARCHITECTURE.md` et
 * `src/__tests__/App.test.tsx`, qui atterrissent dans le projet. Ce test rejoue
 * les deux sources d'écriture — le flux principal et une lane — et vérifie
 * qu'aucune action n'atteint le moteur quand le tour porte `consigneSansFichier`.
 */
const actionsExecutees: Array<{ type: string; filePath?: string; messageId: string }> = [];

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    showWorkbench: { set: vi.fn() },
    files: { get: () => ({}) },
    addArtifact: vi.fn(),
    updateArtifact: vi.fn(),
    addAction: vi.fn(),
    runAction: vi.fn((data: { messageId: string; action: { type: string; filePath?: string } }) => {
      actionsExecutees.push({ type: data.action.type, filePath: data.action.filePath, messageId: data.messageId });
    }),
  },
}));

/* Le chemin de production : en DEV, `parseMessages` remet tout à zéro à chaque passage. */
vi.stubEnv('DEV', false);

const { useMessageParser } = await import('./useMessageParser');

const FLUX_PRINCIPAL = [
  'Voici les étapes.',
  '<boltArtifact id="a" title="a">',
  '<boltAction type="file" filePath="src/desobeissance.ts">export const x = 1;</boltAction>',
  '<boltAction type="shell">npm install</boltAction>',
  '</boltArtifact>',
].join('\n');

const LANE = [
  '<boltArtifact id="lane" title="lane"><boltAction type="file" filePath="docs/ARCHITECTURE.md">',
  '# Architecture',
  '</boltAction></boltArtifact>',
  '{"summary":"fait","files":["docs/ARCHITECTURE.md"],"risks":[],"verification":[]}',
].join('\n');

const reponse = (id: string, annotations: unknown[]) =>
  ({
    id,
    role: 'assistant',
    content: FLUX_PRINCIPAL,
    annotations: [...annotations, { type: 'agentLaneStream', kind: 'delta', roleId: 'architect', text: LANE }],
  }) as unknown as Message;

describe('consigne « aucun fichier » : barrière à l’exécution', () => {
  beforeEach(() => {
    actionsExecutees.length = 0;
  });

  it('aucune action du tour ne part — ni fichier, ni commande, ni sous-agent', () => {
    const { result } = renderHook(() => useMessageParser());
    result.current.parseMessages([reponse('barriere', [{ type: 'consigneSansFichier' }])], false);

    expect(actionsExecutees).toEqual([]);
  });

  it('contre-épreuve : sans la consigne, les mêmes actions partent', () => {
    const { result } = renderHook(() => useMessageParser());
    result.current.parseMessages([reponse('temoin', [])], false);

    expect(actionsExecutees.map((a) => a.filePath ?? a.type)).toEqual(
      expect.arrayContaining(['src/desobeissance.ts', 'shell', 'docs/ARCHITECTURE.md']),
    );
  });
});
