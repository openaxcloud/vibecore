/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';
import { FilesStore } from './files';

/**
 * BUG-CREATE-011, moitié « lecture ».
 *
 * L'éditeur affichait le contenu de la carte `files`, alimentée à l'ouverture
 * du projet par `ide-state` — la mémoire LOCALE de l'appareil. Un fichier
 * modifié ailleurs (l'agent, un autre onglet, un autre appareil) s'ouvrait donc
 * dans sa version périmée, sans aucun signal. C'est ce tampon périmé qui a
 * détruit `MARQUEUR-B` en production le 31/08.
 */
function makeRuntime(disque: Map<string, string>, options: { mode?: string; readFile?: () => Promise<never> } = {}) {
  return {
    workdir: '/home/project',
    mode: (options.mode ?? 'remote-kubernetes') as 'remote-kubernetes',
    hasWorkspaceId: () => true,
    listFiles: vi.fn(async () => []),
    readFile: vi.fn(options.readFile ?? (async (chemin: string) => ({ content: disque.get(chemin) ?? '' }))),
    writeFile: vi.fn(async (chemin: string, contenu: string) => {
      disque.set(chemin, contenu);
    }),
    watchFiles: vi.fn(async () => () => undefined),
    watchPorts: vi.fn(async () => () => undefined),
  } as unknown as ConstructorParameters<typeof FilesStore>[0];
}

const CHEMIN = '/home/project/README.md';
const RELATIF = 'README.md';

describe('FilesStore.adoptRemoteContent — recharger la version du runtime', () => {
  it('adopte une version distante plus récente', async () => {
    const disque = new Map([[RELATIF, '# QA\nMARQUEUR-B']]);
    const store = new FilesStore(makeRuntime(disque));
    store.files.set({ [CHEMIN]: { type: 'file', content: '# QA', isBinary: false } });

    expect(await store.adoptRemoteContent(CHEMIN)).toBe('adopte');
    expect(store.getFile(CHEMIN)?.content).toBe('# QA\nMARQUEUR-B');
  });

  it('ne touche à rien quand le distant est identique', async () => {
    const disque = new Map([[RELATIF, 'identique']]);
    const store = new FilesStore(makeRuntime(disque));
    store.files.set({ [CHEMIN]: { type: 'file', content: 'identique', isBinary: false } });

    expect(await store.adoptRemoteContent(CHEMIN)).toBe('inchange');
    expect(store.getFile(CHEMIN)?.content).toBe('identique');
  });

  it('n’invente rien quand la lecture échoue : le tampon reste intact', async () => {
    const store = new FilesStore(
      makeRuntime(new Map(), {
        readFile: async () => {
          throw new Error('Remote runtime request failed: 425');
        },
      }),
    );
    store.files.set({ [CHEMIN]: { type: 'file', content: 'ce que j’avais', isBinary: false } });

    expect(await store.adoptRemoteContent(CHEMIN)).toBe('illisible');
    expect(store.getFile(CHEMIN)?.content).toBe('ce que j’avais');
  });

  it('laisse les binaires tranquilles — leur contenu ne se compare pas par son texte', async () => {
    const disque = new Map([[RELATIF, 'autre']]);
    const store = new FilesStore(makeRuntime(disque));
    store.files.set({ [CHEMIN]: { type: 'file', content: 'binaire', isBinary: true } });

    expect(await store.adoptRemoteContent(CHEMIN)).toBe('hors-portee');
    expect(store.getFile(CHEMIN)?.content).toBe('binaire');
  });

  it('ne s’applique pas hors du runtime distant', async () => {
    const disque = new Map([[RELATIF, 'distant']]);
    const store = new FilesStore(makeRuntime(disque, { mode: 'webcontainer' }));
    store.files.set({ [CHEMIN]: { type: 'file', content: 'local', isBinary: false } });

    expect(await store.adoptRemoteContent(CHEMIN)).toBe('hors-portee');
    expect(store.getFile(CHEMIN)?.content).toBe('local');
  });
});
