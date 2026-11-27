import { expect, it, vi } from 'vitest';
import {
  type ProjectIdeMemory,
  clearProjectIdeMemoryCacheForTest,
  getProjectIdeMemorySync,
  saveProjectIdeMemory,
  setProjectIdeMemorySaveDebounceMsForTest,
} from './projectIdeMemory';

it.each([200, 412])(
  'older PUT acknowledgement %i preserves a newer full turn and the other project',
  async (status) => {
    clearProjectIdeMemoryCacheForTest();
    setProjectIdeMemorySaveDebounceMsForTest(0);

    let release!: (r: Response) => void;

    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });

    const writes: { url: string; state: ProjectIdeMemory }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        const state = JSON.parse(init.body).state;
        writes.push({ url, state });

        return writes.length === 1
          ? pending
          : Response.json({ ideState: { state, version: 3 } }, { headers: { etag: '"3"' } });
      }),
    );

    const user = { id: 'user-1', role: 'user' as const, content: 'prompt' };
    const partial = { id: 'assistant-1', role: 'assistant' as const, content: 'partial' };
    const full = { ...partial, content: 'complete bytes' };

    try {
      const first = saveProjectIdeMemory('A', { chat: { messages: [user, partial], clearMessages: true } });
      await vi.waitFor(() => expect(writes).toHaveLength(1));

      const final = saveProjectIdeMemory('A', { chat: { messages: [user, full] } });
      await saveProjectIdeMemory('B', { chat: { messages: [{ ...user, content: 'B only' }] } });
      release(
        Response.json(
          { ideState: { state: { ui: { agentWidth: 600 } }, version: 2 } },
          { status, headers: { etag: '"2"' } },
        ),
      );
      await Promise.all([first, final]);
      expect({
        cached: getProjectIdeMemorySync('A')?.chat?.messages,
        sent: writes.filter((item) => item.url.includes('/A/')).at(-1)?.state.chat?.messages,
        otherProject: getProjectIdeMemorySync('B')?.chat?.messages?.map((m) => m.content),
      }).toEqual({ cached: [user, full], sent: [user, full], otherProject: ['B only'] });
    } finally {
      vi.unstubAllGlobals();
      clearProjectIdeMemoryCacheForTest();
    }
  },
);
