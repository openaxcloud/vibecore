import { describe, expect, it } from 'vitest';
import type { FileMap } from './constants';
import { getFilePaths } from './select-context';

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
