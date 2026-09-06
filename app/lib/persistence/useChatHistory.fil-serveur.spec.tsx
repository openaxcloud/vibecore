/** @vitest-environment jsdom */

import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * LE SITE D'APPEL, tenu pour de vrai.
 *
 * `serveur-fil-projet.spec.ts` couvre parfaitement le chargeur et la règle de
 * priorité. Il ne couvre PAS ce fichier-ci : mesuré le 2026-09-06, retirer la
 * ligne `void completerFilSiVide(...)` de `useChatHistory.ts` laissait ses
 * **neuf cas au vert**. Le correctif se défaisait sans un seul rouge.
 *
 * C'est la classe dominante de cette semaine — la sonde SEC-9 jamais admise, le
 * garde d'épinglage câblé nulle part : le mécanisme non tenu est presque
 * toujours le site d'appel, pas la fonction.
 *
 * Deux contrats sont épinglés ici, et ils sont distincts :
 *   1. la banque serveur EST consultée à la restauration d'un projet ;
 *   2. elle ne BLOQUE pas l'affichage — le fil local paraît d'abord.
 */

const mocks = vi.hoisted(() => {
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: {} });

  return {
    loaderData: {} as { id?: string; projectId?: string },
    completerFilSiVide: vi.fn(),
    getProjectIdeMemory: vi.fn(),
    saveProjectIdeMemory: vi.fn(),
    openDatabase: vi.fn(async () => ({ name: 'fil-serveur-spec-db' })),
    noop: vi.fn(),
  };
});

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    useLoaderData: () => mocks.loaderData,
    useNavigate: () => mocks.noop,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

vi.mock('react-toastify', () => ({
  toast: { info: mocks.noop, error: mocks.noop, success: mocks.noop },
}));

vi.mock('./db', () => ({
  openDatabase: (...a: unknown[]) => mocks.openDatabase(...a),
  getMessages: vi.fn(async () => undefined),
  getNextId: vi.fn(async () => 'chat-next'),
  getUrlId: vi.fn(async () => 'chat-url'),
  setMessages: vi.fn(async () => undefined),
  duplicateChat: vi.fn(),
  createChatFromMessages: vi.fn(),
  getSnapshot: vi.fn(async () => undefined),
  setSnapshot: vi.fn(async () => undefined),
}));

vi.mock('./projectIdeMemory', () => ({
  getProjectIdeMemory: (...a: unknown[]) => mocks.getProjectIdeMemory(...a),
  saveProjectIdeMemory: (...a: unknown[]) => mocks.saveProjectIdeMemory(...a),
}));

vi.mock('./serveur-fil-projet', () => ({
  completerFilSiVide: (...a: unknown[]) => mocks.completerFilSiVide(...a),
}));

vi.mock('~/lib/runtime/RuntimeAdapterProvider', () => ({
  runtimeAdapter: { workdir: '/home/project', createDirectory: mocks.noop, writeFile: mocks.noop },
}));
vi.mock('~/lib/stores/logs', () => ({ logStore: { logError: mocks.noop } }));
vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: { firstArtifact: undefined, files: { get: () => ({}) } },
}));
vi.mock('~/utils/projectCommands', () => ({
  detectProjectCommands: vi.fn(async () => []),
  createCommandActionsString: vi.fn(() => ''),
  escapeBoltActionAttribute: vi.fn((v: string) => v),
}));

import { useChatHistory } from './useChatHistory';

describe('la restauration d’un projet consulte la banque serveur', () => {
  beforeEach(() => {
    mocks.loaderData = { projectId: 'projet-sonde' };
    localStorage.clear();
    mocks.completerFilSiVide.mockReset();
    mocks.getProjectIdeMemory.mockReset();
    mocks.saveProjectIdeMemory.mockReset().mockResolvedValue(undefined);
    mocks.completerFilSiVide.mockResolvedValue(undefined);
    mocks.getProjectIdeMemory.mockResolvedValue({
      chat: undefined,
      updatedAt: '2026-09-06T00:00:00.000Z',
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('CONTRAT 1 — la banque serveur est bien sollicitée, avec le projet et un poseur', async () => {
    renderHook(() => useChatHistory());

    await waitFor(() => expect(mocks.completerFilSiVide).toHaveBeenCalled());

    const [messages, projectId, poser] = mocks.completerFilSiVide.mock.calls[0];
    expect(Array.isArray(messages)).toBe(true);
    expect(projectId).toBe('projet-sonde');
    expect(typeof poser).toBe('function');
  });

  it('CONTRAT 2 — l’affichage n’attend pas le serveur', async () => {
    /*
     * Le complément ne se résout JAMAIS : un serveur indéfiniment lent. Le hook
     * doit tout de même se déclarer prêt. Si l'appel était attendu au lieu d'être
     * lancé en arrière-plan, ce cas resterait bloqué — c'est exactement ce que
     * la mise en garde de la session QA demandait d'épingler.
     */
    mocks.completerFilSiVide.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useChatHistory());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(mocks.completerFilSiVide).toHaveBeenCalled();
  });

  it('le fil local déjà présent est celui qu’on transmet au complément', async () => {
    mocks.getProjectIdeMemory.mockResolvedValue({
      chat: { id: 'projet-sonde', messages: [{ id: 'm1', role: 'user', content: 'bonjour' }] },
      updatedAt: '2026-09-06T00:00:00.000Z',
    });

    renderHook(() => useChatHistory());

    await waitFor(() => expect(mocks.completerFilSiVide).toHaveBeenCalled());

    /*
     * C'est `completerFilSiVide` qui décide de ne rien faire quand le local est
     * plein — mais encore faut-il qu'on lui passe le VRAI fil local, sinon elle
     * écraserait un fil frais par celui du serveur.
     */
    expect(mocks.completerFilSiVide.mock.calls[0][0]).toHaveLength(1);
  });
});
