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
import { useTranslation } from 'react-i18next';

import { useFileActionDiff } from '~/lib/hooks/useFileActionDiff';
import { useFileActionReview } from '~/lib/hooks/useFileActionReview';
import {
  formatInlineFileActionDiffCopy,
  formatInlineFileActionDiffPlural,
  getInlineFileActionDiffCopy,
  type InlineFileActionDiffCopy,
} from '~/lib/i18n/catalogs/inline-file-action-diff';
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
 * so the card shows the localized repair progress inline. `errorMessage`
 * only indicates that validation failed; the upstream parser detail remains
 * internal so technical or untrusted text is never rendered verbatim.
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
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getInlineFileActionDiffCopy(language);
  const locale = language.toLowerCase().startsWith('fr') ? 'fr-FR' : 'en-US';
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
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
      <span
        className="bolt-file-action-diff-added"
        aria-label={formatInlineFileActionDiffPlural(language, diff.summary.addedLines, {
          one: copy['inlineFileDiff.aria.added_one'],
          other: copy['inlineFileDiff.aria.added_other'],
        })}
      >
        +{numberFormatter.format(diff.summary.addedLines)}
      </span>
      <span
        className="bolt-file-action-diff-removed"
        aria-label={formatInlineFileActionDiffPlural(language, diff.summary.removedLines, {
          one: copy['inlineFileDiff.aria.removed_one'],
          other: copy['inlineFileDiff.aria.removed_other'],
        })}
      >
        −{numberFormatter.format(diff.summary.removedLines)}
      </span>
    </span>
  );

  const headerLabel = diff.isNewFile
    ? copy['inlineFileDiff.status.newFile']
    : diff.summary.hasChanges
      ? copy['inlineFileDiff.status.changes']
      : copy['inlineFileDiff.status.noChanges'];

  return (
    <section
      className="bolt-file-action-diff"
      aria-label={formatInlineFileActionDiffCopy(copy['inlineFileDiff.aria.file'], { path: diff.filePath })}
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
          <div
            className="bolt-file-action-diff-file-actions"
            role="group"
            aria-label={copy['inlineFileDiff.decision.group']}
          >
            <button
              type="button"
              className="bolt-file-action-diff-file-action bolt-file-action-diff-file-action-accept"
              onClick={handleAcceptFile}
              disabled={acceptedCountForApply === 0}
              aria-label={copy['inlineFileDiff.decision.accept']}
            >
              {copy['inlineFileDiff.decision.accept']}
            </button>
            <button
              type="button"
              className="bolt-file-action-diff-file-action"
              onClick={handleRejectFile}
              aria-label={copy['inlineFileDiff.decision.reject']}
            >
              {copy['inlineFileDiff.decision.reject']}
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
          <span>
            <span className="i-svg-spinners:90-ring-with-bg" aria-hidden />{' '}
            {formatInlineFileActionDiffCopy(copy['inlineFileDiff.repair.attempt'], {
              attempt: numberFormatter.format(selfRepair.attempt),
              maximum: numberFormatter.format(selfRepair.maxAttempts),
            })}
          </span>
          {selfRepair.errorMessage ? (
            <span className="bolt-file-action-diff-self-repair-error">
              {copy['inlineFileDiff.repair.validationFailed']}
            </span>
          ) : null}
        </div>
      ) : action.streaming ? (
        <div className="bolt-file-action-diff-streaming-indicator" role="status" aria-live="polite">
          <span className="i-svg-spinners:90-ring-with-bg" aria-hidden /> {copy['inlineFileDiff.streaming']}
        </div>
      ) : diff.summary.hasChanges ? (
        <ul className="bolt-file-action-diff-hunks">
          {diff.hunks.map((hunk) => (
            <HunkView
              key={hunk.id}
              hunk={hunk}
              copy={copy}
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
          {copy['inlineFileDiff.noChanges']}
        </div>
      )}

      {!action.streaming && onApply && diff.summary.hasChanges ? (
        <div className="bolt-file-action-diff-footer" role="status">
          {formatInlineFileActionDiffPlural(language, acceptedCountForApply, {
            one: copy['inlineFileDiff.selection.selected_one'],
            other: copy['inlineFileDiff.selection.selected_other'],
          })}{' '}
          ·{' '}
          {formatInlineFileActionDiffPlural(language, rejectedCount, {
            one: copy['inlineFileDiff.selection.excluded_one'],
            other: copy['inlineFileDiff.selection.excluded_other'],
          })}
        </div>
      ) : null}
    </section>
  );
});

InlineFileActionDiff.displayName = 'InlineFileActionDiff';

interface HunkViewProps {
  hunk: ReviewableDiffHunk;
  copy: InlineFileActionDiffCopy;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}

const HunkView = memo(({ hunk, copy, checked, onToggle }: HunkViewProps) => {
  return (
    <li
      className="bolt-file-action-diff-hunk"
      data-decision={checked ? 'accepted' : 'rejected'}
      aria-label={formatInlineFileActionDiffCopy(copy['inlineFileDiff.hunk.aria'], { id: hunk.id })}
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
            {copy['inlineFileDiff.hunk.show']}
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
