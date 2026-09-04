import { diffLines } from 'diff';

export type FileHistoryDiffKind = 'context' | 'added' | 'removed';

export interface FileHistoryDiffRow {
  key: string;
  kind: FileHistoryDiffKind;
  oldLine?: number;
  newLine?: number;
  text: string;
}

export interface FileHistoryInlineDiff {
  rows: FileHistoryDiffRow[];
  totalRows: number;
  truncated: boolean;
  additions: number;
  removals: number;
}

const DEFAULT_MAX_ROWS = 5_000;

export function buildFileHistoryInlineDiff(
  selectedContent: string,
  latestContent: string,
  maxRows = DEFAULT_MAX_ROWS,
): FileHistoryInlineDiff {
  const rows: FileHistoryDiffRow[] = [];

  let oldLine = 1;
  let newLine = 1;
  let additions = 0;
  let removals = 0;
  let totalRows = 0;

  for (const change of diffLines(selectedContent, latestContent)) {
    const lines = splitChangeLines(change.value);
    const kind: FileHistoryDiffKind = change.added ? 'added' : change.removed ? 'removed' : 'context';

    for (const text of lines) {
      const row: FileHistoryDiffRow = {
        key: `${totalRows}-${kind}`,
        kind,
        oldLine: kind === 'added' ? undefined : oldLine,
        newLine: kind === 'removed' ? undefined : newLine,
        text,
      };

      if (rows.length < maxRows) {
        rows.push(row);
      }

      totalRows += 1;

      if (kind !== 'added') {
        oldLine += 1;
      }

      if (kind !== 'removed') {
        newLine += 1;
      }

      if (kind === 'added') {
        additions += 1;
      } else if (kind === 'removed') {
        removals += 1;
      }
    }
  }

  return {
    rows,
    totalRows,
    truncated: totalRows > rows.length,
    additions,
    removals,
  };
}

export function orderFileHistoryVersionsChronologically<T extends { id: string; sequence: string }>(
  versions: readonly T[],
): T[] {
  const byId = new Map(versions.map((version) => [version.id, version]));

  return [...byId.values()].sort((left, right) => {
    const leftSequence = BigInt(left.sequence);
    const rightSequence = BigInt(right.sequence);

    return leftSequence < rightSequence ? -1 : leftSequence > rightSequence ? 1 : left.id.localeCompare(right.id);
  });
}

export function fileHistoryPlaybackDelay(speed: 0.5 | 1 | 2): number {
  return Math.round(900 / speed);
}

function splitChangeLines(value: string): string[] {
  if (!value) {
    return [];
  }

  const lines = value.split('\n');

  if (value.endsWith('\n')) {
    lines.pop();
  }

  return lines;
}
