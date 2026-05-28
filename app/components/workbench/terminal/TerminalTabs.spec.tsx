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
    clear: vi.fn(),
    focus: vi.fn(),
    input: vi.fn(),
    reset: vi.fn(),
    write: vi.fn(),
  };

  return {
    clearRef: vi.fn(),
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
      findNext: terminalHarness.findNext,
      findPrevious: terminalHarness.findPrevious,
      fit: () => undefined,
      getTerminal: () => terminalHarness.xterm,
      reloadStyles: () => undefined,
    }));

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

  it('uses a compact Shell (Terminal) header without the legacy Vibecore tab', () => {
    render(<TerminalTabs panelDefaultSize={100} />);

    expect(screen.getByTestId('terminal-tabs-bar').getAttribute('aria-label')).toBe('Shell (Terminal)');
    expect(screen.queryByText('Vibecore Terminal')).toBeNull();
    expect(screen.queryByPlaceholderText('Find')).toBeNull();
    expect(screen.getByRole('button', { name: /Open shell sessions/i }).textContent).toContain('~/workspace: bash');
    expect(screen.getByRole('button', { name: 'Find in Shell' })).toBeTruthy();
  });

  it('opens Replit-style find controls only after clicking the search icon', () => {
    render(<TerminalTabs panelDefaultSize={100} />);

    fireEvent.click(screen.getByRole('button', { name: 'Find in Shell' }));

    const findInput = screen.getByPlaceholderText('Find');
    fireEvent.change(findInput, { target: { value: 'vite' } });
    fireEvent.keyDown(findInput, { key: 'Enter' });

    expect(terminalHarness.findNext).toHaveBeenCalledWith('vite');

    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(screen.queryByPlaceholderText('Find')).toBeNull();
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
    expect(within(menu).getByText('Clear conversation')).toBeTruthy();
    expect(within(menu).getByText('Restart Shell')).toBeTruthy();

    fireEvent.click(within(menu).getByText('Kill Shell'));
    expect(terminalHarness.xterm.input).toHaveBeenCalledWith('\x03');
  });
});
