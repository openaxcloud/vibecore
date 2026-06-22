import { describe, expect, it } from 'vitest';
import type { FileMap } from './constants';
import { getFilePaths, selectContextBufferFiles } from './select-context';

describe('getFilePaths', () => {
  it('does not throw on the bare /home/project root entry (regression: ignore() rejects absolute paths)', () => {
    /*
     * Previously `'/home/project'.replace('/home/project/', '')` left the string
     * absolute, so ig.ignores('/home/project') threw "path should be a
     * `path.relative()`d string", crashing the entire chat stream (code=UNKNOWN).
     */
    const files: FileMap = {
      '/home/project': { type: 'folder' },
      '/home/project/src/App.tsx': { type: 'file', content: 'export default {}', isBinary: false },
      '/home/project/node_modules/foo/index.js': { type: 'file', content: '', isBinary: false },
    } as unknown as FileMap;

    let result: string[] = [];
    expect(() => {
      result = getFilePaths(files);
    }).not.toThrow();

    /*
     * The real source file is kept; the bare root is dropped (empty rel path);
     * node_modules is ignored by IGNORE_PATTERNS.
     */
    expect(result).toContain('/home/project/src/App.tsx');
    expect(result).not.toContain('/home/project');
    expect(result.some((p) => p.includes('node_modules'))).toBe(false);
  });

  it('handles a leading-slash absolute path without throwing', () => {
    const files: FileMap = {
      '/home/project/index.html': { type: 'file', content: '<!doctype html>', isBinary: false },
    } as unknown as FileMap;

    expect(() => getFilePaths(files)).not.toThrow();
    expect(getFilePaths(files)).toContain('/home/project/index.html');
  });
});

describe('selectContextBufferFiles', () => {
  const files: FileMap = {
    '/home/project/src/App.tsx': { type: 'file', content: 'app', isBinary: false },
    '/home/project/src/index.ts': { type: 'file', content: 'index', isBinary: false },
  } as unknown as FileMap;

  it('selects files listed in a well-formed codeContext.files array', () => {
    const { contextFiles, currentFiles } = selectContextBufferFiles(files, ['src/App.tsx']);

    expect(currentFiles).toEqual(['src/App.tsx']);
    expect(Object.keys(contextFiles)).toEqual(['src/App.tsx']);
    expect(contextFiles['src/App.tsx']).toBe(files['/home/project/src/App.tsx']);
  });

  it('does not throw when codeContext.files is undefined (regression: deserialized annotation missing files)', () => {
    /*
     * Previously `const codeContextFiles: string[] = codeContext.files;` was
     * dereferenced with `.includes()` and no array guard. A corrupted/older
     * annotation whose `files` is undefined threw a TypeError that aborted the
     * whole context-optimization pass for the turn.
     */
    let result: ReturnType<typeof selectContextBufferFiles> | undefined;

    expect(() => {
      result = selectContextBufferFiles(files, undefined);
    }).not.toThrow();

    expect(result?.contextFiles).toEqual({});
    expect(result?.currentFiles).toEqual([]);
  });

  it('does not throw when codeContext.files is a non-array value', () => {
    for (const bad of [null, 'src/App.tsx', 42, { 0: 'src/App.tsx' }] as unknown[]) {
      let result: ReturnType<typeof selectContextBufferFiles> | undefined;

      expect(() => {
        result = selectContextBufferFiles(files, bad);
      }).not.toThrow();

      expect(result?.contextFiles).toEqual({});
      expect(result?.currentFiles).toEqual([]);
    }
  });
});
