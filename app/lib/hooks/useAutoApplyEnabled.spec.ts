/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  REQUIRE_AI_CHANGE_REVIEW_CHANGED_EVENT,
  REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY,
  readAutoApplyFromStorage,
  readRequireAiChangeReviewFromStorage,
  setAutoApplyEnabled,
  setRequireAiChangeReview,
  useAutoApplyEnabled,
  useRequireAiChangeReview,
} from './useAutoApplyEnabled';

describe('require-review / auto-apply setting', () => {
  beforeEach(() => {
    window.localStorage.removeItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY);
  });

  afterEach(() => {
    window.localStorage.removeItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY);
  });

  it('defaults to auto-apply (review NOT required) when nothing is stored', () => {
    expect(readRequireAiChangeReviewFromStorage()).toBe(false);
    expect(readAutoApplyFromStorage()).toBe(true);

    const { result } = renderHook(() => useAutoApplyEnabled());
    expect(result.current).toBe(true);

    const { result: reviewResult } = renderHook(() => useRequireAiChangeReview());
    expect(reviewResult.current).toBe(false);
  });

  it('keeps automatic application enabled despite a legacy review preference', () => {
    window.localStorage.setItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY, 'true');

    expect(readRequireAiChangeReviewFromStorage()).toBe(true);
    expect(readAutoApplyFromStorage()).toBe(false);

    const { result } = renderHook(() => useAutoApplyEnabled());
    expect(result.current).toBe(true);
  });

  it('does not restore a manual gate from a legacy same-tab toggle', () => {
    const { result } = renderHook(() => useAutoApplyEnabled());
    expect(result.current).toBe(true);

    act(() => {
      setRequireAiChangeReview(true);
    });
    expect(result.current).toBe(true);
    expect(window.localStorage.getItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY)).toBe('true');

    act(() => {
      setRequireAiChangeReview(false);
    });
    expect(result.current).toBe(true);
    expect(window.localStorage.getItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY)).toBe('false');
  });

  it('preserves the legacy setter without disabling the Agent flow', () => {
    const { result } = renderHook(() => useAutoApplyEnabled());

    act(() => {
      setAutoApplyEnabled(false);
    });
    expect(result.current).toBe(true);
    expect(window.localStorage.getItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY)).toBe('true');

    act(() => {
      setAutoApplyEnabled(true);
    });
    expect(result.current).toBe(true);
    expect(window.localStorage.getItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY)).toBe('false');
  });

  it('does not restore a manual gate from cross-tab storage', () => {
    const { result } = renderHook(() => useAutoApplyEnabled());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY, newValue: 'true' }),
      );
    });
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY, newValue: null }));
    });
    expect(result.current).toBe(true);
  });

  it('ignores unrelated storage events', () => {
    window.localStorage.setItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY, 'true');

    const { result } = renderHook(() => useAutoApplyEnabled());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'something-else', newValue: 'false' }));
    });
    expect(result.current).toBe(true);
  });

  it('does not restore a manual gate from a custom event without detail', () => {
    const { result } = renderHook(() => useAutoApplyEnabled());

    act(() => {
      window.localStorage.setItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY, 'true');
      window.dispatchEvent(new Event(REQUIRE_AI_CHANGE_REVIEW_CHANGED_EVENT));
    });
    expect(result.current).toBe(true);
  });
});
