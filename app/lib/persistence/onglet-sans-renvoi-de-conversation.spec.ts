import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearProjectIdeMemoryCacheForTest,
  getProjectIdeMemorySync,
  saveProjectIdeMemory,
  setProjectIdeMemorySaveDebounceMsForTest,
} from './projectIdeMemory';

/*
 * A-11 — chaque clic d'onglet renvoyait TOUTE la conversation au serveur.
 *
 * Mesuré en production le 2026-10-11 : ~490 Ko par clic, deux envois, 32
 * `PUT /ide-state` sur un projet neuf sans une seule écriture. Un changement
 * d'onglet déclenche deux sauvegardes d'interface (la disposition de l'IDE,
 * `BaseChat.tsx`, et celle de l'aperçu, `Preview.tsx`) ; chacune envoyait la
 * mémoire ENTIÈRE, fil compris.
 *
 * Le serveur fusionne (`mergeProjectIdeState`) : un `chat` absent garde le fil
 * enregistré. On compte ici les requêtes et les octets réellement envoyés.
 */

type Envoi = { corps: string; etat: Record<string, unknown> };

let envois: Envoi[] = [];
let reponseSuivante: () => { ok: boolean; status: number } = () => ({ ok: true, status: 200 });

function installerStockageLocal() {
  const valeurs = new Map<string, string>();

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (cle: string) => valeurs.get(cle) ?? null,
      setItem: (cle: string, valeur: string) => valeurs.set(cle, valeur),
      removeItem: (cle: string) => valeurs.delete(cle),
      clear: () => valeurs.clear(),
      key: (index: number) => Array.from(valeurs.keys())[index] ?? null,
      get length() {
        return valeurs.size;
      },
    },
  });
}

beforeEach(() => {
  clearProjectIdeMemoryCacheForTest();
  setProjectIdeMemorySaveDebounceMsForTest(0);
  installerStockageLocal();
  envois = [];
  reponseSuivante = () => ({ ok: true, status: 200 });

  let version = 1;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        const corps = String(init.body);
        envois.push({ corps, etat: (JSON.parse(corps) as { state: Record<string, unknown> }).state });

        const { ok, status } = reponseSuivante();
        version += 1;

        return {
          ok,
          status,
          headers: { get: (nom: string) => (nom.toLowerCase() === 'etag' ? `"${version}"` : null) },
          json: async () => ({}),
          clone() {
            return this;
          },
        };
      }

      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ ideState: null }) };
    }),
  );
});

afterEach(() => {
  clearProjectIdeMemoryCacheForTest();
  vi.unstubAllGlobals();
});

const PROJET = 'projet-a11';

/** Un fil réaliste : ~480 Ko, comme celui du projet mesuré. */
function filVolumineux() {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `m${index}`,
    role: index % 2 ? 'assistant' : 'user',
    content: `${'contenu généré par l’agent '.repeat(450)}${index}`,
  })) as never;
}

/** Ce que déclenche un clic sur l'onglet « Aperçu » : les deux sauvegardes d'interface. */
async function cliquerSurLOngletApercu() {
  await saveProjectIdeMemory(PROJET, {
    ui: { activeWorkspacePanel: 'preview', currentView: 'preview', workspaceTabs: ['agent', 'preview'] } as never,
  });
  await saveProjectIdeMemory(PROJET, { ui: { previewIndex: 0, previewPath: '/' } as never });
}

const octets = (liste: Envoi[]) =>
  liste.reduce((total, envoi) => total + new TextEncoder().encode(envoi.corps).length, 0);

describe('A-11 — un changement d’onglet ne renvoie pas la conversation', () => {
  it('un clic d’onglet envoie quelques octets d’interface, jamais le fil', async () => {
    await saveProjectIdeMemory(PROJET, { chat: { id: `project:${PROJET}`, messages: filVolumineux() } });

    // Témoin : la sauvegarde du fil, elle, part bien entière.
    expect(octets(envois)).toBeGreaterThan(400_000);

    const avantLeClic = envois.length;
    await cliquerSurLOngletApercu();

    const duClic = envois.slice(avantLeClic);

    /*
     * Mesuré AVANT correctif : 2 envois, ~970 Ko au total, le fil complet dans
     * chacun — le défaut vu en production.
     */
    expect(octets(duClic)).toBeLessThan(5_000);
    expect(duClic.every((envoi) => envoi.etat.chat === undefined)).toBe(true);
    expect(duClic.length).toBeLessThanOrEqual(2);
  });

  it('revenir sur le même onglet (même état) n’envoie RIEN de plus', async () => {
    await saveProjectIdeMemory(PROJET, { chat: { id: `project:${PROJET}`, messages: filVolumineux() } });
    await cliquerSurLOngletApercu();

    const avant = envois.length;

    // L'aperçu remonté resauvegarde exactement la même chose : le serveur l'a déjà.
    await saveProjectIdeMemory(PROJET, { ui: { previewIndex: 0, previewPath: '/' } as never });

    expect(envois.length - avant).toBe(0);
  });
});

describe('A-11 — ce qui garantit la survie du travail ne bouge pas', () => {
  it('une sauvegarde du fil part toujours ENTIÈRE, avec tous ses messages', async () => {
    await saveProjectIdeMemory(PROJET, { chat: { id: `project:${PROJET}`, messages: filVolumineux() } });
    await cliquerSurLOngletApercu();
    await saveProjectIdeMemory(PROJET, {
      chat: { id: `project:${PROJET}`, messages: [{ id: 'm40', role: 'user', content: 'encore' }] as never },
    });

    const dernier = envois.at(-1)!;
    const messages = (dernier.etat.chat as { messages: Array<{ id: string }> }).messages;

    expect(messages.map((message) => message.id)).toContain('m0');
    expect(messages.map((message) => message.id)).toContain('m40');
  });

  it('un fil dont l’envoi a ÉCHOUÉ repart avec le clic d’onglet suivant — il n’est jamais abandonné', async () => {
    reponseSuivante = () => ({ ok: false, status: 400 });

    await expect(
      saveProjectIdeMemory(PROJET, { chat: { id: `project:${PROJET}`, messages: filVolumineux() } }),
    ).rejects.toThrow();

    reponseSuivante = () => ({ ok: true, status: 200 });
    await saveProjectIdeMemory(PROJET, { ui: { activeWorkspacePanel: 'preview' } as never });

    const dernier = envois.at(-1)!;

    expect((dernier.etat.chat as { messages: unknown[] } | undefined)?.messages).toHaveLength(40);
    expect((dernier.etat.ui as { activeWorkspacePanel?: string }).activeWorkspacePanel).toBe('preview');
  }, 40_000);

  it('un vrai changement d’onglet après un envoi évité part quand même', async () => {
    await cliquerSurLOngletApercu();

    const avant = envois.length;
    await saveProjectIdeMemory(PROJET, { ui: { activeWorkspacePanel: 'console' } as never });

    expect(envois.length - avant).toBe(1);
    expect((envois.at(-1)!.etat.ui as { activeWorkspacePanel?: string }).activeWorkspacePanel).toBe('console');
  });

  it('la mémoire locale garde tout : l’interface ET le fil', async () => {
    await saveProjectIdeMemory(PROJET, { chat: { id: `project:${PROJET}`, messages: filVolumineux() } });
    await cliquerSurLOngletApercu();

    const memoire = getProjectIdeMemorySync(PROJET);

    expect(memoire?.chat?.messages).toHaveLength(40);
    expect(memoire?.ui?.activeWorkspacePanel).toBe('preview');
  });
});
