/**
 * @vitest-environment jsdom
 *
 * Covers two WorkbenchStore fixes:
 *  1. syncFiles() now writes binary assets (decoded from base64) instead of
 *     silently dropping them while reporting success.
 *  2. #resetProjectScopedState() (via configureProject on a project switch)
 *     clears the buffered workspace-log lines + pending flush timer so project
 *     A's logs can't flush into project B's freshly-reset log atom.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchStore } from './workbench';
import { base64ToUint8Array, syncWriteContent } from './workbench-sync';

const { runtimeAdapterMock } = vi.hoisted(() => {
  return {
    runtimeAdapterMock: {
      workdir: '/home/project',
      mode: 'test',
      listFiles: vi.fn(async () => []),
      readFile: vi.fn(async () => ({ content: '', encoding: 'utf8' as const })),
      writeFile: vi.fn(async () => undefined),
      createFile: vi.fn(async () => undefined),
      createDirectory: vi.fn(async () => undefined),
      listProcesses: vi.fn(async () => []),
      killProcess: vi.fn(async () => undefined),
      streamCommand: vi.fn(async function* () {
        yield { type: 'exit' as const, exitCode: 0 };
      }),
      runCommand: vi.fn(async () => ({ exitCode: 0, output: '' })),
      deleteFile: vi.fn(async () => undefined),
      startWorkspace: vi.fn(async () => ({
        id: 'ws-1',
        runtimeMode: 'remote-kubernetes' as const,
        status: 'running' as const,
        workdir: '/home/project',
        createdAt: '',
        updatedAt: '',
      })),
    },
  };
});

vi.mock('~/lib/runtime/RuntimeAdapterProvider', () => ({
  runtimeAdapter: runtimeAdapterMock,
  getRuntimeAdapter: () => runtimeAdapterMock,
}));

vi.mock('./previews', async () => {
  const { atom } = await import('nanostores');

  return {
    PreviewsStore: class {
      previews = atom([]);
      setRuntime = vi.fn();
      refreshPorts = vi.fn(async () => undefined);
    },
  };
});

vi.mock('./files', async () => {
  const { map } = await import('nanostores');

  return {
    FilesStore: class {
      files = map({});
      filesCount = 0;
      setRuntime = vi.fn();
      getFile(filePath: string) {
        return this.files.get()[filePath];
      }
      isFileLocked() {
        return { locked: false as const };
      }
      getFileModifications() {
        return {};
      }
      getModifiedFiles() {
        return [];
      }
      resetFileModifications = vi.fn();
    },
  };
});

vi.mock('./editor', async () => {
  const { atom, map } = await import('nanostores');

  return {
    EditorStore: class {
      currentDocument = atom(undefined);
      selectedFile = atom(undefined);
      documents = map({});
      setDocuments = vi.fn();
      setSelectedFile = vi.fn();
      updateFile = vi.fn();
      updateScrollPosition = vi.fn();
    },
  };
});

vi.mock('./terminal', async () => {
  const { atom } = await import('nanostores');

  return {
    TerminalStore: class {
      showTerminal = atom(true);
      boltTerminal = { ready: vi.fn(async () => undefined), terminal: {}, process: {} };
      setRuntime = vi.fn();
      toggleTerminal = vi.fn();
    },
  };
});

vi.mock('~/lib/persistence/agentPatchProposalSync', () => ({
  deleteAgentPatchProposalRemote: vi.fn(async () => undefined),
  fetchOpenAgentPatchProposals: vi.fn(async () => []),
  isTerminalAgentPatchStatus: () => false,
  putAgentPatchProposal: vi.fn(async () => undefined),
}));

/** Minimal in-memory File System Access API stand-in for syncFiles. */
function createFakeDirectoryHandle() {
  type FakeFile = { content: string | Uint8Array };

  const files = new Map<string, FakeFile>();
  const subdirs = new Map<string, ReturnType<typeof makeDir>>();

  function makeDir(prefix: string) {
    return {
      async getDirectoryHandle(name: string) {
        const key = `${prefix}${name}/`;

        let dir = subdirs.get(key);

        if (!dir) {
          dir = makeDir(key);
          subdirs.set(key, dir);
        }

        return dir;
      },
      async getFileHandle(name: string) {
        const key = `${prefix}${name}`;

        return {
          async createWritable() {
            return {
              async write(content: string | Uint8Array) {
                files.set(key, { content });
              },
              async close() {
                /* no-op: content captured synchronously in write() */
              },
            };
          },
        };
      },
    };
  }

  const root = makeDir('');

  return Object.assign(root, { _files: files });
}

describe('syncWriteContent (pure helper)', () => {
  it('returns text content unchanged for non-binary files', () => {
    expect(syncWriteContent({ type: 'file', content: 'hello world' })).toBe('hello world');
    expect(syncWriteContent({ type: 'file', content: 'x', isBinary: false })).toBe('x');
  });

  it('decodes base64 binary content into the original bytes', () => {
    const bytes = new Uint8Array([0x00, 0xff, 0x10, 0x89, 0x50]);
    const base64 = Buffer.from(bytes).toString('base64');

    const result = syncWriteContent({ type: 'file', content: base64, isBinary: true });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result as Uint8Array)).toEqual(Array.from(bytes));
  });

  it('round-trips PNG magic bytes (the asset class previously dropped)', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const decoded = base64ToUint8Array(Buffer.from(png).toString('base64'));

    expect(Array.from(decoded)).toEqual(Array.from(png));
  });
});

describe('WorkbenchStore.syncFiles', () => {
  it('writes both text and binary files (binary no longer silently dropped)', async () => {
    const store = new WorkbenchStore();

    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xde, 0xad]);

    store.files.set({
      '/home/project/src/index.ts': { type: 'file', content: 'export const x = 1;', isBinary: false },
      '/home/project/public/logo.png': {
        type: 'file',
        content: Buffer.from(imageBytes).toString('base64'),
        isBinary: true,
      },
      '/home/project/src': { type: 'folder' },
    } as any);

    const dir = createFakeDirectoryHandle();
    const synced = await store.syncFiles(dir as unknown as FileSystemDirectoryHandle);

    // Both files reported as synced (folder dirent skipped).
    expect(synced.sort()).toEqual(['public/logo.png', 'src/index.ts']);

    const text = dir._files.get('src/index.ts');
    expect(text?.content).toBe('export const x = 1;');

    const image = dir._files.get('public/logo.png');
    expect(image?.content).toBeInstanceOf(Uint8Array);
    expect(Array.from(image?.content as Uint8Array)).toEqual(Array.from(imageBytes));
  });
});

describe('WorkbenchStore workspace-log reset on project switch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('does not flush project A buffered logs into project B after a switch', () => {
    const store = new WorkbenchStore();

    store.configureProject('project-a');

    // Buffer a streamed line for project A (coalesced behind the 100ms timer).
    store.appendWorkspaceLog({ type: 'stdout', data: 'project-a build output\n' } as any);

    // Nothing flushed yet — it's pending behind the timer.
    expect(store.workspaceLogs.get()).toEqual([]);

    // Switch to project B (provider resets the log atom afterwards).
    store.configureProject('project-b');
    store.workspaceLogs.set([]);

    // Let any leftover timer fire.
    vi.runAllTimers();

    // Project A's buffered line must NOT have leaked into project B.
    expect(store.workspaceLogs.get()).toEqual([]);
  });
});
