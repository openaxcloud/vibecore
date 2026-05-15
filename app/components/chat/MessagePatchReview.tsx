/**
 * Collapsible "Files changed" panel rendered under an assistant message.
 *
 * Parses the same message snapshot the existing Markdown component uses
 * via the typed block model (`messageToBlocks` + `summarizeAssistantMessage`),
 * surfaces each `fileAction` as an `<InlineFileActionDiff>` card, and
 * applies the user-accepted hunks to the workbench file map.
 *
 * Sprint 2 entry point for replacing the monolithic Markdown rendering
 * surface — this is intentionally additive (Markdown still renders the
 * prose + artifact summary), so the existing chat behaviour is preserved
 * while the new diff cards add per-hunk Accept/Reject affordances.
 */

import { useStore } from '@nanostores/react';
import { memo, useCallback, useMemo, useState } from 'react';
import { toast } from 'react-toastify';

import type { AssistantMessageProps } from './AssistantMessage';
import { InlineFileActionDiff, type InlineFileActionDiffApplyDetail } from './InlineFileActionDiff';
import { useAutoApplyEnabled } from '~/lib/hooks/useAutoApplyEnabled';
import { computeFileActionDiff } from '~/lib/hooks/useFileActionDiff';
import { summarizeAssistantMessage } from '~/lib/runtime/message-block-summary';
import { messageToBlocks } from '~/lib/runtime/message-blocks';
import type { FileMap } from '~/lib/stores/files';
import { workbenchStore } from '~/lib/stores/workbench';
import { aggregateReviewableDiffSummaries } from '~/utils/diff';

type SnapshotInput = Pick<AssistantMessageProps, 'parts'> & {
  messageId: string;
  content: string;
};

async function defaultApplyHandler(detail: InlineFileActionDiffApplyDetail) {
  try {
    await workbenchStore.writeFileContent(detail.absolutePath, detail.acceptedContent);
    toast.success(
      `Applied ${detail.acceptedHunkIds.length} hunk${detail.acceptedHunkIds.length === 1 ? '' : 's'} to ${detail.filePath}`,
    );
  } catch (error) {
    toast.error(`Failed to apply ${detail.filePath}: ${(error as Error).message}`);
  }
}

export interface MessagePatchReviewProps extends SnapshotInput {
  /**
   * Optional override for the per-file Apply handler. Defaults to writing
   * the accepted content via `workbenchStore.writeFileContent`. Tests pass
   * their own to assert the event without doing a real write.
   */
  onApply?: (detail: InlineFileActionDiffApplyDetail) => void | Promise<void>;
}

export const MessagePatchReview = memo(({ messageId, content, parts, onApply }: MessagePatchReviewProps) => {
  /*
   * When auto-apply is on the existing ActionRunner path applies file
   * actions silently — surfacing a redundant Accept/Apply UI here would
   * confuse the user and risk double-writes. Hide the panel entirely;
   * the existing artifact card still narrates what landed.
   */
  const autoApplyEnabled = useAutoApplyEnabled();

  const blocks = useMemo(() => {
    /*
     * `messageToBlocks` reads `id`, `content`, `parts`, `experimental_attachments`.
     * We're at the assistant-message render boundary so attachments don't apply.
     */
    return messageToBlocks({ id: messageId, role: 'assistant', content, parts });
  }, [messageId, content, parts]);

  const summary = useMemo(() => summarizeAssistantMessage(blocks), [blocks]);
  const fileActions = summary.fileActions;

  /*
   * Subscribe to the workbench file map so the aggregate +N/−M badge
   * recomputes when an external write changes the on-disk content. We
   * still let each card's hook recompute its own hunks independently —
   * the aggregate stays in source order with the cards below.
   */
  const files = useStore(workbenchStore.files) as FileMap;

  const aggregate = useMemo(() => {
    return aggregateReviewableDiffSummaries(fileActions.map((action) => computeFileActionDiff(files, action).summary));
  }, [files, fileActions]);

  const [isOpen, setIsOpen] = useState(true);
  const [isApplyingAll, setIsApplyingAll] = useState(false);

  const applyHandler = onApply ?? defaultApplyHandler;

  const handleApplyAll = useCallback(async () => {
    if (isApplyingAll || fileActions.length === 0) {
      return;
    }

    setIsApplyingAll(true);

    let appliedCount = 0;
    let failedCount = 0;

    /*
     * Apply each file action sequentially so that ETag-style writes that
     * recompute the on-disk state see the previous one's effects. This
     * preserves the same UX as a chain of single-card Apply clicks.
     */
    for (const action of fileActions) {
      const diff = computeFileActionDiff(files, action);

      if (!diff.summary.hasChanges) {
        continue;
      }

      try {
        await applyHandler({
          absolutePath: diff.absolutePath,
          filePath: diff.filePath,
          originalContent: diff.originalContent,
          acceptedContent: diff.proposedContent,
          acceptedHunkIds: diff.hunks.map((hunk) => hunk.id),
          rejectedHunkIds: [],
        });
        appliedCount += 1;
      } catch {
        failedCount += 1;
      }
    }

    setIsApplyingAll(false);

    if (appliedCount > 0 && failedCount === 0) {
      toast.success(`Applied ${appliedCount} file${appliedCount === 1 ? '' : 's'}`);
    } else if (failedCount > 0) {
      toast.error(`Applied ${appliedCount} file${appliedCount === 1 ? '' : 's'}, ${failedCount} failed`);
    }
  }, [applyHandler, fileActions, files, isApplyingAll]);

  if (autoApplyEnabled || fileActions.length === 0) {
    return null;
  }

  return (
    <section className="bolt-message-patch-review" aria-label="Patch review for assistant message">
      <header className="bolt-message-patch-review-header">
        <button
          type="button"
          className="bolt-message-patch-review-toggle"
          aria-expanded={isOpen}
          aria-controls={`patch-review-body-${messageId}`}
          onClick={() => setIsOpen((open) => !open)}
        >
          <span className={isOpen ? 'i-ph:caret-down' : 'i-ph:caret-right'} aria-hidden />
          <span>Files changed</span>
          <span className="bolt-message-patch-review-count" aria-label={`${fileActions.length} files`}>
            {fileActions.length}
          </span>
          {aggregate.addedLines + aggregate.removedLines > 0 ? (
            <span
              className="bolt-message-patch-review-aggregate"
              aria-label={`${aggregate.addedLines} added, ${aggregate.removedLines} removed across ${aggregate.filesWithChanges} files`}
            >
              <span className="bolt-file-action-diff-added">+{aggregate.addedLines}</span>
              <span className="bolt-file-action-diff-removed">−{aggregate.removedLines}</span>
            </span>
          ) : null}
        </button>
        {aggregate.filesWithChanges > 0 ? (
          <button
            type="button"
            className="bolt-message-patch-review-apply-all"
            onClick={handleApplyAll}
            disabled={isApplyingAll}
            aria-label={`Apply all ${aggregate.filesWithChanges} files`}
          >
            {isApplyingAll ? 'Applying…' : `Apply all (${aggregate.filesWithChanges})`}
          </button>
        ) : null}
      </header>
      {isOpen ? (
        <div id={`patch-review-body-${messageId}`} className="bolt-message-patch-review-body">
          {fileActions.map((action) => (
            <InlineFileActionDiff key={action.id} action={action} onApply={applyHandler} />
          ))}
        </div>
      ) : null}
    </section>
  );
});

MessagePatchReview.displayName = 'MessagePatchReview';
