/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useIdeToastLayout } from './useIdeToastLayout';

let compactViewport: boolean;
let listeners: Set<() => void>;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let resizeCallbacks: Array<() => void>;
let observe: ReturnType<typeof vi.fn>;
let disconnect: ReturnType<typeof vi.fn>;

function flushFrames() {
  const pending = [...frames.values()];
  frames.clear();
  act(() => pending.forEach((callback) => callback(0)));
}

beforeEach(() => {
  compactViewport = true;
  listeners = new Set();
  frames = new Map();
  nextFrame = 0;
  resizeCallbacks = [];
  observe = vi.fn();
  disconnect = vi.fn();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resizeCallbacks.push(callback);
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
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

it('keeps IDE notifications readable across desktop/mobile and removes its viewport listener on unmount', async () => {
  const shell = document.createElement('div');
  shell.className = 'bolt-responsive-ide';
  document.body.append(shell);

  const { result, unmount } = renderHook(() => useIdeToastLayout());
  expect(result.current).toBe(true);
  act(() => {
    compactViewport = false;
    listeners.forEach((listener) => listener());
  });
  expect(result.current).toBe(true);
  act(() => {
    compactViewport = true;
    listeners.forEach((listener) => listener());
  });
  expect(result.current).toBe(true);
  unmount();
  expect(listeners.size).toBe(0);
});

function focusedList() {
  const shell = document.createElement('div');
  shell.className = 'bolt-responsive-ide';

  const list = document.createElement('div');
  list.className = 'Toastify__toast-container vc-ide-compact-toasts';

  const button = document.createElement('button');
  list.append(button);
  document.body.append(shell, list);
  Object.defineProperties(list, {
    clientHeight: { value: 100 },
    scrollHeight: { value: 500 },
  });
  vi.spyOn(list, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect);

  let top = 240;
  vi.spyOn(button, 'getBoundingClientRect').mockImplementation(() => ({ top, bottom: top + 44 }) as DOMRect);
  button.focus();

  return {
    list,
    button,
    setTop: (value: number) => {
      top = value;
    },
  };
}

it('keeps the current toast control visible on resize within the compact breakpoint, without moving focus or page', () => {
  const { list, button, setTop } = focusedList();
  const pageScroll = vi.spyOn(window, 'scrollTo');
  const { unmount } = renderHook(() => useIdeToastLayout());
  flushFrames();
  expect(list.scrollTop).toBe(84);
  expect(document.activeElement).toBe(button);
  setTop(70);
  act(() => {
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));
    resizeCallbacks.at(-1)!();
  });
  expect(frames.size).toBe(1);
  flushFrames();
  expect(list.scrollTop).toBe(54);
  expect(document.activeElement).toBe(button);
  expect(pageScroll).not.toHaveBeenCalled();
  unmount();
  pageScroll.mockRestore();
});

it('bounds internal scrolling and ignores an outside focus including a queued resize', () => {
  const { list, setTop } = focusedList();
  renderHook(() => useIdeToastLayout());
  setTop(1000);
  flushFrames();
  expect(list.scrollTop).toBe(400);
  setTop(-1000);
  act(() => window.dispatchEvent(new Event('resize')));
  flushFrames();
  expect(list.scrollTop).toBe(0);
  act(() => window.dispatchEvent(new Event('resize')));

  const outside = document.createElement('button');
  document.body.append(outside);
  outside.focus();
  flushFrames();
  expect(list.scrollTop).toBe(0);
  expect(document.activeElement).toBe(outside);
});

it('disconnects observation and cancels scheduled work when leaving the IDE or unmounting', async () => {
  focusedList();

  const { unmount } = renderHook(() => useIdeToastLayout());
  expect(frames.size).toBe(1);
  await act(async () => document.querySelector('.bolt-responsive-ide')!.remove());
  expect(disconnect).toHaveBeenCalled();
  expect(frames.size).toBe(0);
  act(() => window.dispatchEvent(new Event('resize')));
  expect(frames.size).toBe(0);
  unmount();
});

it('uses the visible Agent pane on desktop, follows its resize, and clears geometry when leaving the IDE', async () => {
  compactViewport = false;

  const shell = document.createElement('div');
  shell.className = 'bolt-responsive-ide';

  const panel = document.createElement('section');
  panel.className = 'bolt-project-agent-panel';

  let width = 320;
  vi.spyOn(panel, 'getBoundingClientRect').mockImplementation(
    () => ({ left: 50, right: 50 + width, top: 80, bottom: 880, width, height: 800 }) as DOMRect,
  );
  shell.append(panel);
  document.body.append(shell);

  const { result } = renderHook(() => useIdeToastLayout());
  expect(result.current).toBe(true);
  expect(document.documentElement.style.getPropertyValue('--vc-ide-toast-left')).toBe('58px');
  expect(document.documentElement.style.getPropertyValue('--vc-ide-toast-width')).toBe('304px');
  act(() => {
    width = 480;
    resizeCallbacks[0]();
  });
  expect(document.documentElement.style.getPropertyValue('--vc-ide-toast-width')).toBe('380px');
  act(() => {
    width = 0;
    resizeCallbacks[0]();
  });
  expect(result.current).toBe(true);
  expect(document.documentElement.style.getPropertyValue('--vc-ide-toast-left')).toBe('');
  act(() => {
    compactViewport = true;
    listeners.forEach((listener) => listener());
  });
  expect(result.current).toBe(true);
  expect(document.documentElement.style.getPropertyValue('--vc-ide-toast-left')).toBe('');
  await act(async () => shell.remove());
  expect(result.current).toBe(false);
});

it('rounds fractional focus repairs toward the clipped edge', () => {
  const { list, setTop } = focusedList();
  setTop(156.125);
  renderHook(() => useIdeToastLayout());
  flushFrames();
  expect(list.scrollTop).toBe(1);
  list.scrollTop = 10;
  setTop(99.875);
  act(() => window.dispatchEvent(new Event('resize')));
  flushFrames();
  expect(list.scrollTop).toBe(9);
});
