/**
 * Composer overlay that surfaces the @-file-mention palette while the
 * user is typing in the agent chat textarea (Sprint 3 wiring).
 *
 * Detects an active `@token` based on `input` + the textarea's
 * selectionStart, renders <FileMentionsPalette> right above the
 * composer when a token is present, and on select replaces the
 * `@token` substring with `@<filePath> ` so the existing backend
 * resolver (resolveMentionedProjectFiles in BaseChat) picks it up.
 *
 * Hidden when no active token, when input is empty, or when
 * textareaRef hasn't mounted yet. Has no effect on auto-apply
 * behaviour — this is input assistance, not a proposed write.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import { FileMentionsPalette } from './FileMentionsPalette';
import type { FileMentionCandidate } from '~/lib/hooks/useFileMentions';
import { recordMentionedFile } from '~/lib/persistence/projectIdeMemory';
import { useCurrentWorkspaceId } from '~/lib/runtime/CurrentWorkspaceContext';

export interface ComposerMentionsOverlayProps {
  textareaRef: RefObject<HTMLTextAreaElement>;
  input: string;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;

  /**
   * MRU display paths from projectIdeMemory.ui.recentMentionedFilePaths.
   * When supplied, the palette boosts those entries in its ranking.
   */
  recentMentionedFilePaths?: readonly string[];

  /**
   * Project id for persistence. When supplied + a candidate is picked,
   * we record the file path via recordMentionedFile so the next palette
   * open surfaces it first.
   */
  projectId?: string;
}

interface ActiveTrigger {
  /** Inclusive start of the `@` character in the input string. */
  start: number;

  /** Exclusive end — position of the cursor or first whitespace after the token. */
  end: number;

  /** Substring after the `@`, without the `@` itself. */
  query: string;
}

const TRIGGER_CHAR = '@';

/**
 * Inspect the input + caret position to determine whether the user is
 * actively composing an `@token`. The trigger is the LAST `@` before
 * the caret with no whitespace between it and the caret.
 */
export function detectMentionTrigger(input: string, caret: number): ActiveTrigger | null {
  if (caret <= 0 || caret > input.length) {
    return null;
  }

  // Walk backwards from caret until we hit whitespace or the trigger char.
  let cursor = caret - 1;

  while (cursor >= 0) {
    const ch = input[cursor];

    if (ch === TRIGGER_CHAR) {
      // Trigger char must be at start of input OR preceded by whitespace.
      if (cursor === 0 || /\s/.test(input[cursor - 1])) {
        return { start: cursor, end: caret, query: input.slice(cursor + 1, caret) };
      }

      return null;
    }

    if (/\s/.test(ch)) {
      return null;
    }

    cursor -= 1;
  }

  return null;
}

export const ComposerMentionsOverlay = memo(
  ({ textareaRef, input, handleInputChange, recentMentionedFilePaths, projectId }: ComposerMentionsOverlayProps) => {
    const [caret, setCaret] = useState<number>(0);
    const currentWorkspaceId = useCurrentWorkspaceId();

    /*
     * Track the textarea caret position via selectionchange polling. We
     * can't rely on onSelect alone because the parent textarea is in
     * another component, so we listen at the document level and read
     * selectionStart when the ref points to the focused element.
     */
    useEffect(() => {
      const ref = textareaRef.current;

      if (!ref) {
        return undefined;
      }

      const handler = () => {
        if (document.activeElement === ref) {
          setCaret(ref.selectionStart ?? 0);
        }
      };

      handler();
      document.addEventListener('selectionchange', handler);
      ref.addEventListener('focus', handler);

      return () => {
        document.removeEventListener('selectionchange', handler);
        ref.removeEventListener('focus', handler);
      };
    }, [textareaRef]);

    const trigger = useMemo(() => detectMentionTrigger(input, caret), [input, caret]);

    const lastHandledTriggerRef = useRef<ActiveTrigger | null>(null);

    useEffect(() => {
      lastHandledTriggerRef.current = trigger;
    }, [trigger]);

    const handleSelect = useCallback(
      (candidate: FileMentionCandidate) => {
        const active = lastHandledTriggerRef.current ?? trigger;

        if (!active || !handleInputChange || !textareaRef.current) {
          return;
        }

        if (projectId) {
          // Fire-and-forget MRU record — the debounced save layer batches.
          void recordMentionedFile(projectId, candidate.displayPath, currentWorkspaceId);
        }

        const before = input.slice(0, active.start);
        const after = input.slice(active.end);
        const insertion = `@${candidate.displayPath} `;
        const next = `${before}${insertion}${after}`;

        const syntheticEvent = {
          target: { value: next },
          currentTarget: { value: next },
        } as unknown as React.ChangeEvent<HTMLTextAreaElement>;
        handleInputChange(syntheticEvent);

        // Refocus + move caret right after the inserted path.
        const nextCaret = active.start + insertion.length;
        window.requestAnimationFrame(() => {
          const el = textareaRef.current;

          if (!el) {
            return;
          }

          el.focus();
          el.setSelectionRange(nextCaret, nextCaret);
          setCaret(nextCaret);
        });
      },
      [handleInputChange, input, projectId, currentWorkspaceId, textareaRef, trigger],
    );

    const handleDismiss = useCallback(() => {
      /*
       * Dismiss = ignore further palette updates for the current trigger
       * by clearing the query implicitly. The user can resume by typing
       * a fresh `@`. We do this by moving the caret one step past the
       * trigger so `detectMentionTrigger` returns null on next render.
       */
      const ref = textareaRef.current;

      if (!ref || !trigger) {
        return;
      }

      ref.focus();
      setCaret(trigger.end);
    }, [textareaRef, trigger]);

    if (!trigger) {
      return null;
    }

    return (
      <div className="bolt-composer-mentions-overlay">
        <FileMentionsPalette
          query={trigger.query}
          onSelect={handleSelect}
          onDismiss={handleDismiss}
          recentMentionedFilePaths={recentMentionedFilePaths}
        />
      </div>
    );
  },
);

ComposerMentionsOverlay.displayName = 'ComposerMentionsOverlay';
