import { describe, expect, it } from 'vitest';
import { decodeClonedFiles, type ClonedFileBlob } from './decode-cloned-files';

describe('decodeClonedFiles', () => {
  it('keeps genuinely empty text files (empty __init__.py, .gitkeep)', () => {
    const data: Record<string, ClonedFileBlob> = {
      'src/__init__.py': { data: '', encoding: 'utf8' },
      'static/.gitkeep': { data: new Uint8Array([]), encoding: undefined },
      'src/main.py': { data: 'print("hi")', encoding: 'utf8' },
    };

    const result = decodeClonedFiles(Object.keys(data), data);

    expect(result).toEqual([
      { path: 'src/__init__.py', content: '' },
      { path: 'static/.gitkeep', content: '' },
      { path: 'src/main.py', content: 'print("hi")' },
    ]);
  });

  it('decodes Uint8Array blobs as UTF-8', () => {
    const bytes = new TextEncoder().encode('hello world');

    const data: Record<string, ClonedFileBlob> = {
      'README.md': { data: bytes, encoding: undefined },
    };

    const result = decodeClonedFiles(['README.md'], data);

    expect(result).toEqual([{ path: 'README.md', content: 'hello world' }]);
  });

  it('keeps non-empty utf8 string content as-is', () => {
    const data: Record<string, ClonedFileBlob> = {
      'index.ts': { data: 'export const x = 1;', encoding: 'utf8' },
    };

    expect(decodeClonedFiles(['index.ts'], data)).toEqual([{ path: 'index.ts', content: 'export const x = 1;' }]);
  });

  it('drops only entries with no decodable text (binary / missing blobs)', () => {
    const data: Record<string, ClonedFileBlob> = {
      'logo.png': { data: { some: 'object' }, encoding: undefined },
      'app.ts': { data: 'ok', encoding: 'utf8' },
    };

    const result = decodeClonedFiles(['logo.png', 'app.ts', 'ghost.txt'], data);

    /*
     * logo.png (undecodable object) and ghost.txt (missing) are dropped;
     * app.ts survives.
     */
    expect(result).toEqual([{ path: 'app.ts', content: 'ok' }]);
  });

  it('keeps source files with uncommon extensions and drops content-detected binary', () => {
    const data: Record<string, ClonedFileBlob> = {
      // Uncommon-but-text extensions the old extension allowlist wrongly dropped.
      'main.py': { data: new TextEncoder().encode('print("hi")'), encoding: undefined },
      'db/schema.sql': { data: new TextEncoder().encode('select 1;'), encoding: undefined },

      // Real binary: contains a NUL byte, so it is skipped by content sniff.
      'logo.png': { data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a]), encoding: undefined },
    };

    const result = decodeClonedFiles(['main.py', 'db/schema.sql', 'logo.png'], data);

    expect(result).toEqual([
      { path: 'main.py', content: 'print("hi")' },
      { path: 'db/schema.sql', content: 'select 1;' },
    ]);
  });

  it('does not drop a file whose decoded content is falsy but is a real string', () => {
    const data: Record<string, ClonedFileBlob> = {
      'empty.txt': { data: '', encoding: 'utf8' },
      'zero.txt': { data: new TextEncoder().encode('0'), encoding: undefined },
    };

    const result = decodeClonedFiles(['empty.txt', 'zero.txt'], data);

    expect(result).toEqual([
      { path: 'empty.txt', content: '' },
      { path: 'zero.txt', content: '0' },
    ]);
  });
});
