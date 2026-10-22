/** @vitest-environment jsdom */

import { EditorView } from '@codemirror/view';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { MobileCodeEditor } from '@vibecore/editor';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchStore } from './workbench';

const { runtimeAdapterMock, runtimeFiles } = vi.hoisted(() => {
  const runtimeFiles = new Map<string, string>();

  const fileNodes = () =>
    [...runtimeFiles.entries()].map(([filePath, content]) => ({
      type: 'file' as const,
      name: filePath.split('/').pop() ?? filePath,
      path: filePath,
      content,
      encoding: 'utf8' as const,
    }));

  return {
    runtimeFiles,
    runtimeAdapterMock: {
      watchFiles: vi.fn(async () => () => undefined),
      watchPorts: vi.fn(async () => () => undefined),
      workdir: '/home/project',
      mode: 'webcontainer',
      listFiles: vi.fn(async () => fileNodes()),
      readFile: vi.fn(async (filePath: string) => ({
        content: runtimeFiles.get(filePath) ?? '',
        encoding: 'utf8' as const,
      })),
      writeFile: vi.fn(async (filePath: string, content: string) => {
        runtimeFiles.set(filePath, content);
      }),
      createFile: vi.fn(async (filePath: string, content: string) => {
        runtimeFiles.set(filePath, content);
      }),
      createDirectory: vi.fn(async () => undefined),
      listProcesses: vi.fn(async () => []),
      killProcess: vi.fn(async () => undefined),
      streamCommand: vi.fn(async function* () {
        yield { type: 'exit' as const, exitCode: 0 };
      }),
      runCommand: vi.fn(async () => ({ exitCode: 0, output: '' })),
      deleteFile: vi.fn(async (filePath: string) => {
        runtimeFiles.delete(filePath);
      }),
      startWorkspace: vi.fn(async () => ({
        id: 'ws-2',
        runtimeMode: 'remote-kubernetes' as const,
        status: 'running' as const,
        watchFiles: vi.fn(async () => () => undefined),
        watchPorts: vi.fn(async () => () => undefined),
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

vi.mock('./terminal', async () => {
  const { atom } = await import('nanostores');

  return {
    TerminalStore: class {
      showTerminal = atom(true);
      boltTerminal = {
        ready: vi.fn(async () => undefined),
        terminal: {},
        process: {},
        executeCommand: vi.fn(async () => ({ exitCode: 0, output: '' })),
      };

      setRuntime = vi.fn();

      toggleTerminal = vi.fn();
    },
  };
});

describe('P0 displayed document / save path after creation', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it.each(['keyboard', 'autosave', 'other-global-selection'])(
    'keeps types content on types.ts after twelve creations (%s)',
    async (saveMode) => {
      localStorage.clear();
      runtimeFiles.clear();
      vi.clearAllMocks();
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify({ proposals: [] }))),
      );

      const store = new WorkbenchStore();
      runtimeFiles.set('types.ts', 'export type Original = string;');
      await store.loadRuntimeFiles();
      store.setDocuments(store.files.get());
      store.setSelectedFile('/home/project/types.ts');

      const explicitSaveTargets: string[] = [];

      const viewFor = () => {
        const doc = store.currentDocument.get()!;
        return (
          <MobileCodeEditor
            value={doc.value}
            filePath={doc.filePath}
            onChange={(u) => {
              store.setDocumentContent(doc.filePath, u.value);
              store.scheduleFileAutosave(doc.filePath, u.value);
            }}
            onSave={() => {
              explicitSaveTargets.push(doc.filePath);
              void store.saveFile(doc.filePath);
            }}
          />
        );
      };

      const mounted = render(viewFor());

      for (let i = 0; i < 12; i++) {
        const path =
          i === 11 ? '/home/project/src/components/ui/card.tsx' : `/home/project/src/components/ui/c${i}.tsx`;
        await act(async () => {
          await store.createFile(path, '');
          store.setDocuments(store.files.get());
          store.setSelectedFile(path);
        });
        mounted.rerender(viewFor());

        const editor = EditorView.findFromDOM(mounted.container.querySelector('.cm-content') as HTMLElement)!;
        act(() => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: `COMPONENT-${i}` } }));
        await act(async () => {
          await store.saveFile(path);
        });
      }
      await act(async () => {
        store.setSelectedFile('/home/project/types.ts');
      });
      mounted.rerender(viewFor());

      if (saveMode === 'other-global-selection') {
        store.setSelectedFile('/home/project/src/components/ui/card.tsx');
      }

      const content = mounted.container.querySelector('.cm-content') as HTMLElement;
      expect(content.textContent).toBe('export type Original = string;');

      const editor = EditorView.findFromDOM(content)!;
      act(() =>
        editor.dispatch({
          changes: { from: 0, to: editor.state.doc.length, insert: 'export type Candidate = number;' },
        }),
      );

      if (saveMode !== 'autosave') {
        act(() => {
          content.focus();
          fireEvent.keyDown(content, { key: 's', code: 'KeyS', ctrlKey: true });
        });
        expect(explicitSaveTargets).toEqual(['/home/project/types.ts']);
      }

      await vi.waitFor(() => expect(runtimeFiles.get('types.ts')).toBe('export type Candidate = number;'));
      expect(runtimeFiles.get('src/components/ui/card.tsx')).toBe('COMPONENT-11');

      for (let i = 0; i < 11; i++) {
        expect(runtimeFiles.get(`src/components/ui/c${i}.tsx`)).toBe(`COMPONENT-${i}`);
      }
    },
  );
});
