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
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const activeProfile = terminalProfiles.find((item) => item.id === profile) ?? terminalProfiles[0];

  const addTerminal = () => {
    if (terminalCount < MAX_TERMINALS) {
      const nextCount = terminalCount + 1;
      setTerminalCount(nextCount);
      setActiveTerminal(nextCount);
    }
  };

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
    if (!moreMenuOpen) {
      return undefined;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!moreMenuRef.current?.contains(event.target as Node)) {
        setMoreMenuOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [moreMenuOpen]);

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
          <div className="bolt-terminal-tabs-bar" data-testid="terminal-tabs-bar">
            <div className="bolt-terminal-tabs-strip" aria-label="Terminal sessions">
              {Array.from({ length: terminalCount + 1 }, (_, index) => {
                const isActive = activeTerminal === index;

                const terminalLabel =
                  index === 0 ? 'Vibecore Terminal' : `Terminal ${terminalCount > 1 ? index : ''}`.trim();

                return (
                  <div
                    key={index}
                    className={classNames('bolt-terminal-tab-item', {
                      'is-active': isActive,
                    })}
                    data-terminal-kind={index === 0 ? 'agent' : 'shell'}
                  >
                    <button
                      type="button"
                      className="bolt-terminal-tab-button"
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={terminalLabel}
                      onClick={() => setActiveTerminal(index)}
                    >
                      <span className={index === 0 ? 'i-ph:sparkle-duotone' : 'i-ph:terminal-window'} aria-hidden />
                      <span>{terminalLabel}</span>
                    </button>
                    {index > 0 ? (
                      <button
                        type="button"
                        className="bolt-terminal-tab-close"
                        aria-label={`Close ${terminalLabel}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          closeTerminal(index);
                        }}
                      >
                        <span className="i-ph:x" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div
              className="bolt-terminal-toolbar-section"
              data-section="search"
              role="search"
              aria-label="Search terminal"
            >
              <span className="bolt-terminal-toolbar-label">Search</span>
              <div className="bolt-terminal-search">
                <input
                  aria-label="Search terminal scrollback"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      findInActiveTerminal(event.shiftKey ? 'previous' : 'next');
                    }
                  }}
                  placeholder="Find in terminal"
                />
                <button
                  type="button"
                  aria-label="Find previous terminal match"
                  onClick={() => findInActiveTerminal('previous')}
                >
                  <span className="i-ph:caret-up" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Find next terminal match"
                  onClick={() => findInActiveTerminal('next')}
                >
                  <span className="i-ph:caret-down" aria-hidden />
                </button>
              </div>
            </div>
            <div className="bolt-terminal-toolbar-section" data-section="process" aria-label="Terminal process actions">
              <span className="bolt-terminal-toolbar-label">Process</span>
              {terminalCount < MAX_TERMINALS && (
                <button
                  type="button"
                  className="bolt-terminal-action-button"
                  title="New terminal. Open another shell session."
                  onClick={addTerminal}
                >
                  <span className="i-ph:plus" aria-hidden />
                  New
                </button>
              )}
              <button
                type="button"
                className="bolt-terminal-action-button"
                title="Kill terminal. Stop the active shell process."
                onClick={killActiveTerminal}
              >
                <span className="i-ph:stop" aria-hidden />
                Kill
              </button>
              <button
                type="button"
                className="bolt-terminal-action-button"
                title="Restart terminal. Kill and recreate the active shell session."
                onClick={restartActiveTerminal}
              >
                <span className="i-ph:arrow-clockwise" aria-hidden />
                Restart
              </button>
            </div>
            <div className="bolt-terminal-toolbar-section" data-section="view" aria-label="Terminal view actions">
              <span className="bolt-terminal-toolbar-label">View</span>
              <button
                type="button"
                className="bolt-terminal-action-button"
                title="Split terminal. Show two terminal sessions side by side."
                onClick={() => setSplitView((value) => !value)}
              >
                <span className="i-ph:columns" aria-hidden />
                {splitView ? 'Unsplit' : 'Split'}
              </button>
              <button
                type="button"
                className="bolt-terminal-action-button"
                title="Clear terminal. Remove visible scrollback for the active shell."
                onClick={clearActiveTerminal}
              >
                <span className="i-ph:eraser" aria-hidden />
                Clear
              </button>
            </div>
            <div className="bolt-terminal-more" ref={moreMenuRef}>
              <button
                type="button"
                className="bolt-terminal-more-button"
                aria-haspopup="dialog"
                aria-expanded={moreMenuOpen}
                aria-label="More terminal options"
                title="More terminal options"
                onClick={() => setMoreMenuOpen((value) => !value)}
              >
                <span className="i-ph:dots-three-vertical-bold" aria-hidden />
                More
              </button>
              {moreMenuOpen ? (
                <div className="bolt-terminal-more-menu" role="group" aria-label="More terminal options">
                  <label className="bolt-terminal-profile-select">
                    <span>Profile</span>
                    <select
                      aria-label="Terminal profile"
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
                    aria-label="Terminal PTY size"
                    title="Terminal PTY size. Shows the current pseudo-terminal columns and rows."
                  >
                    <span className="bolt-terminal-runtime-dot" aria-hidden />
                    <span>PTY size</span>
                    <strong>
                      {terminalSize.cols > 0 && terminalSize.rows > 0
                        ? `${terminalSize.cols}x${terminalSize.rows}`
                        : 'Detecting'}
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="bolt-terminal-menu-item"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      workbenchStore.toggleTerminal(false);
                    }}
                  >
                    <span className="i-ph:caret-down" aria-hidden />
                    Close terminal
                  </button>
                </div>
              ) : null}
            </div>
          </div>
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
