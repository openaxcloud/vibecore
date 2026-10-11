import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearProjectIdeMemoryCacheForTest,
  flushProjectIdeMemorySaves,
  getProjectIdeMemorySync,
  saveProjectIdeMemory,
  setProjectIdeMemorySaveDebounceMsForTest,
} from './projectIdeMemory';

const projectId = 'sonde-onglets';
const history = { messages: [{ id: 'u1', role: 'user' as const, content: 'x'.repeat(490_000) }] };
const bodies: Array<Record<string, unknown>> = [];

beforeEach(() => {
  clearProjectIdeMemoryCacheForTest();
  setProjectIdeMemorySaveDebounceMsForTest(0);
  bodies.length = 0;

  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, options: RequestInit) => {
      bodies.push(JSON.parse(String(options.body)).state);

      return { ok: true, headers: new Headers(), json: async () => ({ ideState: null }) };
    }),
  );
});

afterEach(() => {
  clearProjectIdeMemoryCacheForTest();
  vi.unstubAllGlobals();
});

describe('persistance des onglets sans renvoyer la conversation', () => {
  it('conserve 490 Ko en mémoire, mais un changement d’onglet envoie moins de 1 Ko sans chat', async () => {
    await saveProjectIdeMemory(projectId, { chat: history });
    bodies.length = 0;
    await saveProjectIdeMemory(projectId, { ui: { activeWorkspacePanel: 'files' } });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).not.toHaveProperty('chat');
    expect(new TextEncoder().encode(JSON.stringify(bodies[0])).length).toBeLessThan(1_000);
    expect(getProjectIdeMemorySync(projectId)?.chat).toEqual(history);
  });

  it('ne renvoie pas le même état et transmet un changement suivant', async () => {
    await saveProjectIdeMemory(projectId, { ui: { activeWorkspacePanel: 'files' } });
    bodies.length = 0;
    await saveProjectIdeMemory(projectId, { ui: { activeWorkspacePanel: 'files' } });
    expect(bodies).toHaveLength(0);
    await saveProjectIdeMemory(projectId, { ui: { activeWorkspacePanel: 'editor' } });
    expect(bodies).toHaveLength(1);
    expect(bodies[0].ui).toMatchObject({ activeWorkspacePanel: 'editor' });
  });

  it('coalesce chat et disposition sans perdre le remplacement explicite des messages', async () => {
    setProjectIdeMemorySaveDebounceMsForTest(5_000);

    const chat = saveProjectIdeMemory(projectId, { chat: { ...history, clearMessages: true } });
    const tabs = saveProjectIdeMemory(projectId, { ui: { activeWorkspacePanel: 'files' } });
    await flushProjectIdeMemorySaves(projectId);
    await Promise.all([chat, tabs]);

    expect(bodies).toHaveLength(1);
    expect(bodies[0].chat).toMatchObject({ ...history, clearMessages: true });
    expect(bodies[0].ui).toMatchObject({ activeWorkspacePanel: 'files' });
  });

  it('deux appels simultanés n’émettent qu’un PUT après coalescence', async () => {
    await Promise.all([
      saveProjectIdeMemory(projectId, { ui: { activeWorkspacePanel: 'files' } }),
      saveProjectIdeMemory(projectId, { ui: { rightPanelOpen: true } }),
    ]);

    expect(bodies).toHaveLength(1);
    expect(bodies[0].ui).toMatchObject({ activeWorkspacePanel: 'files', rightPanelOpen: true });
  });
});
