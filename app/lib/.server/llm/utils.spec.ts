import { describe, expect, it } from 'vitest';
import type { FileMap } from './constants';
import { createFilesContext } from './utils';

/**
 * P0-b: the CONTEXT BUFFER must be byte-identical whenever the file SET is the
 * same, regardless of the order `selectContext` happened to emit the paths in.
 * A stable byte string is what lets OpenAI/Gemini/DeepSeek auto-cache (and
 * Anthropic) actually READ the cached prefix instead of re-billing it.
 */
describe('createFilesContext', () => {
  const file = (content: string): FileMap[string] => ({ type: 'file', content, isBinary: false });

  it('produces identical output for the same file set in different key orders', () => {
    const orderA: FileMap = {
      '/home/project/src/a.ts': file('export const a = 1;'),
      '/home/project/src/b.ts': file('export const b = 2;'),
      '/home/project/src/c.ts': file('export const c = 3;'),
    };

    // Same files, reversed insertion order.
    const orderB: FileMap = {
      '/home/project/src/c.ts': file('export const c = 3;'),
      '/home/project/src/b.ts': file('export const b = 2;'),
      '/home/project/src/a.ts': file('export const a = 1;'),
    };

    expect(createFilesContext(orderA, true)).toBe(createFilesContext(orderB, true));
  });

  it('emits the files in sorted path order', () => {
    const files: FileMap = {
      '/home/project/z.ts': file('z'),
      '/home/project/a.ts': file('a'),
      '/home/project/m.ts': file('m'),
    };

    const output = createFilesContext(files, true);
    expect(output.indexOf('filePath="a.ts"')).toBeLessThan(output.indexOf('filePath="m.ts"'));
    expect(output.indexOf('filePath="m.ts"')).toBeLessThan(output.indexOf('filePath="z.ts"'));
  });
});
