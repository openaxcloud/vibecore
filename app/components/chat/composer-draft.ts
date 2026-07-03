/**
 * Chat composer draft persistence.
 *
 * The typed-but-unsent composer text survives a reload or accidental tab
 * close via sessionStorage, keyed per project (per-tab by design — a draft
 * in one tab must not leak into another tab's composer).
 *
 * Storage access is SSR/private-mode safe (same pattern as
 * app/components/dashboard/sidebar-collapse.ts): `typeof window` guards plus
 * try/catch, degrading silently to "no draft" when storage is unavailable.
 */

export const COMPOSER_DRAFT_STORAGE_PREFIX = 'ecode:composer-draft:';

/** Keystrokes are coalesced into one storage write per pause. */
export const COMPOSER_DRAFT_DEBOUNCE_MS = 300;

export function composerDraftStorageKey(projectId: string): string {
  return `${COMPOSER_DRAFT_STORAGE_PREFIX}${projectId}`;
}

/** Stored draft for the project, or null when there is none (or no storage). */
export function readComposerDraft(projectId: string | undefined): string | null {
  if (typeof window === 'undefined' || !projectId) {
    return null;
  }

  try {
    const stored = window.sessionStorage.getItem(composerDraftStorageKey(projectId));

    return stored && stored.trim().length > 0 ? stored : null;
  } catch {
    // Storage blocked (Safari private mode) — behave as "no draft".
    return null;
  }
}

/**
 * Persist the draft. An emptied composer means "no draft", so blank values
 * drop the key instead of storing whitespace.
 */
export function writeComposerDraft(projectId: string | undefined, value: string): void {
  if (typeof window === 'undefined' || !projectId) {
    return;
  }

  try {
    if (value.trim().length === 0) {
      window.sessionStorage.removeItem(composerDraftStorageKey(projectId));
    } else {
      window.sessionStorage.setItem(composerDraftStorageKey(projectId), value);
    }
  } catch {
    // Storage blocked/full — the draft lives only in React state for this page.
  }
}

export function clearComposerDraft(projectId: string | undefined): void {
  if (typeof window === 'undefined' || !projectId) {
    return;
  }

  try {
    window.sessionStorage.removeItem(composerDraftStorageKey(projectId));
  } catch {
    // Storage blocked — nothing to clear.
  }
}

export interface ComposerDraftWriter {
  /** Debounced write — replaces any pending write with this one. */
  schedule: (projectId: string | undefined, value: string) => void;

  /** Persist the pending write immediately (unmount/navigation path). */
  flush: () => void;

  /** Drop the pending write without persisting (send path). */
  cancel: () => void;
}

/**
 * Debounced wrapper around writeComposerDraft so per-keystroke updates cost
 * one storage write per typing pause. Pure setTimeout so specs can drive it
 * with vitest fake timers.
 */
export function createComposerDraftWriter(delayMs: number = COMPOSER_DRAFT_DEBOUNCE_MS): ComposerDraftWriter {
  let timer: ReturnType<typeof setTimeout> | undefined = undefined;
  let pending: { projectId: string; value: string } | undefined = undefined;

  const clearTimer = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const commit = () => {
    const write = pending;
    pending = undefined;

    if (write) {
      writeComposerDraft(write.projectId, write.value);
    }
  };

  return {
    schedule(projectId, value) {
      if (!projectId) {
        return;
      }

      pending = { projectId, value };
      clearTimer();
      timer = setTimeout(() => {
        timer = undefined;
        commit();
      }, delayMs);
    },
    flush() {
      clearTimer();
      commit();
    },
    cancel() {
      clearTimer();
      pending = undefined;
    },
  };
}
