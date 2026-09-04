import { describe, expect, it } from 'vitest';
import { buildFileHistoryInlineDiff, fileHistoryPlaybackDelay, orderFileHistoryVersionsChronologically } from './diff';

describe('buildFileHistoryInlineDiff', () => {
  it('produces unified line numbers and non-color-only change markers', () => {
    const result = buildFileHistoryInlineDiff('alpha\nbeta\n', 'alpha\ngamma\n');

    expect(result).toMatchObject({ additions: 1, removals: 1, truncated: false });
    expect(result.rows).toEqual([
      expect.objectContaining({ kind: 'context', oldLine: 1, newLine: 1, text: 'alpha' }),
      expect.objectContaining({ kind: 'removed', oldLine: 2, newLine: undefined, text: 'beta' }),
      expect.objectContaining({ kind: 'added', oldLine: undefined, newLine: 2, text: 'gamma' }),
    ]);
  });

  it('caps rendered rows while retaining accurate totals and stats', () => {
    const result = buildFileHistoryInlineDiff('one\ntwo\nthree\n', 'four\nfive\nsix\n', 2);

    expect(result.rows).toHaveLength(2);
    expect(result.truncated).toBe(true);
    expect(result.totalRows).toBe(6);
    expect(result.additions).toBe(3);
    expect(result.removals).toBe(3);
  });
});

describe('File History timeline helpers', () => {
  it('deduplicates and orders newest-first API pages into chronological playback order', () => {
    const ordered = orderFileHistoryVersionsChronologically([
      { id: 'new', sequence: '900719925474099312345' },
      { id: 'old', sequence: '7' },
      { id: 'new', sequence: '900719925474099312345' },
      { id: 'middle', sequence: '42' },
    ]);

    expect(ordered.map((version) => version.id)).toEqual(['old', 'middle', 'new']);
  });

  it('uses the durable sequence even when timestamps would tie or move backwards', () => {
    const ordered = orderFileHistoryVersionsChronologically([
      { id: 'second', sequence: '11', createdAt: '2026-07-15T09:00:00.000Z' },
      { id: 'first', sequence: '10', createdAt: '2026-07-15T12:00:00.000Z' },
    ]);

    expect(ordered.map((version) => version.id)).toEqual(['first', 'second']);
  });

  it('maps playback speed to predictable frame delays', () => {
    expect(fileHistoryPlaybackDelay(0.5)).toBe(1800);
    expect(fileHistoryPlaybackDelay(1)).toBe(900);
    expect(fileHistoryPlaybackDelay(2)).toBe(450);
  });
});
