/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEditorCompositionHandoff } from './useEditorCompositionHandoff';

const native = vi.hoisted(() => ({ composing: false }));
vi.mock('@vibecore/editor', () => ({ useDesktopEditorComposing: () => native.composing }));

beforeEach(() => {
  native.composing = false;
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function pointer(type: string, id = 1) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: id });
  document.dispatchEvent(event);
}

function tick() {
  act(() => vi.runOnlyPendingTimers());
}

it('waits for actual readiness and lets the final input event finish', () => {
  const hook = renderHook(({ ready }) => useEditorCompositionHandoff(ready), { initialProps: { ready: false } });
  tick();
  expect(hook.result.current).toBe(false);
  hook.rerender({ ready: true });
  expect(hook.result.current).toBe(false);
  tick();
  expect(hook.result.current).toBe(true);
});

it('keeps the shell during composition and activates once after native completion', () => {
  native.composing = true;

  const hook = renderHook(() => useEditorCompositionHandoff(true));
  tick();
  expect(hook.result.current).toBe(false);
  native.composing = false;
  hook.rerender();
  expect(hook.result.current).toBe(false);
  tick();
  expect(hook.result.current).toBe(true);
  native.composing = true;
  hook.rerender();
  expect(hook.result.current).toBe(true);
});

it('cancels a queued activation if composition resumes before the task boundary', () => {
  const hook = renderHook(({ ready }) => useEditorCompositionHandoff(ready), { initialProps: { ready: false } });
  hook.rerender({ ready: true });
  native.composing = true;
  hook.rerender({ ready: true });
  tick();
  expect(hook.result.current).toBe(false);
});

it('does not remove the pointer target before its click completes', () => {
  native.composing = true;

  const hook = renderHook(() => useEditorCompositionHandoff(true));
  act(() => pointer('pointerdown'));
  native.composing = false;
  hook.rerender();
  tick();
  expect(hook.result.current).toBe(false);
  act(() => pointer('pointerup'));
  expect(hook.result.current).toBe(false);

  let receivedClick = false;

  const target = document.createElement('button');

  target.onclick = () => {
    receivedClick = true;
  };
  target.click();
  expect(receivedClick).toBe(true);
  tick();
  tick();
  expect(hook.result.current).toBe(true);
});

it('waits for all pointers and releases on cancellation', () => {
  native.composing = true;

  const hook = renderHook(() => useEditorCompositionHandoff(true));
  act(() => {
    pointer('pointerdown', 1);
    pointer('pointerdown', 2);
  });
  native.composing = false;
  hook.rerender();
  act(() => pointer('pointerup', 1));
  tick();
  expect(hook.result.current).toBe(false);
  act(() => pointer('pointercancel', 2));
  tick();
  tick();
  expect(hook.result.current).toBe(true);
});

it('cleans up pending activation and pointer listeners on unmount', () => {
  const hook = renderHook(({ ready }) => useEditorCompositionHandoff(ready), { initialProps: { ready: false } });
  hook.rerender({ ready: true });
  hook.unmount();
  expect(vi.getTimerCount()).toBe(0);
  act(() => pointer('pointerdown'));
  expect(vi.getTimerCount()).toBe(0);
});

it('releases a pointer gesture that ends outside the window', () => {
  native.composing = true;

  const hook = renderHook(() => useEditorCompositionHandoff(true));
  act(() => pointer('pointerdown'));
  native.composing = false;
  hook.rerender();
  act(() => window.dispatchEvent(new Event('blur')));
  tick();
  tick();
  expect(hook.result.current).toBe(true);
});
