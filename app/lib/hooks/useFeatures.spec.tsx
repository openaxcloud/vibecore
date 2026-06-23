/**
 * @vitest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFeatures } from './useFeatures';
import * as featuresApi from '~/lib/api/features';
import type { Feature } from '~/lib/api/features';

const VIEWED_FEATURES_KEY = 'bolt_viewed_features';

const FEATURES: Feature[] = [
  { id: 'a', name: 'A', description: 'a', viewed: false, releaseDate: '2026-01-01' },
  { id: 'b', name: 'B', description: 'b', viewed: false, releaseDate: '2026-01-02' },
  { id: 'c', name: 'C', description: 'c', viewed: false, releaseDate: '2026-01-03' },
];

describe('useFeatures.acknowledgeAllFeatures', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(featuresApi, 'getFeatureFlags').mockResolvedValue(FEATURES);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('persists every viewed id when all mark-viewed POSTs succeed', async () => {
    vi.spyOn(featuresApi, 'markFeatureViewed').mockResolvedValue(undefined);

    const { result } = renderHook(() => useFeatures());

    await waitFor(() => expect(result.current.hasNewFeatures).toBe(true));
    expect(result.current.unviewedFeatures).toHaveLength(3);

    await act(async () => {
      await result.current.acknowledgeAllFeatures();
    });

    expect(result.current.hasNewFeatures).toBe(false);
    expect(result.current.unviewedFeatures).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem(VIEWED_FEATURES_KEY)!).sort()).toEqual(['a', 'b', 'c']);
  });

  it('persists the succeeded ids and keeps only the failed feature when one POST fails', async () => {
    vi.spyOn(featuresApi, 'markFeatureViewed').mockImplementation(async (id: string) => {
      if (id === 'b') {
        throw new Error('Feature viewed request failed: 500');
      }
    });

    const { result } = renderHook(() => useFeatures());

    await waitFor(() => expect(result.current.unviewedFeatures).toHaveLength(3));

    await act(async () => {
      await result.current.acknowledgeAllFeatures();
    });

    // a and c succeeded server-side, so they must be persisted and removed from the badge list.
    expect(JSON.parse(localStorage.getItem(VIEWED_FEATURES_KEY)!).sort()).toEqual(['a', 'c']);
    expect(result.current.unviewedFeatures.map((f) => f.id)).toEqual(['b']);

    // b is still unviewed, so the badge stays lit (but only for the one real failure).
    expect(result.current.hasNewFeatures).toBe(true);
  });

  it('does not persist anything when every POST fails', async () => {
    vi.spyOn(featuresApi, 'markFeatureViewed').mockRejectedValue(new Error('Feature viewed request failed: 500'));

    const { result } = renderHook(() => useFeatures());

    await waitFor(() => expect(result.current.unviewedFeatures).toHaveLength(3));

    await act(async () => {
      await result.current.acknowledgeAllFeatures();
    });

    expect(localStorage.getItem(VIEWED_FEATURES_KEY)).toBeNull();
    expect(result.current.unviewedFeatures).toHaveLength(3);
    expect(result.current.hasNewFeatures).toBe(true);
  });
});
