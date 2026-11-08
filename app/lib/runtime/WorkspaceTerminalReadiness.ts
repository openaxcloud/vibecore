import { createContext } from 'react';

/** Attachment is held until this provider's real workspace start and seed finish. */
export function createWorkspaceTerminalReadiness() {
  let ready = false;

  const waiting = new Set<() => void>();

  return {
    subscribe(attach: () => void) {
      if (ready) {
        attach();
      } else {
        waiting.add(attach);
      }

      return () => {
        waiting.delete(attach);
      };
    },
    open() {
      ready = true;

      for (const attach of [...waiting]) {
        // A preceding callback can synchronously unmount another terminal.
        if (!waiting.delete(attach)) {
          continue;
        }

        attach();
      }
    },
    close() {
      ready = false;
      waiting.clear();
    },
  };
}

// Outside a project workspace, preserve the existing local terminal lifecycle.
export const workspaceTerminalReadinessContext = createContext<ReturnType<
  typeof createWorkspaceTerminalReadiness
> | null>(null);
