import { useMemo, useState } from 'react';
import { classNames } from '~/utils/classNames';

type BlameLine = { sha: string; line: number; author?: string; content?: string };

/*
 * Rich unified-diff renderer for the Git panel — replaces the raw <pre> dump with
 * a Replit-style line-numbered, add/remove-coloured view. Parses the `git diff`
 * unified output once (memoized) into rows with old/new line gutters; hunk headers
 * (@@) and file-meta lines (diff/index/---/+++/rename/…) get their own styling.
 * Frontend-only: the diff text already arrives from /projects/:id/git/diff.
 */
type DiffRowType = 'hunk' | 'add' | 'remove' | 'context' | 'meta';

interface DiffRow {
  type: DiffRowType;
  oldNo?: number;
  newNo?: number;
  text: string;
}

const META_PREFIXES = [
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
  '\\',
];

function parseUnifiedDiff(diff: string): DiffRow[] {
  const rows: DiffRow[] = [];

  let oldNo = 0;
  let newNo = 0;

  for (const raw of diff.split('\n')) {
    if (raw.startsWith('@@')) {
      const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);

      if (match) {
        oldNo = Number(match[1]);
        newNo = Number(match[2]);
      }

      rows.push({ type: 'hunk', text: raw });
      continue;
    }

    if (META_PREFIXES.some((prefix) => raw.startsWith(prefix))) {
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

export function GitDiffView({ diff, blame, className }: { diff: string; blame?: BlameLine[]; className?: string }) {
  const rows = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const hasBlame = Boolean(blame && blame.length);
  const [view, setView] = useState<'diff' | 'blame'>('diff');

  /*
   * Blame is folded into this view as a toggle (was a separate "Blame and diff"
   * box). Fall back to blame if there's no diff to show.
   */
  const showBlame = hasBlame && (view === 'blame' || !diff.trim());

  if (!diff.trim() && !hasBlame) {
    return null;
  }

  return (
    <div className={className} data-testid="git-diff-view">
      {hasBlame ? (
        <div className="mb-2 inline-flex overflow-hidden rounded-md border border-bolt-elements-borderColor text-xs">
          {(['diff', 'blame'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              data-testid={`git-diffview-${mode}`}
              onClick={() => setView(mode)}
              disabled={mode === 'diff' && !diff.trim()}
              className={classNames(
                'px-3 py-1 font-medium capitalize disabled:opacity-40',
                (mode === 'blame') === showBlame
                  ? 'bg-bolt-elements-item-contentAccent text-white'
                  : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3',
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      ) : null}

      {showBlame ? (
        <div className="max-h-72 overflow-auto rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 font-mono text-xs leading-relaxed">
          {blame!.map((line) => (
            <div key={line.line} className="grid grid-cols-[40px_72px_minmax(0,1fr)] gap-2 px-3 py-0.5">
              <span className="select-none text-right text-[11px] text-bolt-elements-textTertiary opacity-60">
                {line.line}
              </span>
              <span
                className="truncate text-[11px] text-bolt-elements-item-contentAccent"
                title={`${line.sha}${line.author ? ` · ${line.author}` : ''}`}
              >
                {line.sha.slice(0, 7)}
              </span>
              <span className="whitespace-pre-wrap break-words text-bolt-elements-textPrimary">
                {line.content || ' '}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div
          className={classNames(
            'max-h-72 overflow-auto rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 font-mono text-xs leading-relaxed',
          )}
        >
          {rows.map((row, index) => {
            if (row.type === 'meta') {
              return (
                <div key={index} className="px-3 py-0.5 text-[11px] text-bolt-elements-textTertiary opacity-70">
                  {row.text || ' '}
                </div>
              );
            }

            if (row.type === 'hunk') {
              return (
                <div
                  key={index}
                  className="bg-bolt-elements-background-depth-2 px-3 py-0.5 font-semibold text-bolt-elements-item-contentAccent"
                >
                  {row.text}
                </div>
              );
            }

            const added = row.type === 'add';
            const removed = row.type === 'remove';

            return (
              <div
                key={index}
                className={classNames(
                  'grid grid-cols-[40px_40px_14px_minmax(0,1fr)]',
                  added ? 'bg-green-500/10' : removed ? 'bg-red-500/10' : undefined,
                )}
              >
                <span className="select-none px-1 text-right text-[11px] text-bolt-elements-textTertiary opacity-60">
                  {removed || row.type === 'context' ? row.oldNo : ''}
                </span>
                <span className="select-none px-1 text-right text-[11px] text-bolt-elements-textTertiary opacity-60">
                  {added || row.type === 'context' ? row.newNo : ''}
                </span>
                <span
                  className={classNames(
                    'select-none text-center',
                    added ? 'text-green-500' : removed ? 'text-red-500' : 'text-bolt-elements-textTertiary',
                  )}
                >
                  {added ? '+' : removed ? '-' : ''}
                </span>
                <span
                  className={classNames(
                    'whitespace-pre-wrap break-words pr-3',
                    added
                      ? 'text-green-600 dark:text-green-300'
                      : removed
                        ? 'text-red-600 dark:text-red-300'
                        : 'text-bolt-elements-textPrimary',
                  )}
                >
                  {row.text || ' '}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
