import { useStore } from '@nanostores/react';
import { useEffect } from 'react';
import { shortcutsStore, type Shortcuts } from '~/lib/stores/settings';

class ShortcutEventEmitter {
  #emitter = new EventTarget();

  dispatch(type: keyof Shortcuts) {
    this.#emitter.dispatchEvent(new Event(type));
  }

  on(type: keyof Shortcuts, cb: VoidFunction) {
    this.#emitter.addEventListener(type, cb);

    return () => {
      this.#emitter.removeEventListener(type, cb);
    };
  }
}

export const shortcutEventEmitter = new ShortcutEventEmitter();

export function useShortcuts(): void {
  const shortcuts = useStore(shortcutsStore);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      // Debug logging
      console.log('Key pressed:', {
        key: event.key,
        code: event.code, // This gives us the physical key regardless of modifiers
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      });

      /*
       * Check for theme toggle shortcut first (Option + Command + Shift + D)
       * Use event.code to check for the physical D key regardless of the character produced
       */
      if (
        event.code === 'KeyD' &&
        event.metaKey && // Command (Mac) or Windows key
        event.altKey && // Option (Mac) or Alt (Windows)
        event.shiftKey &&
        !event.ctrlKey
      ) {
        event.preventDefault();
        event.stopPropagation();
        shortcuts.toggleTheme.action();

        return;
      }

      // Handle other shortcuts
      for (const name in shortcuts) {
        const shortcut = shortcuts[name as keyof Shortcuts];

        if (name === 'toggleTheme') {
          continue;
        } // Skip theme toggle as it's handled above

        // For other shortcuts, check both key and code
        const keyMatches =
          shortcut.key.toLowerCase() === event.key.toLowerCase() || `Key${shortcut.key.toUpperCase()}` === event.code;

        const modifiersMatch =
          (shortcut.ctrlKey === undefined || shortcut.ctrlKey === event.ctrlKey) &&
          (shortcut.metaKey === undefined || shortcut.metaKey === event.metaKey) &&
          (shortcut.shiftKey === undefined || shortcut.shiftKey === event.shiftKey) &&
          (shortcut.altKey === undefined || shortcut.altKey === event.altKey);

        if (keyMatches && modifiersMatch) {
          event.preventDefault();
          event.stopPropagation();
          shortcutEventEmitter.dispatch(name as keyof Shortcuts);
          shortcut.action();
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts]);
}
