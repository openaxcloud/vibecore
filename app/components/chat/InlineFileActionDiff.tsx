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
 *   - settled: full hunks + per-hunk accept/reject buttons + a header
 *     "Accept all" / "Reject all" + "Apply" footer.
 */

import { memo, useCallback, useEffect, useRef } from 'react';

import { useFileActionDiff } from '~/lib/hooks/useFileActionDiff';
import { useFileActionReview } from '~/lib/hooks/useFileActionReview';
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

export interface InlineFileActionDiffProps {
  action: FileActionBlock;
  onApply?: (detail: InlineFileActionDiffApplyDetail) => void;
}

export const InlineFileActionDiff = memo(({ action, onApply }: InlineFileActionDiffProps) => {
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

  const { isFullyDecided, hasAccepted, acceptedCount, rejectedCount, pendingCount } = review.summary;

  const handleApply = useCallback(() => {
    if (!onApply) {
      return;
    }

    const acceptedHunkIds = [...review.summary.acceptedIds];
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
  }, [diff, onApply, review.summary.acceptedIds, review.summary.rejectedIds]);

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
        {!action.streaming && diff.summary.hasChanges ? (
          <div className="bolt-file-action-diff-bulk-actions" role="group" aria-label="Bulk hunk decisions">
            <button
              type="button"
              className="bolt-file-action-diff-bulk-action"
              onClick={review.acceptAll}
              aria-label="Accept all hunks"
            >
              Accept all
            </button>
            <button
              type="button"
              className="bolt-file-action-diff-bulk-action"
              onClick={review.rejectAll}
              aria-label="Reject all hunks"
            >
              Reject all
            </button>
            <button
              type="button"
              className="bolt-file-action-diff-bulk-action"
              onClick={review.clearAll}
              aria-label="Clear all decisions"
              disabled={acceptedCount === 0 && rejectedCount === 0}
            >
              Clear
            </button>
          </div>
        ) : null}
      </header>

      {action.streaming ? (
        <div className="bolt-file-action-diff-streaming-indicator" role="status" aria-live="polite">
          <span className="i-svg-spinners:90-ring-with-bg" aria-hidden /> Streaming patch…
        </div>
      ) : diff.summary.hasChanges ? (
        <ul className="bolt-file-action-diff-hunks">
          {diff.hunks.map((hunk) => (
            <HunkView
              key={hunk.id}
              hunk={hunk}
              decision={review.state.decisions[hunk.id] ?? 'pending'}
              onAccept={() => review.accept(hunk.id)}
              onReject={() => review.reject(hunk.id)}
              onClear={() => review.clear(hunk.id)}
            />
          ))}
        </ul>
      ) : (
        <div className="bolt-file-action-diff-noop" role="status">
          Content is identical to the file on disk.
        </div>
      )}

      {!action.streaming && onApply && diff.summary.hasChanges ? (
        <footer className="bolt-file-action-diff-footer">
          <span className="bolt-file-action-diff-footer-status">
            {acceptedCount} accepted · {rejectedCount} rejected · {pendingCount} pending
          </span>
          <button
            type="button"
            className="bolt-file-action-diff-apply"
            onClick={handleApply}
            disabled={!hasAccepted}
            aria-label="Apply accepted hunks"
          >
            Apply{acceptedCount > 0 ? ` (${acceptedCount})` : ''}
          </button>
        </footer>
      ) : null}
    </section>
  );
});

InlineFileActionDiff.displayName = 'InlineFileActionDiff';

interface HunkViewProps {
  hunk: ReviewableDiffHunk;
  decision: 'pending' | 'accepted' | 'rejected';
  onAccept: () => void;
  onReject: () => void;
  onClear: () => void;
}

const HunkView = memo(({ hunk, decision, onAccept, onReject, onClear }: HunkViewProps) => {
  return (
    <li className="bolt-file-action-diff-hunk" data-decision={decision} aria-label={`Hunk ${hunk.id}`}>
      <div className="bolt-file-action-diff-hunk-header">
        <span className="bolt-file-action-diff-hunk-range">
          @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
        </span>
        <span className="bolt-file-action-diff-hunk-actions" role="group" aria-label="Hunk decision">
          <button
            type="button"
            className="bolt-file-action-diff-hunk-action"
            data-active={decision === 'accepted' ? 'true' : 'false'}
            onClick={decision === 'accepted' ? onClear : onAccept}
            aria-pressed={decision === 'accepted'}
            aria-label="Accept hunk"
          >
            <span className="i-ph:check" aria-hidden /> Accept
          </button>
          <button
            type="button"
            className="bolt-file-action-diff-hunk-action"
            data-active={decision === 'rejected' ? 'true' : 'false'}
            onClick={decision === 'rejected' ? onClear : onReject}
            aria-pressed={decision === 'rejected'}
            aria-label="Reject hunk"
          >
            <span className="i-ph:x" aria-hidden /> Reject
          </button>
        </span>
      </div>
      <pre className="bolt-file-action-diff-hunk-body">
        {hunk.lines.map((line) => (
          <DiffLineRow key={line.id} line={line} />
        ))}
      </pre>
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
