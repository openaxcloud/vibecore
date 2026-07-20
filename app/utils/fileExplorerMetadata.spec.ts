import { describe, expect, it } from 'vitest';
import { WORK_DIR } from './constants';
import {
  buildFileOutline,
  buildFileTimeline,
  buildGitStatusMap,
  gitStatusForPath,
  materialFileIcon,
  normalizeWorkspacePath,
  resolveWorkspacePathEntry,
} from './fileExplorerMetadata';
import type { FileMap } from '~/lib/stores/files';

describe('fileExplorerMetadata', () => {
  it('maps common source files to material-style icons', () => {
    expect(materialFileIcon(`${WORK_DIR}/src/App.tsx`).label).toBe('TypeScript React');
    expect(materialFileIcon('package.json').label).toBe('npm package manifest');
    expect(materialFileIcon('styles.css').label).toBe('CSS');
  });

  it('normalizes and resolves git status paths from backend changed files', () => {
    const statusByPath = buildGitStatusMap([
      'src/App.tsx',
      { path: 'src/new-file.ts', status: 'A' },
      { filePath: 'src/conflict.ts', status: 'UU' },
    ]);

    expect(normalizeWorkspacePath(`${WORK_DIR}/src/App.tsx`)).toBe('src/App.tsx');
    expect(gitStatusForPath(statusByPath, `${WORK_DIR}/src/App.tsx`)).toBe('modified');
    expect(gitStatusForPath(statusByPath, `${WORK_DIR}/src/new-file.ts`)).toBe('added');
    expect(gitStatusForPath(statusByPath, `${WORK_DIR}/src/conflict.ts`)).toBe('conflicted');
  });

  it('resolves an exact document first, then the canonical relative path across namespaces', () => {
    const runtimeDocument = { filePath: `${WORK_DIR}/src/App.tsx`, value: 'runtime' };
    const storageDocument = { filePath: '/src/App.tsx', value: 'storage' };

    const documents = {
      '/src/App.tsx': storageDocument,
      [`${WORK_DIR}/src/App.tsx`]: runtimeDocument,
    };

    expect(resolveWorkspacePathEntry(documents, `${WORK_DIR}/src/App.tsx`)).toBe(runtimeDocument);
    expect(resolveWorkspacePathEntry({ [`${WORK_DIR}/src/App.tsx`]: runtimeDocument }, '/src/App.tsx')).toBe(
      runtimeDocument,
    );
    expect(resolveWorkspacePathEntry(documents, '\\home\\project\\src\\App.tsx')).toBe(storageDocument);
    expect(resolveWorkspacePathEntry(documents, '/src/missing.ts')).toBeUndefined();
  });

  it('builds a useful outline for code and markdown files', () => {
    const files: FileMap = {
      [`${WORK_DIR}/src/App.tsx`]: {
        type: 'file',
        isBinary: false,
        content: ['export function App() {', 'const saveUser = () => null', 'class Store {}'].join('\n'),
      },
      [`${WORK_DIR}/README.md`]: {
        type: 'file',
        isBinary: false,
        content: '# Title\n## Install',
      },
    };

    expect(buildFileOutline(`${WORK_DIR}/src/App.tsx`, files).map((symbol) => symbol.label)).toEqual([
      'App',
      'saveUser',
      'Store',
    ]);
    expect(buildFileOutline(`${WORK_DIR}/README.md`, files).map((symbol) => symbol.label)).toEqual([
      'Title',
      'Install',
    ]);
  });

  it('combines file history and git status into a timeline', () => {
    const files: FileMap = {
      [`${WORK_DIR}/src/App.tsx`]: { type: 'file', isBinary: false, content: 'export function App() {}' },
      [`${WORK_DIR}/src/new.ts`]: { type: 'file', isBinary: false, content: 'export const value = 1' },
    };

    const timeline = buildFileTimeline(
      files,
      {
        [`${WORK_DIR}/src/App.tsx`]: {
          originalContent: '',
          lastModified: 100,
          changes: [],
          versions: [{ timestamp: 100, content: 'export function App() {}' }],
        },
      },
      buildGitStatusMap([{ path: 'src/new.ts', status: 'A' }]),
    );

    expect(timeline).toHaveLength(2);
    expect(timeline.some((entry) => entry.filePath.endsWith('/src/new.ts') && entry.status === 'added')).toBe(true);
  });
});
