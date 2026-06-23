/**
 * Composer overlay that surfaces the `/` slash-command palette while the
 * user is typing in the agent chat textarea (Sprint 4 wiring).
 *
 * Detects an active `/` trigger at the start of the input (so messages
 * that just *contain* a slash like "see foo/bar.ts" don't accidentally
 * trigger the palette), renders <SlashCommandsPalette>, and on select
 * runs the chosen command's `execute(context)` then clears the input.
 *
 * The argument-bearing case (`/explain reactivity model`) currently
 * runs the command without splitting the argument out — the executor
 * receives the raw `argument` via context for future use; the command
 * resolves itself the way `parseSlashInput` already documents.
 *
 * Hidden when no active trigger. Auto-apply does not affect this
 * surface — slash commands are explicit user actions.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import { SlashCommandsPalette } from './SlashCommandsPalette';
import { shouldForwardKeyToSlashPalette } from './composer-slash-keys';
import { parseSlashInput, type SlashCommand, type SlashCommandContext } from '~/lib/chat/slash-commands';
import { recordSlashCommand } from '~/lib/persistence/projectIdeMemory';
import { useCurrentWorkspaceId } from '~/lib/runtime/CurrentWorkspaceContext';

export interface ComposerSlashOverlayProps {
  textareaRef: RefObject<HTMLTextAreaElement>;
  input: string;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  context?: SlashCommandContext;

  /**
   * MRU slash-command ids from projectIdeMemory. When supplied, the
   * palette boosts those commands so frequent ones surface first.
   */
  recentSlashCommandIds?: readonly string[];

  /**
   * Project id for persistence. When supplied + a command is executed,
   * we record its id via recordSlashCommand so the next palette open
   * surfaces it first.
   */
  projectId?: string;
}

interface ActiveTrigger {
  keyword: string;
  argument: string;
}

/**
 * The slash trigger only activates when the input *starts* with `/`
 * followed by a keyword character. We compute this from `input`
 * directly — caret position is irrelevant here because the palette
 * is always anchored to the start-of-input slash.
 */
export function detectSlashTrigger(input: string): ActiveTrigger | null {
  const parsed = parseSlashInput(input);

  if (!parsed) {
    return null;
  }

  return { keyword: parsed.keyword, argument: parsed.argument };
}

