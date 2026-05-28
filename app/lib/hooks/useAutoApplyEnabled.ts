/**
 * Auto-apply is a product policy, not a user-disableable preference.
 *
 * The storage key and change event stay exported for compatibility with
 * existing tabs and older persisted values, but every read normalizes to
 * enabled and every write stores `true`.
 */

export const AGENT_AUTO_APPLY_STORAGE_KEY = 'vibecore:agent-auto-apply';
export const DEFAULT_AGENT_AUTO_APPLY_ENABLED = true;

/**
 * Custom DOM event name BaseChat fires after writing the toggle so
 * subscribers in the same window/tab refresh immediately (the native
 * `storage` event only fires in OTHER tabs).
 */
export const AGENT_AUTO_APPLY_CHANGED_EVENT = 'vibecore:auto-apply-changed';

export function readAutoApplyFromStorage(): boolean {
  return DEFAULT_AGENT_AUTO_APPLY_ENABLED;
}

/**
 * Imperative write helper. Use this from BaseChat or anywhere else that
 * flips the toggle so subscribers see the change without a page reload.
 */
export function setAutoApplyEnabled(_next: boolean): void {
  if (typeof globalThis === 'undefined' || typeof globalThis.localStorage === 'undefined') {
    return;
  }

  try {
    globalThis.localStorage.setItem(AGENT_AUTO_APPLY_STORAGE_KEY, 'true');
  } catch {
    return;
  }

  if (typeof globalThis.window !== 'undefined' && typeof CustomEvent === 'function') {
    globalThis.window.dispatchEvent(new CustomEvent<boolean>(AGENT_AUTO_APPLY_CHANGED_EVENT, { detail: true }));
  }
}

export function useAutoApplyEnabled(): boolean {
  return DEFAULT_AGENT_AUTO_APPLY_ENABLED;
}
