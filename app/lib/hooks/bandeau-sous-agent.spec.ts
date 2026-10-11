// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { Message } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * LE FAUX BANDEAU « la génération s'est arrêtée en route » (BUG-AGENT-BANDEAU-ARRET-FAUX-001).
 *
 * Mesuré en production le 2026-09-30, trois tours sur trois : le coordinateur
 * finit proprement (`finishReason: stop`), le sous-agent « frontend » est coupé
 * par son plafond, et le filet de fin de flux referme son artefact À LA FIN DU
 * TOUR — donc APRÈS que le coordinateur a écrit ses fichiers. Le constat part
 * en « tronqué » alors qu'aucune entrée ne manque, et le morceau du rôle est
 * écrit par-dessus la version intégrée.
 *
 * Vrai parseur, vrai magasin du constat ; seul le workbench est doublé pour
 * COMPTER les écritures.
 */
const ecritures: Array<{ messageId: string; filePath?: string; content?: string; enFlux: boolean }> = [];

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    showWorkbench: { set: vi.fn() },
    files: { get: () => ({}) },
    addArtifact: vi.fn(),
    updateArtifact: vi.fn(),
    addAction: vi.fn(),
    runAction: vi.fn((data: { messageId: string; action: { filePath?: string; content?: string } }, enFlux = false) => {
      ecritures.push({
        messageId: data.messageId,
        filePath: data.action.filePath,
        content: data.action.content,
        enFlux,
      });
    }),
  },
}));

/* Le chemin de production : en DEV, `parseMessages` remet tout à zéro à chaque passage. */
vi.stubEnv('DEV', false);

const { useMessageParser } = await import('./useMessageParser');
const { constatDeGenerationStore } = await import('~/lib/stores/constat-de-generation');

const APP_COMPLET = 'export function App() {\n  return <main>Tâches</main>;\n}';

const COORDINATEUR = [
  'Voici l’application.',
  '<boltArtifact id="app" title="App">',
  `<boltAction type="file" filePath="src/App.tsx">${APP_COMPLET}</boltAction>`,
  '</boltArtifact>',
  'Terminé.',
].join('\n');

/* Le rôle « frontend », coupé par son plafond au milieu du même fichier. */
const LANE_COUPEE =
  '<boltArtifact id="lane" title="lane"><boltAction type="file" filePath="src/App.tsx">export function App() {\n  return <di';

const message = (id: string, contenu: string, lanes: Array<{ roleId: string; text: string }> = []) =>
  ({
    id,
    role: 'assistant',
    content: contenu,
    annotations: lanes.map((lane) => ({ type: 'agentLaneStream', kind: 'delta', ...lane })),
  }) as unknown as Message;

const ecrituresFinales = (chemin: string) => ecritures.filter((e) => !e.enFlux && e.filePath === chemin);

describe('un sous-agent coupé n’est pas une génération arrêtée', () => {
  beforeEach(() => {
    ecritures.length = 0;
    constatDeGenerationStore.set(undefined);
  });

  it('le coordinateur fini, le rôle coupé : pas de bandeau, et le fichier complet n’est pas écrasé', () => {
    const { result } = renderHook(() => useMessageParser());
    result.current.parseMessages([message('tour', COORDINATEUR, [{ roleId: 'frontend', text: LANE_COUPEE }])], false);

    expect(constatDeGenerationStore.get()).toBeUndefined();

    const finales = ecrituresFinales('src/App.tsx');

    expect(finales.length).toBeGreaterThan(0);
    expect(finales.at(-1)?.content?.trim()).toBe(APP_COMPLET);
    expect(finales.some((e) => e.messageId.includes('::lane:'))).toBe(false);
  });

  it('contre-épreuve : le COORDINATEUR coupé allume toujours le bandeau', () => {
    const { result } = renderHook(() => useMessageParser());
    const coupe = COORDINATEUR.slice(0, COORDINATEUR.indexOf('</boltAction>') - 5);
    result.current.parseMessages([message('coupe', coupe)], false);

    expect(constatDeGenerationStore.get()?.tronquee).toBe(true);
  });

  it('contre-épreuve : un rôle qui a FINI écrit toujours ses fichiers', () => {
    const { result } = renderHook(() => useMessageParser());

    const laneFinie =
      `${LANE_COUPEE}v>Rôle</div>;\n}</boltAction></boltArtifact>\n{"summary":"ok","files":["src/Role.tsx"],"risks":[],"verification":[]}`.replace(
        /src\/App\.tsx/,
        'src/Role.tsx',
      );
    result.current.parseMessages([message('fini', 'Rien.', [{ roleId: 'frontend', text: laneFinie }])], false);

    expect(ecrituresFinales('src/Role.tsx').map((e) => e.messageId)).toEqual(['fini::lane:frontend']);
  });
});
