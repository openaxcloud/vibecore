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

  it('does not inject the "No newline at end of file" sentinel into accepted content', () => {
    /*
     * No trailing newline on either side — `structuredPatch` emits a
     * `\ No newline at end of file` sentinel line that must not be written
     * back into the file when the hunk is accepted.
     */
    const original = 'const x = 1\nconst y = 2';
    const proposed = 'const x = 1\nconst y = 3';

    const hunks = buildReviewableDiffHunks('src/no-newline.ts', original, proposed);

    // The sentinel must never surface as a reviewable line of any type.
    for (const hunk of hunks) {
      for (const line of hunk.lines) {
        expect(line.content).not.toContain('No newline at end of file');
      }
    }

    const accepted = applyReviewableDiffHunks({
      originalContent: original,
      hunks,
      acceptedHunkIds: hunks.map((hunk) => hunk.id),
    });

    expect(accepted).toBe(proposed);
    expect(accepted).not.toContain('No newline at end of file');
  });

  it('preserves the proposed trailing newline when the file end is part of an accepted hunk', () => {
    // New-file accept: original is empty, the agent's content has a trailing newline.
    const original = '';
    const proposed = 'const greeting = "hi";\n';

    const hunks = buildReviewableDiffHunks('src/new-file.ts', original, proposed);

    const accepted = applyReviewableDiffHunks({
      originalContent: original,
      hunks,
      acceptedHunkIds: hunks.map((hunk) => hunk.id),
      proposedContent: proposed,
    });

    // Without proposedContent the trailing newline would be dropped (original is '').
    expect(accepted).toBe(proposed);
    expect(accepted.endsWith('\n')).toBe(true);
  });

  it('adopts a newly-added trailing newline at EOF when the proposal is accepted', () => {
    // Original has NO trailing newline; the proposal adds one to the final line.
    const original = 'const a = 1\nconst b = 2';
    const proposed = 'const a = 1\nconst b = 2\n';

    const hunks = buildReviewableDiffHunks('src/add-eof-newline.ts', original, proposed);

    const accepted = applyReviewableDiffHunks({
      originalContent: original,
      hunks,
      acceptedHunkIds: hunks.map((hunk) => hunk.id),
      proposedContent: proposed,
    });

    expect(accepted).toBe(proposed);
    expect(accepted.endsWith('\n')).toBe(true);
  });

  it('drops a removed trailing newline at EOF when the proposal is accepted', () => {
    // Original HAS a trailing newline; the proposal removes it.
    const original = 'const a = 1\nconst b = 2\n';
    const proposed = 'const a = 1\nconst b = 2';

    const hunks = buildReviewableDiffHunks('src/remove-eof-newline.ts', original, proposed);

    const accepted = applyReviewableDiffHunks({
      originalContent: original,
      hunks,
      acceptedHunkIds: hunks.map((hunk) => hunk.id),
      proposedContent: proposed,
    });

    expect(accepted).toBe(proposed);
    expect(accepted.endsWith('\n')).toBe(false);
  });

  it('keeps the original trailing newline when only a non-final hunk is accepted', () => {
    // Two independent changes; accepting only the first must not touch the EOF newline.
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

      // remove the trailing newline at EOF in the (rejected) second hunk
      'const b = 2;',
    ].join('\n');

    const hunks = buildReviewableDiffHunks('src/partial-eof.ts', original, proposed);
    expect(hunks.length).toBeGreaterThanOrEqual(2);

    const result = applyReviewableDiffHunks({
      originalContent: original,
      hunks,
      acceptedHunkIds: [hunks[0].id],
      proposedContent: proposed,
    });

    // First hunk applied, EOF untouched → original trailing newline retained.
    expect(result).toContain('const a = 2;');
    expect(result).toContain('const b = 1;');
    expect(result.endsWith('\n')).toBe(true);
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
