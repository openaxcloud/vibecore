import { useStore } from '@nanostores/react';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, type ImperativePanelHandle } from 'react-resizable-panels';
import { Terminal, type TerminalRef } from './Terminal';
import { TerminalManager } from './TerminalManager';
import { shortcutEventEmitter } from '~/lib/hooks';
import { themeStore } from '~/lib/stores/theme';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Terminal');

const MAX_TERMINALS = 4;
const TERMINAL_UI_STORAGE_KEY = 'vibecore-terminal-ui-v1';
const TERMINAL_PANEL_LABEL = 'Shell (Terminal)';
const TERMINAL_WORKSPACE_LABEL = '~/workspace';
export const DEFAULT_TERMINAL_SIZE = 34;

type TerminalProfile = 'managed' | 'bash' | 'zsh' | 'sh';
type TerminalUiState = {
  activeTerminal: number;
  terminalCount: number;
  profile: TerminalProfile;
  splitView: boolean;
};

const terminalProfiles: Array<{ id: TerminalProfile; label: string; command?: string }> = [
  { id: 'managed', label: 'Managed shell' },
  { id: 'bash', label: 'bash', command: '/bin/bash' },
  { id: 'zsh', label: 'zsh', command: '/bin/zsh' },
  { id: 'sh', label: 'sh', command: '/bin/sh' },
];

function readTerminalUiState(): TerminalUiState {
  if (typeof window === 'undefined') {
    return { activeTerminal: 0, terminalCount: 0, profile: 'managed' as TerminalProfile, splitView: false };
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(TERMINAL_UI_STORAGE_KEY) ?? '{}');

    return {
      activeTerminal: typeof parsed.activeTerminal === 'number' ? Math.max(0, parsed.activeTerminal) : 0,
      terminalCount:
        typeof parsed.terminalCount === 'number' ? Math.min(MAX_TERMINALS - 1, Math.max(0, parsed.terminalCount)) : 0,
      profile: terminalProfiles.some((profile) => profile.id === parsed.profile)
        ? (parsed.profile as TerminalProfile)
        : ('managed' as TerminalProfile),
      splitView: typeof parsed.splitView === 'boolean' ? parsed.splitView : false,
    };
  } catch {
    return { activeTerminal: 0, terminalCount: 0, profile: 'managed' as TerminalProfile, splitView: false };
  }
}

interface TerminalTabsProps {
  panelDefaultSize?: number;
}

