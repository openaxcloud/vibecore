/*
 * Pure unified-diff parser extracted from GitDiffView so it can be unit-tested
 * without rendering React. Turns `git diff` output into rows with old/new line
 * gutters; hunk headers (@@) and file-meta lines (diff/index/---/+++/rename/…)
 * get their own row type for styling.
 */
export type DiffRowType = 'hunk' | 'add' | 'remove' | 'context' | 'meta';

export interface DiffRow {
  type: DiffRowType;
  oldNo?: number;
  newNo?: number;
  text: string;
}

/*
 * Header-only meta prefixes. These only appear in the file header that precedes
 * the first @@ hunk, so they are only treated as meta when we are NOT inside a
 * hunk. Once inside a hunk a line beginning with '--- '/'+++ ' is a real removed
 * (`-`) or added (`+`) source line (e.g. a Markdown rule or a banner comment) and
 * must be classified by its leading +/- first.
 */
const HEADER_META_PREFIXES = [
  'diff ',
  'index ',
  '--- ',
  '+++ ',
  'new file',
  'deleted file',
  'old mode',
  'new mode',
  'similarity ',
  'rename ',
  'copy ',
  'Binary files',
];

export function parseUnifiedDiff(diff: string): DiffRow[] {
  const rows: DiffRow[] = [];

  let oldNo = 0;
  let newNo = 0;
  let inHunk = false;

  for (const raw of diff.split('\n')) {
    if (raw.startsWith('@@')) {
      const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);

      if (match) {
        oldNo = Number(match[1]);
        newNo = Number(match[2]);
      }

      inHunk = true;
      rows.push({ type: 'hunk', text: raw });
      continue;
    }

    /*
     * The "\ No newline at end of file" marker is the only meta line that lives
     * *inside* a hunk; it does not advance either gutter. Everywhere else inside
     * a hunk we must fall through to the +/- content checks below.
     */
    if (raw.startsWith('\\')) {
      rows.push({ type: 'meta', text: raw });
      continue;
    }

    /*
     * A `diff ` / `diff --git ` line begins a new file's header block. Reset the
     * in-hunk flag so the HEADER_META_PREFIXES branch re-engages for this file's
     * own header (index/---/+++/rename/…) instead of misclassifying those lines
     * as +/- content or context rows (which would also desync the gutters).
     */
    if (raw.startsWith('diff ')) {
      inHunk = false;
    }

    /*
     * Header lines (diff/index/---/+++/rename/…) only count as meta before the
     * first hunk; once inside a hunk they are real +/- content lines.
     */
    if (!inHunk && HEADER_META_PREFIXES.some((prefix) => raw.startsWith(prefix))) {
      rows.push({ type: 'meta', text: raw });
      continue;
    }

    if (raw.startsWith('+')) {
      rows.push({ type: 'add', newNo, text: raw.slice(1) });
      newNo += 1;
      continue;
    }

    if (raw.startsWith('-')) {
      rows.push({ type: 'remove', oldNo, text: raw.slice(1) });
      oldNo += 1;
      continue;
    }

    // Context line (leading space) or a trailing blank line inside the diff.
    rows.push({ type: 'context', oldNo, newNo, text: raw.startsWith(' ') ? raw.slice(1) : raw });
    oldNo += 1;
    newNo += 1;
  }

  // Drop a single trailing empty context row produced by the final newline.
  if (rows.length && rows[rows.length - 1].type === 'context' && rows[rows.length - 1].text === '') {
    rows.pop();
  }

  return rows;
}
