/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  AGENT_AUTO_APPLY_CHANGED_EVENT,
  AGENT_AUTO_APPLY_STORAGE_KEY,
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

  it('returns false when nothing is stored', () => {
    const { result } = renderHook(() => useAutoApplyEnabled());
    expect(result.current).toBe(false);
  });

  it('returns true when the storage slot already holds "true"', () => {
    window.localStorage.setItem(AGENT_AUTO_APPLY_STORAGE_KEY, 'true');

    const { result } = renderHook(() => useAutoApplyEnabled());
    expect(result.current).toBe(true);
  });

  it('reacts to setAutoApplyEnabled in the same tab via the custom event', () => {
    const { result } = renderHook(() => useAutoApplyEnabled());
    expect(result.current).toBe(false);

    act(() => {
      setAutoApplyEnabled(true);
    });
    expect(result.current).toBe(true);

    act(() => {
      setAutoApplyEnabled(false);
    });
    expect(result.current).toBe(false);
  });

  it('reacts to the native storage event (cross-tab toggle)', () => {
    const { result } = renderHook(() => useAutoApplyEnabled());
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: AGENT_AUTO_APPLY_STORAGE_KEY,
          newValue: 'true',
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
