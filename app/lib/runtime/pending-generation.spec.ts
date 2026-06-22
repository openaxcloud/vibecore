import { describe, expect, it } from 'vitest';
import { countWorkspaceFiles, isUngeneratedProject, resolvePendingPrompt } from './pending-generation';
import type { FileMap } from '~/lib/stores/files';

describe('resolvePendingPrompt', () => {
  it('KEEPS the prompt when the generation wrote no files (failed/empty attempt)', () => {
    // README-only project (1 file) before and after — nothing was generated.
    expect(resolvePendingPrompt({ baselineFileCount: 1, finalFileCount: 1, errored: false })).toBe('keep');
  });

  it('KEEPS the prompt when the generation stream errored, even if some files exist', () => {
    expect(resolvePendingPrompt({ baselineFileCount: 1, finalFileCount: 5, errored: true })).toBe('keep');
  });

  it('CLEARS the prompt only after at least one new file was written', () => {
    // README (1) -> README + package.json + src/* (7): the agent produced the app.
    expect(resolvePendingPrompt({ baselineFileCount: 1, finalFileCount: 7, errored: false })).toBe('clear');
  });

  it('CLEARS on a single new file (boundary)', () => {
    expect(resolvePendingPrompt({ baselineFileCount: 0, finalFileCount: 1, errored: false })).toBe('clear');
  });

  it('KEEPS when the count somehow shrank (never treat that as success)', () => {
    expect(resolvePendingPrompt({ baselineFileCount: 3, finalFileCount: 2, errored: false })).toBe('keep');
  });
});

describe('countWorkspaceFiles', () => {
  it('counts real files and ignores folders and pruned entries', () => {
    const files: FileMap = {
      '/home/project/README.md': { type: 'file', content: '', isBinary: false },
      '/home/project/src': { type: 'folder' },
      '/home/project/src/App.tsx': { type: 'file', content: '', isBinary: false },
      '/home/project/removed.ts': undefined,
    };
    expect(countWorkspaceFiles(files)).toBe(2);
  });

  it('returns 0 for an empty or undefined map', () => {
    expect(countWorkspaceFiles({})).toBe(0);
    expect(countWorkspaceFiles(undefined)).toBe(0);
  });
});

describe('isUngeneratedProject', () => {
  it('is true when the only real files are scaffolding (README / .gitignore)', () => {
    const files: FileMap = {
      '/home/project/README.md': { type: 'file', content: '', isBinary: false },
      '/home/project/.gitignore': { type: 'file', content: '', isBinary: false },
      '/home/project/src': { type: 'folder' },
    };
    expect(isUngeneratedProject(files)).toBe(true);
  });

  it('is false once the agent has produced real app files', () => {
    const files: FileMap = {
      '/home/project/README.md': { type: 'file', content: '', isBinary: false },
      '/home/project/package.json': { type: 'file', content: '', isBinary: false },
      '/home/project/src/App.tsx': { type: 'file', content: '', isBinary: false },
    };
    expect(isUngeneratedProject(files)).toBe(false);
  });

  it('is false for an empty workspace (nothing to regenerate yet)', () => {
    expect(isUngeneratedProject({})).toBe(false);
    expect(isUngeneratedProject(undefined)).toBe(false);
  });
});
