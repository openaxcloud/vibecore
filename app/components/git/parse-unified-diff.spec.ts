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

  it('classifies the second file header as meta in a multi-file diff (gutters reset)', () => {
    const diff = [
      'diff --git a/fileA.txt b/fileA.txt',
      'index 1111111..2222222 100644',
      '--- a/fileA.txt',
      '+++ b/fileA.txt',
      '@@ -1,1 +1,1 @@',
      '-old A',
      '+new A',
      'diff --git a/fileB.txt b/fileB.txt',
      'index 3333333..4444444 100644',
      '--- a/fileB.txt',
      '+++ b/fileB.txt',
      '@@ -1,1 +1,1 @@',
      '-old B',
      '+new B',
    ].join('\n');

    const rows = parseUnifiedDiff(diff);

    /*
     * fileB's header block (diff/---/+++ that name fileB.txt) must be meta,
     * not add/remove/context.
     */
    const fileBHeader = rows.filter((r) => r.text.includes('fileB.txt'));
    expect(fileBHeader).toHaveLength(3);
    expect(fileBHeader.every((r) => r.type === 'meta')).toBe(true);

    // The `index ...` line of fileB must not be misclassified as context.
    const fileBIndex = rows.find((r) => r.text === 'index 3333333..4444444 100644');
    expect(fileBIndex?.type).toBe('meta');

    // fileB's own hunk resets the gutters to 1/1, so its rows are numbered fresh.
    const removes = rows.filter((r) => r.type === 'remove');
    const adds = rows.filter((r) => r.type === 'add');
    expect(removes.map((r) => [r.text, r.oldNo])).toEqual([
      ['old A', 1],
      ['old B', 1],
    ]);
    expect(adds.map((r) => [r.text, r.newNo])).toEqual([
      ['new A', 1],
      ['new B', 1],
    ]);
  });

  it('handles a new-file mode header in a subsequent file as meta', () => {
    const diff = [
      'diff --git a/a.txt b/a.txt',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,1 +1,1 @@',
      '-x',
      '+y',
      'diff --git a/new.txt b/new.txt',
      'new file mode 100644',
      'index 0000000..5555555',
      '--- /dev/null',
      '+++ b/new.txt',
      '@@ -0,0 +1,1 @@',
      '+hello',
    ].join('\n');

    const rows = parseUnifiedDiff(diff);

    expect(rows.find((r) => r.text === 'new file mode 100644')?.type).toBe('meta');
    expect(rows.find((r) => r.text === 'diff --git a/new.txt b/new.txt')?.type).toBe('meta');
    expect(rows.find((r) => r.text === '--- /dev/null')?.type).toBe('meta');

    // Only the real content lines are add/remove.
    expect(rows.filter((r) => r.type === 'add').map((r) => r.text)).toEqual(['y', 'hello']);
    expect(rows.filter((r) => r.type === 'remove').map((r) => r.text)).toEqual(['x']);
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
