/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useIdeToastLayout } from './useIdeToastLayout';

let compactViewport: boolean;
let listeners: Set<() => void>;

beforeEach(() => {
  compactViewport = true;
  listeners = new Set();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return compactViewport;
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    })),
  );
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it.each(['bolt-project-ide-shell', 'bolt-responsive-ide'])(
  'follows mounting and leaving the actual %s shell',
  async (className) => {
    const { result } = renderHook(() => useIdeToastLayout());
    expect(result.current).toBe(false);

    const shell = document.createElement('div');
    shell.className = className;
    await act(async () => {
      document.body.append(shell);
    });
    expect(result.current).toBe(true);
    await act(async () => {
      shell.remove();
    });
    expect(result.current).toBe(false);
  },
);

it('restores desktop stacking on resize and removes its viewport listener on unmount', async () => {
  const shell = document.createElement('div');
  shell.className = 'bolt-responsive-ide';
  document.body.append(shell);

  const { result, unmount } = renderHook(() => useIdeToastLayout());
  expect(result.current).toBe(true);
  act(() => {
    compactViewport = false;
    listeners.forEach((listener) => listener());
  });
  expect(result.current).toBe(false);
  act(() => {
    compactViewport = true;
    listeners.forEach((listener) => listener());
  });
  expect(result.current).toBe(true);
  unmount();
  expect(listeners.size).toBe(0);
});
