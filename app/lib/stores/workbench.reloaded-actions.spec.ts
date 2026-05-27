/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';
import { WorkbenchStore } from './workbench';
import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/runtime/message-parser';

const { runtimeAdapterMock } = vi.hoisted(() => ({
  runtimeAdapterMock: {
    workdir: '/home/project',
    mode: 'test',
    listFiles: vi.fn(async () => []),
  },
}));

vi.mock('~/lib/runtime/RuntimeAdapterProvider', () => ({
  runtimeAdapter: runtimeAdapterMock,
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

      async saveFile(filePath: string, content: string) {
        this.files.setKey(filePath, { type: 'file', content, isBinary: false });
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

      setSelectedFile(filePath: string | undefined) {
        this.selectedFile.set(filePath);
      }

      updateFile(filePath: string, value: string) {
        this.documents.setKey(filePath, { filePath, value, isBinary: false });
      }

      updateScrollPosition = vi.fn();
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

function artifactData(messageId = 'assistant-1'): ArtifactCallbackData {
  return {
    id: 'artifact-1',
    artifactId: 'artifact-1',
    messageId,
    title: 'Generated app',
    type: 'bundled',
  };
}

function fileAction(messageId = 'assistant-1'): ActionCallbackData {
  return {
    artifactId: 'artifact-1',
    messageId,
    actionId: 'file-1',
    action: {
      type: 'file',
      filePath: 'src/App.tsx',
      content: 'export default function App() { return <h1>Production Preview Verified</h1>; }\n',
    },
  };
}

function shellAction(messageId = 'assistant-1'): ActionCallbackData {
  return {
    artifactId: 'artifact-1',
    messageId,
    actionId: 'shell-1',
    action: {
      type: 'shell',
      content: 'npm install',
    },
  };
}

function actionStatus(store: WorkbenchStore, actionId: string) {
  return store.artifacts.get()['artifact-1']?.runner.actions.get()[actionId]?.status;
}

describe('WorkbenchStore reloaded and review-first actions', () => {
  it('marks reloaded message actions complete without replaying them', async () => {
    const store = new WorkbenchStore();
    const artifact = artifactData();
    const command = shellAction();

    store.setReloadedMessages(['assistant-1']);
    store.addArtifact(artifact);
    store.addAction(command);
    store.runAction(command);

    await vi.waitFor(() => {
      expect(actionStatus(store, 'shell-1')).toBe('complete');
    });

    expect(store.agentPatchProposals.get()).toEqual({});
  });

  it('queues review-first file actions and skips follow-up commands until review is handled', async () => {
    const store = new WorkbenchStore();
    const artifact = artifactData();
    const file = fileAction();
    const command = shellAction();

    store.setAgentPatchReviewRequired(true);
    store.addArtifact(artifact);
    store.addAction(file);
    store.runAction(file);
    store.addAction(command);
    store.runAction(command);

    await vi.waitFor(() => {
      expect(actionStatus(store, 'file-1')).toBe('complete');
      expect(actionStatus(store, 'shell-1')).toBe('complete');
    });

    expect(store.agentPatchProposals.get()['artifact-1:file-1']).toMatchObject({
      actionId: 'file-1',
      status: 'pending',
      relativePath: 'src/App.tsx',
    });
    expect(store.workspaceLogs.get()).toContain(
      'AI command skipped until reviewed file changes are accepted or rejected.',
    );
  });
});
