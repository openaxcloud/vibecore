/**
 * Inline diff card rendered under each `<boltAction type="file">` block in
 * the assistant message.
 *
 * Reads the workbench file map via `useFileActionDiff` to compute hunks
 * against the file's current on-disk content, and tracks per-hunk Accept /
 * Reject decisions via `useFileActionReview`. The component is intentionally
 * stateless wrt the patch apply pipeline — it just emits the user's
 * decisions through `onApply` so the chat container can do the side-effectful
 * write (which is what `workbenchStore` already does for batch patches).
 *
 * The component is rendered in two states:
 *   - streaming: the closing `</boltAction>` hasn't arrived yet, so we show
 *     a partial-diff indicator and hide every decision affordance.
 *   - settled: file-level Accept / Reject actions plus optional per-hunk
 *     checkboxes for excluding hunks before accepting the file.
 */

import { memo, useCallback, useEffect, useMemo, useRef } from 'react';

import { useFileActionDiff } from '~/lib/hooks/useFileActionDiff';
import { useFileActionReview } from '~/lib/hooks/useFileActionReview';
import { t } from '~/lib/i18n/dictionary';
import type { FileActionBlock } from '~/types/message-blocks';
import { applyReviewableDiffHunks, type ReviewableDiffHunk, type ReviewableDiffLine } from '~/utils/diff';

export interface InlineFileActionDiffApplyDetail {
  /** Workbench path the new content should be written to. */
  absolutePath: string;

  /** Path as it appeared in the action block (useful for logs / UI). */
  filePath: string;

  /** Original content before this action ran. */
  originalContent: string;

  /** Content the user accepted (proposed merged with rejected hunks dropped). */
  acceptedContent: string;

  /** Hunk ids the user accepted in this Apply click. */
  acceptedHunkIds: string[];

  /** Hunk ids the user rejected. */
  rejectedHunkIds: string[];
}

/**
 * Phase 0 #2 UI surface — when the LLM self-repair pipeline is retrying
 * a hunk that failed AST validation, the parent can pass these counters
 * so the card shows "Self-repair attempt 1/2…" inline. `errorMessage`
 * surfaces the last parser error so the user knows why the agent is
 * retrying.
 */
export interface SelfRepairStatus {
  attempt: number;
  maxAttempts: number;
  errorMessage?: string;
}

export interface InlineFileActionDiffProps {
  action: FileActionBlock;
  onApply?: (detail: InlineFileActionDiffApplyDetail) => void;

  /**
   * Optional self-repair state. When set, an in-progress banner replaces
   * the streaming/no-changes indicator. Undefined = no repair active.
   */
  selfRepair?: SelfRepairStatus;
}

