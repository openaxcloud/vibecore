import { describe, expect, it } from 'vitest';
import { computeReplacement, needsContentHydration, toRuntimeRelativePath } from './search-replace';

describe('computeReplacement', () => {
  it('counts and substitutes every literal match', () => {
    const matcher = /foo/g;
    const { nextContent, count } = computeReplacement('foo bar foo', matcher, 'baz');

    expect(nextContent).toBe('baz bar baz');
    expect(count).toBe(2);
  });

  it('reports zero replacements against empty (lazily-unloaded) content', () => {
    /*
     * Regression guard: in remote mode unopened files sit in the store with
     * content === ''. Replacing against '' must report a truthful count of 0,
     * not a success that overwrites nothing. The component relies on this
     * count being honest to avoid the "Replaced N matches" lie.
     */
    const matcher = /foo/g;
    const { nextContent, count } = computeReplacement('', matcher, 'baz');

    expect(nextContent).toBe('');
    expect(count).toBe(0);
  });

  it('returns identical content and zero count when there is no match', () => {
    const matcher = /missing/g;
    const original = 'unchanged content';
    const { nextContent, count } = computeReplacement(original, matcher, 'x');

    expect(nextContent).toBe(original);
    expect(count).toBe(0);
  });
});

describe('needsContentHydration', () => {
  it('flags empty content as needing a runtime read', () => {
    expect(needsContentHydration('')).toBe(true);
  });

  it('does not flag non-empty content', () => {
    expect(needsContentHydration('const a = 1;')).toBe(false);
  });
});

describe('toRuntimeRelativePath', () => {
  it('strips the default WORK_DIR prefix', () => {
    expect(toRuntimeRelativePath('/home/project/src/a.ts')).toBe('src/a.ts');
  });

  it('strips a custom adapter workdir prefix', () => {
    expect(toRuntimeRelativePath('/workspace/app/index.ts', '/workspace')).toBe('app/index.ts');
  });

  it('falls back to stripping leading slashes for unprefixed paths', () => {
    expect(toRuntimeRelativePath('/loose/path.ts', '/workspace')).toBe('loose/path.ts');
  });
});
