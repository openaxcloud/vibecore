/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TerminalTabs } from './TerminalTabs';
import { useKeybindings } from '~/lib/hooks/useKeybindings';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderTabs(ui: ReactElement, language: 'en' | 'fr' = 'en') {
  return render(<I18nextProvider i18n={createI18nInstance(language)}>{ui}</I18nextProvider>);
}

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
    renderTabs(<TerminalTabs panelDefaultSize={100} />);

    expect(screen.getByTestId('terminal-tabs-bar').getAttribute('aria-label')).toBe('Shell (Terminal)');
    expect(screen.queryByText('E-Code Terminal')).toBeNull();
    expect(screen.queryByPlaceholderText('Find')).toBeNull();
    expect(screen.getByRole('button', { name: /Open shell sessions/i }).textContent).toContain('~/workspace: bash');
    expect(screen.getByRole('button', { name: 'Find in Shell' })).toBeTruthy();
  });

  it('opens Replit-style find controls only after clicking the search icon', () => {
    renderTabs(<TerminalTabs panelDefaultSize={100} />);

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

    renderTabs(<TerminalTabs panelDefaultSize={100} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith('pnpm run dev');
  });

  it('copies the visible scrollback when nothing is selected', () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } });
    terminalHarness.xterm.getSelection.mockReturnValue('');

    renderTabs(<TerminalTabs panelDefaultSize={100} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    // rows=2, viewportY=3 → the two viewport lines of the scrollback.
    expect(writeText).toHaveBeenCalledWith('line-3\nline-4');
  });

  it('opens new shell sessions from the session dropdown', () => {
    renderTabs(<TerminalTabs panelDefaultSize={100} />);

    fireEvent.click(screen.getByRole('button', { name: /Open shell sessions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New Shell' }));

    expect(screen.getByRole('button', { name: /Open shell sessions/i }).textContent).toContain('#2');
    expect(screen.getByTestId('terminal_1')).toBeTruthy();
  });

  it('keeps destructive and recovery actions in the Shell menu', () => {
    renderTabs(<TerminalTabs panelDefaultSize={100} />);

    fireEvent.click(screen.getByRole('button', { name: 'More Shell actions' }));

    const menu = screen.getByRole('menu', { name: 'More Shell actions' });
    expect(within(menu).getByText('Kill Shell')).toBeTruthy();
    expect(within(menu).getByText('Clear terminal')).toBeTruthy();
    expect(within(menu).getByText('Restart Shell')).toBeTruthy();

    fireEvent.click(within(menu).getByText('Kill Shell'));
    expect(terminalHarness.xterm.input).toHaveBeenCalledWith('\x03');
  });

  it.each(['sessions', 'actions'])('focuses and navigates the %s menu, restoring its trigger on Escape', (kind) => {
    renderTabs(<TerminalTabs panelDefaultSize={100} />);

    const trigger = screen.getByRole('button', {
      name: kind === 'sessions' ? /Open shell sessions/i : 'More Shell actions',
    });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    const menu = screen.getByRole('menu');
    const controls = within(menu).getAllByRole(kind === 'sessions' ? 'menuitemradio' : 'menuitem');
    expect(document.activeElement).toBe(controls[0]);
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(controls[0]);
    fireEvent.keyDown(document.activeElement!, { key: 'End' });

    const last =
      kind === 'sessions'
        ? within(menu).getByRole('menuitem', { name: 'New Shell' })
        : within(menu).getByRole('combobox');
    expect(document.activeElement).toBe(last);

    // Native select arrows/Home/End must not be captured by menu navigation.
    if (kind === 'actions') {
      expect(fireEvent.keyDown(last, { key: 'ArrowUp' })).toBe(true);
      controls[controls.length - 1].focus();
    }

    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(controls[0]);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).not.toBe(controls[0]);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('focuses on click, leaves Tab native, and closes on outside focus without stealing it', () => {
    renderTabs(
      <>
        <TerminalTabs panelDefaultSize={100} />
        <button>Outside</button>
      </>,
    );

    const trigger = screen.getByRole('button', { name: 'More Shell actions' });
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Kill Shell' }));
    expect(fireEvent.keyDown(document.activeElement!, { key: 'Tab' })).toBe(true);
    fireEvent.blur(document.activeElement!, { relatedTarget: screen.getByRole('button', { name: 'Outside' }) });
    screen.getByRole('button', { name: 'Outside' }).focus();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement?.textContent).toBe('Outside');
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
    screen.getByRole('button', { name: 'Outside' }).focus();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement?.textContent).toBe('Outside');
  });

  it('keeps session creation, closing and disabled-limit navigation usable', () => {
    renderTabs(<TerminalTabs panelDefaultSize={100} />);

    const trigger = screen.getByRole('button', { name: /Open shell sessions/i });

    for (let i = 0; i < 3; i++) {
      fireEvent.click(trigger);
      fireEvent.click(screen.getByRole('menuitem', { name: 'New Shell' }));
      expect(document.activeElement).toBe(trigger);
    }
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });

    const menu = screen.getByRole('menu');
    expect((within(menu).getByRole('menuitem', { name: 'New Shell' }) as HTMLButtonElement).disabled).toBe(true);

    const closeButtons = within(menu).getAllByRole('menuitem', { name: /Close ~\/workspace/ });
    expect(document.activeElement).toBe(closeButtons[closeButtons.length - 1]);
    fireEvent.click(document.activeElement!);
    expect(workbenchMocks.detachTerminal).toHaveBeenCalled();
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(3);
    expect(document.activeElement).toBe(within(menu).getAllByRole('menuitemradio')[0]);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: 'New Shell' }));
    fireEvent.click(within(menu).getAllByRole('menuitemradio')[1]);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('preserves restart and kill commands and keeps profile selection native', () => {
    renderTabs(<TerminalTabs panelDefaultSize={100} />);

    const trigger = screen.getByRole('button', { name: 'More Shell actions' });
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });

    const profile = screen.getByRole('combobox', { name: 'Shell profile' });
    expect(document.activeElement).toBe(profile);

    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
      expect(fireEvent.keyDown(profile, { key })).toBe(true);
      expect(document.activeElement).toBe(profile);
    }
    fireEvent.change(profile, { target: { value: 'zsh' } });
    expect((profile as HTMLSelectElement).value).toBe('zsh');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restart Shell' }));
    expect(workbenchMocks.restartBoltTerminal).toHaveBeenCalledWith(terminalHarness.xterm);
    expect(terminalHarness.xterm.focus).toHaveBeenCalled();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Kill Shell' }));
    expect(terminalHarness.xterm.input).toHaveBeenCalledWith('\x03');
    expect(document.activeElement).toBe(trigger);
  });

  it('owns Escape ahead of the real global keybinding capture listener', () => {
    const globalAction = vi.fn();

    function Harness() {
      useKeybindings({
        bindings: [{ combo: 'escape', action: 'overlay.close', label: '', description: '', category: 'Help' }],
        getContext: () => ({}),
        runAction: globalAction,
      });
      return <TerminalTabs panelDefaultSize={100} />;
    }
    renderTabs(<Harness />);

    for (const name of ['More Shell actions', /Open shell sessions/]) {
      const trigger = screen.getByRole('button', { name });
      fireEvent.click(trigger);
      fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
      expect(screen.queryByRole('menu')).toBeNull();
      expect(document.activeElement).toBe(trigger);
      expect(globalAction).not.toHaveBeenCalled();
    }

    // Closed menus no longer claim Escape from the global IDE binding.
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(globalAction).toHaveBeenCalledOnce();
  });

  it('writes a connecting notice into the terminal on spawn so cold start is not blank', () => {
    renderTabs(<TerminalTabs panelDefaultSize={100} />);

    const writes = terminalHarness.xterm.write.mock.calls.map((call) => String(call[0]));
    expect(writes.some((value) => value.includes('Connecting to workspace…'))).toBe(true);
  });

  it('keeps an already-spawned shell labelled with the profile it was created under', () => {
    renderTabs(<TerminalTabs panelDefaultSize={100} />);

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

  it('renders the terminal bar and menus in French without leaking raw keys', () => {
    const { container } = renderTabs(<TerminalTabs panelDefaultSize={100} />, 'fr');

    // Frozen technical label stays identical in French.
    expect(screen.getByTestId('terminal-tabs-bar').getAttribute('aria-label')).toBe('Shell (Terminal)');

    // Localized controls resolve to French copy.
    expect(screen.getByRole('button', { name: 'Copier' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ouvrir les sessions shell/i })).toBeTruthy();

    // Open the more-menu and the find bar to exercise the deeper strings.
    fireEvent.click(screen.getByRole('button', { name: 'Plus d’actions du shell' }));

    const menu = screen.getByRole('menu', { name: 'Plus d’actions du shell' });
    expect(within(menu).getByText('Arrêter le shell')).toBeTruthy();
    expect(within(menu).getByText('Redémarrer le shell')).toBeTruthy();
    expect(within(menu).getByText('Vue divisée')).toBeTruthy();
    expect(within(menu).getByText('Taille PTY')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Rechercher dans le shell' }));
    expect(screen.getByPlaceholderText('Rechercher')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Quitter' })).toBeTruthy();

    // No raw i18n key ever reaches the DOM.
    expect(container.textContent).not.toMatch(/terminalTabs\./);
  });
});