export const InlineFileActionDiff = memo(({ action, onApply, selfRepair }: InlineFileActionDiffProps) => {
  const diff = useFileActionDiff(action);
  const hunkIds = diff.hunks.map((hunk) => hunk.id);
  const review = useFileActionReview(hunkIds);

  /*
   * If the underlying hunk ids change (the assistant streams in a new
   * chunk and the diff resegments), reset the review state machine so
   * we never carry decisions for stale hunk ids. The joined key collapses
   * the changing array reference into a stable string so the effect fires
   * exactly when the id set changes, not on every render.
   */
  const hunkIdsKey = hunkIds.join('|');
  const hunkIdsRef = useRef(hunkIds);
  hunkIdsRef.current = hunkIds;

  useEffect(() => {
    review.reset(hunkIdsRef.current);
  }, [hunkIdsKey, review.reset]);

  const { isFullyDecided, rejectedCount } = review.summary;

  const acceptedHunkIdsForApply = useMemo(
    () => hunkIds.filter((hunkId) => review.state.decisions[hunkId] !== 'rejected'),
    [hunkIds, review.state.decisions],
  );

  const acceptedCountForApply = acceptedHunkIdsForApply.length;

  const handleAcceptFile = useCallback(() => {
    if (!onApply) {
      return;
    }

    const acceptedHunkIds = acceptedHunkIdsForApply;
    const rejectedHunkIds = [...review.summary.rejectedIds];

    const acceptedContent = applyReviewableDiffHunks({
      originalContent: diff.originalContent,
      hunks: diff.hunks,
      acceptedHunkIds,
    });

    onApply({
      absolutePath: diff.absolutePath,
      filePath: diff.filePath,
      originalContent: diff.originalContent,
      acceptedContent,
      acceptedHunkIds,
      rejectedHunkIds,
    });
  }, [acceptedHunkIdsForApply, diff, onApply, review.summary.rejectedIds]);

  const handleRejectFile = useCallback(() => {
    review.rejectAll();
  }, [review]);

  const summaryPill = (
    <span className="bolt-file-action-diff-summary" data-has-changes={diff.summary.hasChanges ? 'true' : 'false'}>
      <span className="bolt-file-action-diff-added" aria-label={`${diff.summary.addedLines} added`}>
        +{diff.summary.addedLines}
      </span>
      <span className="bolt-file-action-diff-removed" aria-label={`${diff.summary.removedLines} removed`}>
        −{diff.summary.removedLines}
      </span>
    </span>
  );

  const headerLabel = diff.isNewFile ? 'New file' : diff.summary.hasChanges ? 'Changes' : 'No changes';

  return (
    <section
      className="bolt-file-action-diff"
      aria-label={`File action diff for ${diff.filePath}`}
      data-streaming={action.streaming ? 'true' : 'false'}
      data-decided={isFullyDecided ? 'true' : 'false'}
    >
      <header className="bolt-file-action-diff-header">
        <div className="bolt-file-action-diff-title">
          <span className="i-ph:file-code bolt-file-action-diff-icon" aria-hidden />
          <code className="bolt-file-action-diff-path">{diff.filePath}</code>
          <span className="bolt-file-action-diff-status">{headerLabel}</span>
        </div>
        {summaryPill}
        {!action.streaming && diff.summary.hasChanges && onApply ? (
          <div className="bolt-file-action-diff-file-actions" role="group" aria-label="File decision">
            <button
              type="button"
              className="bolt-file-action-diff-file-action bolt-file-action-diff-file-action-accept"
              onClick={handleAcceptFile}
              disabled={acceptedCountForApply === 0}
              aria-label="Accept file"
            >
              Accept file
            </button>
            <button
              type="button"
              className="bolt-file-action-diff-file-action"
              onClick={handleRejectFile}
              aria-label="Reject file"
            >
              Reject file
            </button>
          </div>
        ) : null}
      </header>

      {selfRepair ? (
        <div
          className="bolt-file-action-diff-self-repair"
          role="status"
          aria-live="polite"
          data-attempt={selfRepair.attempt}
        >
          <span className="i-svg-spinners:90-ring-with-bg" aria-hidden /> Self-repair attempt {selfRepair.attempt}/
          {selfRepair.maxAttempts}…
          {selfRepair.errorMessage ? (
            <span className="bolt-file-action-diff-self-repair-error">{selfRepair.errorMessage}</span>
          ) : null}
        </div>
      ) : action.streaming ? (
        <div className="bolt-file-action-diff-streaming-indicator" role="status" aria-live="polite">
          <span className="i-svg-spinners:90-ring-with-bg" aria-hidden /> {t('patchReview.streaming')}
        </div>
      ) : diff.summary.hasChanges ? (
        <ul className="bolt-file-action-diff-hunks">
          {diff.hunks.map((hunk) => (
            <HunkView
              key={hunk.id}
              hunk={hunk}
              checked={review.state.decisions[hunk.id] !== 'rejected'}
              onToggle={(checked) => {
                if (checked) {
                  review.accept(hunk.id);
                } else {
                  review.reject(hunk.id);
                }
              }}
            />
          ))}
        </ul>
      ) : (
        <div className="bolt-file-action-diff-noop" role="status">
          {t('patchReview.noChanges')}
        </div>
      )}

      {!action.streaming && onApply && diff.summary.hasChanges ? (
        <div className="bolt-file-action-diff-footer" role="status">
          {acceptedCountForApply} selected · {rejectedCount} excluded
        </div>
      ) : null}
    </section>
  );
});

InlineFileActionDiff.displayName = 'InlineFileActionDiff';

interface HunkViewProps {
  hunk: ReviewableDiffHunk;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}

const HunkView = memo(({ hunk, checked, onToggle }: HunkViewProps) => {
  return (
    <li
      className="bolt-file-action-diff-hunk"
      data-decision={checked ? 'accepted' : 'rejected'}
      aria-label={`Hunk ${hunk.id}`}
    >
      <details className="bolt-file-action-diff-hunk-details">
        <summary className="bolt-file-action-diff-hunk-header">
          <label className="bolt-file-action-diff-hunk-checkbox" onClick={(event) => event.stopPropagation()}>
            <input type="checkbox" checked={checked} onChange={(event) => onToggle(event.currentTarget.checked)} />
            <span className="bolt-file-action-diff-hunk-range">
              @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
            </span>
          </label>
          <span className="bolt-file-action-diff-hunk-show">
            Show diff
            <span className="i-ph:caret-down" aria-hidden />
          </span>
        </summary>
        <pre className="bolt-file-action-diff-hunk-body">
          {hunk.lines.map((line) => (
            <DiffLineRow key={line.id} line={line} />
          ))}
        </pre>
      </details>
    </li>
  );
});

HunkView.displayName = 'InlineFileActionDiff.HunkView';

const DiffLineRow = memo(({ line }: { line: ReviewableDiffLine }) => {
  const marker = line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' ';

  return (
    <span className="bolt-file-action-diff-line" data-line-type={line.type}>
      <span className="bolt-file-action-diff-line-marker" aria-hidden>
        {marker}
      </span>
      <span className="bolt-file-action-diff-line-content">{line.content}</span>
    </span>
  );
});

DiffLineRow.displayName = 'InlineFileActionDiff.DiffLineRow';
