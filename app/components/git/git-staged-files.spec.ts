import { describe, expect, it } from 'vitest';
import { findUnserializableStagedFiles, pathBreaksCommaSerialization, serializeStagedFiles } from './git-staged-files';

describe('pathBreaksCommaSerialization', () => {
  it('flags paths containing a comma', () => {
    expect(pathBreaksCommaSerialization('a,b.txt')).toBe(true);
    expect(pathBreaksCommaSerialization('src/weird, name.ts')).toBe(true);
  });

  it('accepts ordinary paths', () => {
    expect(pathBreaksCommaSerialization('src/index.ts')).toBe(false);
    expect(pathBreaksCommaSerialization('a b.txt')).toBe(false);
  });
});

describe('findUnserializableStagedFiles', () => {
  it('returns only the comma-bearing paths', () => {
    expect(findUnserializableStagedFiles(['ok.ts', 'a,b.txt', 'dir/c,d.ts'])).toEqual(['a,b.txt', 'dir/c,d.ts']);
  });

  it('returns an empty list when every path is safe', () => {
    expect(findUnserializableStagedFiles(['a.ts', 'b.ts'])).toEqual([]);
  });
});

describe('serializeStagedFiles', () => {
  it('round-trips comma-free paths through the action route split(",") parser', () => {
    const paths = ['a.ts', 'src/b.ts', 'dir/c.ts'];
    const { value, unserializable } = serializeStagedFiles(paths);

    expect(unserializable).toEqual([]);
    expect(value.split(',')).toEqual(paths);
  });

  it('surfaces comma-bearing paths instead of silently corrupting them', () => {
    const { value, unserializable } = serializeStagedFiles(['a,b.txt']);

    /*
     * The naive comma-join would mis-split into two bogus paths; callers must
     * use `unserializable` to block the commit rather than trust `value`.
     */
    expect(value.split(',')).toEqual(['a', 'b.txt']);
    expect(unserializable).toEqual(['a,b.txt']);
  });
});
