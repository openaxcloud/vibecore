import { useStore } from '@nanostores/react';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Panel, type ImperativePanelHandle } from 'react-resizable-panels';
import { Terminal, type TerminalRef } from './Terminal';
import { TerminalManager } from './TerminalManager';
import { IconButton } from '~/components/ui/IconButton';
import { shortcutEventEmitter } from '~/lib/hooks';
import { themeStore } from '~/lib/stores/theme';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Terminal');

const MAX_TERMINALS = 3;
export const DEFAULT_TERMINAL_SIZE = 25;

interface TerminalTabsProps {
  panelDefaultSize?: number;
}

export const TerminalTabs = memo(({ panelDefaultSize = DEFAULT_TERMINAL_SIZE }: TerminalTabsProps) => {
  const showTerminal = useStore(workbenchStore.showTerminal);
  const theme = useStore(themeStore);

  const terminalRefs = useRef<Map<number, TerminalRef>>(new Map());
  const terminalPanelRef = useRef<ImperativePanelHandle>(null);
  const terminalToggledByShortcut = useRef(false);

  const [activeTerminal, setActiveTerminal] = useState(0);
  const [terminalCount, setTerminalCount] = useState(0);
  const [terminalSize, setTerminalSize] = useState({ cols: 0, rows: 0 });

  const addTerminal = () => {
    if (terminalCount < MAX_TERMINALS) {
      setTerminalCount(terminalCount + 1);
      setActiveTerminal(terminalCount);
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
            <div className="bolt-terminal-runtime-meta" aria-label="Terminal runtime status">
              <span className="bolt-terminal-runtime-dot" aria-hidden />
              <span>PTY</span>
              {terminalSize.cols > 0 && terminalSize.rows > 0 ? (
                <span>
                  {terminalSize.cols}x{terminalSize.rows}
                </span>
              ) : null}
            </div>
            <div className="bolt-terminal-actions">
              {terminalCount < MAX_TERMINALS && (
                <IconButton icon="i-ph:plus" title="New terminal" size="md" onClick={addTerminal} />
              )}
              <IconButton
                icon="i-ph:arrow-clockwise"
                title="Reset Terminal"
                size="md"
                onClick={() => {
                  const ref = terminalRefs.current.get(activeTerminal);

                  if (ref?.getTerminal()) {
                    const terminal = ref.getTerminal()!;
                    terminal.clear();
                    terminal.focus();

                    if (activeTerminal === 0) {
                      workbenchStore.attachBoltTerminal(terminal);
                    } else {
                      workbenchStore.attachTerminal(terminal);
                    }
                  }
                }}
              />
              <IconButton
                icon="i-ph:caret-down"
                title="Close"
                size="md"
                onClick={() => workbenchStore.toggleTerminal(false)}
              />
            </div>
          </div>
          {Array.from({ length: terminalCount + 1 }, (_, index) => {
            const isActive = activeTerminal === index;

            logger.debug(`Starting bolt terminal [${index}]`);

            if (index == 0) {
              return (
                <React.Fragment key={`terminal-container-${index}`}>
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
                  <TerminalManager
                    terminal={terminalRefs.current.get(index)?.getTerminal() || null}
                    isActive={isActive}
                  />
                </React.Fragment>
              );
            } else {
              return (
                <React.Fragment key={`terminal-container-${index}`}>
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
                    onTerminalReady={(terminal) => workbenchStore.attachTerminal(terminal)}
                    onTerminalResize={(cols, rows) => {
                      setTerminalSize({ cols, rows });
                      workbenchStore.onTerminalResize(cols, rows);
                    }}
                    theme={theme}
                  />
                  <TerminalManager
                    terminal={terminalRefs.current.get(index)?.getTerminal() || null}
                    isActive={isActive}
                  />
                </React.Fragment>
              );
            }
          })}
        </div>
      </div>
    </Panel>
  );
});
