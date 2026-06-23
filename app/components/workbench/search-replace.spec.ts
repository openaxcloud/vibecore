import { describe, expect, it } from 'vitest';
import {
  computeReplacement,
  hasUnsavedEdits,
  isLatestSearch,
  needsContentHydration,
  toRuntimeRelativePath,
} from './search-replace';

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

describe('hasUnsavedEdits', () => {
  it('flags a file present in the dirty set so Replace All skips it', () => {
    /*
     * Regression guard: Replace All writes the on-disk copy back through
     * writeFileContent, which would clobber unsaved editor edits. A file with
     * unsaved changes must be detected so the component skips it instead of
     * silently destroying the user's in-progress work.
     */
    const unsaved = new Set(['/home/project/src/a.ts']);

    expect(hasUnsavedEdits(unsaved, '/home/project/src/a.ts')).toBe(true);
  });

  it('does not flag a file absent from the dirty set', () => {
    const unsaved = new Set(['/home/project/src/a.ts']);

    expect(hasUnsavedEdits(unsaved, '/home/project/src/b.ts')).toBe(false);
  });

  it('does not flag anything when nothing is dirty', () => {
    expect(hasUnsavedEdits(new Set<string>(), '/home/project/src/a.ts')).toBe(false);
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

describe('isLatestSearch', () => {
  it('lets the most recent search stop the spinner', () => {
    expect(isLatestSearch(3, 3)).toBe(true);
  });

  it('blocks a superseded fast search from hiding a newer search spinner', () => {
    /*
     * Regression guard: a fast search (token 1) schedules a trailing min-loader
     * timeout; before it fires, a newer search (token 2) starts and turns the
     * spinner back on. When the stale timeout finally runs it must NOT clear the
     * spinner, or the newer in-flight search flickers off prematurely.
     */
    expect(isLatestSearch(1, 2)).toBe(false);
  });

  it('treats any non-current token as stale (e.g. after unmount-triggered reset)', () => {
    expect(isLatestSearch(5, 6)).toBe(false);
    expect(isLatestSearch(0, 1)).toBe(false);
  });
});
