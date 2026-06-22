/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { atom } from 'nanostores';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileTree } from './FileTree';
import { resolveEmptyExplorerState } from './file-tree-empty-state';
import type { FileMap } from '~/lib/stores/files';

const { loadRuntimeFiles } = vi.hoisted(() => ({ loadRuntimeFiles: vi.fn(() => Promise.resolve()) }));

vi.mock('~/lib/runtime/RuntimeAdapterProvider', () => ({
  useRuntimeAdapter: () => ({
    workdir: '/home/project',
    readFile: vi.fn(() => Promise.resolve({ content: '', encoding: 'utf8' as const })),
  }),
}));

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    createFile: vi.fn(),
    createFolder: vi.fn(),
    deleteFile: vi.fn(),
    deleteFolder: vi.fn(),
    files: { get: () => ({}) },
    isFileLocked: () => ({ locked: false }),
    isFolderLocked: () => ({ isLocked: false }),
    lockFile: vi.fn(),
    lockFolder: vi.fn(),
    loadRuntimeFiles,
    setCurrentDocumentScrollPosition: vi.fn(),
    setSelectedFile: vi.fn(),
    unlockFile: vi.fn(),
    unlockFolder: vi.fn(),
    workspaceLoading: atom(false),
    workspaceStatus: atom<{ status: string } | undefined>(undefined),
    workspaceError: atom<string | undefined>(undefined),
  },
}));

const files = {
  '/home/project/package.json': { type: 'file', content: '{}', isBinary: false },
  '/home/project/src/App.tsx': {
    type: 'file',
    content: 'export default function App() { return null; }',
    isBinary: false,
  },
  '/home/project/node_modules/@babel/core/package.json': { type: 'file', content: '{}', isBinary: false },
  '/home/project/.vite/deps/react.js': { type: 'file', content: 'export {};', isBinary: false },
} satisfies FileMap;

describe('<FileTree /> hidden/system files', () => {
  afterEach(() => {
    cleanup();
  });

  it('hides node_modules and generated folders by default', () => {
    render(<FileTree files={files} rootFolder="/home/project" hideRoot />);

    expect(screen.getByText('package.json')).toBeTruthy();
    expect(screen.getByText('src')).toBeTruthy();
    expect(screen.queryByText('node_modules')).toBeNull();
    expect(screen.queryByText('.vite')).toBeNull();
  });

  it('can reveal hidden/system folders on demand', () => {
    render(<FileTree files={files} rootFolder="/home/project" hideRoot showHiddenFiles />);

    expect(screen.getByText('node_modules')).toBeTruthy();
    expect(screen.getByText('.vite')).toBeTruthy();
  });
});

describe('resolveEmptyExplorerState', () => {
  it('reports loading while the workspace is provisioning', () => {
    const view = resolveEmptyExplorerState({
      filesEmpty: true,
      workspaceLoading: true,
      workspaceStatus: 'starting',
      hasWorkspace: true,
    });

    expect(view.variant).toBe('loading');
    expect(view.showReconnect).toBe(false);
  });

  it('reports an error with a reconnect affordance when the runtime crashed', () => {
    const view = resolveEmptyExplorerState({
      filesEmpty: true,
      workspaceLoading: false,
      workspaceStatus: 'error',
      hasWorkspace: true,
    });

    expect(view.variant).toBe('error');
    expect(view.showReconnect).toBe(true);
  });

  it('treats a stopped/GC-ed workspace as an error, not "still loading"', () => {
    const view = resolveEmptyExplorerState({
      filesEmpty: true,
      workspaceLoading: false,
      workspaceStatus: 'stopped',
      hasWorkspace: true,
    });

    expect(view.variant).toBe('error');
    expect(view.showReconnect).toBe(true);
  });

  it('prefers an explicit error message over a stale loading flag', () => {
    const view = resolveEmptyExplorerState({
      filesEmpty: true,
      workspaceLoading: true,
      workspaceStatus: 'starting',
      workspaceError: 'Crashed runtime',
      hasWorkspace: true,
    });

    expect(view.variant).toBe('error');
    expect(view.description).toBe('Crashed runtime');
  });

  it('keeps the original "No files" copy when the workspace is genuinely ready and empty', () => {
    const view = resolveEmptyExplorerState({
      filesEmpty: true,
      workspaceLoading: false,
      workspaceStatus: 'running',
      hasWorkspace: true,
    });

    expect(view.variant).toBe('empty');
    expect(view.title).toBe('No files available');
  });

  it('shows plain empty state when there is no remote workspace at all', () => {
    const view = resolveEmptyExplorerState({
      filesEmpty: true,
      workspaceLoading: false,
      hasWorkspace: false,
    });

    expect(view.variant).toBe('empty');
  });
});

describe('<FileTree /> empty state', () => {
  afterEach(() => {
    cleanup();
    loadRuntimeFiles.mockClear();
  });

  it('renders an error + Reconnect button for a crashed workspace instead of "loading"', () => {
    render(
      <FileTree
        files={{}}
        rootFolder="/home/project"
        hideRoot
        workspaceStatus="error"
        workspaceLoading={false}
        workspaceError="Crashed runtime"
      />,
    );

    expect(screen.getByText('Crashed runtime')).toBeTruthy();
    expect(screen.queryByText('Project files will appear here once the workspace is loaded.')).toBeNull();

    fireEvent.click(screen.getByText('Reconnect'));
    expect(loadRuntimeFiles).toHaveBeenCalledWith('.');
  });

  it('shows a loading state while the workspace provisions', () => {
    render(
      <FileTree files={{}} rootFolder="/home/project" hideRoot workspaceStatus="starting" workspaceLoading={true} />,
    );

    expect(screen.getByText('Loading workspace files…')).toBeTruthy();
    expect(screen.queryByText('Reconnect')).toBeNull();
  });
});
