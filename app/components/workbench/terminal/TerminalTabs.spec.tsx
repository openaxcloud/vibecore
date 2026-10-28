/**
 * @vitest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode, useLayoutEffect, type ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TerminalInteractionHandoffBoundary, TerminalInteractionHandoffProvider } from './TerminalInteractionHandoff';
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

describe('Terminal interaction handoff during startup shell replacement', () => {
  const i18n = createI18nInstance('en');

  const tree = (version: number, project = 'a', pane = 'main', slot = 'panel', visible = true) => (
    <I18nextProvider i18n={i18n}>
      <TerminalInteractionHandoffProvider projectId={project} workspaceId="workspace" windowId="window">
        <button data-testid="outside">Outside</button>
        {visible ? <TerminalTabs key={version} paneId={pane} handoffSlot={slot} /> : null}
      </TerminalInteractionHandoffProvider>
    </I18nextProvider>
  );
  const openActions = () => {
    const trigger = screen.getByRole('button', { name: 'More Shell actions' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    return trigger;
  };

  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it.each(['Copy output', 'Shell profile'])(
    'preserves the open menu and %s focus without executing an action',
    (name) => {
      const ui = render(tree(0));
      openActions();

      const control =
        name === 'Shell profile' ? screen.getByRole('combobox', { name }) : screen.getByRole('menuitem', { name });
      control.focus();
      ui.rerender(tree(1));

      const restored =
        name === 'Shell profile' ? screen.getByRole('combobox', { name }) : screen.getByRole('menuitem', { name });
      expect(document.activeElement).toBe(restored);
      expect(control.isConnected).toBe(false);
      expect(workbenchMocks.restartBoltTerminal).not.toHaveBeenCalled();
      expect(terminalHarness.xterm.input).not.toHaveBeenCalled();
      fireEvent.keyDown(restored, { key: 'Escape' });
      expect(screen.queryByRole('menu')).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More Shell actions' }));
    },
  );

  it('transfers focus alone after Escape and never reopens the closed menu', () => {
    const ui = render(tree(0));
    openActions();
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Kill Shell' }), { key: 'Escape' });
    ui.rerender(tree(1));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More Shell actions' }));
  });

  it('does not reopen a menu closed in the same React batch as shell replacement', () => {
    const ui = render(tree(0));
    openActions();

    const kill = screen.getByRole('menuitem', { name: 'Kill Shell' });
    act(() => {
      fireEvent.keyDown(kill, { key: 'Escape' });
      ui.rerender(tree(1));
    });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More Shell actions' }));
  });

  it('preserves the sessions menu selection without starting a shell', () => {
    const ui = render(tree(0));
    const trigger = screen.getByRole('button', { name: /Open shell sessions/ });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'New Shell' }));
    ui.rerender(tree(1));
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'New Shell' }));
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(1);
  });

  it.each(['project', 'pane', 'slot'])('does not transfer across a different %s', (scope) => {
    const ui = render(tree(0));
    openActions();
    ui.rerender(
      tree(
        1,
        scope === 'project' ? 'b' : 'a',
        scope === 'pane' ? 'other' : 'main',
        scope === 'slot' ? 'bottom' : 'panel',
      ),
    );
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it('abandons transfer after focus leaves the toolbar', () => {
    const ui = render(tree(0));
    openActions();
    screen.getByTestId('outside').focus();
    ui.rerender(tree(1));
    expect(document.activeElement).toBe(screen.getByTestId('outside'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('abandons menu and focus restoration when a sibling claims focus during replacement', () => {
    const ClaimFocus = () => {
      useLayoutEffect(() => {
        screen.getByTestId('outside').focus();
      }, []);
      return null;
    };
    const ui = render(
      <>
        {tree(0)}
        {null}
      </>,
    );
    openActions();
    ui.rerender(
      <>
        {tree(1)}
        <ClaimFocus />
      </>,
    );
    expect(document.activeElement).toBe(screen.getByTestId('outside'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does not revive a menu after a later reopen', async () => {
    const ui = render(tree(0));
    openActions();
    ui.rerender(tree(1, 'a', 'main', 'panel', false));
    await Promise.resolve();
    ui.rerender(tree(2));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it('does not reopen a menu on navigation or a later Back', () => {
    const ui = render(tree(0));
    openActions();
    window.history.replaceState({}, '', '/other');
    ui.rerender(tree(1));
    expect(screen.queryByRole('menu')).toBeNull();
    window.history.replaceState({}, '', '/');
    ui.rerender(tree(2));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('consumes a missing session target without reviving focus on a later menu opening', () => {
    window.localStorage.setItem('vibecore-terminal-ui-v1', JSON.stringify({ terminalCount: 1 }));

    const ui = render(tree(0));
    const trigger = screen.getByRole('button', { name: /Open shell sessions/ });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    screen.getAllByRole('menuitemradio')[1].focus();
    window.localStorage.setItem('vibecore-terminal-ui-v1', JSON.stringify({ terminalCount: 0 }));
    ui.rerender(tree(1));
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(1);
    expect(document.activeElement).toBe(document.body);

    const nextTrigger = screen.getByRole('button', { name: /Open shell sessions/ });
    nextTrigger.focus();
    fireEvent.keyDown(nextTrigger, { key: 'Escape' });
    fireEvent.keyDown(nextTrigger, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio'));
  });

  const delayedTree = (version: number, mounted: boolean, active = true) => (
    <I18nextProvider i18n={i18n}>
      <TerminalInteractionHandoffProvider projectId="a" workspaceId="workspace" windowId="window">
        <button data-testid="outside">Outside</button>
        <TerminalInteractionHandoffBoundary key={version} paneId={active ? 'main' : undefined} slot="editor">
          {mounted ? <TerminalTabs paneId="main" handoffSlot="editor" /> : <span>Loading workbench</span>}
        </TerminalInteractionHandoffBoundary>
      </TerminalInteractionHandoffProvider>
    </I18nextProvider>
  );

  it('reserves the active mobile destination across a delayed Workbench mount', async () => {
    const ui = render(delayedTree(0, true));
    openActions();
    screen.getByRole('combobox', { name: 'Shell profile' }).focus();
    ui.rerender(delayedTree(1, false));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    ui.rerender(delayedTree(1, true));
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Shell profile' }));
  });

  it.each(['pointer', 'keyboard', 'focus', 'navigation', 'panel', 'unmount'])(
    'abandons a lazy reservation after %s changes the user destination',
    async (action) => {
      const ui = render(delayedTree(0, true));
      openActions();
      ui.rerender(delayedTree(1, false));
      await act(async () => {
        await Promise.resolve();
      });

      if (action === 'pointer') {
        fireEvent.pointerDown(document.body);
      }

      if (action === 'keyboard') {
        fireEvent.keyDown(document.body, { key: 'Escape' });
      }

      if (action === 'focus') {
        screen.getByTestId('outside').focus();
      }

      if (action === 'navigation') {
        fireEvent.popState(window);
      }

      if (action === 'panel') {
        ui.rerender(delayedTree(1, false, false));
      }

      if (action === 'unmount') {
        ui.rerender(delayedTree(2, false));
      }

      ui.rerender(delayedTree(action === 'unmount' ? 2 : 1, true));
      expect(screen.queryByRole('menu')).toBeNull();
      expect(document.activeElement).not.toBe(screen.queryByRole('menuitem', { name: 'Kill Shell' }));
    },
  );

  it('reserves a lazy destination once under StrictMode effect replay', async () => {
    const ui = render(<StrictMode>{delayedTree(0, true)}</StrictMode>);
    openActions();
    ui.rerender(<StrictMode>{delayedTree(1, false)}</StrictMode>);
    await act(async () => {
      await Promise.resolve();
    });
    ui.rerender(<StrictMode>{delayedTree(1, true)}</StrictMode>);
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Kill Shell' }));
  });

  it('handles StrictMode cleanup without duplicate restoration', () => {
    const ui = render(<StrictMode>{tree(0)}</StrictMode>);
    openActions();
    ui.rerender(<StrictMode>{tree(1)}</StrictMode>);
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Kill Shell' }));
    expect(workbenchMocks.restartBoltTerminal).not.toHaveBeenCalled();
  });
});
