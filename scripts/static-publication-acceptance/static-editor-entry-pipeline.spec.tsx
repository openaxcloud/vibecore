/** @vitest-environment jsdom */

import type { FileChange, RuntimeAdapter } from '@vibecore/runtime-contract';
import JSZip from 'jszip';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilesStore } from '~/lib/stores/files';
import { WorkbenchStore } from '~/lib/stores/workbench';
import { prefetchInitialProjectArchive } from '~/lib/ide/initial-project-archive';

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
      mode: 'test',
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
  useRuntimeAdapter: () => runtimeAdapterMock,
  getRuntimeAdapter: () => runtimeAdapterMock,
}));

vi.mock('~/lib/stores/previews', async () => {
  const { atom } = await import('nanostores');

  return {
    PreviewsStore: class {
      previews = atom([]);

      setObservationEnabled = vi.fn();
      setRuntime = vi.fn();
      refreshPorts = vi.fn(async () => undefined);
    },
  };
});

vi.mock('~/lib/stores/terminal', async () => {
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

let projectSequence = 0;

const path = '/home/project/audit.txt';

async function archive(content = 'saved document') {
  const zip = new JSZip();
  zip.file('audit.txt', content);

  return new Response(JSON.stringify({ archive: { base64: await zip.generateAsync({ type: 'base64' }) } }));
}

function setup() {
  const store = new WorkbenchStore();
  const projectId = `selection-restore-${++projectSequence}`;
  store.configureProject(projectId);

  return { store, projectId };
}

function stubArchive(load: () => Promise<Response>) {
  const downloads = vi.fn(load);
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.endsWith('/export/zip') ? downloads() : Promise.resolve(new Response(JSON.stringify({ proposals: [] }))),
    ),
  );

  return downloads;
}


import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import * as Tooltip from '@radix-ui/react-tooltip';
import {I18nextProvider} from 'react-i18next';
import {FileTree} from '~/components/workbench/FileTree';
import {createI18nInstance} from '~/lib/i18n/runtime';
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();localStorage.clear();});
it.each(['failed','empty'])('exact root index remains discoverable through actual archive→store→FileTree when runtime list is %s',async mode=>{
 const {store}=setup();
 const zip=new JSZip();zip.file('index.html','<!doctype html><main id="proof">STATIC-SEED-NOT-PUBLISHED</main>');zip.file('package.json','{"name":"owned-static-proof"}');
 const base64=await zip.generateAsync({type:'base64'});
 stubArchive(async()=>new Response(JSON.stringify({archive:{base64}})));
 if(mode==='failed')runtimeAdapterMock.listFiles.mockRejectedValueOnce(Error('CONTROLLED_RUNTIME_UNAVAILABLE'));else runtimeAdapterMock.listFiles.mockResolvedValueOnce([]);
 await store.loadRuntimeFiles('.');
 expect(store.files.get()['/home/project/index.html']).toMatchObject({type:'file',content:'<!doctype html><main id="proof">STATIC-SEED-NOT-PUBLISHED</main>'});
 const select=vi.fn();render(<I18nextProvider i18n={createI18nInstance('en')}><Tooltip.Provider><FileTree files={store.files.get()} rootFolder="/home/project" hideRoot collapsed={false} enableWorkspaceViews onFileSelect={select}/></Tooltip.Provider></I18nextProvider>);
 const row=screen.getByText('index.html',{exact:true});expect(row.matches('.bolt-file-tree-name')).toBe(true);expect(row.closest('button.bolt-file-tree-node')).not.toBeNull();fireEvent.click(row);expect(select).toHaveBeenCalledWith('/home/project/index.html');
 store.configureProject(undefined);
});
