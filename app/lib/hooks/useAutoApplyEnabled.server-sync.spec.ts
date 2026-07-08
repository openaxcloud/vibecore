/**
 * @vitest-environment jsdom
 *
 * #23: the require-review / auto-apply setting must survive reload AND follow the
 * user across devices, not live in localStorage only. These cases exercise the
 * server reconciliation layer (`/api/user/preferences`) with a mocked `fetch`.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY,
  __resetRequireAiChangeReviewServerCache,
  setRequireAiChangeReview,
  useRequireAiChangeReview,
} from './useAutoApplyEnabled';

describe('require-ai-change-review server persistence (#23)', () => {
  beforeEach(() => {
    window.localStorage.removeItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY);
    __resetRequireAiChangeReviewServerCache();
  });

  afterEach(() => {
    window.localStorage.removeItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY);
    __resetRequireAiChangeReviewServerCache();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('adopts the persisted server value on mount even with nothing stored locally (cross-device)', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ preferences: { requireAiChangeReview: true } }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useRequireAiChangeReview());

    // Starts from the local default (review NOT required)…
    expect(result.current).toBe(false);

    // …then reconciles to the value persisted for this signed-in user.
    await waitFor(() => expect(result.current).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/user/preferences',
      expect.objectContaining({ headers: expect.objectContaining({ accept: 'application/json' }) }),
    );

    // The local cache is updated too, so a plain reload keeps the choice.
    expect(window.localStorage.getItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY)).toBe('true');
  });

  it('PATCHes the server preferences blob when the user changes the setting', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);

    act(() => {
      setRequireAiChangeReview(true);
    });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/user/preferences',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ preferences: { requireAiChangeReview: true } }),
        }),
      ),
    );
  });

  it('keeps the local value when the backend is unauthenticated (401) or offline', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);
    window.localStorage.setItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY, 'true');

    const { result } = renderHook(() => useRequireAiChangeReview());
    expect(result.current).toBe(true);

    // Server had no usable value → localStorage stays the source of truth.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current).toBe(true);
  });

  it('issues a single GET across multiple hook consumers on the same page', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ preferences: {} }) }));
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useRequireAiChangeReview());
    renderHook(() => useRequireAiChangeReview());
    renderHook(() => useRequireAiChangeReview());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const gets = fetchMock.mock.calls.filter(
      ([, init]) => (init as { method?: string } | undefined)?.method === undefined,
    );
    expect(gets).toHaveLength(1);
  });
});
