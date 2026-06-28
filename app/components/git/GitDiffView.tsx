import { useMemo, useState } from 'react';
import { parseUnifiedDiff } from './parse-unified-diff';
import { classNames } from '~/utils/classNames';

type BlameLine = { sha: string; line: number; author?: string; content?: string };

/*
 * Rich unified-diff renderer for the Git panel — replaces the raw <pre> dump with
 * a Replit-style line-numbered, add/remove-coloured view. Parses the `git diff`
 * unified output once (memoized) into rows with old/new line gutters; hunk headers
 * (@@) and file-meta lines (diff/index/---/+++/rename/…) get their own styling.
 * Frontend-only: the diff text already arrives from /projects/:id/git/diff.
 * The parser lives in ./parse-unified-diff so it can be unit-tested directly.
 */

type DiffRow = ReturnType<typeof parseUnifiedDiff>[number];
type SplitRow = { full?: DiffRow; left?: DiffRow; right?: DiffRow };

/*
 * Convert the flat unified rows into side-by-side rows: meta/hunk span both
 * columns; context lines appear on both sides; a run of removes is zipped against
 * the following run of adds (extras become left-only / right-only blanks).
 */
function buildSplitRows(rows: DiffRow[]): SplitRow[] {
  const out: SplitRow[] = [];

  let i = 0;

  while (i < rows.length) {
    const r = rows[i];

    if (r.type === 'meta' || r.type === 'hunk') {
      out.push({ full: r });
      i++;
      continue;
    }

    if (r.type === 'context') {
      out.push({ left: r, right: r });
      i++;
      continue;
    }

    const removes: DiffRow[] = [];
    const adds: DiffRow[] = [];

    while (i < rows.length && rows[i].type === 'remove') {
      removes.push(rows[i]);
      i++;
    }

    while (i < rows.length && rows[i].type === 'add') {
      adds.push(rows[i]);
      i++;
    }

    const pairs = Math.max(removes.length, adds.length);

    for (let j = 0; j < pairs; j++) {
      out.push({ left: removes[j], right: adds[j] });
    }

    if (removes.length === 0 && adds.length === 0) {
      // Defensive: unknown row type — render it full-width and advance.
      out.push({ full: r });
      i++;
    }
  }

  return out;
}

export function GitDiffView({ diff, blame, className }: { diff: string; blame?: BlameLine[]; className?: string }) {
  const rows = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const splitRows = useMemo(() => buildSplitRows(rows), [rows]);
  const hasBlame = Boolean(blame && blame.length);
  const [view, setView] = useState<'unified' | 'split' | 'blame'>('unified');

  /*
   * Blame is folded into this view as a toggle (was a separate "Blame and diff"
   * box). Fall back to blame if there's no diff to show.
   */
  const showBlame = hasBlame && (view === 'blame' || !diff.trim());
  const showSplit = !showBlame && view === 'split';

  if (!diff.trim() && !hasBlame) {
    return null;
  }

  const modes = (['unified', 'split', ...(hasBlame ? (['blame'] as const) : [])] as const).filter(Boolean);

  return (
    <div className={className} data-testid="git-diff-view">
      <div className="mb-2 inline-flex overflow-hidden rounded-md border border-bolt-elements-borderColor text-xs">
        {modes.map((mode) => (
          <button
            key={mode}
            type="button"
            data-testid={`git-diffview-${mode}`}
            onClick={() => setView(mode)}
            disabled={mode !== 'blame' && !diff.trim()}
            className={classNames(
              'px-3 py-1 font-medium capitalize disabled:opacity-40',
              view === mode
                ? 'bg-bolt-elements-item-contentAccent text-white'
                : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3',
            )}
          >
            {mode}
          </button>
        ))}
      </div>

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
      ) : showSplit ? (
        <div className="max-h-72 overflow-auto rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 font-mono text-xs leading-relaxed">
          {splitRows.map((sr, index) => {
            if (sr.full) {
              return (
                <div
                  key={index}
                  className={classNames(
                    'px-3 py-0.5',
                    sr.full.type === 'hunk'
                      ? 'bg-bolt-elements-background-depth-2 font-semibold text-bolt-elements-item-contentAccent'
                      : 'text-[11px] text-bolt-elements-textTertiary opacity-70',
                  )}
                >
                  {sr.full.text || ' '}
                </div>
              );
            }

            return (
              <div key={index} className="grid grid-cols-2 divide-x divide-bolt-elements-borderColor">
                <DiffSide row={sr.left} side="old" />
                <DiffSide row={sr.right} side="new" />
              </div>
            );
          })}
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

/* One side (old/new) of a split-diff row; blank when the row has no counterpart. */
function DiffSide({ row, side }: { row?: DiffRow; side: 'old' | 'new' }) {
  if (!row) {
    return <span className="block bg-bolt-elements-background-depth-2/40" />;
  }

  const added = row.type === 'add';
  const removed = row.type === 'remove';
  const no = side === 'old' ? row.oldNo : row.newNo;

  return (
    <div
      className={classNames(
        'grid grid-cols-[40px_14px_minmax(0,1fr)]',
        added ? 'bg-green-500/10' : removed ? 'bg-red-500/10' : undefined,
      )}
    >
      <span className="select-none px-1 text-right text-[11px] text-bolt-elements-textTertiary opacity-60">{no}</span>
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
        {row.text || ' '}
      </span>
    </div>
  );
}
