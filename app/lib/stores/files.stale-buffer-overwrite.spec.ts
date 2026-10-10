/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FilesStore } from './files';
import { setUserLanguagePreference } from '~/lib/i18n/language';

/**
 * BUG-CREATE-011 — le tampon de l'éditeur écrasait une version plus récente du
 * serveur, sans prévenir. Perte de données constatée en production le 31/08.
 *
 * Le contrôle de concurrence de `#saveFileImpl` relit le fichier distant avant
 * d'écrire et refuse la sauvegarde si le contenu a changé sous nos pieds. Mais
 * la relecture était écrite ainsi :
 *
 *   const remoteContent = await runtime.readFile(p).then(r => r.content)
 *     .catch(() => oldContent);   // ← échec de lecture ⇒ « aucun conflit »
 *
 * Le repli sur `oldContent` rend les deux valeurs égales par construction : à la
 * moindre défaillance de lecture — coupure réseau, 425 sur un workspace froid,
 * 5xx — la garde s'annule et le tampon périmé écrase ce qu'il y a sur le
 * serveur, silencieusement. C'est un fail-open sur une garde de sûreté des
 * données : l'échec doit protéger, pas ouvrir.
 */
function makeRuntime(options: { disk: Map<string, string>; readFile: (path: string) => Promise<{ content: string }> }) {
  return {
    workdir: '/home/project',
    mode: 'remote-kubernetes' as const,
    hasWorkspaceId: () => true,
    listFiles: vi.fn(async () => []),
    readFile: vi.fn(options.readFile),
    createFile: vi.fn(async (path: string, content: string) => {
      options.disk.set(path, content);
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      options.disk.set(path, content);
    }),
    watchFiles: vi.fn(async () => () => undefined),
    watchPorts: vi.fn(async () => () => undefined),
  } as unknown as ConstructorParameters<typeof FilesStore>[0];
}

const CHEMIN = '/home/project/README.md';
const RELATIF = 'README.md';

describe('BUG-CREATE-011 — une relecture impossible ne doit pas valoir « aucun conflit »', () => {
  beforeEach(() => {
    setUserLanguagePreference('fr');
  });

  it('refuse la sauvegarde quand la relecture distante échoue, au lieu d’écraser', async () => {
    const disk = new Map([[RELATIF, '# QA parcours creation\nMARQUEUR-B']]);

    const store = new FilesStore(
      makeRuntime({
        disk,
        readFile: async () => {
          throw new Error('Remote runtime request failed: 425');
        },
      }),
    );

    // Le tampon de l'éditeur, chargé depuis la mémoire locale de l'appareil : périmé.
    store.files.set({ [CHEMIN]: { type: 'file', content: '# QA parcours creation', isBinary: false } });

    await expect(store.saveFile(CHEMIN, '# QA parcours creation\nMARQUEUR-UI2')).rejects.toThrow();

    // Le contenu du serveur est INTACT — c'est tout l'enjeu.
    expect(disk.get(RELATIF)).toBe('# QA parcours creation\nMARQUEUR-B');
  });

  it('réessaie une fois : une défaillance isolée ne coûte pas la sauvegarde', async () => {
    const disk = new Map([[RELATIF, 'contenu commun']]);

    let appels = 0;

    const store = new FilesStore(
      makeRuntime({
        disk,
        readFile: async (path: string) => {
          appels += 1;

          if (appels === 1) {
            throw new Error('blip');
          }

          return { content: disk.get(path) ?? '' };
        },
      }),
    );

    store.files.set({ [CHEMIN]: { type: 'file', content: 'contenu commun', isBinary: false } });

    await store.saveFile(CHEMIN, 'contenu commun + ma frappe');

    expect(appels).toBe(2);
    expect(disk.get(RELATIF)).toBe('contenu commun + ma frappe');
  });

  it('laisse créer un fichier neuf : rien à perdre, la lecture échoue normalement', async () => {
    const disk = new Map<string, string>();

    const store = new FilesStore(
      makeRuntime({
        disk,
        readFile: async () => {
          throw new Error('ENOENT');
        },
      }),
    );

    // Aucune entrée préalable dans la carte : le fichier n'existe pas encore.
    store.files.set({ [CHEMIN]: { type: 'file', content: '', isBinary: false } });

    await store.saveFile(CHEMIN, 'premier contenu');

    expect(disk.get(RELATIF)).toBe('premier contenu');
  });

  it('refuse toujours une sauvegarde humaine quand le distant a VRAIMENT changé', async () => {
    const disk = new Map([[RELATIF, 'version serveur plus recente']]);

    const store = new FilesStore(
      makeRuntime({ disk, readFile: async (path: string) => ({ content: disk.get(path) ?? '' }) }),
    );

    store.files.set({ [CHEMIN]: { type: 'file', content: 'version perimee', isBinary: false } });

    await expect(store.saveFile(CHEMIN, 'mon tampon')).rejects.toThrow();
    expect(disk.get(RELATIF)).toBe('version serveur plus recente');
  });
});
