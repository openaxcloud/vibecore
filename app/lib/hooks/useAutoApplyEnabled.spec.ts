/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  AGENT_AUTO_APPLY_CHANGED_EVENT,
  AGENT_AUTO_APPLY_STORAGE_KEY,
  readAutoApplyFromStorage,
  setAutoApplyEnabled,
  useAutoApplyEnabled,
} from './useAutoApplyEnabled';

describe('useAutoApplyEnabled', () => {
  beforeEach(() => {
    window.localStorage.removeItem(AGENT_AUTO_APPLY_STORAGE_KEY);
  });

  afterEach(() => {
    window.localStorage.removeItem(AGENT_AUTO_APPLY_STORAGE_KEY);
  });

  it('returns true when nothing is stored', () => {
    const { result } = renderHook(() => useAutoApplyEnabled());
    expect(result.current).toBe(true);
  });

  it('returns true when the storage slot already holds "true"', () => {
    window.localStorage.setItem(AGENT_AUTO_APPLY_STORAGE_KEY, 'true');

    const { result } = renderHook(() => useAutoApplyEnabled());
    expect(result.current).toBe(true);
  });

  it('ignores legacy stored "false" values', () => {
    window.localStorage.setItem(AGENT_AUTO_APPLY_STORAGE_KEY, 'false');

    const { result } = renderHook(() => useAutoApplyEnabled());
    expect(result.current).toBe(true);
    expect(readAutoApplyFromStorage()).toBe(true);
  });

  it('normalizes writes to enabled in the same tab via the custom event', () => {
    window.localStorage.setItem(AGENT_AUTO_APPLY_STORAGE_KEY, 'false');

    const { result } = renderHook(() => useAutoApplyEnabled());
    expect(result.current).toBe(true);

    act(() => {
      setAutoApplyEnabled(true);
    });
    expect(result.current).toBe(true);
    expect(window.localStorage.getItem(AGENT_AUTO_APPLY_STORAGE_KEY)).toBe('true');

    act(() => {
      setAutoApplyEnabled(false);
    });
    expect(result.current).toBe(true);
    expect(window.localStorage.getItem(AGENT_AUTO_APPLY_STORAGE_KEY)).toBe('true');
  });

  it('ignores cross-tab attempts to disable auto-apply', () => {
    window.localStorage.setItem(AGENT_AUTO_APPLY_STORAGE_KEY, 'false');

    const { result } = renderHook(() => useAutoApplyEnabled());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: AGENT_AUTO_APPLY_STORAGE_KEY,
          newValue: 'false',
        }),
      );
    });
    expect(result.current).toBe(true);
  });

  it('falls back to enabled when the cross-tab preference is removed', () => {
    window.localStorage.setItem(AGENT_AUTO_APPLY_STORAGE_KEY, 'false');

    const { result } = renderHook(() => useAutoApplyEnabled());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: AGENT_AUTO_APPLY_STORAGE_KEY,
          newValue: null,
        }),
      );
    });
    expect(result.current).toBe(true);
  });

  it('ignores unrelated storage events', () => {
    window.localStorage.setItem(AGENT_AUTO_APPLY_STORAGE_KEY, 'true');

    const { result } = renderHook(() => useAutoApplyEnabled());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'something-else',
          newValue: 'false',
        }),
      );
    });
    expect(result.current).toBe(true);
  });

  it('falls back to reading storage when the custom event has no detail', () => {
    const { result } = renderHook(() => useAutoApplyEnabled());

    act(() => {
      window.localStorage.setItem(AGENT_AUTO_APPLY_STORAGE_KEY, 'true');
      window.dispatchEvent(new Event(AGENT_AUTO_APPLY_CHANGED_EVENT));
    });
    expect(result.current).toBe(true);
  });
});
