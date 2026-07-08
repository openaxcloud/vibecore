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
 * Persistence (#23): the value lives in TWO places, reconciled on mount.
 *  - localStorage (per browser): the fast local cache. It seeds the SSR default,
 *    survives reload, and is broadcast via a custom DOM event so every panel in
 *    the same tab reacts immediately (the native `storage` event only fires in
 *    OTHER tabs).
 *  - the server `preferences` blob (`/api/user/preferences`, key
 *    `requireAiChangeReview`): the cross-device source of truth. On mount the
 *    hook fetches it once and, if the signed-in user has a stored value,
 *    reconciles the local cache to it so the choice follows the user to another
 *    device/browser. Every write is pushed back with a best-effort PATCH.
 *
 * Both server calls are best-effort: an unauthenticated IDE session (401) or an
 * unreachable backend simply falls back to localStorage-only, exactly like the
 * rest of the in-IDE settings panel.
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

/** The key this setting occupies inside the server `preferences` blob. */

export const REQUIRE_AI_CHANGE_REVIEW_PREFERENCE_KEY = 'requireAiChangeReview';

const USER_PREFERENCES_ENDPOINT = '/api/user/preferences';

/*
 * Only talk to the backend from a real browser that has `fetch`. In SSR and in
 * unit tests without a browser window this is false, so the hook stays a pure
 * localStorage affair and never fires a network request.
 */
function canReachServer(): boolean {
  return typeof globalThis.window !== 'undefined' && typeof globalThis.fetch === 'function';
}

/**
 * Best-effort push of the setting into the server `preferences` blob. The blob
 * is shallow-merged server-side, so sending just this key preserves the rest of
 * the user's preferences. Never throws — a 401 / offline session is a no-op and
 * the localStorage value remains the local source of truth.
 */
async function pushRequireAiChangeReviewToServer(next: boolean): Promise<void> {
  if (!canReachServer()) {
    return;
  }

  try {
    await globalThis.fetch(USER_PREFERENCES_ENDPOINT, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ preferences: { [REQUIRE_AI_CHANGE_REVIEW_PREFERENCE_KEY]: next } }),
    });
  } catch {
    // Offline / no backend account — keep the localStorage value.
  }
}

/*
 * Fetch the persisted value from the server AT MOST ONCE per page load, shared
 * across every hook instance (BaseChat, the review queue, Settings all mount it)
 * so the IDE issues a single GET. Resolves `undefined` when the user has no
 * stored value, is unauthenticated, or the backend is unreachable — the caller
 * then keeps whatever localStorage holds.
 */
let serverValuePromise: Promise<boolean | undefined> | undefined;

function fetchRequireAiChangeReviewFromServer(): Promise<boolean | undefined> {
  if (serverValuePromise) {
    return serverValuePromise;
  }

  if (!canReachServer()) {
    serverValuePromise = Promise.resolve(undefined);

    return serverValuePromise;
  }

  serverValuePromise = globalThis
    .fetch(USER_PREFERENCES_ENDPOINT, { headers: { accept: 'application/json' } })
    .then((response) => (response.ok ? response.json() : undefined))
    .then((payload) => {
      const value = (payload as { preferences?: { requireAiChangeReview?: unknown } } | undefined)?.preferences
        ?.requireAiChangeReview;

      return typeof value === 'boolean' ? value : undefined;
    })
    .catch(() => undefined);

  return serverValuePromise;
}

/** Test-only: drop the memoized server fetch so each case starts clean. */
export function __resetRequireAiChangeReviewServerCache(): void {
  serverValuePromise = undefined;
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
 * Write the value to the local cache (localStorage) and broadcast it to same-tab
 * subscribers, WITHOUT touching the server. Used both by the public setter and
 * by server→local reconciliation (which must not echo a redundant PATCH back).
 */
function writeRequireAiChangeReviewLocally(next: boolean): void {
  if (hasLocalStorage()) {
    try {
      globalThis.localStorage.setItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY, String(next));
    } catch {
      // Storage unavailable (private mode / quota) — still broadcast below.
    }
  }

  if (typeof globalThis.window !== 'undefined' && typeof CustomEvent === 'function') {
    globalThis.window.dispatchEvent(new CustomEvent<boolean>(REQUIRE_AI_CHANGE_REVIEW_CHANGED_EVENT, { detail: next }));
  }
}

/**
 * Imperative write helper — persists the require-review setting locally, pushes
 * it to the server `preferences` blob (best-effort, so it survives reload AND
 * follows the user across devices), and broadcasts it so same-tab subscribers
 * refresh without a page reload.
 */
export function setRequireAiChangeReview(next: boolean): void {
  writeRequireAiChangeReviewLocally(next);
  void pushRequireAiChangeReviewToServer(next);
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

    /*
     * Cross-device reconciliation: pull the signed-in user's persisted value and,
     * if it differs from the local cache, adopt it (server is the source of truth
     * across browsers/devices). `writeRequireAiChangeReviewLocally` updates the
     * cache and broadcasts to every other subscriber without echoing a PATCH.
     */
    let cancelled = false;

    void fetchRequireAiChangeReviewFromServer().then((serverValue) => {
      if (cancelled || typeof serverValue !== 'boolean') {
        return;
      }

      if (serverValue !== readRequireAiChangeReviewFromStorage()) {
        writeRequireAiChangeReviewLocally(serverValue);
      }

      setRequireReviewState(serverValue);
    });

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
      cancelled = true;
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
