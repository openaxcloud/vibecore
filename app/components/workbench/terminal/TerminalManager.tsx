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

  // Auto-focus terminal when it becomes active
  useEffect(() => {
    if (isActive && terminal) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        try {
          terminal.focus();
        } catch {
          // terminal may have been disposed before the timeout fired
        }
      }, 100);

      return () => clearTimeout(timer);
    }

    return undefined;
  }, [isActive, terminal]);

  return null; // This is a utility component, no UI
});

TerminalManager.displayName = 'TerminalManager';
