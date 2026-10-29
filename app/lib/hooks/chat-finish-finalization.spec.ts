// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { RuntimeAdapter } from '@vibecore/runtime-contract';
import type { Message } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeStreamMessage, processStreamSnapshot } from '~/lib/chat/finalize-stream-message';
import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/runtime/message-parser';

// Real parser and runner; only the runtime/terminal effects and Workbench routing are isolated.
const files = new Map<string, string>();
const writes: string[] = [];
const runners = new Map<string, import('~/lib/runtime/action-runner').ActionRunner>();

const owners = new Map<string, string>();

let queued: Promise<unknown> = Promise.resolve();

const runtime = {
  workdir: '/home/project',
  createDirectory: vi.fn(async () => undefined),
  writeFile: vi.fn(async (path: string, content: string) => {
    files.set(path, String(content));
    writes.push(String(content));
  }),
  readFile: vi.fn(async (path: string) => ({ content: files.get(path) ?? '' })),
  listFiles: vi.fn(async () => []),
  runCommand: vi.fn(async () => {
    throw new Error('Commands forbidden in this fixture');
  }),
} as unknown as RuntimeAdapter;

const shell = { ready: vi.fn(async () => undefined), terminal: {}, process: {}, executeCommand: vi.fn() };
vi.mock('~/lib/stores/workbench', async () => {
  const runnerModule = await import('~/lib/runtime/action-runner');
  return {
    workbenchStore: {
      showWorkbench: { set: vi.fn() },
      files: { get: () => ({}) },
      addArtifact: (data: ArtifactCallbackData & { id: string }) => {
        if (!runners.has(data.id)) {
          owners.set(data.id, data.messageId);
          runners.set(data.id, new runnerModule.ActionRunner(runtime, () => shell as any));
        }
      },
      updateArtifact: vi.fn(),
      addAction: (data: ActionCallbackData) => {
        queued = queued.then(() => runners.get(data.artifactId)!.addAction(data));
      },
      runAction: (data: ActionCallbackData, streaming = false) => {
        queued = queued.then(() => runners.get(data.artifactId)!.runAction(data, streaming));
      },
      finishStreamingFileActions: (messageId: string) => {
        const captured = [...runners.entries()]
          .filter(([id]) => owners.get(id) === messageId)
          .map(([, runner]) => runner);
        queued = queued.then(() => captured.forEach((runner) => runner.abortStreamingFileActions()));
      },
      abortAllActions: () => runners.forEach((runner) => runner.abortAll()),
      abortStreamingFileActions: () => runners.forEach((runner) => runner.abortStreamingFileActions()),
    },
  };
});
vi.stubEnv('DEV', false);

const { useMessageParser } = await import('./useMessageParser');
const { workbenchStore } = await import('~/lib/stores/workbench');

const prefix =
  '<boltArtifact id="app" title="Fixture"><boltAction type="file" filePath="src/styles.css">body { color: red;';

const full = `${prefix} background: white; }</boltAction></boltArtifact>`;

let sequence = 0;

const message = (id: string, content: string): Message => ({ id, role: 'assistant', content });

const drain = async () => {
  await queued;

  for (const runner of runners.values()) {
    await runner.waitForIdle();
  }
};

const action = () => Object.values([...runners.values()][0].actions.get())[0];

async function begin() {
  const id = `finish-fixture-${++sequence}`;
  const hook = renderHook(() => useMessageParser());
  await act(async () => {
    hook.result.current.parseMessages([message(id, prefix)], true);
    await drain();
  });
  expect(action().status).toBe('running');
  expect(action().executed).toBe(false);

  return { id, hook };
}
beforeEach(() => {
  files.clear();
  writes.length = 0;
  runners.clear();
  owners.clear();
  queued = Promise.resolve();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Network forbidden in this fixture');
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('final chat fragment versus streaming cleanup', () => {
  it('must persist a received complete final file even when onFinish precedes the sampled final parse', async () => {
    const { id, hook } = await begin();

    // Invoke the same finalization helper as Chat.onFinish before the sampled final render.
    finalizeStreamMessage(message(id, full), [message(id, prefix)], hook.result.current.parseMessages, (owner) =>
      workbenchStore.finishStreamingFileActions(owner),
    );
    await act(async () => {
      hook.result.current.parseMessages([message(id, full)], false);
      await drain();
    });
    expect(action().status).toBe('complete');
    expect(writes.some((content) => /background:\s*white;\s*}/.test(content))).toBe(true);
  });
  it('does not call an open EOF file complete', async () => {
    const { id, hook } = await begin();
    finalizeStreamMessage(message(id, prefix), [message(id, prefix)], hook.result.current.parseMessages, (owner) =>
      workbenchStore.finishStreamingFileActions(owner),
    );
    await act(async () => {
      hook.result.current.parseMessages([message(id, prefix)], false);
      await drain();
    });
    expect(action().status).toBe('aborted');
    expect(writes.some((content) => /background:\s*white;\s*}/.test(content))).toBe(false);
  });
  it('never revives an explicit user Stop when a late complete final fragment arrives', async () => {
    const { id, hook } = await begin();
    workbenchStore.abortAllActions();

    const count = writes.length;
    finalizeStreamMessage(message(id, full), [message(id, prefix)], hook.result.current.parseMessages, (owner) =>
      workbenchStore.finishStreamingFileActions(owner),
    );
    await act(async () => {
      hook.result.current.parseMessages([message(id, full)], false);
      await drain();
    });
    expect(action().status).toBe('aborted');
    expect(writes).toHaveLength(count);
  });
});

