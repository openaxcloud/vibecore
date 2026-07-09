/**
 * Chat-UI render surface for a `<boltAction type="diff">` (anchored
 * search/replace) action inside an artifact's ActionList.
 *
 * A `diff` action is applied by the runner as a targeted patch onto an existing
 * file (never a full rewrite), so it renders differently from a `file` action's
 * "Create <path>" row:
 *
 *   - label "Edit <path> (targeted patch)" (the path opens the file in the
 *     workbench, matching the file-action affordance);
 *   - on a successful apply, a +N/−M hunk pill reusing the exact
 *     `bolt-file-action-diff-*` classes the file-proposal cards already use, so
 *     the impact reads identically to a file edit;
 *   - on a fail-safe fallback (base drift / malformed / missing target), a
 *     compact "could not apply" marker so the action is never silently absent —
 *     the full explanation is surfaced by the runner's alert.
 *
 * Zero violet, theme-token driven, responsive (the path truncates), no
 * window.confirm. Presentational only — the workbench does the side effects.
 */

import { memo } from 'react';

import type { DiffApplyMeta } from '~/types/actions';
import { classNames } from '~/utils/classNames';

export interface DiffActionRowProps {
  filePath: string;

  /** Apply outcome once the diff has resolved; undefined while streaming. */
  diffApply?: DiffApplyMeta;

  /** Open the target file in the workbench (wired by the artifact list). */
  onOpenFile?: (filePath: string) => void;
}

export const DiffActionRow = memo(({ filePath, diffApply, onOpenFile }: DiffActionRowProps) => {
  const applied = diffApply?.status === 'applied';
  const failed = diffApply?.status === 'failed';
  const hasChanges = applied && (diffApply.addedLines > 0 || diffApply.removedLines > 0);

  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-1.5"
      data-testid="diff-action-row"
      data-status={diffApply?.status}
    >
      <span className="shrink-0">Edit</span>
      <code
        className="truncate bg-bolt-elements-artifacts-inlineCode-background text-bolt-elements-artifacts-inlineCode-text px-1.5 py-1 rounded-md text-bolt-elements-item-contentAccent hover:underline cursor-pointer"
        onClick={() => onOpenFile?.(filePath)}
      >
        {filePath}
      </code>
      <span className="shrink-0 text-xs text-bolt-elements-textTertiary">(targeted patch)</span>

      {hasChanges ? (
        <span
          className="bolt-file-action-diff-summary shrink-0"
          data-has-changes="true"
          aria-label={`${diffApply.addedLines} added, ${diffApply.removedLines} removed`}
        >
          <span className="bolt-file-action-diff-added">+{diffApply.addedLines}</span>
          <span className="bolt-file-action-diff-removed">−{diffApply.removedLines}</span>
        </span>
      ) : null}

      {failed ? (
        <span
          className={classNames(
            'shrink-0 inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] font-medium leading-4',
            'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-icon-error',
          )}
          role="status"
          aria-label="Patch could not be applied"
        >
          <span className="i-ph:warning-circle" aria-hidden />
          Could not apply
        </span>
      ) : null}
    </div>
  );
});

DiffActionRow.displayName = 'DiffActionRow';
