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
import { useTranslation } from 'react-i18next';

import {
  formatChatRenderersCopy,
  formatChatRenderersPlural,
  getChatRenderersCopy,
} from '~/lib/i18n/catalogs/chat-renderers';
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
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const copy = getChatRenderersCopy(language);
  const applied = diffApply?.status === 'applied';
  const failed = diffApply?.status === 'failed';
  const hasChanges = applied && (diffApply.addedLines > 0 || diffApply.removedLines > 0);

  const addedLabel = hasChanges
    ? formatChatRenderersPlural(language, diffApply.addedLines, {
        one: copy['chatRenderers.diff.added_one'],
        other: copy['chatRenderers.diff.added_other'],
      })
    : '';
  const removedLabel = hasChanges
    ? formatChatRenderersPlural(language, diffApply.removedLines, {
        one: copy['chatRenderers.diff.removed_one'],
        other: copy['chatRenderers.diff.removed_other'],
      })
    : '';

  return (
    <div
      className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"
      data-testid="diff-action-row"
      data-status={diffApply?.status}
    >
      <span className="shrink-0">{copy['chatRenderers.diff.edit']}</span>
      <button
        type="button"
        className="inline-flex min-h-11 min-w-0 max-w-full items-center rounded-md bg-bolt-elements-artifacts-inlineCode-background px-1.5 py-1 text-bolt-elements-item-contentAccent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-bolt-elements-focus"
        onClick={() => onOpenFile?.(filePath)}
        aria-label={formatChatRenderersCopy(copy['chatRenderers.diff.openFile'], { path: filePath })}
      >
        <code className="truncate text-bolt-elements-artifacts-inlineCode-text">{filePath}</code>
      </button>
      <span className="text-xs text-bolt-elements-textTertiary">{copy['chatRenderers.diff.targetedPatch']}</span>

      {hasChanges ? (
        <span
          className="bolt-file-action-diff-summary shrink-0"
          data-has-changes="true"
          aria-label={formatChatRenderersCopy(copy['chatRenderers.diff.summary'], {
            added: addedLabel,
            removed: removedLabel,
          })}
        >
          <span className="bolt-file-action-diff-added">+{diffApply.addedLines}</span>
          <span className="bolt-file-action-diff-removed">−{diffApply.removedLines}</span>
        </span>
      ) : null}

      {failed ? (
        <span
          className={classNames(
            'shrink-0 inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[11px] font-medium leading-4',
            'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-icon-error',
          )}
          role="status"
          aria-label={copy['chatRenderers.diff.applyFailedAria']}
        >
          <span className="i-ph:warning-circle" aria-hidden />
          {copy['chatRenderers.diff.applyFailed']}
        </span>
      ) : null}
    </div>
  );
});

DiffActionRow.displayName = 'DiffActionRow';
