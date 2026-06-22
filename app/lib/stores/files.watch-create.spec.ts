import { describe, expect, it } from 'vitest';
import { resolveContentlessCreate } from './files.watch-create';

describe('resolveContentlessCreate', () => {
  it('registers a FOLDER when the read failed (undefined result = path is a directory)', () => {
    expect(resolveContentlessCreate(undefined)).toEqual({ type: 'folder', content: '', isBinary: false });
  });

  it('registers a FILE with the fetched text content when the read succeeds', () => {
    expect(resolveContentlessCreate({ content: 'hello', encoding: 'utf8' })).toEqual({
      type: 'file',
      content: 'hello',
      isBinary: false,
    });
  });

  it('marks the file binary when the read returns base64 encoding', () => {
    expect(resolveContentlessCreate({ content: 'AAAA', encoding: 'base64' })).toEqual({
      type: 'file',
      content: 'AAAA',
      isBinary: true,
    });
  });

  it('defaults to empty content / non-binary when encoding is absent', () => {
    expect(resolveContentlessCreate({ content: '' })).toEqual({ type: 'file', content: '', isBinary: false });
  });
});
