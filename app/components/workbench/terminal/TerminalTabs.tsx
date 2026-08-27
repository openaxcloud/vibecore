import { useStore } from '@nanostores/react';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel, type ImperativePanelHandle } from 'react-resizable-panels';
import { Terminal, type TerminalRef, type TerminalSearchResults } from './Terminal';
import { TerminalManager } from './TerminalManager';
import {
  TERMINAL_PROFILES,
  type TerminalProfileId,
  buildConnectingNotice,
  getSessionLabel as buildSessionLabel,
} from './terminal-session';
import { shortcutEventEmitter } from '~/lib/hooks';
import { themeStore } from '~/lib/stores/theme';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { createScopedLogger } from '~/utils/logger';
import { isMac } from '~/utils/os';

const logger = createScopedLogger('Terminal');

const FIND_SHORTCUT_HINT = isMac ? '⌘F' : 'Ctrl+F';
const CLEAR_SHORTCUT_HINT = isMac ? '⌘K' : 'Ctrl+K';

/** Clipboard write with a legacy execCommand fallback for non-secure contexts. */
async function writeToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);

      return true;
    }
  } catch (error) {
    logger.warn('navigator.clipboard rejected, falling back to execCommand copy', error);
  }

  try {
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();

    const copied = document.execCommand('copy');
    helper.remove();

    return copied;
  } catch (error) {
    logger.error('Copy to clipboard failed', error);

    return false;
  }
}

const MAX_TERMINALS = 4;
const TERMINAL_UI_STORAGE_KEY = 'vibecore-terminal-ui-v1';
const TERMINAL_PANEL_LABEL = 'Shell (Terminal)';
export const DEFAULT_TERMINAL_SIZE = 34;

type TerminalProfile = TerminalProfileId;
type TerminalUiState = {
  activeTerminal: number;
  terminalCount: number;
  profile: TerminalProfile;
  splitView: boolean;
};