export const TerminalTabs = memo(({ panelDefaultSize = DEFAULT_TERMINAL_SIZE }: TerminalTabsProps) => {
  const showTerminal = useStore(workbenchStore.showTerminal);
  const theme = useStore(themeStore);

  const terminalRefs = useRef<Map<number, TerminalRef>>(new Map());
  const terminalPanelRef = useRef<ImperativePanelHandle>(null);
  const terminalToggledByShortcut = useRef(false);

  const initialUiState = useMemo(readTerminalUiState, []);
  const [activeTerminal, setActiveTerminal] = useState(initialUiState.activeTerminal);
  const [terminalCount, setTerminalCount] = useState(initialUiState.terminalCount);
  const [terminalSize, setTerminalSize] = useState({ cols: 0, rows: 0 });
  const [profile, setProfile] = useState<TerminalProfile>(initialUiState.profile);
  const [splitView, setSplitView] = useState(initialUiState.splitView);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sessionMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const activeProfile = terminalProfiles.find((item) => item.id === profile) ?? terminalProfiles[0];
  const activeShellName = activeProfile.id === 'managed' ? 'bash' : activeProfile.label;

  const getSessionLabel = useCallback(
    (index: number) => {
      const baseLabel = `${TERMINAL_WORKSPACE_LABEL}: ${activeShellName}`;

      return index === 0 ? baseLabel : `${baseLabel} #${index + 1}`;
    },
    [activeShellName],
  );

  const activeSessionLabel = getSessionLabel(activeTerminal);

  const addTerminal = useCallback(() => {
    /*
     * terminalCount counts the *extra* shells beyond the bolt terminal (index 0),
     * and the render loops draw terminalCount + 1 panes, so the cap is MAX_TERMINALS - 1.
     */
    if (terminalCount < MAX_TERMINALS - 1) {
      const nextCount = terminalCount + 1;
      setTerminalCount(nextCount);
      setActiveTerminal(nextCount);
      setSessionMenuOpen(false);
    }
  }, [terminalCount]);

  const closeTerminal = useCallback(
    (index: number) => {
      if (index === 0) {
        return;
      } // Can't close bolt terminal

      const terminalRef = terminalRefs.current.get(index);

      if (terminalRef?.getTerminal) {
        const terminal = terminalRef.getTerminal();

        if (terminal) {
          workbenchStore.detachTerminal(terminal);
        }
      }

      // Remove the terminal from refs
      terminalRefs.current.delete(index);

      // Adjust terminal count and active terminal
      setTerminalCount(terminalCount - 1);

      if (activeTerminal === index) {
        setActiveTerminal(Math.max(0, index - 1));
      } else if (activeTerminal > index) {
        setActiveTerminal(activeTerminal - 1);
      }
    },
    [activeTerminal, terminalCount],
  );

  useEffect(() => {
    if (activeTerminal > terminalCount) {
      setActiveTerminal(terminalCount);
    }
  }, [activeTerminal, terminalCount]);

  useEffect(() => {
    if (!splitView || terminalCount > 0) {
      return;
    }

    setTerminalCount(1);
  }, [splitView, terminalCount]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      TERMINAL_UI_STORAGE_KEY,
      JSON.stringify({ activeTerminal, terminalCount, profile, splitView }),
    );
  }, [activeTerminal, terminalCount, profile, splitView]);

  useEffect(() => {
    return () => {
      terminalRefs.current.forEach((ref, index) => {
        if (index > 0 && ref?.getTerminal) {
          const terminal = ref.getTerminal();

          if (terminal) {
            workbenchStore.detachTerminal(terminal);
          }
        }
      });
    };
  }, []);

  const restartActiveTerminal = useCallback(() => {
    const ref = terminalRefs.current.get(activeTerminal);
    const terminal = ref?.getTerminal();

    if (!terminal) {
      return;
    }

    terminal.reset();
    terminal.clear();
    terminal.focus();

    if (activeTerminal === 0) {
      void workbenchStore.restartBoltTerminal(terminal);
    } else {
      void workbenchStore.restartTerminal(terminal, activeProfile.command);
    }
  }, [activeProfile.command, activeTerminal]);

  const killActiveTerminal = useCallback(() => {
    const ref = terminalRefs.current.get(activeTerminal);
    const terminal = ref?.getTerminal();

    if (!terminal) {
      return;
    }

    if (activeTerminal === 0) {
      terminal.input('\x03');
      terminal.write('\r\n^C\r\n');
    } else {
      void workbenchStore.detachTerminal(terminal);
      terminal.write('\r\nProcess killed. Use Restart to open a new shell.\r\n');
    }
  }, [activeTerminal]);

  const clearActiveTerminal = useCallback(() => {
    terminalRefs.current.get(activeTerminal)?.clear();
    terminalRefs.current.get(activeTerminal)?.getTerminal()?.focus();
  }, [activeTerminal]);

  const closeActiveShellTab = useCallback(() => {
    setMoreMenuOpen(false);

    if (activeTerminal > 0) {
      closeTerminal(activeTerminal);

      return;
    }

    workbenchStore.toggleTerminal(false);
  }, [activeTerminal, closeTerminal]);

  const openSearch = useCallback(() => {
    setMoreMenuOpen(false);
    setSearchOpen(true);
  }, []);

  const findInActiveTerminal = useCallback(
    (direction: 'next' | 'previous' = 'next') => {
      const query = searchQuery.trim();

      if (!query) {
        return;
      }

      const ref = terminalRefs.current.get(activeTerminal);

      if (direction === 'next') {
        ref?.findNext(query);
      } else {
        ref?.findPrevious(query);
      }
    },
    [activeTerminal, searchQuery],
  );

  const visibleTerminalIndexes = useMemo(() => {
    if (!splitView) {
      return [activeTerminal];
    }

    const secondary = activeTerminal === 0 ? 1 : 0;

    return Array.from(new Set([activeTerminal, Math.min(terminalCount, secondary)]));
  }, [activeTerminal, splitView, terminalCount]);

  useEffect(() => {
    const { current: terminal } = terminalPanelRef;

    if (!terminal) {
      return;
    }

    const isCollapsed = terminal.isCollapsed();

    if (!showTerminal && !isCollapsed) {
      terminal.collapse();
    } else if (showTerminal && isCollapsed) {
      terminal.resize(panelDefaultSize);
    }

    terminalToggledByShortcut.current = false;
  }, [panelDefaultSize, showTerminal]);

  useEffect(() => {
    const unsubscribeFromEventEmitter = shortcutEventEmitter.on('toggleTerminal', () => {
      terminalToggledByShortcut.current = true;
    });

    const unsubscribeFromThemeStore = themeStore.subscribe(() => {
      terminalRefs.current.forEach((ref) => {
        ref?.reloadStyles();
      });
    });

    return () => {
      unsubscribeFromEventEmitter();
      unsubscribeFromThemeStore();
    };
  }, []);

  useEffect(() => {
    if (!searchOpen) {
      return undefined;
    }

    const frame = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });

    return () => cancelAnimationFrame(frame);
  }, [searchOpen]);

  useEffect(() => {
    if (!moreMenuOpen && !sessionMenuOpen) {
      return undefined;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;

      if (moreMenuOpen && !moreMenuRef.current?.contains(target)) {
        setMoreMenuOpen(false);
      }

      if (sessionMenuOpen && !sessionMenuRef.current?.contains(target)) {
        setSessionMenuOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreMenuOpen(false);
        setSessionMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [moreMenuOpen, sessionMenuOpen]);

  return (
    <Panel
      ref={terminalPanelRef}
      defaultSize={showTerminal ? panelDefaultSize : 0}
      minSize={10}
      collapsible
      onExpand={() => {
        if (!terminalToggledByShortcut.current) {
          workbenchStore.toggleTerminal(true);
        }
      }}
      onCollapse={() => {
        if (!terminalToggledByShortcut.current) {
          workbenchStore.toggleTerminal(false);
        }
      }}
    >
      <div className="h-full">
        <div className="bolt-terminal-tabs-shell bg-bolt-elements-terminals-background h-full flex flex-col">
          <div className="bolt-terminal-tabs-bar" data-testid="terminal-tabs-bar" aria-label={TERMINAL_PANEL_LABEL}>
            <div className="bolt-terminal-session-switcher" ref={sessionMenuRef}>
              <button
                type="button"
                className="bolt-terminal-session-button"
                aria-haspopup="menu"
                aria-expanded={sessionMenuOpen}
                aria-label={`Open shell sessions. Active session ${activeSessionLabel}.`}
                title="Shell sessions"
                onClick={() => {
                  setMoreMenuOpen(false);
                  setSessionMenuOpen((value) => !value);
                }}
              >
                <span className="i-ph:caret-down" aria-hidden />
                <span className="bolt-terminal-session-label">{activeSessionLabel}</span>
              </button>
              {sessionMenuOpen ? (
                <div className="bolt-terminal-session-menu" role="menu" aria-label="Shell sessions">
                  {Array.from({ length: terminalCount + 1 }, (_, index) => {
                    const isActive = activeTerminal === index;
                    const terminalLabel = getSessionLabel(index);

                    return (
                      <div key={index} className="bolt-terminal-session-row" role="none">
                        <button
                          type="button"
                          className="bolt-terminal-session-menu-item"
                          role="menuitemradio"
                          aria-checked={isActive}
                          onClick={() => {
                            setActiveTerminal(index);
                            setSessionMenuOpen(false);
                          }}
                        >
                          <span className={isActive ? 'i-ph:check' : 'i-ph:terminal-window'} aria-hidden />
                          <span>{terminalLabel}</span>
                        </button>
                        {index > 0 ? (
                          <button
                            type="button"
                            className="bolt-terminal-session-close"
                            aria-label={`Close ${terminalLabel}`}
                            onClick={() => closeTerminal(index)}
                          >
                            <span className="i-ph:x" aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                  {terminalCount < MAX_TERMINALS - 1 ? (
                    <button type="button" className="bolt-terminal-session-new" role="menuitem" onClick={addTerminal}>
                      <span className="i-ph:plus" aria-hidden />
                      <span>New Shell</span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="bolt-terminal-primary-actions" aria-label="Shell actions">
              <button
                type="button"
                className="bolt-terminal-icon-button"
                aria-label="Find in Shell"
                title="Find in Shell"
                onClick={openSearch}
              >
                <span className="i-ph:magnifying-glass" aria-hidden />
              </button>
              <button
                type="button"
                className="bolt-terminal-icon-button"
                aria-label="Clear conversation"
                title="Clear conversation"
                onClick={clearActiveTerminal}
              >
                <span className="i-ph:trash" aria-hidden />
              </button>
              <div className="bolt-terminal-more" ref={moreMenuRef}>
                <button
                  type="button"
                  className="bolt-terminal-more-button"
                  aria-haspopup="menu"
                  aria-expanded={moreMenuOpen}
                  aria-label="More Shell actions"
                  title="More Shell actions"
                  onClick={() => {
                    setSessionMenuOpen(false);
                    setMoreMenuOpen((value) => !value);
                  }}
                >
                  <span className="i-ph:dots-three-vertical-bold" aria-hidden />
                </button>
                {moreMenuOpen ? (
                  <div className="bolt-terminal-more-menu" role="menu" aria-label="More Shell actions">
                    <div className="bolt-terminal-menu-heading">
                      <span className="i-ph:terminal-window" aria-hidden />
                      <div>
                        <strong>{TERMINAL_PANEL_LABEL}</strong>
                        <small>{activeSessionLabel}</small>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="bolt-terminal-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        killActiveTerminal();
                      }}
                    >
                      <span className="i-ph:stop" aria-hidden />
                      <span>Kill Shell</span>
                    </button>
                    <button
                      type="button"
                      className="bolt-terminal-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        clearActiveTerminal();
                      }}
                    >
                      <span className="i-ph:trash" aria-hidden />
                      <span>Clear conversation</span>
                    </button>
                    <button type="button" className="bolt-terminal-menu-item" role="menuitem" onClick={openSearch}>
                      <span className="i-ph:magnifying-glass" aria-hidden />
                      <span>Find in Shell</span>
                    </button>
                    <button
                      type="button"
                      className="bolt-terminal-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        restartActiveTerminal();
                      }}
                    >
                      <span className="i-ph:arrow-clockwise" aria-hidden />
                      <span>Restart Shell</span>
                    </button>
                    <button
                      type="button"
                      className="bolt-terminal-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        setSplitView((value) => !value);
                      }}
                    >
                      <span className="i-ph:columns" aria-hidden />
                      <span>{splitView ? 'Single view' : 'Split view'}</span>
                    </button>
                    <button
                      type="button"
                      className="bolt-terminal-menu-item"
                      role="menuitem"
                      onClick={closeActiveShellTab}
                    >
                      <span className="i-ph:x" aria-hidden />
                      <span>Close tab</span>
                    </button>
                    <label className="bolt-terminal-profile-select">
                      <span>Profile</span>
                      <select
                        aria-label="Shell profile"
                        value={profile}
                        onChange={(event) => setProfile(event.target.value as TerminalProfile)}
                      >
                        {terminalProfiles.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div
                      className="bolt-terminal-runtime-meta"
                      aria-label="Shell PTY size"
                      title="Shell PTY size. Shows the current pseudo-terminal columns and rows."
                    >
                      <span className="bolt-terminal-runtime-dot" aria-hidden />
                      <span>PTY size</span>
                      <strong>
                        {terminalSize.cols > 0 && terminalSize.rows > 0
                          ? `${terminalSize.cols}x${terminalSize.rows}`
                          : 'Detecting'}
                      </strong>
                    </div>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="bolt-terminal-icon-button"
                aria-label="Close tab"
                title="Close tab"
                onClick={closeActiveShellTab}
              >
                <span className="i-ph:x" aria-hidden />
              </button>
            </div>
          </div>
          <div className="bolt-terminal-content-frame">
            {searchOpen ? (
              <div className="bolt-terminal-find-row" role="search" aria-label="Find in Shell">
                <input
                  ref={searchInputRef}
                  aria-label="Find in Shell"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      findInActiveTerminal(event.shiftKey ? 'previous' : 'next');
                    } else if (event.key === 'Escape') {
                      setSearchOpen(false);
                    }
                  }}
                  placeholder="Find"
                />
                <button type="button" onClick={() => findInActiveTerminal('next')} disabled={!searchQuery.trim()}>
                  Next
                </button>
                <button type="button" onClick={() => findInActiveTerminal('previous')} disabled={!searchQuery.trim()}>
                  Previous
                </button>
                <button type="button" onClick={() => setSearchOpen(false)}>
                  Exit
                </button>
              </div>
            ) : null}
            <div className={classNames('bolt-terminal-viewports', { 'is-split': splitView })}>
              {Array.from({ length: terminalCount + 1 }, (_, index) => {
                const isActive = visibleTerminalIndexes.includes(index);

                logger.debug(`Starting bolt terminal [${index}]`);

                if (index == 0) {
                  return (
                    <Terminal
                      key={`terminal-${index}`}
                      id={`terminal_${index}`}
                      className={classNames(
                        'bolt-terminal-viewport-frame h-full overflow-hidden modern-scrollbar-invert',
                        {
                          hidden: !isActive,
                        },
                      )}
                      ref={(ref) => {
                        if (ref) {
                          terminalRefs.current.set(index, ref);
                        } else {
                          terminalRefs.current.delete(index);
                        }
                      }}
                      onTerminalReady={(terminal) => workbenchStore.attachBoltTerminal(terminal)}
                      onTerminalResize={(cols, rows) => {
                        setTerminalSize({ cols, rows });
                        workbenchStore.onTerminalResize(cols, rows);
                      }}
                      theme={theme}
                    />
                  );
                } else {
                  return (
                    <Terminal
                      key={`terminal-${index}`}
                      id={`terminal_${index}`}
                      className={classNames('bolt-terminal-viewport-frame modern-scrollbar h-full overflow-hidden', {
                        hidden: !isActive,
                      })}
                      ref={(ref) => {
                        if (ref) {
                          terminalRefs.current.set(index, ref);
                        } else {
                          terminalRefs.current.delete(index);
                        }
                      }}
                      onTerminalReady={(terminal) => workbenchStore.attachTerminal(terminal, activeProfile.command)}
                      onTerminalResize={(cols, rows) => {
                        setTerminalSize({ cols, rows });
                        workbenchStore.onTerminalResize(cols, rows);
                      }}
                      theme={theme}
                    />
                  );
                }
              })}
            </div>
          </div>
          {Array.from({ length: terminalCount + 1 }, (_, index) => (
            <TerminalManager
              key={`terminal-manager-${index}`}
              terminal={terminalRefs.current.get(index)?.getTerminal() || null}
              isActive={visibleTerminalIndexes.includes(index)}
            />
          ))}
        </div>
      </div>
    </Panel>
  );
});
