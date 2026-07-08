/**
 * "Require review of AI changes" is a persisted USER setting.
 *
 * Default is OFF (`false`) → the agent's file changes AUTO-APPLY (Replit-style):
 * pending proposals are accepted automatically, no review gate. When the user
 * turns the setting ON in Settings, every AI change stays pending and must be
 * accepted/rejected in the review queue before it lands.
 *
 * Auto-apply is exactly the inverse of this setting:
 *   autoApplyEnabled === !requireAiChangeReview
 *
 * The value is stored in localStorage (per user/browser) and broadcast via a
 * custom DOM event so every panel in the same tab reacts immediately (the
 * native `storage` event only fires in OTHER tabs).
 */

import { useEffect, useState } from 'react';

export const REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY = 'vibecore:require-ai-change-review';
export const REQUIRE_AI_CHANGE_REVIEW_CHANGED_EVENT = 'vibecore:require-ai-change-review-changed';

/** Default: reviews are NOT required → changes auto-apply. */
export const DEFAULT_REQUIRE_AI_CHANGE_REVIEW = false;

/* --- Back-compat aliases (existing imports keep working) ------------------- */

export const AGENT_AUTO_APPLY_STORAGE_KEY = REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY;
export const AGENT_AUTO_APPLY_CHANGED_EVENT = REQUIRE_AI_CHANGE_REVIEW_CHANGED_EVENT;
export const DEFAULT_AGENT_AUTO_APPLY_ENABLED = true;

function hasLocalStorage(): boolean {
  return typeof globalThis !== 'undefined' && typeof globalThis.localStorage !== 'undefined';
}

/** Parse a stored `'true'`/`'false'` slot, falling back to the default. */
function parseBool(raw: string | null, fallback: boolean): boolean {
  if (raw === 'true') {
    return true;
  }

  if (raw === 'false') {
    return false;
  }

  return fallback;
}

export function readRequireAiChangeReviewFromStorage(): boolean {
  if (!hasLocalStorage()) {
    return DEFAULT_REQUIRE_AI_CHANGE_REVIEW;
  }

  try {
    return parseBool(
      globalThis.localStorage.getItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY),
      DEFAULT_REQUIRE_AI_CHANGE_REVIEW,
    );
  } catch {
    return DEFAULT_REQUIRE_AI_CHANGE_REVIEW;
  }
}

/** Auto-apply is the inverse of require-review. */
export function readAutoApplyFromStorage(): boolean {
  return !readRequireAiChangeReviewFromStorage();
}

/**
 * Imperative write helper — persists the require-review setting and broadcasts
 * it so same-tab subscribers refresh without a page reload.
 */
export function setRequireAiChangeReview(next: boolean): void {
  if (!hasLocalStorage()) {
    return;
  }

  try {
    globalThis.localStorage.setItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY, String(next));
  } catch {
    return;
  }

  if (typeof globalThis.window !== 'undefined' && typeof CustomEvent === 'function') {
    globalThis.window.dispatchEvent(new CustomEvent<boolean>(REQUIRE_AI_CHANGE_REVIEW_CHANGED_EVENT, { detail: next }));
  }
}

/** Back-compat: flipping auto-apply flips !requireReview. */
export function setAutoApplyEnabled(next: boolean): void {
  setRequireAiChangeReview(!next);
}

function useReviewSubscription(): boolean {
  const [requireReview, setRequireReviewState] = useState<boolean>(() => readRequireAiChangeReviewFromStorage());

  useEffect(() => {
    // Re-read on mount so SSR's default is reconciled with client storage.
    setRequireReviewState(readRequireAiChangeReviewFromStorage());

    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail;
      setRequireReviewState(typeof detail === 'boolean' ? detail : readRequireAiChangeReviewFromStorage());
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY) {
        return;
      }

      setRequireReviewState(parseBool(event.newValue, DEFAULT_REQUIRE_AI_CHANGE_REVIEW));
    };

    globalThis.window?.addEventListener(REQUIRE_AI_CHANGE_REVIEW_CHANGED_EVENT, onCustom as EventListener);
    globalThis.window?.addEventListener('storage', onStorage);

    return () => {
      globalThis.window?.removeEventListener(REQUIRE_AI_CHANGE_REVIEW_CHANGED_EVENT, onCustom as EventListener);
      globalThis.window?.removeEventListener('storage', onStorage);
    };
  }, []);

  return requireReview;
}

/** Reactive: whether the user requires manual review of AI changes. */
export function useRequireAiChangeReview(): boolean {
  return useReviewSubscription();
}

/** Reactive: whether AI changes auto-apply (the inverse of require-review). */
export function useAutoApplyEnabled(): boolean {
  return !useReviewSubscription();
}
