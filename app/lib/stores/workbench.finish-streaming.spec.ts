/** @vitest-environment jsdom */
import type { RuntimeAdapter } from '@vibecore/runtime-contract';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkbenchStore } from './workbench';
import { identifiantDeLane } from '~/lib/runtime/agent-lane-writes';
import type { ActionCallbackData } from '~/lib/runtime/message-parser';

const { disk, runtime } = vi.hoisted(() => {
  const disk = new Map<string, string>();
  return {
    disk,
    runtime: {
      workdir: '/home/project',
      mode: 'test',
      createDirectory: vi.fn(async () => undefined),
      writeFile: vi.fn(async (path: string, content: string) => {
        disk.set(path, content);
      }),
      readFile: vi.fn(async (path: string) => ({ content: disk.get(path) ?? '' })),
      listFiles: vi.fn(async () => []),
    },
  };
});
vi.mock('~/lib/runtime/RuntimeAdapterProvider', () => ({ runtimeAdapter: runtime, getRuntimeAdapter: () => runtime }));
vi.mock('./previews', async () => {
  const { atom } = await import('nanostores');
  return {
    PreviewsStore: class {
      previews = atom([]);
      setRuntime = vi.fn();
      setObservationEnabled = vi.fn();
      refreshPorts = vi.fn(async () => undefined);
    },
  };
});
vi.mock('./files', async () => {
  const { map } = await import('nanostores');
  return {
    FilesStore: class {
      files = map<Record<string, unknown>>({});
      filesCount = 0;
      setRuntime = vi.fn();
      reloadFromRuntime = vi.fn(async () => undefined);
      adoptRemoteContent = vi.fn(async () => 'inchange');
      getFile = vi.fn();
      isFileLocked = () => ({ locked: false });
      getFileModifications = () => ({});
      getModifiedFiles = () => [];
      resetFileModifications = vi.fn();
    },
  };
});
vi.mock('./editor', async () => {
  const { atom, map } = await import('nanostores');
  return {
    EditorStore: class {
      currentDocument = atom(undefined);
      selectedFile = atom<string | undefined>(undefined);
      documents = map({});
      setDocuments = vi.fn();
      setSelectedFile = (path?: string) => this.selectedFile.set(path);
      updateFile = vi.fn();
      updateScrollPosition = vi.fn();
    },
  };
});
vi.mock('./terminal', async () => {
  const { atom } = await import('nanostores');
  return {
    TerminalStore: class {
      showTerminal = atom(false);
      boltTerminal = { ready: vi.fn(async () => undefined), terminal: {}, process: {}, executeCommand: vi.fn() };
      setRuntime = vi.fn();
      toggleTerminal = vi.fn();
    },
  };
});

const stores: WorkbenchStore[] = [];

const drain = (store: WorkbenchStore) =>
  new Promise<void>((resolve) => store.addToExecutionQueue(async () => resolve()));

const hold = (store: WorkbenchStore) => {
  let release!: () => void;

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  store.addToExecutionQueue(() => gate);

  return release;
};

async function streaming(store: WorkbenchStore, messageId: string, artifactId: string) {
  store.addArtifact({ id: artifactId, artifactId, messageId, title: 'Fixture', type: 'bundled' });

  const data: ActionCallbackData = {
    messageId,
    artifactId,
    actionId: 'file',
    action: { type: 'file', filePath: `${artifactId}.css`, content: 'body { color: red;' },
  };
  store.addAction(data);
  await drain(store);

  const runner = store.artifacts.get()[artifactId].runner;
  await runner.runAction(data, true);
  expect(runner.actions.get().file.status).toBe('running');

  return { runner, data };
}

function create() {
  const store = new WorkbenchStore();
  stores.push(store);

  return store;
}
beforeEach(() => {
  disk.clear();
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ proposals: [] }), { status: 200 })),
  );
});
afterEach(() => {
  for (const store of stores.splice(0)) {
    store.flushWorkspaceLogs();
  }
  vi.unstubAllGlobals();
});
it('runs a queued final write before cleanup through the real Workbench queue', async () => {
  const store = create();
  const { runner, data } = await streaming(store, 'turn', 'main');
  const release = hold(store);
  store.runAction({ ...data, action: { type: 'file', filePath: 'main.css', content: 'body { color: blue; }' } });
  store.finishStreamingFileActions('turn');
  expect(runner.actions.get().file.status).toBe('running');
  release();
  await drain(store);
  expect(runner.actions.get().file.status).toBe('complete');
  expect(disk.get('main.css')).toContain('blue');
});
it('cleans only the captured message and its lanes, preserving another streaming message', async () => {
  const store = create();
  const first = await streaming(store, 'turn', 'main');
  const lane = await streaming(store, identifiantDeLane('turn', 'frontend'), 'lane');
  const other = await streaming(store, 'other', 'other');
  store.finishStreamingFileActions('turn');
  await drain(store);
  expect(first.runner.actions.get().file.status).toBe('aborted');
  expect(lane.runner.actions.get().file.status).toBe('aborted');
  expect(other.runner.actions.get().file.status).toBe('running');
});
it.each(['runtime', 'project'] as const)('invalidates queued cleanup after a %s binding change', async (change) => {
  const store = create();
  store.configureProject('project-a');

  const { runner } = await streaming(store, 'turn', 'main');
  const release = hold(store);
  store.finishStreamingFileActions('turn');

  if (change === 'runtime') {
    store.configureRuntime({ ...runtime } as unknown as RuntimeAdapter, 'project-a');
  } else {
    store.configureProject('project-b');
  }

  release();
  await drain(store);
  expect(runner.actions.get().file.status).toBe('running');
});