export const ComposerSlashOverlay = memo(
  ({ textareaRef, input, handleInputChange, context, recentSlashCommandIds, projectId }: ComposerSlashOverlayProps) => {
    const trigger = useMemo(() => detectSlashTrigger(input), [input]);
    const currentWorkspaceId = useCurrentWorkspaceId();

    const [focused, setFocused] = useState(false);

    /*
     * Ref to the overlay wrapper. The palette (a child of this wrapper)
     * owns its keyboard navigation on its own div's onKeyDown, but in
     * production focus stays in the textarea so it never fires. We forward
     * the nav keys to it (see the keydown-bridge effect below) by
     * redispatching the event onto the palette node, which keeps the
     * palette's active-index state and selection logic as the single
     * source of truth.
     */
    const paletteRef = useRef<HTMLDivElement | null>(null);

    /*
     * Mirror whether a trigger is currently active into a ref so the
     * (stable) capture-phase keydown listener can read the latest value
     * without re-subscribing on every keystroke.
     */
    const triggerActiveRef = useRef(false);
    triggerActiveRef.current = Boolean(trigger) && focused;

    /*
     * Track focus on the parent textarea so the palette only renders
     * when the composer is the active element. This avoids the palette
     * lingering after the user blurs the textarea to do something else.
     */
    useEffect(() => {
      const ref = textareaRef.current;

      if (!ref) {
        return undefined;
      }

      const onFocus = () => setFocused(true);

      const onBlur = () => {
        /*
         * Defer the blur handling by one tick so a click on the palette
         * (which momentarily moves focus) doesn't unmount the palette
         * before the click handler runs.
         */
        window.setTimeout(() => {
          if (document.activeElement !== ref) {
            setFocused(false);
          }
        }, 0);
      };

      if (document.activeElement === ref) {
        setFocused(true);
      }

      ref.addEventListener('focus', onFocus);
      ref.addEventListener('blur', onBlur);

      return () => {
        ref.removeEventListener('focus', onFocus);
        ref.removeEventListener('blur', onBlur);
      };
    }, [textareaRef]);

    /*
     * Keyboard bridge: while a slash trigger is active, intercept the
     * palette's navigation keys on the textarea *before* the composer's
     * own onKeyDown runs (capture phase), and forward them to the
     * palette. Without this, ArrowUp/Down/Enter/Tab/Escape never reach
     * the (unfocused) palette and Enter falls through to handleSendMessage,
     * sending the literal `/command` text to the LLM.
     */
    useEffect(() => {
      const ref = textareaRef.current;

      if (!ref) {
        return undefined;
      }

      const onKeyDownCapture = (event: KeyboardEvent) => {
        if (!shouldForwardKeyToSlashPalette(event, triggerActiveRef.current)) {
          return;
        }

        const wrapper = paletteRef.current;

        /*
         * The palette node is the one carrying the React onKeyDown
         * handler — dispatch onto it (or a descendant) so React resolves
         * that handler from the event target's fiber. The wrapper itself
         * has no handler and the palette is its child, so dispatching on
         * the wrapper would bubble away from the palette and do nothing.
         */
        const palette = wrapper?.querySelector<HTMLElement>('.bolt-slash-commands-palette');

        if (!palette) {
          return;
        }

        /*
         * Stop the composer's bubble-phase Enter handler (and any other
         * listeners) from firing, then hand the key to the palette. The
         * palette's onKeyDown calls preventDefault itself for the keys it
         * handles; we preventDefault here too so a fall-through Enter can
         * never submit the raw command even if the palette has no match.
         */
        event.preventDefault();
        event.stopImmediatePropagation();

        const forwarded = new KeyboardEvent('keydown', {
          key: event.key,
          code: event.code,
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          bubbles: true,
          cancelable: true,
        });

        palette.dispatchEvent(forwarded);
      };

      /*
       * Capture phase so we run before React's bubble-phase delegated
       * onKeyDown on the textarea (ChatBox's Enter -> handleSendMessage).
       */
      ref.addEventListener('keydown', onKeyDownCapture, true);

      return () => {
        ref.removeEventListener('keydown', onKeyDownCapture, true);
      };
    }, [textareaRef]);

    const clearInput = useCallback(() => {
      if (!handleInputChange) {
        return;
      }

      const syntheticEvent = {
        target: { value: '' },
        currentTarget: { value: '' },
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;
      handleInputChange(syntheticEvent);
    }, [handleInputChange]);

    const handleSelect = useCallback(
      async (command: SlashCommand) => {
        const argument = trigger?.argument ?? '';
        const resolvedContext: SlashCommandContext = { ...(context ?? {}), argument };

        if (projectId) {
          void recordSlashCommand(projectId, command.id, currentWorkspaceId);
        }

        try {
          await command.execute(resolvedContext);
        } finally {
          clearInput();

          // Refocus the textarea so the user can keep typing.
          window.requestAnimationFrame(() => {
            textareaRef.current?.focus();
          });
        }
      },
      [clearInput, context, projectId, currentWorkspaceId, textareaRef, trigger],
    );

    const handleDismiss = useCallback(() => {
      /*
       * Clear the leading `/` so the next render evaluates `trigger`
       * to null and the palette unmounts. The user can still type a
       * fresh `/` to re-trigger.
       */
      if (!handleInputChange || !input.startsWith('/')) {
        return;
      }

      const next = input.replace(/^\/[^\s]*\s?/, '');

      const syntheticEvent = {
        target: { value: next },
        currentTarget: { value: next },
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;
      handleInputChange(syntheticEvent);
      textareaRef.current?.focus();
    }, [handleInputChange, input, textareaRef]);

    if (!trigger || !focused) {
      return null;
    }

    return (
      <div className="bolt-composer-slash-overlay" ref={paletteRef}>
        <SlashCommandsPalette
          query={trigger.keyword}
          onSelect={handleSelect}
          onDismiss={handleDismiss}
          pendingArgument={trigger.argument || undefined}
          recentSlashCommandIds={recentSlashCommandIds}
        />
      </div>
    );
  },
);

ComposerSlashOverlay.displayName = 'ComposerSlashOverlay';
