import type { Message } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearProjectIdeMemoryCacheForTest,
  getProjectIdeMemory,
  getProjectIdeMemoryStorageKey,
  getProjectIdeMemorySync,
  getProjectIdeMemoryVersionForTest,
  saveProjectIdeMemory,
  setProjectIdeMemorySaveDebounceMsForTest,
  subscribeProjectIdeMemory,
  type ProjectIdeMemory,
} from './projectIdeMemory';

function deferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

function envelope(state: ProjectIdeMemory, version: number, status = 200) {
  return new Response(JSON.stringify({ ideState: { state, version } }), {
    status,
    headers: { etag: `"${version}"` },
  });
}

interface Put {
  endpoint: string;
  state: ProjectIdeMemory;
  version: string | null;
  finish: (response: Response) => void;
}

function transport(initial: ProjectIdeMemory = { ui: { agentWidth: 340 } }) {
  const puts: Put[] = [];
  const unread: Put[] = [];
  const waiting: Array<(put: Put) => void> = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      if (init?.method !== 'PUT') {
        return envelope(initial, 1);
      }

      const response = deferred<Response>();

      const put: Put = {
        endpoint: input,
        state: (JSON.parse(String(init.body)) as { state: ProjectIdeMemory }).state,
        version: new Headers(init.headers).get('if-match'),
        finish: response.resolve,
      };
      puts.push(put);

      const waiter = waiting.shift();

      if (waiter) {
        waiter(put);
      } else {
        unread.push(put);
      }

      return response.promise;
    }),
  );

  return {
    puts,
    nextPut: () => {
      const put = unread.shift();
      return put ? Promise.resolve(put) : new Promise<Put>((resolve) => waiting.push(resolve));
    },
  };
}

function installStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  });
}

function message(id: string, content: string): Message {
  return { id, role: 'user', content };
}

beforeEach(() => {
  clearProjectIdeMemoryCacheForTest();
  setProjectIdeMemorySaveDebounceMsForTest(0);
  vi.useFakeTimers();
  installStorage();
});

