import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff } from './parse-unified-diff';

describe('parseUnifiedDiff', () => {
  it('classifies file-header meta lines before the first hunk', () => {
    const diff = [
      'diff --git a/foo.txt b/foo.txt',
      'index 1111111..2222222 100644',
      '--- a/foo.txt',
      '+++ b/foo.txt',
      '@@ -1,1 +1,1 @@',
      '-old',
      '+new',
    ].join('\n');

    const rows = parseUnifiedDiff(diff);

    expect(rows.slice(0, 4).map((r) => r.type)).toEqual(['meta', 'meta', 'meta', 'meta']);
    expect(rows[4].type).toBe('hunk');
  });

  it('does NOT misclassify in-hunk removed lines whose content starts with "-- "', () => {
    // A removed source line `-- comment` is rendered as `--- comment` in the diff.
    const diff = ['@@ -10,2 +10,1 @@', '--- a sql comment', ' kept line'].join('\n');

    const rows = parseUnifiedDiff(diff);

    const removed = rows.find((r) => r.type === 'remove');
    expect(removed).toBeDefined();
    expect(removed!.text).toBe('-- a sql comment');
    expect(removed!.oldNo).toBe(10);
  });

  it('does NOT misclassify in-hunk added lines whose content starts with "++ "', () => {
    // An added source line `++ banner` is rendered as `+++ banner` in the diff.
    const diff = ['@@ -1,0 +1,1 @@', '+++ banner comment'].join('\n');

    const rows = parseUnifiedDiff(diff);

    const added = rows.find((r) => r.type === 'add');
    expect(added).toBeDefined();
    expect(added!.text).toBe('++ banner comment');
    expect(added!.newNo).toBe(1);
  });

  it('keeps gutters aligned after a "--- "-prefixed changed line', () => {
    const diff = ['@@ -5,3 +5,3 @@', ' context a', '--- removed dashes', '+++ added dashes', ' context b'].join('\n');

    const rows = parseUnifiedDiff(diff).filter((r) => r.type !== 'hunk');

    // context a (old 5/new 5), remove (old 6), add (new 6), context b (old 7/new 7)
    expect(rows.map((r) => [r.type, r.oldNo, r.newNo])).toEqual([
      ['context', 5, 5],
      ['remove', 6, undefined],
      ['add', undefined, 6],
      ['context', 7, 7],
    ]);
  });

  it('still treats the "\\ No newline at end of file" marker as meta inside a hunk', () => {
    const diff = ['@@ -1,1 +1,1 @@', '-old', '\\ No newline at end of file', '+new'].join('\n');

    const rows = parseUnifiedDiff(diff);

    const marker = rows.find((r) => r.text.startsWith('\\'));
    expect(marker?.type).toBe('meta');
    expect(rows.filter((r) => r.type === 'remove')).toHaveLength(1);
    expect(rows.filter((r) => r.type === 'add')).toHaveLength(1);
  });
});
