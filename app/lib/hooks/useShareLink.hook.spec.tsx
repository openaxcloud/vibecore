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

  it('transitions to ready after build()', () => {
    const { result } = renderHook(() => useShareLink({ origin: 'https://vibecore.io' }));

    let url: string | undefined;
    act(() => {
      url = result.current.build(BUILD_INPUT);
    });

    expect(url).toBeDefined();
    expect(result.current.state.kind).toBe('ready');

    if (result.current.state.kind === 'ready') {
      expect(result.current.state.url).toBe(url);
    }
  });

  it('copyToClipboard writes the latest URL and returns true', async () => {
    const { result } = renderHook(() => useShareLink({ origin: 'https://vibecore.io' }));

    act(() => {
      result.current.build(BUILD_INPUT);
    });

    let copied: boolean | undefined;
    await act(async () => {
      copied = await result.current.copyToClipboard();
    });

    expect(copied).toBe(true);
    expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalledTimes(1);

    if (result.current.state.kind === 'ready') {
      const expectedUrl = result.current.state.url;
      expect(
        (globalThis.navigator.clipboard.writeText as unknown as { mock: { calls: string[][] } }).mock.calls[0][0],
      ).toBe(expectedUrl);
    }
  });

  it('returns false from copyToClipboard when there is no URL yet', async () => {
    const { result } = renderHook(() => useShareLink({ origin: 'https://vibecore.io' }));

    let copied: boolean | undefined;
    await act(async () => {
      copied = await result.current.copyToClipboard();
    });
    expect(copied).toBe(false);
  });

  it('reset() returns to idle', () => {
    const { result } = renderHook(() => useShareLink({ origin: 'https://vibecore.io' }));

    act(() => {
      result.current.build(BUILD_INPUT);
    });
    expect(result.current.state.kind).toBe('ready');

    act(() => {
      result.current.reset();
    });
    expect(result.current.state).toEqual({ kind: 'idle' });
  });

  it('surfaces an error state when the clipboard API is unavailable', async () => {
    vi.stubGlobal('navigator', { ...globalThis.navigator, clipboard: undefined });

    const { result } = renderHook(() => useShareLink({ origin: 'https://vibecore.io' }));

    act(() => {
      result.current.build(BUILD_INPUT);
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
