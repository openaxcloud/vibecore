import { describe, expect, it } from 'vitest';
import { computeFileDiffStats } from './file-tree-diff-stats';
import type { FileHistory } from '~/types/actions';

function makeHistory(originalContent: string, currentContent: string): FileHistory {
  return {
    originalContent,
    lastModified: 0,
    changes: [],
    versions: [{ timestamp: 0, content: currentContent }],
  };
}

describe('computeFileDiffStats', () => {
  it('returns zeroes when there are no modifications', () => {
    expect(computeFileDiffStats(undefined)).toEqual({ additions: 0, deletions: 0 });
    expect(computeFileDiffStats(makeHistory('', ''))).toEqual({ additions: 0, deletions: 0 });
  });

  it('returns zeroes when content is unchanged', () => {
    const history = makeHistory('a\nb\nc\n', 'a\nb\nc\n');
    expect(computeFileDiffStats(history)).toEqual({ additions: 0, deletions: 0 });
  });

  it('counts a single added line without the phantom trailing-newline line', () => {
    // Original 3 lines, current 4 lines: exactly one line added.
    const history = makeHistory('line1\nline2\nline3\n', 'line1\nline2\nnewline\nline3\n');
    const stats = computeFileDiffStats(history);

    /*
     * The buggy split('\n').length over a jsdiff chunk ending in '\n' would
     * have reported 2 additions for this single added line.
     */
    expect(stats.additions).toBe(1);
    expect(stats.deletions).toBe(0);
  });

  it('counts a single removed line without over-counting', () => {
    const history = makeHistory('line1\nline2\nline3\n', 'line1\nline3\n');
    const stats = computeFileDiffStats(history);

    expect(stats.additions).toBe(0);
    expect(stats.deletions).toBe(1);
  });

  it('counts multiple added lines accurately', () => {
    const history = makeHistory('a\nb\n', 'a\nx\ny\nz\nb\n');
    const stats = computeFileDiffStats(history);

    expect(stats.additions).toBe(3);
    expect(stats.deletions).toBe(0);
  });

  it('counts a modified line as one deletion and one addition', () => {
    const history = makeHistory('a\nb\nc\n', 'a\nB\nc\n');
    const stats = computeFileDiffStats(history);

    expect(stats.additions).toBe(1);
    expect(stats.deletions).toBe(1);
  });

  it('normalizes CRLF line endings before diffing', () => {
    const history = makeHistory('a\r\nb\r\n', 'a\nb\n');
    expect(computeFileDiffStats(history)).toEqual({ additions: 0, deletions: 0 });
  });
});
