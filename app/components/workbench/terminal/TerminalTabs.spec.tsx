/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TerminalTabs } from './TerminalTabs';

const workbenchMocks = vi.hoisted(() => ({
  attachBoltTerminal: vi.fn(),
  attachTerminal: vi.fn(),
  detachTerminal: vi.fn(),
  onTerminalResize: vi.fn(),
  restartBoltTerminal: vi.fn(),
  restartTerminal: vi.fn(),
  toggleTerminal: vi.fn(),
}));

const terminalHarness = vi.hoisted(() => {
  const xterm = {
    buffer: {
      active: {
        viewportY: 3,
        getLine: (row: number) => ({ translateToString: () => `line-${row}` }),
      },
    },
    clear: vi.fn(),
    focus: vi.fn(),
    getSelection: vi.fn(() => ''),
    input: vi.fn(),
    reset: vi.fn(),
    rows: 2,
    write: vi.fn(),
  };

  return {
    clearRef: vi.fn(),
    clearSearch: vi.fn(),
    findNext: vi.fn(),
    findPrevious: vi.fn(),
    xterm,
  };
});

vi.mock('@nanostores/react', () => ({
  useStore: (store: { get: () => unknown }) => store.get(),
}));

vi.mock('react-resizable-panels', async () => {
  const React = await import('react');

  const Panel = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      collapse: () => undefined,
      isCollapsed: () => false,
      resize: () => undefined,
    }));

    return React.createElement('div', { 'data-testid': 'terminal-panel' }, props.children);
  });
  Panel.displayName = 'MockPanel';

  return { Panel };
});

vi.mock('~/lib/hooks', () => ({
  shortcutEventEmitter: {
    on: () => () => undefined,
  },
}));

vi.mock('~/lib/stores/theme', () => ({
  themeStore: {
    get: () => 'dark',
    subscribe: () => () => undefined,
  },
}));

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    showTerminal: { get: () => true },
    ...workbenchMocks,
  },
}));

vi.mock('~/utils/logger', () => ({
  createScopedLogger: () => ({
    debug: () => undefined,
    error: () => undefined,
    warn: () => undefined,
  }),
}));

vi.mock('./TerminalManager', () => ({
  TerminalManager: () => null,
}));

vi.mock('./Terminal', async () => {
  const React = await import('react');

  const Terminal = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      clear: terminalHarness.clearRef,
      clearSearch: terminalHarness.clearSearch,
      findNext: terminalHarness.findNext,
      findPrevious: terminalHarness.findPrevious,
      fit: () => undefined,
      getTerminal: () => terminalHarness.xterm,
      reloadStyles: () => undefined,
    }));

    // Drive the ready callback so spawn-time behaviour (connecting notice) runs.
    React.useEffect(() => {
      props.onTerminalReady?.(terminalHarness.xterm);
    }, []);

    return React.createElement('div', { className: props.className, 'data-testid': props.id });
  });
  Terminal.displayName = 'MockTerminal';

  return { Terminal };
});

describe('<TerminalTabs />', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('uses a compact Shell (Terminal) header without the legacy E-Code tab', () => {
    render(<TerminalTabs panelDefaultSize={100} />);

    expect(screen.getByTestId('terminal-tabs-bar').getAttribute('aria-label')).toBe('Shell (Terminal)');
    expect(screen.queryByText('E-Code Terminal')).toBeNull();
    expect(screen.queryByPlaceholderText('Find')).toBeNull();
    expect(screen.getByRole('button', { name: /Open shell sessions/i }).textContent).toContain('~/workspace: bash');
    expect(screen.getByRole('button', { name: 'Find in Shell' })).toBeTruthy();
  });

  it('opens Replit-style find controls only after clicking the search icon', () => {
    render(<TerminalTabs panelDefaultSize={100} />);

    fireEvent.click(screen.getByRole('button', { name: 'Find in Shell' }));

    const findInput = screen.getByPlaceholderText('Find');
    fireEvent.change(findInput, { target: { value: 'vite' } });

    // Typing runs an incremental highlight-as-you-type search…
    expect(terminalHarness.findNext).toHaveBeenCalledWith('vite', { incremental: true });

    fireEvent.keyDown(findInput, { key: 'Enter' });

    // …while Enter advances to the next match.
    expect(terminalHarness.findNext).toHaveBeenCalledWith('vite');

    fireEvent.keyDown(findInput, { key: 'Enter', shiftKey: true });
    expect(terminalHarness.findPrevious).toHaveBeenCalledWith('vite');

    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(screen.queryByPlaceholderText('Find')).toBeNull();

    // Closing the find bar sweeps match decorations and hands focus back to the shell.
    expect(terminalHarness.clearSearch).toHaveBeenCalled();
    expect(terminalHarness.xterm.focus).toHaveBeenCalled();
  });

  it('copies the selection when one exists', () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } });
    terminalHarness.xterm.getSelection.mockReturnValue('pnpm run dev');

    render(<TerminalTabs panelDefaultSize={100} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith('pnpm run dev');
  });

  it('copies the visible scrollback when nothing is selected', () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } });
    terminalHarness.xterm.getSelection.mockReturnValue('');

    render(<TerminalTabs panelDefaultSize={100} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    // rows=2, viewportY=3 → the two viewport lines of the scrollback.
    expect(writeText).toHaveBeenCalledWith('line-3\nline-4');
  });

  it('opens new shell sessions from the session dropdown', () => {
    render(<TerminalTabs panelDefaultSize={100} />);

    fireEvent.click(screen.getByRole('button', { name: /Open shell sessions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New Shell' }));

    expect(screen.getByRole('button', { name: /Open shell sessions/i }).textContent).toContain('#2');
    expect(screen.getByTestId('terminal_1')).toBeTruthy();
  });

  it('keeps destructive and recovery actions in the Shell menu', () => {
    render(<TerminalTabs panelDefaultSize={100} />);

    fireEvent.click(screen.getByRole('button', { name: 'More Shell actions' }));

    const menu = screen.getByRole('menu', { name: 'More Shell actions' });
    expect(within(menu).getByText('Kill Shell')).toBeTruthy();
    expect(within(menu).getByText('Clear terminal')).toBeTruthy();
    expect(within(menu).getByText('Restart Shell')).toBeTruthy();

    fireEvent.click(within(menu).getByText('Kill Shell'));
    expect(terminalHarness.xterm.input).toHaveBeenCalledWith('\x03');
  });

  it('writes a connecting notice into the terminal on spawn so cold start is not blank', () => {
    render(<TerminalTabs panelDefaultSize={100} />);

    const writes = terminalHarness.xterm.write.mock.calls.map((call) => String(call[0]));
    expect(writes.some((value) => value.includes('Connecting to workspace…'))).toBe(true);
  });

  it('keeps an already-spawned shell labelled with the profile it was created under', () => {
    render(<TerminalTabs panelDefaultSize={100} />);

    // Spawn a second shell while the default (managed) profile is selected.
    fireEvent.click(screen.getByRole('button', { name: /Open shell sessions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New Shell' }));

    // Now switch the Profile <select> to zsh.
    fireEvent.click(screen.getByRole('button', { name: 'More Shell actions' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Shell profile' }), { target: { value: 'zsh' } });

    // The active (already-running) pane must NOT be relabelled to zsh.
    const sessionButton = screen.getByRole('button', { name: /Open shell sessions/i });
    expect(sessionButton.textContent).toContain('~/workspace: bash');
    expect(sessionButton.textContent).not.toContain('zsh');
  });
});
