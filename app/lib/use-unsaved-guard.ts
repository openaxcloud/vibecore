import { useEffect } from 'react';
import { useBlocker } from 'react-router';

/**
 * Guard against losing unsaved form edits: blocks in-app navigation away from
 * the current path while `dirty` (the caller renders a confirm dialog from the
 * returned blocker) and arms the native beforeunload prompt for hard
 * reloads/closes. Same-path navigations (the form's own POST) pass through.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!dirty) {
      return undefined;
    }

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();

      // Chrome requires returnValue to be set for the prompt to show.
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);

    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  return blocker;
}