it('scopes final cleanup to its message while another message still streams', async () => {
  const { id, hook } = await begin();
  const nextId = `next-${id}`;
  const nextPrefix = prefix.replace('id="app"', 'id="other"').replace('styles.css', 'next.css');
  await act(async () => {
    hook.result.current.parseMessages([message(id, prefix), message(nextId, nextPrefix)], true);
    await drain();
  });

  const otherRunner = [...runners.entries()].find(([artifactId]) => owners.get(artifactId) === nextId)![1];
  await act(async () => {
    finalizeStreamMessage(
      message(id, full),
      [message(id, prefix), message(nextId, nextPrefix)],
      hook.result.current.parseMessages,
      (owner) => workbenchStore.finishStreamingFileActions(owner),
    );
    await drain();
  });
  expect(action().status).toBe('complete');
  expect(Object.values(otherRunner.actions.get())[0].status).toBe('running');
});

it('honors manual Stop while a final write is waiting in the execution queue', async () => {
  const { id, hook } = await begin();

  let release!: () => void;

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  queued = queued.then(() => gate);

  const count = writes.length;
  finalizeStreamMessage(message(id, full), [message(id, prefix)], hook.result.current.parseMessages, (owner) =>
    workbenchStore.finishStreamingFileActions(owner),
  );
  workbenchStore.abortAllActions();
  await act(async () => {
    release();
    await drain();
  });
  expect(action().status).toBe('aborted');
  expect(writes).toHaveLength(count);
});

it('does not create a newly discovered artifact from a sampled final fragment after Stop', async () => {
  const hook = renderHook(() => useMessageParser());
  const id = `stopped-new-${++sequence}`;
  await act(async () => {
    processStreamSnapshot({
      messages: [message(id, full)],
      initialMessages: [],
      isLoading: false,
      isCurrent: () => true,
      isAborted: () => true,
      parseMessages: hook.result.current.parseMessages,
      finishFileActions: (owner) => workbenchStore.finishStreamingFileActions(owner),
    });
    await drain();
  });
  expect(runners.size).toBe(0);
  expect(writes).toEqual([]);
});

it('ignores a stale sampled transcript after navigation without opening its new artifact', () => {
  const hook = renderHook(() => useMessageParser());

  const processed = processStreamSnapshot({
    messages: [message('old-project', full)],
    initialMessages: [],
    isLoading: false,
    isCurrent: () => false,
    isAborted: () => false,
    parseMessages: hook.result.current.parseMessages,
    finishFileActions: (owner) => workbenchStore.finishStreamingFileActions(owner),
  });
  expect(processed).toBe(false);
  expect(runners.size).toBe(0);
  expect(writes).toEqual([]);
});
it('does not create a new artifact from final bytes sampled after explicit Stop', async () => {
  const { id, hook } = await begin();
  workbenchStore.abortAllActions();

  const count = writes.length;
  const artifactCount = runners.size;
  const late = `${full}<boltArtifact id="late" title="Late"><boltAction type="file" filePath="late.css">body{color:blue}</boltAction></boltArtifact>`;

  const processed = processStreamSnapshot({
    messages: [message(id, late)],
    initialMessages: [],
    isLoading: false,
    isCurrent: () => true,
    isAborted: () => true,
    parseMessages: hook.result.current.parseMessages,
    finishFileActions: (owner) => workbenchStore.finishStreamingFileActions(owner),
  });
  await drain();
  expect(processed).toBe(false);
  expect(runners.size).toBe(artifactCount);
  expect(writes).toHaveLength(count);
});
it('the sampled completion writes the final file through the production snapshot handler', async () => {
  const { id, hook } = await begin();
  await act(async () => {
    expect(
      processStreamSnapshot({
        messages: [message(id, full)],
        initialMessages: [],
        isLoading: false,
        isCurrent: () => true,
        isAborted: () => false,
        parseMessages: hook.result.current.parseMessages,
        finishFileActions: (owner) => workbenchStore.finishStreamingFileActions(owner),
      }),
    ).toBe(true);
    await drain();
  });
  expect(action().status).toBe('complete');
  expect(writes.some((content) => /background:\s*white;\s*}/.test(content))).toBe(true);
});
