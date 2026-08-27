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
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

import type { AssistantMessageProps } from './AssistantMessage';
import { InlineFileActionDiff, type InlineFileActionDiffApplyDetail } from './InlineFileActionDiff';
import { useAutoApplyEnabled } from '~/lib/hooks/useAutoApplyEnabled';
import { computeFileActionDiff } from '~/lib/hooks/useFileActionDiff';
import {
  type ChatRenderersCopy,
  formatChatRenderersCopy,
  formatChatRenderersPlural,
  getChatRenderersCopy,
} from '~/lib/i18n/catalogs/chat-renderers';
import { summarizeAssistantMessage } from '~/lib/runtime/message-block-summary';
import { messageToBlocks } from '~/lib/runtime/message-blocks';
import type { FileMap } from '~/lib/stores/files';
import { workbenchStore } from '~/lib/stores/workbench';
import { aggregateReviewableDiffSummaries } from '~/utils/diff';
import { batchFileApplied } from '~/utils/toast-batcher';

type SnapshotInput = Pick<AssistantMessageProps, 'parts'> & {
  messageId: string;
  content: string;
};

async function defaultApplyHandler(detail: InlineFileActionDiffApplyDetail, copy: ChatRenderersCopy) {
  try {
    await workbenchStore.writeFileContent(detail.absolutePath, detail.acceptedContent);

    /*
     * Coalesce per-file applies into a single "N files applied · Undo all"
     * toast rather than spamming one toast per Apply click. Undo writes
     * the captured originalContent back through the same path.
     */
    batchFileApplied({
      filePath: detail.filePath,
      undo: () => workbenchStore.writeFileContent(detail.absolutePath, detail.originalContent),
    });
  } catch {
    toast.error(formatChatRenderersCopy(copy['chatRenderers.patchReview.applyFileFailed'], { path: detail.filePath }), {
      toastId: 'patch-apply-failed',
    });
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
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const copy = getChatRenderersCopy(language);
  const locale = language.toLowerCase().startsWith('fr') ? 'fr-FR' : 'en-US';
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  /*
   * Auto-apply is always on. The existing ActionRunner path applies file
   * actions silently — surfacing a redundant Accept/Apply UI here would
   * confuse the user and risk double-writes. Hide the panel entirely;
   * the existing artifact card still narrates what landed.
   */
  const autoApplyEnabled = useAutoApplyEnabled();

  const blocks = useMemo(() => {
    if (autoApplyEnabled) {
      return [];
    }

    /*
     * `messageToBlocks` reads `id`, `content`, `parts`, `experimental_attachments`.
     * We're at the assistant-message render boundary so attachments don't apply.
     */
    return messageToBlocks({ id: messageId, role: 'assistant', content, parts });
  }, [autoApplyEnabled, messageId, content, parts]);

  const summary = useMemo(() => summarizeAssistantMessage(blocks), [blocks]);
  const fileActions = summary.fileActions;

  /*
   * Subscribe to the workbench file map so the aggregate +N/−M badge
   * recomputes when an external write changes the on-disk content. We
   * still let each card's hook recompute its own hunks independently —
   * the aggregate stays in source order with the cards below.
   */
  const files = useStore(workbenchStore.files) as FileMap;
  const selfRepairByPath = useStore(workbenchStore.agentPatchSelfRepair);

  const aggregate = useMemo(() => {
    return aggregateReviewableDiffSummaries(fileActions.map((action) => computeFileActionDiff(files, action).summary));
  }, [files, fileActions]);

  const [isOpen, setIsOpen] = useState(true);
  const [isApplyingAll, setIsApplyingAll] = useState(false);
  const [isRejected, setIsRejected] = useState(false);

  const localizedDefaultApplyHandler = useCallback(
    (detail: InlineFileActionDiffApplyDetail) => defaultApplyHandler(detail, copy),
    [copy],
  );

  const applyHandler = onApply ?? localizedDefaultApplyHandler;

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
      try {
        const diff = computeFileActionDiff(files, action);

        if (!diff.summary.hasChanges) {
          continue;
        }

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

    /*
     * Per-file success toasts are coalesced by `batchFileApplied` inside
     * the default handler (see `defaultApplyHandler`). Surface only the
     * failure summary here — the batcher has no signal for failures.
     */
    if (failedCount > 0) {
      const appliedLabel = formatChatRenderersPlural(language, appliedCount, {
        one: copy['chatRenderers.patchReview.applied_one'],
        other: copy['chatRenderers.patchReview.applied_other'],
      });
      const failedLabel = formatChatRenderersPlural(language, failedCount, {
        one: copy['chatRenderers.patchReview.failed_one'],
        other: copy['chatRenderers.patchReview.failed_other'],
      });

      toast.error(
        formatChatRenderersCopy(copy['chatRenderers.patchReview.applySummary'], {
          applied: appliedLabel,
          failed: failedLabel,
        }),
      );
    }
  }, [applyHandler, copy, fileActions, files, isApplyingAll, language]);

  if (autoApplyEnabled || fileActions.length === 0 || isRejected) {
    return null;
  }

  const fileCountLabel = formatChatRenderersPlural(language, fileActions.length, {
    one: copy['chatRenderers.patchReview.files_one'],
    other: copy['chatRenderers.patchReview.files_other'],
  });
  const changedFileCountLabel = formatChatRenderersPlural(language, aggregate.filesWithChanges, {
    one: copy['chatRenderers.patchReview.files_one'],
    other: copy['chatRenderers.patchReview.files_other'],
  });
  const addedLabel = formatChatRenderersPlural(language, aggregate.addedLines, {
    one: copy['chatRenderers.diff.added_one'],
    other: copy['chatRenderers.diff.added_other'],
  });
  const removedLabel = formatChatRenderersPlural(language, aggregate.removedLines, {
    one: copy['chatRenderers.diff.removed_one'],
    other: copy['chatRenderers.diff.removed_other'],
  });

  return (
    <section className="bolt-message-patch-review min-w-0" aria-label={copy['chatRenderers.patchReview.aria']}>
      <header className="bolt-message-patch-review-header min-w-0 flex-wrap gap-2">
        <button
          type="button"
          className="bolt-message-patch-review-toggle min-h-11 min-w-0 max-w-full flex-wrap focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive"
          aria-expanded={isOpen}
          aria-controls={`patch-review-body-${messageId}`}
          onClick={() => setIsOpen((open) => !open)}
        >
          <span className={isOpen ? 'i-ph:caret-down' : 'i-ph:caret-right'} aria-hidden />
          <span className="min-w-0 break-words">{copy['chatRenderers.patchReview.filesChanged']}</span>
          <span className="bolt-message-patch-review-count" aria-label={fileCountLabel}>
            {numberFormatter.format(fileActions.length)}
          </span>
          {aggregate.addedLines + aggregate.removedLines > 0 ? (
            <span
              className="bolt-message-patch-review-aggregate"
              aria-label={formatChatRenderersCopy(copy['chatRenderers.patchReview.aggregate'], {
                added: addedLabel,
                removed: removedLabel,
                files: changedFileCountLabel,
              })}
            >
              <span className="bolt-file-action-diff-added">+{aggregate.addedLines}</span>
              <span className="bolt-file-action-diff-removed">−{aggregate.removedLines}</span>
            </span>
          ) : null}
        </button>
        {aggregate.filesWithChanges > 0 ? (
          <div
            className="bolt-message-patch-review-actions min-w-0 flex-wrap"
            role="group"
            aria-label={copy['chatRenderers.patchReview.decisions']}
          >
            <button
              type="button"
              className="bolt-message-patch-review-apply-all min-h-11 min-w-11 max-w-full whitespace-normal focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive"
              onClick={handleApplyAll}
              disabled={isApplyingAll}
              aria-label={formatChatRenderersCopy(copy['chatRenderers.patchReview.acceptAllAria'], {
                files: changedFileCountLabel,
              })}
              aria-busy={isApplyingAll}
            >
              {isApplyingAll
                ? copy['chatRenderers.patchReview.accepting']
                : formatChatRenderersCopy(copy['chatRenderers.patchReview.acceptAll'], {
                    count: numberFormatter.format(aggregate.filesWithChanges),
                  })}
            </button>
            <button
              type="button"
              className="bolt-message-patch-review-reject-all min-h-11 min-w-11 max-w-full whitespace-normal focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive"
              onClick={() => setIsRejected(true)}
              disabled={isApplyingAll}
              aria-label={formatChatRenderersCopy(copy['chatRenderers.patchReview.rejectAllAria'], {
                files: changedFileCountLabel,
              })}
            >
              {copy['chatRenderers.patchReview.rejectAll']}
            </button>
          </div>
        ) : null}
      </header>
      {isOpen ? (
        <div id={`patch-review-body-${messageId}`} className="bolt-message-patch-review-body">
          {fileActions.map((action) => (
            <InlineFileActionDiff
              key={action.id}
              action={action}
              onApply={applyHandler}
              selfRepair={selfRepairByPath[action.filePath]}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
});

MessagePatchReview.displayName = 'MessagePatchReview';
