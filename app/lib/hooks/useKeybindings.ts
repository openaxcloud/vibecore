import { useEffect } from 'react';

import {
  findKeybinding,
  isEditableKeybindingTarget,
  serializeKeyEvent,
  type Keybinding,
  type KeybindingContext,
} from '~/lib/keybindings';

/**
 * Decide how the global capture-phase listener should treat a matched binding when
 * the keydown event originated inside an editable element (input/textarea/contenteditable).
 *
 * The `overlay.close` (Escape) binding is the only one allowed to run while focus is in an
 * editable element, because closing an open overlay should win over native input behavior.
 * BUT when no overlay is actually open, Escape must fall through to the focused input and to
 * bubbling child handlers (IME composition cancel, inline-rename cancel, dropdown close, …).
 * Calling preventDefault()/stopPropagation() in that case silently breaks all of them.
 *
 * Returns:
 *  - 'ignore'   — not an editable target, no special handling needed; caller proceeds normally.
 *  - 'skip'     — editable target + this binding must not run here; caller returns early.
 *  - 'passthrough' — editable target + run the action WITHOUT preventDefault/stopPropagation,
 *                    so the native event still reaches the input and child handlers.
 *  - 'handle'   — editable target + run the action and suppress the native event.
 */
export type EditableTargetDisposition = 'ignore' | 'skip' | 'passthrough' | 'handle';

export function resolveEditableTargetDisposition({
  editableTarget,
  commandLike,
  binding,
  overlayOpen,
}: {
  editableTarget: boolean;
  commandLike: boolean;
  binding: Pick<Keybinding, 'action'>;
  overlayOpen: boolean;
}): EditableTargetDisposition {
  if (!editableTarget) {
    return 'ignore';
  }

  // Command-like combos (cmd/ctrl/alt) are intentional global shortcuts even inside inputs.
  if (commandLike) {
    return 'handle';
  }

  if (binding.action !== 'overlay.close') {
    // Plain keys typed into an input belong to the input, not to a global shortcut.
    return 'skip';
  }

  /*
   * overlay.close (Escape) inside an input: only hijack the event when there is actually an
   * overlay to close. Otherwise let Escape reach the input and any bubbling child handlers.
   */
  return overlayOpen ? 'handle' : 'passthrough';
}

/**
 * Best-effort detection of an open modal overlay. The command palette is surfaced through
 * `KeybindingContext.commandPaletteOpen`; any other `aria-modal` dialog (keyboard shortcuts
 * reference, etc.) is detected from the DOM so Escape still closes it even while focus sits in
 * one of its own inputs.
 */
export function isOverlayOpen(context: KeybindingContext): boolean {
  if (context.commandPaletteOpen) {
    return true;
  }

  if (typeof document === 'undefined') {
    return false;
  }

  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

export function useKeybindings({
  enabled = true,
  bindings,
  getContext,
  runAction,
}: {
  enabled?: boolean;
  bindings: Keybinding[];
  getContext: () => KeybindingContext;
  runAction: (action: string, binding: Keybinding, event: KeyboardEvent) => void;
}) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const editableTarget = isEditableKeybindingTarget(event.target);

      const context = {
        ...getContext(),
        isEditableTarget: editableTarget,
      };

      const binding = findKeybinding(bindings, serializeKeyEvent(event), context);

      if (!binding) {
        return;
      }

      const commandLike = event.metaKey || event.ctrlKey || event.altKey;

      const disposition = resolveEditableTargetDisposition({
        editableTarget,
        commandLike,
        binding,
        overlayOpen: editableTarget && !commandLike ? isOverlayOpen(context) : false,
      });

      if (disposition === 'skip') {
        return;
      }

      /*
       * 'passthrough' runs the action but leaves the native event intact so Escape still
       * reaches the focused input and bubbling child handlers (no preventDefault/stopPropagation).
       */
      if (disposition !== 'passthrough' && binding.preventDefault !== false) {
        event.preventDefault();
        event.stopPropagation();
      }

      runAction(binding.action, binding, event);
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });

    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [bindings, enabled, getContext, runAction]);
}