afterEach(() => {
  clearProjectIdeMemoryCacheForTest();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('IDE conflict recovery keeps edits queued during an in-flight PUT', () => {
  it.each([undefined, 'workspace-a'])(
    'keeps the latest UI edit in scope %s and the optimistic version contract',
    async (workspaceId) => {
      const network = transport();
      await getProjectIdeMemory('project-a', workspaceId);

      const first = saveProjectIdeMemory('project-a', { ui: { agentWidth: 520 } }, workspaceId);
      const sent = await network.nextPut();
      const second = saveProjectIdeMemory('project-a', { ui: { agentWidth: 700 } }, workspaceId);
      expect(network.puts).toHaveLength(1); // PUTs remain serialized within the scope.
      expect(getProjectIdeMemorySync('project-a', workspaceId)?.ui?.agentWidth).toBe(700);
      sent.finish(
        envelope({ ui: { agentWidth: 340, terminalBottomHeight: 222 }, chat: { description: 'remote' } }, 2, 412),
      );
      await vi.advanceTimersByTimeAsync(500);

      const retry = await network.nextPut();
      expect(retry.state.ui).toMatchObject({ agentWidth: 700, terminalBottomHeight: 222 });
      expect(retry.state).not.toHaveProperty('chat');
      expect([sent.version, retry.version]).toEqual(['"1"', '"2"']);
      retry.finish(envelope({}, 3));
      await Promise.all([first, second]);
      expect(network.puts).toHaveLength(2);
      expect(getProjectIdeMemorySync('project-a', workspaceId)?.ui?.agentWidth).toBe(700);
      expect(getProjectIdeMemoryVersionForTest('project-a', workspaceId)).toBe(3);

      const local = JSON.parse(
        localStorage.getItem(getProjectIdeMemoryStorageKey('project-a', workspaceId))!,
      ) as ProjectIdeMemory;
      expect(local.ui?.agentWidth).toBe(700);
    },
  );

  it('reads pending dirty after the conflict response body has finished parsing', async () => {
    const network = transport();
    await getProjectIdeMemory('project-a');

    const first = saveProjectIdeMemory('project-a', { ui: { agentWidth: 520 } });
    const sent = await network.nextPut();
    const body = deferred<unknown>();
    const reading = deferred<void>();
    const conflict = envelope({}, 2, 412);
    vi.spyOn(conflict, 'json').mockImplementation(() => {
      reading.resolve();
      return body.promise;
    });
    sent.finish(conflict);
    await reading.promise;

    const second = saveProjectIdeMemory('project-a', { ui: { agentWidth: 700 } });
    body.resolve({ ideState: { state: { ui: { agentWidth: 340 } }, version: 2 } });
    await vi.advanceTimersByTimeAsync(500);

    const retry = await network.nextPut();
    expect(retry.state.ui?.agentWidth).toBe(700);
    retry.finish(envelope({}, 3));
    await Promise.all([first, second]);
  });

  it('keeps newer chat edits and appended messages while adopting unrelated server messages', async () => {
    const network = transport({ chat: { messages: [message('user', 'initial')] } });
    await getProjectIdeMemory('project-a');

    const first = saveProjectIdeMemory('project-a', { chat: { messages: [message('user', 'first')] } });
    const sent = await network.nextPut();

    const second = saveProjectIdeMemory('project-a', {
      chat: { messages: [message('user', 'latest'), message('new', 'new local message')], description: 'latest title' },
    });
    sent.finish(
      envelope(
        {
          ui: { terminalBottomHeight: 222 },
          chat: { messages: [message('user', 'remote'), message('remote', 'other writer')] },
        },
        2,
        412,
      ),
    );
    await vi.advanceTimersByTimeAsync(500);

    const retry = await network.nextPut();
    expect(retry.state).not.toHaveProperty('ui');
    expect(retry.state.chat?.messages).toEqual([
      message('user', 'latest'),
      message('remote', 'other writer'),
      message('new', 'new local message'),
    ]);
    expect(retry.state.chat?.description).toBe('latest title');
    expect(retry.state.chat?.clearMessages).toBeUndefined();
    retry.finish(envelope({}, 3));
    await Promise.all([first, second]);
    expect(getProjectIdeMemorySync('project-a')?.chat?.messages).toEqual(retry.state.chat?.messages);
  });

  it('preserves a chat clear queued behind a UI PUT, including archived messages', async () => {
    const stale = {
      ui: { agentWidth: 340 },
      chat: { messages: [message('old', 'old')], archivedMessages: [message('archive', 'archived')] },
    };

    const network = transport(stale);
    await getProjectIdeMemory('project-a');

    const first = saveProjectIdeMemory('project-a', { ui: { agentWidth: 520 } });
    const sent = await network.nextPut();

    const second = saveProjectIdeMemory('project-a', {
      chat: { messages: [], archivedMessages: [], clearMessages: true },
    });
    sent.finish(envelope(stale, 2, 412));
    await vi.advanceTimersByTimeAsync(500);

    const retry = await network.nextPut();
    expect(retry.state).toMatchObject({
      ui: { agentWidth: 520 },
      chat: { messages: [], archivedMessages: [], clearMessages: true },
    });
    retry.finish(envelope({}, 3));
    await Promise.all([first, second]);
    expect(getProjectIdeMemorySync('project-a')?.chat).toMatchObject({ messages: [], archivedMessages: [] });
    expect(getProjectIdeMemorySync('project-a')?.chat).not.toHaveProperty('clearMessages');
  });

  it('keeps clearMessages sticky when a newer chat edit follows the pending clear', async () => {
    const network = transport({
      chat: { messages: [message('removed', 'removed')], archivedMessages: [message('archive', 'old')] },
    });
    await getProjectIdeMemory('project-a');

    const first = saveProjectIdeMemory('project-a', {
      chat: { messages: [message('survivor', 'kept')], archivedMessages: [], clearMessages: true },
    });

    const sent = await network.nextPut();
    const second = saveProjectIdeMemory('project-a', { chat: { messages: [message('new', 'after rewind')] } });
    sent.finish(
      envelope(
        {
          chat: {
            messages: [message('removed', 'remote removed')],
            archivedMessages: [message('archive', 'remote archived')],
          },
        },
        2,
        412,
      ),
    );
    await vi.advanceTimersByTimeAsync(500);

    const retry = await network.nextPut();
    expect(retry.state.chat).toMatchObject({
      clearMessages: true,
      messages: [message('survivor', 'kept'), message('new', 'after rewind')],
      archivedMessages: [],
    });
    retry.finish(envelope({}, 3));
    await Promise.all([first, second]);
    expect(getProjectIdeMemorySync('project-a')?.chat).not.toHaveProperty('clearMessages');
  });

  it('keeps a UI edit queued behind a chat PUT without losing either pending domain', async () => {
    const network = transport({ ui: { agentWidth: 340 }, chat: { messages: [] } });
    await getProjectIdeMemory('project-a');

    const first = saveProjectIdeMemory('project-a', { chat: { messages: [message('user', 'queued chat')] } });
    const sent = await network.nextPut();
    const second = saveProjectIdeMemory('project-a', { ui: { agentWidth: 700 } });
    sent.finish(envelope({ ui: { agentWidth: 340 }, chat: { messages: [message('remote', 'server chat')] } }, 2, 412));
    await vi.advanceTimersByTimeAsync(500);

    const retry = await network.nextPut();
    expect(retry.state.ui?.agentWidth).toBe(700);
    expect(retry.state.chat?.messages).toEqual([message('remote', 'server chat'), message('user', 'queued chat')]);
    retry.finish(envelope({}, 3));
    await Promise.all([first, second]);
  });

  it('uses the latest authoritative clear when a second clear is queued during the PUT', async () => {
    const network = transport({ chat: { messages: [message('old', 'old')] } });
    await getProjectIdeMemory('project-a');

    const first = saveProjectIdeMemory('project-a', {
      chat: { messages: [message('survivor', 'kept initially')], archivedMessages: [], clearMessages: true },
    });

    const sent = await network.nextPut();

    const second = saveProjectIdeMemory('project-a', {
      chat: { messages: [], archivedMessages: [], clearMessages: true },
    });
    sent.finish(envelope({ chat: { messages: [message('remote', 'not restored')] } }, 2, 412));
    await vi.advanceTimersByTimeAsync(500);

    const retry = await network.nextPut();
    expect(retry.state.chat).toMatchObject({ messages: [], archivedMessages: [], clearMessages: true });
    retry.finish(envelope({}, 3));
    await Promise.all([first, second]);
    expect(getProjectIdeMemorySync('project-a')?.chat?.messages).toEqual([]);
  });

  it('keeps edits made during conflict backoff, before the next PUT starts', async () => {
    const network = transport();
    await getProjectIdeMemory('project-a');

    const first = saveProjectIdeMemory('project-a', { ui: { agentWidth: 520 } });
    const sent = await network.nextPut();
    sent.finish(envelope({ ui: { agentWidth: 340 } }, 2, 412));
    await vi.advanceTimersByTimeAsync(100);
    expect(network.puts).toHaveLength(1);

    const second = saveProjectIdeMemory('project-a', { ui: { agentWidth: 700 } });
    await vi.advanceTimersByTimeAsync(400);

    const retry = await network.nextPut();
    expect(retry.state.ui?.agentWidth).toBe(700);
    expect(retry.version).toBe('"2"');
    retry.finish(envelope({}, 3));
    await Promise.all([first, second]);
  });

  it('preserves the newest edit after each of two conflicts', async () => {
    const network = transport();
    await getProjectIdeMemory('project-a');

    const first = saveProjectIdeMemory('project-a', { ui: { agentWidth: 520 } });
    const sent = await network.nextPut();
    const second = saveProjectIdeMemory('project-a', { ui: { agentWidth: 700 } });
    sent.finish(envelope({ ui: { agentWidth: 340 } }, 2, 412));
    await vi.advanceTimersByTimeAsync(500);

    const retry = await network.nextPut();
    const third = saveProjectIdeMemory('project-a', { ui: { agentWidth: 900 } });
    retry.finish(envelope({ ui: { agentWidth: 340, rightPanelOpen: false } }, 3, 412));
    await vi.advanceTimersByTimeAsync(500);

    const last = await network.nextPut();
    expect(network.puts.map((put) => put.state.ui?.agentWidth)).toEqual([520, 700, 900]);
    expect(network.puts.map((put) => put.version)).toEqual(['"1"', '"2"', '"3"']);
    expect(last.state.ui?.rightPanelOpen).toBe(false);
    last.finish(envelope({}, 4));
    await Promise.all([first, second, third]);
    expect(getProjectIdeMemorySync('project-a')?.ui?.agentWidth).toBe(900);
  });

  it('does not overwrite a save synchronously made by a conflict listener', async () => {
    const network = transport();
    await getProjectIdeMemory('project-a');

    let fromListener: Promise<void> | undefined;

    const unsubscribe = subscribeProjectIdeMemory('project-a', () => {
      fromListener = saveProjectIdeMemory('project-a', { ui: { agentWidth: 700 } });
    });

    const first = saveProjectIdeMemory('project-a', { ui: { agentWidth: 520 } });
    const sent = await network.nextPut();
    sent.finish(envelope({ ui: { agentWidth: 340 } }, 2, 412));
    await vi.advanceTimersByTimeAsync(500);

    const retry = await network.nextPut();
    expect(retry.state.ui?.agentWidth).toBe(700);
    retry.finish(envelope({}, 3));
    await first;
    await fromListener;
    unsubscribe();
  });

  it('isolates two projects and two workspaces while their writes are concurrent', async () => {
    const network = transport();

    const scopes = [
      { projectId: 'project-a', workspaceId: undefined },
      { projectId: 'project-a', workspaceId: 'workspace-a' },
      { projectId: 'project-a', workspaceId: 'workspace-b' },
      { projectId: 'project-b', workspaceId: undefined },
    ];
    await Promise.all(scopes.map(({ projectId, workspaceId }) => getProjectIdeMemory(projectId, workspaceId)));

    const listeners = scopes.map(() => vi.fn<(memory: ProjectIdeMemory) => void>());

    const unsubscribes = scopes.map(({ projectId, workspaceId }, index) =>
      subscribeProjectIdeMemory(projectId, listeners[index], workspaceId),
    );

    const saves = scopes.map((scope, index) =>
      saveProjectIdeMemory(scope.projectId, { ui: { agentWidth: 520 + index * 100 } }, scope.workspaceId),
    );

    const sent = await Promise.all(scopes.map(() => network.nextPut()));
    saves.push(saveProjectIdeMemory('project-a', { ui: { agentWidth: 800 } }));
    saves.push(saveProjectIdeMemory('project-a', { ui: { agentWidth: 900 } }, 'workspace-a'));
    sent[0].finish(envelope({ ui: { agentWidth: 340 } }, 2, 412));
    sent[1].finish(envelope({ ui: { agentWidth: 340 } }, 9, 412));
    sent[2].finish(envelope({}, 30));
    sent[3].finish(envelope({}, 40));
    await vi.advanceTimersByTimeAsync(500);

    const retries = await Promise.all([network.nextPut(), network.nextPut()]);
    expect(retries.map((put) => [put.endpoint, put.version, put.state.ui?.agentWidth])).toEqual([
      ['/api/projects/project-a/ide-state', '"2"', 800],
      ['/api/workspaces/workspace-a/ide-state', '"9"', 900],
    ]);
    retries[0].finish(envelope({}, 3));
    retries[1].finish(envelope({}, 10));
    await Promise.all(saves);
    expect(
      scopes.map(({ projectId, workspaceId }) => getProjectIdeMemorySync(projectId, workspaceId)?.ui?.agentWidth),
    ).toEqual([800, 900, 720, 820]);
    expect(
      scopes.map(({ projectId, workspaceId }) => getProjectIdeMemoryVersionForTest(projectId, workspaceId)),
    ).toEqual([3, 10, 30, 40]);
    expect(
      scopes.map(({ projectId, workspaceId }) => {
        const local = JSON.parse(
          localStorage.getItem(getProjectIdeMemoryStorageKey(projectId, workspaceId))!,
        ) as ProjectIdeMemory;
        return local.ui?.agentWidth;
      }),
    ).toEqual([800, 900, 720, 820]);
    expect(listeners.map((listener) => listener.mock.calls.map(([memory]) => memory.ui?.agentWidth))).toEqual([
      [800],
      [900],
      [],
      [],
    ]);
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  });
});
