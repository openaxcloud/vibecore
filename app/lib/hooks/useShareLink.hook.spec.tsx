/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import type { Message } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useShareLink } from './useShareLink';

const MESSAGES: Message[] = [
  { id: 'u1', role: 'user', content: 'hello' },
  { id: 'a1', role: 'assistant', content: 'hi' },
];

const BUILD_INPUT = {
  conversationId: 'conv-1',
  projectId: 'proj-1',
  authorUserId: 'user-1',
  title: 'Demo',
  messages: MESSAGES,
};

function mockFetchToken(token = 'cshare_abc.sig123') {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 201,
    json: vi.fn().mockResolvedValue({ token }),
  });
  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

describe('useShareLink hook', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {
      ...globalThis.navigator,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts in the idle state', () => {
    const { result } = renderHook(() => useShareLink({ origin: 'https://vibecore.io' }));
    expect(result.current.state).toEqual({ kind: 'idle' });
  });

  it('transitions to ready with a /share/<token> URL after build()', async () => {
    const fetchMock = mockFetchToken('cshare_abc.sig123');
    const { result } = renderHook(() => useShareLink({ origin: 'https://vibecore.io' }));

    let url: string | undefined;
    await act(async () => {
      url = await result.current.build(BUILD_INPUT);
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/chat-share', expect.objectContaining({ method: 'POST' }));
    expect(url).toBe('https://vibecore.io/share/cshare_abc.sig123');
    expect(result.current.state.kind).toBe('ready');

    if (result.current.state.kind === 'ready') {
      expect(result.current.state.url).toBe(url);
    }
  });

  it('surfaces an error when the server rejects the share', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ error: 'Unauthorized' }),
      }),
    );

    const { result } = renderHook(() => useShareLink({ origin: 'https://vibecore.io' }));

    let url: string | undefined;
    await act(async () => {
      url = await result.current.build(BUILD_INPUT);
    });

    expect(url).toBeUndefined();
    expect(result.current.state.kind).toBe('error');

    if (result.current.state.kind === 'error') {
      expect(result.current.state.message).toBe('Unauthorized');
    }
  });

  it('copyToClipboard writes the latest URL and returns true', async () => {
    mockFetchToken('cshare_abc.sig123');

    const { result } = renderHook(() => useShareLink({ origin: 'https://vibecore.io' }));

    await act(async () => {
      await result.current.build(BUILD_INPUT);
    });

    let copied: boolean | undefined;
    await act(async () => {
      copied = await result.current.copyToClipboard();
    });

    expect(copied).toBe(true);
    expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(
      (globalThis.navigator.clipboard.writeText as unknown as { mock: { calls: string[][] } }).mock.calls[0][0],
    ).toBe('https://vibecore.io/share/cshare_abc.sig123');
  });

  it('returns false from copyToClipboard when there is no URL yet', async () => {
    const { result } = renderHook(() => useShareLink({ origin: 'https://vibecore.io' }));

    let copied: boolean | undefined;
    await act(async () => {
      copied = await result.current.copyToClipboard();
    });
    expect(copied).toBe(false);
  });

  it('reset() returns to idle', async () => {
    mockFetchToken();

    const { result } = renderHook(() => useShareLink({ origin: 'https://vibecore.io' }));

    await act(async () => {
      await result.current.build(BUILD_INPUT);
    });
    expect(result.current.state.kind).toBe('ready');

    act(() => {
      result.current.reset();
    });
    expect(result.current.state).toEqual({ kind: 'idle' });
  });

  it('surfaces an error state when the clipboard API is unavailable', async () => {
    mockFetchToken();
    vi.stubGlobal('navigator', { ...globalThis.navigator, clipboard: undefined });

    const { result } = renderHook(() => useShareLink({ origin: 'https://vibecore.io' }));

    await act(async () => {
      await result.current.build(BUILD_INPUT);
    });

    await act(async () => {
      await result.current.copyToClipboard();
    });

    expect(result.current.state.kind).toBe('error');

    if (result.current.state.kind === 'error') {
      expect(result.current.state.message).toMatch(/Clipboard/);
    }
  });
});
