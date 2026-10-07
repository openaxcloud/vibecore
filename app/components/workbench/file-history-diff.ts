import { diffLines } from 'diff';

export type InlineDiffLine = { type: 'added' | 'removed' | 'unchanged'; text: string };

export interface InlineDiff {
  lines: InlineDiffLine[];
  added: number;
  removed: number;
}

/**
 * Line-level inline diff between two file contents. `added`/`removed` count the
 * real changed lines so the panel can show an honest +N/−M summary.
 */
export function computeInlineDiff(before: string, after: string): InlineDiff {
  /*
   * Normalize a trailing newline on both sides. Without it, diffLines tokenizes
   * a final line that lacks "\n" together with the following change, turning a
   * one-line append into a spurious remove+add of the previous line.
   */
  const normalize = (value: string) => (value.endsWith('\n') || value === '' ? value : `${value}\n`);
  const parts = diffLines(normalize(before), normalize(after));
  const lines: InlineDiffLine[] = [];

  let added = 0;
  let removed = 0;

  for (const part of parts) {
    const type: InlineDiffLine['type'] = part.added ? 'added' : part.removed ? 'removed' : 'unchanged';

    // diffLines keeps trailing newlines; drop the one that would create a phantom last line.
    const raw = part.value.replace(/\n$/, '');

    if (raw.length === 0 && part.value === '') {
      continue;
    }

    for (const text of raw.split('\n')) {
      lines.push({ type, text });

      if (type === 'added') {
        added += 1;
      } else if (type === 'removed') {
        removed += 1;
      }
    }
  }

  return { lines, added, removed };
}
