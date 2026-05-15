/**
 * Per-hunk Accept / Reject state machine for a single file action review.
 *
 * Sprint 2 — the inline diff card under each `<boltAction type="file">`
 * lets the user mark individual hunks as Accepted or Rejected before the
 * patch is applied. The reducer here drives that UI:
 *
 *   - `init(hunkIds)` builds the initial pending state for a fresh diff.
 *   - `fileActionReviewReducer(state, action)` applies a single decision.
 *   - `useFileActionReview(hunkIds)` exposes the same state machine as a
 *     React hook with stable callbacks.
 *
 * The reducer is exported separately so it can be unit-tested without a
 * DOM — the React hook is a thin shim.
 */

import { useCallback, useMemo, useReducer } from 'react';

export type HunkDecision = 'pending' | 'accepted' | 'rejected';

export interface FileActionReviewState {
  /** Decision per hunk id, defaulting to `'pending'`. */
  decisions: Record<string, HunkDecision>;
}

export type FileActionReviewEvent =
  | { type: 'reset'; hunkIds: readonly string[] }
  | { type: 'decide'; hunkId: string; decision: HunkDecision }
  | { type: 'acceptAll' }
  | { type: 'rejectAll' }
  | { type: 'clearAll' };

export function initFileActionReview(hunkIds: readonly string[]): FileActionReviewState {
  const decisions: Record<string, HunkDecision> = {};

  for (const id of hunkIds) {
    decisions[id] = 'pending';
  }

  return { decisions };
}

export function fileActionReviewReducer(
  state: FileActionReviewState,
  event: FileActionReviewEvent,
): FileActionReviewState {
  switch (event.type) {
    case 'reset':
      return initFileActionReview(event.hunkIds);

    case 'decide': {
      if (state.decisions[event.hunkId] === event.decision) {
        return state;
      }

      return {
        decisions: { ...state.decisions, [event.hunkId]: event.decision },
      };
    }

    case 'acceptAll': {
      const next: Record<string, HunkDecision> = {};

      for (const id of Object.keys(state.decisions)) {
        next[id] = 'accepted';
      }

      return { decisions: next };
    }

    case 'rejectAll': {
      const next: Record<string, HunkDecision> = {};

      for (const id of Object.keys(state.decisions)) {
        next[id] = 'rejected';
      }

      return { decisions: next };
    }

    case 'clearAll':
      return initFileActionReview(Object.keys(state.decisions));

    default:
      return state;
  }
}

/**
 * Derive the bookkeeping the renderer needs from the raw decision map.
 * Kept pure so the reducer + the hook share the same selector logic.
 */
export interface FileActionReviewSummary {
  acceptedIds: Set<string>;
  rejectedIds: Set<string>;
  pendingIds: Set<string>;
  acceptedCount: number;
  rejectedCount: number;
  pendingCount: number;

  /** True once every hunk has a non-pending decision. */
  isFullyDecided: boolean;

  /** True if at least one hunk has been accepted. */
  hasAccepted: boolean;
}

export function selectFileActionReviewSummary(
  state: FileActionReviewState,
  hunkIds: readonly string[],
): FileActionReviewSummary {
  const acceptedIds = new Set<string>();
  const rejectedIds = new Set<string>();
  const pendingIds = new Set<string>();

  for (const id of hunkIds) {
    const decision = state.decisions[id] ?? 'pending';

    if (decision === 'accepted') {
      acceptedIds.add(id);
    } else if (decision === 'rejected') {
      rejectedIds.add(id);
    } else {
      pendingIds.add(id);
    }
  }

  return {
    acceptedIds,
    rejectedIds,
    pendingIds,
    acceptedCount: acceptedIds.size,
    rejectedCount: rejectedIds.size,
    pendingCount: pendingIds.size,
    isFullyDecided: pendingIds.size === 0 && hunkIds.length > 0,
    hasAccepted: acceptedIds.size > 0,
  };
}

export interface UseFileActionReviewResult {
  state: FileActionReviewState;
  summary: FileActionReviewSummary;
  accept(hunkId: string): void;
  reject(hunkId: string): void;
  clear(hunkId: string): void;
  acceptAll(): void;
  rejectAll(): void;
  clearAll(): void;

  /** Reset the state machine to a fresh `hunkIds` set. */
  reset(hunkIds: readonly string[]): void;
}

/**
 * React hook: lazy-initialises a reducer over the supplied hunk ids and
 * returns stable callbacks for the renderer to wire up to buttons.
 *
 * Recompute the `summary` only when the decisions or hunk ids change.
 */
export function useFileActionReview(hunkIds: readonly string[]): UseFileActionReviewResult {
  const [state, dispatch] = useReducer(
    fileActionReviewReducer,
    hunkIds,
    initFileActionReview as (ids: readonly string[]) => FileActionReviewState,
  );

  const summary = useMemo(() => selectFileActionReviewSummary(state, hunkIds), [state, hunkIds]);

  const accept = useCallback((hunkId: string) => dispatch({ type: 'decide', hunkId, decision: 'accepted' }), []);
  const reject = useCallback((hunkId: string) => dispatch({ type: 'decide', hunkId, decision: 'rejected' }), []);
  const clear = useCallback((hunkId: string) => dispatch({ type: 'decide', hunkId, decision: 'pending' }), []);
  const acceptAll = useCallback(() => dispatch({ type: 'acceptAll' }), []);
  const rejectAll = useCallback(() => dispatch({ type: 'rejectAll' }), []);
  const clearAll = useCallback(() => dispatch({ type: 'clearAll' }), []);
  const reset = useCallback((nextIds: readonly string[]) => dispatch({ type: 'reset', hunkIds: nextIds }), []);

  return { state, summary, accept, reject, clear, acceptAll, rejectAll, clearAll, reset };
}
