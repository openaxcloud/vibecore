/**
 * @vitest-environment jsdom
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Terminal } from './Terminal';

/**
 * Reported from an iPhone: the mobile terminal connected (the PTY socket was
 * open and only ever carried its `hello` frame) but accepted no input at all.
 * Tapping it left `document.activeElement` on the container — xterm's hidden
 * input (`.xterm-helper-textarea`, opacity 0 at z-index -5) never took focus,
 * so no keystroke reached the shell and iOS never raised its keyboard.
 *
 * The container must therefore focus the terminal itself on pointer down.
 * `pointerdown` is the one event that covers touch, mouse and pen.
 */
const harness = vi.hoisted(() => {
  const focus = vi.fn();

  const terminal = {
    focus,
    dispose: vi.fn(),
    loadAddon: vi.fn(),
    open: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onResize: vi.fn(() => ({ dispose: vi.fn() })),
    onKey: vi.fn(() => ({ dispose: vi.fn() })),
    attachCustomKeyEventHandler: vi.fn(),
    clear: vi.fn(),
    reset: vi.fn(),
    write: vi.fn(),
    options: {},
    cols: 80,
    rows: 24,
  };

  return { focus, terminal };
});

vi.mock('@xterm/xterm', () => ({ Terminal: vi.fn(() => harness.terminal) }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: vi.fn(() => ({ fit: vi.fn(), dispose: vi.fn() })) }));
vi.mock('@xterm/addon-search', () => ({
  SearchAddon: vi.fn(() => ({
    findNext: vi.fn(),
    findPrevious: vi.fn(),
    clearDecorations: vi.fn(),
    onDidChangeResults: vi.fn(() => ({ dispose: vi.fn() })),
    dispose: vi.fn(),
  })),
}));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: vi.fn(() => ({ dispose: vi.fn() })) }));

// jsdom ships no ResizeObserver; the component observes its container on mount.
globalThis.ResizeObserver ??= class {
  observe() {
    /* no layout in jsdom */
  }
  unobserve() {
    /* no layout in jsdom */
  }
  disconnect() {
    /* no layout in jsdom */
  }
} as unknown as typeof ResizeObserver;

afterEach(() => {
  harness.focus.mockClear();
  cleanup();
});

function tap(element: Element) {
  element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
}

describe('Terminal focus on tap', () => {
  it('focuses the terminal when the surface is tapped', () => {
    const { container } = render(<Terminal id="qa-terminal" theme="dark" className="h-full w-full" />);
    const surface = container.querySelector('.h-full')!;

    expect(harness.focus).not.toHaveBeenCalled();

    tap(surface);

    expect(harness.focus).toHaveBeenCalledTimes(1);
  });

  it('focuses again on every tap, so returning to the terminal always restores input', () => {
    const { container } = render(<Terminal id="qa-terminal" theme="dark" className="h-full w-full" />);
    const surface = container.querySelector('.h-full')!;

    tap(surface);
    tap(surface);

    expect(harness.focus).toHaveBeenCalledTimes(2);
  });

  it('never focuses a read-only terminal, which takes no input by design', () => {
    const { container } = render(<Terminal id="qa-terminal" theme="dark" className="h-full w-full" readonly />);

    tap(container.querySelector('.h-full')!);

    expect(harness.focus).not.toHaveBeenCalled();
  });
});
