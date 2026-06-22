import { diffLines } from 'diff';
import { describe, expect, it } from 'vitest';
import { computeDiffStat } from './DiffView';

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
