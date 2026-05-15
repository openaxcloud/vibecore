import { describe, expect, it } from 'vitest';
import { WORK_DIR } from './constants';
import {
  aggregateReviewableDiffSummaries,
  applyReviewableDiffHunks,
  buildReviewableDiffHunks,
  extractRelativePath,
  summarizeReviewableDiffHunks,
} from './diff';

describe('Diff', () => {
  it('should strip out Work_dir', () => {
    const filePath = `${WORK_DIR}/index.js`;
    const result = extractRelativePath(filePath);
    expect(result).toBe('index.js');
  });

  it('builds reviewable hunks and applies selected hunks only', () => {
    const original = [
      'export function App() {',
      '  return <h1>Old</h1>;',
      '}',
      '',
      'export const version = 1;',
      '',
    ].join('\n');
    const proposed = [
      'export function App() {',
      '  return <h1>New</h1>;',
      '}',
      '',
      'export const version = 2;',
      '',
    ].join('\n');

    const hunks = buildReviewableDiffHunks('src/App.tsx', original, proposed);

    expect(hunks).toHaveLength(1);
    expect(hunks[0].lines.some((line) => line.type === 'add' && line.content.includes('New'))).toBe(true);

    expect(applyReviewableDiffHunks({ originalContent: original, hunks, acceptedHunkIds: [] })).toBe(original);
    expect(applyReviewableDiffHunks({ originalContent: original, hunks, acceptedHunkIds: [hunks[0].id] })).toBe(
      proposed,
    );
  });

  it('summarizes a reviewable diff into added/removed line counts and hunk count', () => {
    const original = ['line a', 'line b', 'line c', ''].join('\n');
    const proposed = ['line a', 'line b prime', 'line c', 'line d', ''].join('\n');

    const hunks = buildReviewableDiffHunks('src/sum.ts', original, proposed);
    const summary = summarizeReviewableDiffHunks(hunks);

    expect(summary.hunkCount).toBe(hunks.length);
    expect(summary.addedLines).toBe(2);
    expect(summary.removedLines).toBe(1);
    expect(summary.hasChanges).toBe(true);
  });

  it('reports a no-op summary when proposed content matches original', () => {
    const text = ['identical', 'content', ''].join('\n');
    const hunks = buildReviewableDiffHunks('src/noop.ts', text, text);

    const summary = summarizeReviewableDiffHunks(hunks);
    expect(summary.hunkCount).toBe(0);
    expect(summary.addedLines).toBe(0);
    expect(summary.removedLines).toBe(0);
    expect(summary.hasChanges).toBe(false);
  });

  it('aggregates per-file diff summaries for a multi-file patch', () => {
    const a = summarizeReviewableDiffHunks(buildReviewableDiffHunks('a.ts', 'one\n', 'one\ntwo\n'));
    const b = summarizeReviewableDiffHunks(buildReviewableDiffHunks('b.ts', 'x\ny\n', 'x\nyy\n'));
    const noop = summarizeReviewableDiffHunks(buildReviewableDiffHunks('c.ts', 'same\n', 'same\n'));

    const totals = aggregateReviewableDiffSummaries([a, b, noop]);
    expect(totals.filesWithChanges).toBe(2);
    expect(totals.addedLines).toBe(a.addedLines + b.addedLines);
    expect(totals.removedLines).toBe(a.removedLines + b.removedLines);
    expect(totals.hunkCount).toBe(a.hunkCount + b.hunkCount);
  });

  it('can reject one hunk while accepting another', () => {
    const original = [
      'const a = 1;',
      'const keep1 = true;',
      'const keep2 = true;',
      'const keep3 = true;',
      'const keep4 = true;',
      'const keep5 = true;',
      'const keep6 = true;',
      'const keep7 = true;',
      'const keep8 = true;',
      'const b = 1;',
      '',
    ].join('\n');
    const proposed = [
      'const a = 2;',
      'const keep1 = true;',
      'const keep2 = true;',
      'const keep3 = true;',
      'const keep4 = true;',
      'const keep5 = true;',
      'const keep6 = true;',
      'const keep7 = true;',
      'const keep8 = true;',
      'const b = 2;',
      '',
    ].join('\n');

    const hunks = buildReviewableDiffHunks('src/two-hunks.ts', original, proposed);

    expect(hunks.length).toBeGreaterThanOrEqual(1);

    const result = applyReviewableDiffHunks({
      originalContent: original,
      hunks,
      acceptedHunkIds: [hunks[0].id],
    });

    expect(result).toContain('const a = 2;');
    expect(result).toContain('const b = 1;');
  });
});