const terminalProfiles = TERMINAL_PROFILES;

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
  const { t } = useTranslation();
  const showTerminal = useStore(workbenchStore.showTerminal);
  const theme = useStore(themeStore);

  const terminalRefs = useRef<Map<number, TerminalRef>>(new Map());
  const terminalPanelRef = useRef<ImperativePanelHandle>(null);
  const terminalToggledByShortcut = useRef(false);

  /*
   * Stable React keys per pane index. Keying by raw array index unmounts the
   * wrong Terminal when a non-last shell is closed (every higher pane shifts
   * down), so each index gets a monotonic id that is reassigned on close.
   */
  const nextTerminalId = useRef(1);
  const terminalIds = useRef<number[]>([0]);

  const getTerminalId = useCallback((index: number) => {
    while (terminalIds.current.length <= index) {
      terminalIds.current.push(nextTerminalId.current++);
    }

    return terminalIds.current[index];
  }, []);

  const initialUiState = useMemo(readTerminalUiState, []);
  const [activeTerminal, setActiveTerminal] = useState(initialUiState.activeTerminal);
  const [terminalCount, setTerminalCount] = useState(initialUiState.terminalCount);
  const [terminalSize, setTerminalSize] = useState({ cols: 0, rows: 0 });
  const [profile, setProfile] = useState<TerminalProfile>(initialUiState.profile);
  const [splitView, setSplitView] = useState(initialUiState.splitView);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<TerminalSearchResults | null>(null);
  const [copied, setCopied] = useState(false);
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sessionMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const activeProfile = terminalProfiles.find((item) => item.id === profile) ?? terminalProfiles[0];

  /*
   * The profile each pane was actually spawned with. A pane's label and live
   * shell must agree, so changing the Profile <select> only re-targets shells
   * created afterward — already-running panes keep the profile recorded here.
   * Index 0 (the bolt terminal) is always managed.
   */
  const paneProfiles = useRef<Map<number, TerminalProfile>>(new Map([[0, 'managed']]));

  const getSessionLabel = useCallback(
    (index: number) => buildSessionLabel(index, paneProfiles.current.get(index) ?? 'managed'),

    /*
     * `profile` is not read directly, but a pane spawned with the freshly
     * selected profile must re-render its label, so depend on it explicitly.
     */
    [profile],
  );

  const activeSessionLabel = getSessionLabel(activeTerminal);

  const addTerminal = useCallback(() => {
    /*
     * terminalCount counts the *extra* shells beyond the bolt terminal (index 0),
     * and the render loops draw terminalCount + 1 panes, so the cap is MAX_TERMINALS - 1.
     */
    if (terminalCount < MAX_TERMINALS - 1) {
      const nextCount = terminalCount + 1;

      // The new pane is spawned with whatever profile is selected right now.
      paneProfiles.current.set(nextCount, profile);
      setTerminalCount(nextCount);
      setActiveTerminal(nextCount);
      setSessionMenuOpen(false);
    }
  }, [profile, terminalCount]);

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

      // Drop the closed pane's stable id so surviving panes keep theirs
      terminalIds.current.splice(index, 1);

      /*
       * Panes above the closed one shift down by one, so re-key their recorded
       * profiles to keep each label tied to the shell it was spawned with.
       */
      const shifted = new Map<number, TerminalProfile>([[0, 'managed']]);
      paneProfiles.current.forEach((paneProfile, paneIndex) => {
        if (paneIndex === index) {
          return;
        }

        shifted.set(paneIndex > index ? paneIndex - 1 : paneIndex, paneProfile);
      });
      paneProfiles.current = shifted;

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
      terminal.write(buildConnectingNotice('managed'));
      void workbenchStore.restartBoltTerminal(terminal);
    } else {
      /*
       * A restart re-spawns the shell, so adopt the currently-selected profile
       * and record it as this pane's profile so its label stays truthful.
       */
      paneProfiles.current.set(activeTerminal, activeProfile.id);
      terminal.write(buildConnectingNotice(activeProfile.id));
      void workbenchStore.restartTerminal(terminal, activeProfile.command);
    }
  }, [activeProfile.command, activeProfile.id, activeTerminal]);

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

  const copyActiveTerminal = useCallback(() => {
    setMoreMenuOpen(false);

    const terminal = terminalRefs.current.get(activeTerminal)?.getTerminal();

    if (!terminal) {
      return;
    }

    // Copy the user's selection when there is one, otherwise the visible viewport of the scrollback.
    let text = terminal.getSelection();

    if (!text) {
      const buffer = terminal.buffer.active;
      const lines: string[] = [];

      for (let row = 0; row < terminal.rows; row++) {
        const line = buffer.getLine(buffer.viewportY + row);
        lines.push(line ? line.translateToString(true) : '');
      }

      text = lines.join('\n').replace(/\s+$/, '');
    }

    if (!text) {
      return;
    }

    void writeToClipboard(text).then((didCopy) => {
      if (!didCopy) {
        return;
      }

      setCopied(true);

      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }

      copiedTimerRef.current = setTimeout(() => setCopied(false), 1600);
    });
  }, [activeTerminal]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const openSearch = useCallback(() => {
    setMoreMenuOpen(false);
    setSearchOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    // Decorations may linger on panes the user searched before switching, so sweep them all.
    terminalRefs.current.forEach((ref) => ref.clearSearch());
    setSearchOpen(false);
    setSearchResults(null);
    terminalRefs.current.get(activeTerminal)?.getTerminal()?.focus();
  }, [activeTerminal]);

  // A match count from one pane means nothing on another.
  useEffect(() => {
    setSearchResults(null);
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
                aria-label={t('terminalTabs.sessions.open', { session: activeSessionLabel })}
                title={t('terminalTabs.sessions.title')}
                onClick={() => {
                  setMoreMenuOpen(false);
                  setSessionMenuOpen((value) => !value);
                }}
              >
                <span className="i-ph:caret-down" aria-hidden />
                <span className="bolt-terminal-session-label">{activeSessionLabel}</span>
              </button>
              {sessionMenuOpen ? (
                <div className="bolt-terminal-session-menu" role="menu" aria-label={t('terminalTabs.sessions.title')}>
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
                            aria-label={t('terminalTabs.sessions.close', { label: terminalLabel })}
                            onClick={() => closeTerminal(index)}
                          >
                            <span className="i-ph:x" aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                  {(() => {
                    const atShellLimit = terminalCount >= MAX_TERMINALS - 1;

                    return (
                      <button
                        type="button"
                        className="bolt-terminal-session-new disabled:cursor-not-allowed disabled:opacity-50"
                        role="menuitem"
                        onClick={addTerminal}
                        disabled={atShellLimit}
                        title={atShellLimit ? t('terminalTabs.sessions.max', { max: MAX_TERMINALS }) : undefined}
                        data-vc-tooltip={
                          atShellLimit ? t('terminalTabs.sessions.max', { max: MAX_TERMINALS }) : undefined
                        }
                      >
                        <span className="i-ph:plus" aria-hidden />
                        <span>{t('terminalTabs.sessions.new')}</span>
                      </button>
                    );
                  })()}
                </div>
              ) : null}
            </div>
            <div className="bolt-terminal-primary-actions" aria-label={t('terminalTabs.actions.label')}>
              <button
                type="button"
                className="bolt-terminal-icon-button"
                aria-label={t('terminalTabs.copy.label')}
                title={t('terminalTabs.copy.title')}
                onClick={copyActiveTerminal}
              >
                <span className={copied ? 'i-ph:check' : 'i-ph:copy'} aria-hidden />
              </button>
              <span className="sr-only" role="status" aria-live="polite">
                {copied ? t('terminalTabs.copy.copied') : ''}
              </span>
              <button
                type="button"
                className="bolt-terminal-icon-button"
                aria-label={t('terminalTabs.find.label')}
                title={t('terminalTabs.find.titleShortcut', { shortcut: FIND_SHORTCUT_HINT })}
                onClick={openSearch}
              >
                <span className="i-ph:magnifying-glass" aria-hidden />
              </button>
              <button
                type="button"
                className="bolt-terminal-icon-button"
                aria-label={t('terminalTabs.clear.label')}
                title={t('terminalTabs.clear.titleShortcut', { shortcut: CLEAR_SHORTCUT_HINT })}
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
                  aria-label={t('terminalTabs.more.label')}
                  title={t('terminalTabs.more.label')}
                  onClick={() => {
                    setSessionMenuOpen(false);
                    setMoreMenuOpen((value) => !value);
                  }}
                >
                  <span className="i-ph:dots-three-vertical-bold" aria-hidden />
                </button>
                {moreMenuOpen ? (
                  <div className="bolt-terminal-more-menu" role="menu" aria-label={t('terminalTabs.more.label')}>
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
                      <span>{t('terminalTabs.menu.kill')}</span>
                    </button>
                    <button
                      type="button"
                      className="bolt-terminal-menu-item"
                      role="menuitem"
                      onClick={copyActiveTerminal}
                    >
                      <span className="i-ph:copy" aria-hidden />
                      <span>{t('terminalTabs.copy.output')}</span>
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
                      <span>{t('terminalTabs.clear.label')}</span>
                    </button>
                    <button type="button" className="bolt-terminal-menu-item" role="menuitem" onClick={openSearch}>
                      <span className="i-ph:magnifying-glass" aria-hidden />
                      <span>{t('terminalTabs.find.label')}</span>
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
                      <span>{t('terminalTabs.menu.restart')}</span>
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
                      <span>{splitView ? t('terminalTabs.view.single') : t('terminalTabs.view.split')}</span>
                    </button>
                    <button
                      type="button"
                      className="bolt-terminal-menu-item"
                      role="menuitem"
                      onClick={closeActiveShellTab}
                    >
                      <span className="i-ph:x" aria-hidden />
                      <span>{t('terminalTabs.tab.close')}</span>
                    </button>
                    <label className="bolt-terminal-profile-select">
                      <span>{t('terminalTabs.profile.label')}</span>
                      <select
                        aria-label={t('terminalTabs.profile.select')}
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
                      aria-label={t('terminalTabs.pty.label')}
                      title={t('terminalTabs.pty.title')}
                    >
                      <span className="bolt-terminal-runtime-dot" aria-hidden />
                      <span>{t('terminalTabs.pty.size')}</span>
                      <strong>
                        {terminalSize.cols > 0 && terminalSize.rows > 0
                          ? t('terminalTabs.pty.dimensions', { cols: terminalSize.cols, rows: terminalSize.rows })
                          : t('terminalTabs.pty.detecting')}
                      </strong>
                    </div>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="bolt-terminal-icon-button"
                aria-label={t('terminalTabs.tab.close')}
                title={t('terminalTabs.tab.close')}
                onClick={closeActiveShellTab}
              >
                <span className="i-ph:x" aria-hidden />
              </button>
            </div>
          </div>
          <div className="bolt-terminal-content-frame">
            {searchOpen ? (
              <div className="bolt-terminal-find-row" role="search" aria-label={t('terminalTabs.find.label')}>
                <input
                  ref={searchInputRef}
                  aria-label={t('terminalTabs.find.label')}
                  value={searchQuery}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSearchQuery(value);

                    // Live highlight-as-you-type; incremental keeps the current match while it still fits.
                    const ref = terminalRefs.current.get(activeTerminal);

                    if (value.trim()) {
                      ref?.findNext(value.trim(), { incremental: true });
                    } else {
                      ref?.clearSearch();
                      setSearchResults(null);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      findInActiveTerminal(event.shiftKey ? 'previous' : 'next');
                    } else if (event.key === 'Escape') {
                      closeSearch();
                    } else if ((isMac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === 'f') {
                      // The find bar is already open; keep ⌘F from reaching the browser's page find.
                      event.preventDefault();
                      event.currentTarget.select();
                    }
                  }}
                  placeholder={t('terminalTabs.find.placeholder')}
                />
                {searchResults && searchQuery.trim() ? (
                  <span className="bolt-terminal-find-count" aria-live="polite">
                    {searchResults.resultCount === 0
                      ? t('terminalTabs.find.noResults')
                      : searchResults.resultIndex >= 0
                        ? t('terminalTabs.find.countOf', {
                            index: searchResults.resultIndex + 1,
                            count: searchResults.resultCount,
                          })
                        : t('terminalTabs.find.countMatches', { count: searchResults.resultCount })}
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label={t('terminalTabs.find.next')}
                  title={t('terminalTabs.find.nextTitle')}
                  onClick={() => findInActiveTerminal('next')}
                  disabled={!searchQuery.trim()}
                >
                  {t('terminalTabs.find.nextShort')}
                </button>
                <button
                  type="button"
                  aria-label={t('terminalTabs.find.prev')}
                  title={t('terminalTabs.find.prevTitle')}
                  onClick={() => findInActiveTerminal('previous')}
                  disabled={!searchQuery.trim()}
                >
                  {t('terminalTabs.find.prevShort')}
                </button>
                <button type="button" title={t('terminalTabs.find.closeTitle')} onClick={closeSearch}>
                  {t('terminalTabs.find.exit')}
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
                      key={`terminal-${getTerminalId(index)}`}
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
                      onTerminalReady={(terminal) => {
                        // Immediate feedback so a 30–60s pod cold start never looks hung.
                        terminal.write(buildConnectingNotice('managed'));
                        workbenchStore.attachBoltTerminal(terminal);
                      }}
                      onTerminalResize={(cols, rows) => {
                        setTerminalSize({ cols, rows });
                        workbenchStore.onTerminalResize(cols, rows);
                      }}
                      onOpenSearch={openSearch}
                      onSearchResults={setSearchResults}
                      theme={theme}
                    />
                  );
                } else {
                  return (
                    <Terminal
                      key={`terminal-${getTerminalId(index)}`}
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
                      onTerminalReady={(terminal) => {
                        /*
                         * Spawn with the profile this pane was created under, not the
                         * currently-selected one, so the live shell matches its label.
                         */
                        const paneProfileId = paneProfiles.current.get(index) ?? profile;

                        const paneProfile =
                          terminalProfiles.find((item) => item.id === paneProfileId) ?? terminalProfiles[0];
                        paneProfiles.current.set(index, paneProfileId);
                        terminal.write(buildConnectingNotice(paneProfileId));
                        workbenchStore.attachTerminal(terminal, paneProfile.command, index);
                      }}
                      onTerminalResize={(cols, rows) => {
                        setTerminalSize({ cols, rows });
                        workbenchStore.onTerminalResize(cols, rows);
                      }}
                      onOpenSearch={openSearch}
                      onSearchResults={setSearchResults}
                      theme={theme}
                    />
                  );
                }
              })}
            </div>
          </div>
          {Array.from({ length: terminalCount + 1 }, (_, index) => (
            <TerminalManager
              key={`terminal-manager-${getTerminalId(index)}`}
              terminal={terminalRefs.current.get(index)?.getTerminal() || null}
              isActive={visibleTerminalIndexes.includes(index)}
            />
          ))}
        </div>
      </div>
    </Panel>
  );
});
