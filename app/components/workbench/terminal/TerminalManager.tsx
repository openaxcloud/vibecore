import type { Terminal as XTerm } from '@xterm/xterm';
import { memo, useEffect } from 'react';

interface TerminalManagerProps {
  terminal: XTerm | null;
  isActive: boolean;
  onReconnect?: () => void;
}

export const TerminalManager = memo(({ terminal, isActive }: TerminalManagerProps) => {
  // Simplified terminal manager - removed aggressive health checking that was causing issues

  /*
   * NOTE: We intentionally do NOT wire a manual Cmd/Ctrl+V paste handler here.
   * xterm.js already handles clipboard paste natively: the browser fires a
   * `paste` event on xterm's hidden textarea, which xterm forwards to the PTY
   * via its onData path. `terminal.onKey(...)` is an observer-only event that
   * cannot suppress that native paste, so additionally calling
   * `terminal.paste(text)` from an onKey handler delivered the clipboard to the
   * shell twice.
   */

  // Offer focus on activation only while the user has not chosen another control.
  useEffect(() => {
    if (isActive && terminal) {
      const hasFocusedControl = () =>
        document.activeElement !== null &&
        document.activeElement !== document.body &&
        document.activeElement !== document.documentElement;

      if (hasFocusedControl()) {
        return undefined;
      }

      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        cancelAutofocus();

        if (hasFocusedControl()) {
          return;
        }

        try {
          terminal.focus();
        } catch {
          // terminal may have been disposed before the timeout fired
        }
      }, 100);

      // Remember user intent even if that control disappears before the timer fires.
      function cancelAutofocus() {
        clearTimeout(timer);
        document.removeEventListener('focusin', cancelAutofocus, true);
        document.removeEventListener('pointerdown', cancelAutofocus, true);
        document.removeEventListener('keydown', cancelAutofocus, true);
      }

      document.addEventListener('focusin', cancelAutofocus, true);
      document.addEventListener('pointerdown', cancelAutofocus, true);
      document.addEventListener('keydown', cancelAutofocus, true);

      return cancelAutofocus;
    }

    return undefined;
  }, [isActive, terminal]);

  return null; // This is a utility component, no UI
});

TerminalManager.displayName = 'TerminalManager';
