/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileTree } from './FileTree';
import type { FileMap } from '~/lib/stores/files';

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
    setCurrentDocumentScrollPosition: vi.fn(),
    setSelectedFile: vi.fn(),
    unlockFile: vi.fn(),
    unlockFolder: vi.fn(),
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
