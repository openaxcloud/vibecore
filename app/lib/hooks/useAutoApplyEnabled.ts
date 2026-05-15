/**
 * Read the `vibecore:agent-auto-apply` user setting reactively.
 *
 * BaseChat owns the toggle state; it writes to localStorage on every change.
 * The MessagePatchReview component (and any other Sprint 2+ surface that
 * needs to gate behaviour on auto-apply) reads through this hook so it
 * reacts both to same-tab toggles (via the custom `vibecore:auto-apply-
 * changed` event) and cross-tab toggles (via the native `storage` event).
 */

import { useEffect, useState } from 'react';

export const AGENT_AUTO_APPLY_STORAGE_KEY = 'vibecore:agent-auto-apply';

/**
 * Custom DOM event name BaseChat fires after writing the toggle so
 * subscribers in the same window/tab refresh immediately (the native
 * `storage` event only fires in OTHER tabs).
 */
export const AGENT_AUTO_APPLY_CHANGED_EVENT = 'vibecore:auto-apply-changed';

function readAutoApplyFromStorage(): boolean {
  if (typeof globalThis === 'undefined' || typeof globalThis.localStorage === 'undefined') {
    return false;
  }

  try {
    return globalThis.localStorage.getItem(AGENT_AUTO_APPLY_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Imperative write helper. Use this from BaseChat or anywhere else that
 * flips the toggle so subscribers see the change without a page reload.
 */
export function setAutoApplyEnabled(next: boolean): void {
  if (typeof globalThis === 'undefined' || typeof globalThis.localStorage === 'undefined') {
    return;
  }

  try {
    globalThis.localStorage.setItem(AGENT_AUTO_APPLY_STORAGE_KEY, String(next));
  } catch {
    return;
  }

  if (typeof globalThis.window !== 'undefined' && typeof CustomEvent === 'function') {
    globalThis.window.dispatchEvent(new CustomEvent<boolean>(AGENT_AUTO_APPLY_CHANGED_EVENT, { detail: next }));
  }
}

/**
 * React hook returning the current value. Recomputes when either the
 * native `storage` event or our own `vibecore:auto-apply-changed` event
 * fires; both are wired to the same window object so listening to both
 * covers in-tab and cross-tab toggles.
 */
export function useAutoApplyEnabled(): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => readAutoApplyFromStorage());

  useEffect(() => {
    if (typeof globalThis === 'undefined' || typeof globalThis.window === 'undefined') {
      return undefined;
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== AGENT_AUTO_APPLY_STORAGE_KEY) {
        return;
      }

      setEnabled(event.newValue === 'true');
    };

    const onLocalChange = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail;

      if (typeof detail === 'boolean') {
        setEnabled(detail);

        return;
      }

      setEnabled(readAutoApplyFromStorage());
    };

    globalThis.window.addEventListener('storage', onStorage);
    globalThis.window.addEventListener(AGENT_AUTO_APPLY_CHANGED_EVENT, onLocalChange);

    return () => {
      globalThis.window.removeEventListener('storage', onStorage);
      globalThis.window.removeEventListener(AGENT_AUTO_APPLY_CHANGED_EVENT, onLocalChange);
    };
  }, []);

  return enabled;
}
