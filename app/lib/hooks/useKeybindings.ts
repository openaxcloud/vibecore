import { useEffect } from 'react';

import {
  findKeybinding,
  isEditableKeybindingTarget,
  serializeKeyEvent,
  type Keybinding,
  type KeybindingContext,
} from '~/lib/keybindings';

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

      if (editableTarget && !commandLike && binding.action !== 'overlay.close') {
        return;
      }

      if (binding.preventDefault !== false) {
        event.preventDefault();
        event.stopPropagation();
      }

      runAction(binding.action, binding, event);
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });

    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [bindings, enabled, getContext, runAction]);
}
