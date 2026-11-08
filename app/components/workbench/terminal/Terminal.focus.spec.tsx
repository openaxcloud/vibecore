/**
 * @vitest-environment jsdom
 */

import { act, cleanup, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Terminal } from './Terminal';
import {
  createWorkspaceTerminalReadiness,
  workspaceTerminalReadinessContext,
} from '~/lib/runtime/WorkspaceTerminalReadiness';

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

describe('Terminal attachment waits for the real project workspace', () => {
  const tree = (gate: ReturnType<typeof createWorkspaceTerminalReadiness>, attach: () => void) => (
    <workspaceTerminalReadinessContext.Provider value={gate}>
      <Terminal id="startup-terminal" theme="dark" onTerminalReady={attach} />
    </workspaceTerminalReadinessContext.Provider>
  );

  it('does not attach during cold startup, then attaches exactly once when readiness arrives', () => {
    const gate = createWorkspaceTerminalReadiness();
    const attach = vi.fn();
    const created = vi.fn();
    render(
      <workspaceTerminalReadinessContext.Provider value={gate}>
        <Terminal id="startup-feedback" theme="dark" onTerminalCreated={created} onTerminalReady={attach} />
      </workspaceTerminalReadinessContext.Provider>,
    );
    expect(created).toHaveBeenCalledWith(harness.terminal);
    expect(attach).not.toHaveBeenCalled();
    act(() => gate.open());
    expect(attach).toHaveBeenCalledWith(harness.terminal);
    act(() => gate.open());
    expect(attach).toHaveBeenCalledTimes(1);
  });

  it('cancels a disposed terminal rather than attaching it after a slow start', () => {
    const gate = createWorkspaceTerminalReadiness();
    const attach = vi.fn();
    const ui = render(tree(gate, attach));
    ui.unmount();
    act(() => gate.open());
    expect(attach).not.toHaveBeenCalled();
  });

  it('ignores the old project completion and attaches only after the replacement is ready', () => {
    const oldGate = createWorkspaceTerminalReadiness();
    const newGate = createWorkspaceTerminalReadiness();
    const oldAttach = vi.fn();
    const newAttach = vi.fn();
    const ui = render(tree(oldGate, oldAttach));
    ui.rerender(tree(newGate, newAttach));
    act(() => oldGate.open());
    expect(oldAttach).not.toHaveBeenCalled();
    expect(newAttach).not.toHaveBeenCalled();
    act(() => newGate.open());
    expect(newAttach).toHaveBeenCalledTimes(1);
  });

  it('a failed startup stays unattached and a new readiness attempt can succeed', () => {
    const failed = createWorkspaceTerminalReadiness();
    const retry = createWorkspaceTerminalReadiness();
    const attach = vi.fn();
    const ui = render(tree(failed, attach));
    act(() => failed.close());
    expect(attach).not.toHaveBeenCalled();
    ui.rerender(tree(retry, attach));
    act(() => retry.open());
    expect(attach).toHaveBeenCalledTimes(1);
  });

  it('does not retain the discarded StrictMode attachment during delayed startup', () => {
    const gate = createWorkspaceTerminalReadiness();
    const attach = vi.fn();
    render(<StrictMode>{tree(gate, attach)}</StrictMode>);
    expect(attach).not.toHaveBeenCalled();
    act(() => gate.open());
    expect(attach).toHaveBeenCalledTimes(1);
  });

  it('preserves immediate attachment outside a project workspace', () => {
    const attach = vi.fn();
    render(<Terminal id="local-terminal" theme="dark" onTerminalReady={attach} />);
    expect(attach).toHaveBeenCalledTimes(1);
  });
});
