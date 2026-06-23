/**
 * @vitest-environment jsdom
 */

import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TerminalManager } from './TerminalManager';

/**
 * Regression test for the double-paste bug.
 *
 * xterm.js handles clipboard paste natively (browser `paste` event -> hidden
 * textarea -> onData -> PTY). TerminalManager previously ALSO wired a manual
 * `terminal.onKey(...)` handler that read the clipboard and called
 * `terminal.paste(text)`, causing every Cmd/Ctrl+V to be delivered twice.
 *
 * The fix removes the manual handler entirely. These tests run the component's
 * effects (jsdom) and assert it neither subscribes via onKey nor calls paste,
 * so a single native paste reaches the PTY exactly once.
 */

afterEach(() => cleanup());

function makeFakeTerminal() {
  return {
    onKey: vi.fn(() => ({ dispose: vi.fn() })),
    paste: vi.fn(),
    focus: vi.fn(),
  };
}

describe('TerminalManager paste handling', () => {
  it('does not subscribe to onKey for paste', () => {
    const terminal = makeFakeTerminal();

    render(createElement(TerminalManager, { terminal: terminal as unknown as never, isActive: true }));

    expect(terminal.onKey).not.toHaveBeenCalled();
  });

  it('never calls terminal.paste() itself (xterm handles paste natively)', () => {
    const terminal = makeFakeTerminal();

    render(createElement(TerminalManager, { terminal: terminal as unknown as never, isActive: true }));

    expect(terminal.paste).not.toHaveBeenCalled();
  });
});
