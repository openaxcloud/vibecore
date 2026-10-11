// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { Message } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * BUG-QA0930-PREMIER-PROJET-TOUR-COUPE — la cause mesurée en production le
 * 2026-09-30 (parcours du premier projet, « un compteur avec deux boutons ») :
 * le coordinateur ET deux sous-agents écrivent `package.json`, `vite.config.ts`,
 * `src/App.tsx`. L'espace de travail garde la `package.json` d'un rôle (sans
 * vitest) et le `vite.config.ts` d'un autre (qui importe `vitest/config`) :
 * Vite refuse de démarrer, l'aperçu reste à 503.
 *
 * Vrai parseur ; le workbench est doublé pour COMPTER les écritures.
 */
const ecritures: Array<{ messageId: string; filePath?: string; enFlux: boolean }> = [];

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    showWorkbench: { set: vi.fn() },
    files: { get: () => ({}) },
    addArtifact: vi.fn(),
    updateArtifact: vi.fn(),
    addAction: vi.fn(),
    runAction: vi.fn((data: { messageId: string; action: { filePath?: string } }, enFlux = false) => {
      ecritures.push({ messageId: data.messageId, filePath: data.action.filePath, enFlux });
    }),
  },
}));

/* Le chemin de production : en DEV, `parseMessages` remet tout à zéro à chaque passage. */
vi.stubEnv('DEV', false);

const { useMessageParser } = await import('./useMessageParser');

const fichier = (chemin: string, corps: string) => `<boltAction type="file" filePath="${chemin}">${corps}</boltAction>`;

const artefact = (id: string, actions: string[]) =>
  `<boltArtifact id="${id}" title="${id}">${actions.join('\n')}</boltArtifact>`;
const rapport = (fichiers: string[]) =>
  `\n{"summary":"ok","files":${JSON.stringify(fichiers)},"risks":[],"verification":[]}`;

const COORDINATEUR = artefact('app', [
  fichier('package.json', '{ "name": "compteur-app", "devDependencies": { "vitest": "^2" } }'),
  fichier('vite.config.ts', 'export default {}'),
  fichier('index.html', '<script type="module" src="/src/main.tsx"></script>'),
  fichier('src/main.tsx', 'import App from "./App";'),
  fichier('src/App.tsx', 'export default function App() { return null; }'),
]);

const DEVOPS =
  artefact('lane', [
    fichier('package.json', '{ "name": "react-vite-counter" }'),
    fichier('Dockerfile', 'FROM node:18-alpine'),
  ]) + rapport(['package.json', 'Dockerfile']);

const FRONTEND =
  artefact('lane', [
    fichier('vite.config.ts', 'import { defineConfig } from "vitest/config";'),
    fichier('src/App.tsx', 'export default function App() { return <div />; }'),
    fichier('src/main.tsx', 'import App from "./App";'),
    fichier('src/components/Compteur.tsx', 'export const Compteur = () => null;'),
  ]) + rapport(['vite.config.ts', 'src/App.tsx', 'src/main.tsx', 'src/components/Compteur.tsx']);

const message = (id: string, contenu: string) =>
  ({
    id,
    role: 'assistant',
    content: contenu,
    annotations: [
      { type: 'agentLaneStream', kind: 'delta', roleId: 'devops', text: DEVOPS },
      { type: 'agentLaneStream', kind: 'delta', roleId: 'frontend', text: FRONTEND },
    ],
  }) as unknown as Message;

const DEMARRAGE = ['package.json', 'vite.config.ts', 'index.html', 'src/main.tsx', 'src/App.tsx'];

describe('la chaîne de démarrage n’a qu’un auteur : le coordinateur', () => {
  beforeEach(() => {
    ecritures.length = 0;
  });

  it('aucun sous-agent n’écrit package.json, vite.config, index.html, main ou App', () => {
    const { result } = renderHook(() => useMessageParser());

    /* Les rôles d'abord (ils streament avant le coordinateur), puis la réponse du coordinateur. */
    result.current.parseMessages([message('tour', 'Je prépare.')], true);
    result.current.parseMessages([message('tour', `Je prépare.\n${COORDINATEUR}`)], false);

    const parLesRoles = ecritures.filter(
      (e) => e.messageId.includes('::lane:') && DEMARRAGE.includes(e.filePath ?? ''),
    );

    expect(parLesRoles).toEqual([]);

    for (const chemin of DEMARRAGE) {
      expect(ecritures.filter((e) => !e.enFlux && e.filePath === chemin).map((e) => e.messageId)).toEqual(['tour']);
    }
  });

  it('contre-épreuve : les rôles écrivent toujours leurs propres fichiers', () => {
    const { result } = renderHook(() => useMessageParser());
    result.current.parseMessages([message('roles', 'Je prépare.')], false);

    const chemins = ecritures.filter((e) => !e.enFlux).map((e) => e.filePath);

    expect(chemins).toContain('src/components/Compteur.tsx');
    expect(chemins).toContain('Dockerfile');
  });
});
