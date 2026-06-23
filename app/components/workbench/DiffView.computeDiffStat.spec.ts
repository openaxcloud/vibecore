import { diffLines } from 'diff';
import { describe, expect, it } from 'vitest';
import { computeDiffStat, processChanges } from './DiffView';

describe('computeDiffStat', () => {
  it('reports +1/-1 for a single-line edit (no trailing-newline over-count)', () => {
    const before = 'line one\nline two\nline three\n';
    const after = 'line one\nCHANGED\nline three\n';

    const stat = computeDiffStat(diffLines(before, after));

    expect(stat).toEqual({ additions: 1, deletions: 1 });
  });

  it('counts multi-line additions and deletions correctly', () => {
    const before = 'a\nb\nc\n';
    const after = 'a\nX\nY\nZ\n';

    const stat = computeDiffStat(diffLines(before, after));

    // 'b\nc' removed (2 lines), 'X\nY\nZ' added (3 lines)
    expect(stat).toEqual({ additions: 3, deletions: 2 });
  });

  it('returns zero when there are no changes', () => {
    const code = 'same\ncontent\n';

    expect(computeDiffStat(diffLines(code, code))).toEqual({ additions: 0, deletions: 0 });
  });

  it('counts a pure addition with no deletions', () => {
    const before = 'a\nb\n';
    const after = 'a\nb\nc\nd\n';

    expect(computeDiffStat(diffLines(before, after))).toEqual({ additions: 2, deletions: 0 });
  });

  it('falls back to a trailing-newline-stripped split when count is absent', () => {
    // Synthetic chunk without `count`, value ending in a newline.
    const changes = [
      { added: true, removed: false, value: 'one\ntwo\n' },
      { added: false, removed: true, value: 'old\n' },
    ];

    expect(computeDiffStat(changes as any)).toEqual({ additions: 2, deletions: 1 });
  });
});

describe('badge stats agree with the rendered diff (processChanges)', () => {
  /*
   * The FileInfo badge derives +N/-N from processChanges' lineChanges sizes so
   * the counts can never disagree with the highlighted lines in the body.
   */
  const badgeStat = (before: string, after: string) => {
    const { lineChanges } = processChanges(before, after);
    return { additions: lineChanges.after.size, deletions: lineChanges.before.size };
  };

  it('reports non-zero counts for a leading-whitespace-only change (matches highlighted body)', () => {
    const before = 'function f() {\nreturn 1;\n}\n';
    const after = 'function f() {\n    return 1;\n}\n'; // only indentation added

    const { hasChanges } = processChanges(before, after);
    const stat = badgeStat(before, after);

    // The body renders the change as Modified...
    expect(hasChanges).toBe(true);

    // ...and the badge must show a count rather than +0/-0.
    expect(stat.additions + stat.deletions).toBeGreaterThan(0);
    expect(stat).toEqual({ additions: 1, deletions: 1 });

    /*
     * A whitespace-insensitive diff (the old buggy source) would report nothing,
     * which is exactly the disagreement we are guarding against.
     */
    expect(computeDiffStat(diffLines(before, after, { ignoreWhitespace: true }))).toEqual({
      additions: 0,
      deletions: 0,
    });
  });

  it('reports zero counts when only trailing whitespace differs (no body change)', () => {
    const before = 'a\nb\n';
    const after = 'a   \nb\t\n'; // trimEnd() normalizes these away

    const { hasChanges } = processChanges(before, after);

    expect(hasChanges).toBe(false);
    expect(badgeStat(before, after)).toEqual({ additions: 0, deletions: 0 });
  });

  it('agrees with the body for an ordinary single-line edit', () => {
    const before = 'line one\nline two\nline three\n';
    const after = 'line one\nCHANGED\nline three\n';

    expect(badgeStat(before, after)).toEqual({ additions: 1, deletions: 1 });
  });
});
