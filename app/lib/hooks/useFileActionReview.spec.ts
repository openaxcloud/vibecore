import { describe, expect, it } from 'vitest';

import { fileActionReviewReducer, initFileActionReview, selectFileActionReviewSummary } from './useFileActionReview';

describe('fileActionReviewReducer', () => {
  it('initialises every hunk to pending', () => {
    const state = initFileActionReview(['h1', 'h2', 'h3']);

    expect(state.decisions).toEqual({ h1: 'pending', h2: 'pending', h3: 'pending' });
  });

  it('records an accept decision and leaves other hunks alone', () => {
    const state = initFileActionReview(['h1', 'h2']);

    const next = fileActionReviewReducer(state, { type: 'decide', hunkId: 'h2', decision: 'accepted' });

    expect(next.decisions).toEqual({ h1: 'pending', h2: 'accepted' });
    expect(next).not.toBe(state);
  });

  it('returns the same state object when the decision is unchanged', () => {
    const state = initFileActionReview(['h1']);
    const decided = fileActionReviewReducer(state, { type: 'decide', hunkId: 'h1', decision: 'rejected' });

    const reapplied = fileActionReviewReducer(decided, { type: 'decide', hunkId: 'h1', decision: 'rejected' });

    expect(reapplied).toBe(decided);
  });

  it('acceptAll / rejectAll flip every hunk', () => {
    const state = initFileActionReview(['a', 'b', 'c']);

    const accepted = fileActionReviewReducer(state, { type: 'acceptAll' });
    expect(Object.values(accepted.decisions)).toEqual(['accepted', 'accepted', 'accepted']);

    const rejected = fileActionReviewReducer(accepted, { type: 'rejectAll' });
    expect(Object.values(rejected.decisions)).toEqual(['rejected', 'rejected', 'rejected']);
  });

  it('clearAll resets every hunk back to pending', () => {
    const state = initFileActionReview(['a', 'b']);
    const accepted = fileActionReviewReducer(state, { type: 'acceptAll' });

    const cleared = fileActionReviewReducer(accepted, { type: 'clearAll' });
    expect(Object.values(cleared.decisions)).toEqual(['pending', 'pending']);
  });

  it('reset switches the state machine to a new set of hunks', () => {
    const state = initFileActionReview(['a', 'b']);
    const next = fileActionReviewReducer(state, { type: 'reset', hunkIds: ['x', 'y', 'z'] });

    expect(Object.keys(next.decisions)).toEqual(['x', 'y', 'z']);
    expect(Object.values(next.decisions)).toEqual(['pending', 'pending', 'pending']);
  });
});

describe('selectFileActionReviewSummary', () => {
  it('partitions hunk ids into accepted / rejected / pending buckets', () => {
    let state = initFileActionReview(['h1', 'h2', 'h3', 'h4']);
    state = fileActionReviewReducer(state, { type: 'decide', hunkId: 'h1', decision: 'accepted' });
    state = fileActionReviewReducer(state, { type: 'decide', hunkId: 'h2', decision: 'rejected' });
    state = fileActionReviewReducer(state, { type: 'decide', hunkId: 'h3', decision: 'accepted' });

    const summary = selectFileActionReviewSummary(state, ['h1', 'h2', 'h3', 'h4']);

    expect([...summary.acceptedIds]).toEqual(['h1', 'h3']);
    expect([...summary.rejectedIds]).toEqual(['h2']);
    expect([...summary.pendingIds]).toEqual(['h4']);
    expect(summary.acceptedCount).toBe(2);
    expect(summary.rejectedCount).toBe(1);
    expect(summary.pendingCount).toBe(1);
    expect(summary.isFullyDecided).toBe(false);
    expect(summary.hasAccepted).toBe(true);
  });

  it('reports isFullyDecided once every hunk has a non-pending decision', () => {
    let state = initFileActionReview(['h1', 'h2']);
    state = fileActionReviewReducer(state, { type: 'acceptAll' });

    const summary = selectFileActionReviewSummary(state, ['h1', 'h2']);

    expect(summary.isFullyDecided).toBe(true);
    expect(summary.acceptedCount).toBe(2);
  });

  it('treats unknown hunk ids as pending — defends against stale references', () => {
    const state = initFileActionReview(['h1']);
    const summary = selectFileActionReviewSummary(state, ['h1', 'h-orphan']);

    expect(summary.pendingIds.has('h-orphan')).toBe(true);
    expect(summary.acceptedCount).toBe(0);
    expect(summary.rejectedCount).toBe(0);
  });

  it('returns isFullyDecided = false for an empty hunk set', () => {
    const state = initFileActionReview([]);
    const summary = selectFileActionReviewSummary(state, []);

    expect(summary.isFullyDecided).toBe(false);
    expect(summary.pendingCount).toBe(0);
  });
});
