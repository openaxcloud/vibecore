import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon, type ISearchOptions } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal as XTerm } from '@xterm/xterm';
import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from 'react';
import { getTerminalTheme } from './theme';
import type { Theme } from '~/lib/stores/theme';
import { createScopedLogger } from '~/utils/logger';
import { isMac } from '~/utils/os';

const logger = createScopedLogger('Terminal');

export interface TerminalSearchResults {
  /** Index of the active match, or -1 when the highlight limit was exceeded. */
  resultIndex: number;
  resultCount: number;
}

export interface TerminalRef {
  reloadStyles: () => void;
  getTerminal: () => XTerm | undefined;
  clear: () => void;
  findNext: (term: string, options?: { incremental?: boolean }) => boolean;
  findPrevious: (term: string) => boolean;
  clearSearch: () => void;
  fit: () => void;
}

export interface TerminalProps {
  className?: string;
  theme: Theme;
  readonly?: boolean;
  id: string;
  onTerminalReady?: (terminal: XTerm) => void;
  onTerminalResize?: (cols: number, rows: number) => void;

  /** Invoked when the user presses the platform find shortcut (⌘F / Ctrl+F) inside the terminal. */
  onOpenSearch?: () => void;

  /** Fires when search-match decorations change (match count / active index). */
  onSearchResults?: (results: TerminalSearchResults) => void;
}

/**
 * Search-match decoration colors, read from the live theme palette on every
 * search so a light/dark switch is picked up. The addon requires the two
 * overview-ruler colors whenever decorations are enabled; without the tokens
 * we fall back to plain (selection-only) search rather than guessing colors.
 */
function getSearchDecorations(): ISearchOptions['decorations'] {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim() || undefined;

  const matchOverviewRuler = token('--bolt-elements-terminal-findMatch-overviewRuler');
  const activeMatchColorOverviewRuler = token('--bolt-elements-terminal-findMatch-activeOverviewRuler');

  if (!matchOverviewRuler || !activeMatchColorOverviewRuler) {
    return undefined;
  }

  return {
    matchOverviewRuler,
    activeMatchColorOverviewRuler,
    matchBackground: token('--bolt-elements-terminal-findMatch-background'),
    activeMatchBackground: token('--bolt-elements-terminal-findMatch-activeBackground'),
  };
}

export const Terminal = memo(
  forwardRef<TerminalRef, TerminalProps>(
    ({ className, theme, readonly, id, onTerminalReady, onTerminalResize, onOpenSearch, onSearchResults }, ref) => {
      const terminalElementRef = useRef<HTMLDivElement>(null);
      const terminalRef = useRef<XTerm>();
      const fitAddonRef = useRef<FitAddon>();
      const searchAddonRef = useRef<SearchAddon>();
      const resizeObserverRef = useRef<ResizeObserver>();
      const resizeFrameRef = useRef<number>();
      const recoveryTimerRef = useRef<ReturnType<typeof setTimeout>>();

      // Mirror volatile props into a ref so the once-only init effect never sees stale values.
      const callbacksRef = useRef({ readonly, onOpenSearch, onSearchResults });
      callbacksRef.current = { readonly, onOpenSearch, onSearchResults };

      useEffect(() => {
        const element = terminalElementRef.current!;

        const fitAddon = new FitAddon();
        const searchAddon = new SearchAddon();
        const webLinksAddon = new WebLinksAddon();
        fitAddonRef.current = fitAddon;
        searchAddonRef.current = searchAddon;

        const terminal = new XTerm({
          cursorBlink: true,
          convertEol: true,
          disableStdin: readonly,
          theme: getTerminalTheme(readonly ? { cursor: '#00000000' } : {}),
          fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: 13,
          allowProposedApi: true,
          scrollback: 1000,

          // Thin ruler on the right that maps search-match decorations across the whole scrollback.
          overviewRulerWidth: 8,

          // Enable better clipboard handling
          rightClickSelectsWord: true,
        });

        terminalRef.current = terminal;

        /*
         * Terminal-local shortcuts, VS Code style: ⌘K clears the shell and ⌘F opens the
         * find bar (Ctrl on non-mac). These only ever see events while the terminal owns
         * focus; the global ⌘K command-palette binding skips terminal-focused events
         * (see `command.palette` in app/lib/keybindings.ts), so both behaviors coexist.
         */
        terminal.attachCustomKeyEventHandler((event) => {
          if (event.type !== 'keydown') {
            return true;
          }

          const modifier = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;

          if (!modifier || event.altKey || event.shiftKey) {
            return true;
          }

          const key = event.key.toLowerCase();

          if (key === 'k') {
            if (!callbacksRef.current.readonly) {
              event.preventDefault();
              terminal.clear();
            }

            return false;
          }

          if (key === 'f') {
            event.preventDefault();
            callbacksRef.current.onOpenSearch?.();

            return false;
          }

          return true;
        });

        // Surface match count / active index whenever search decorations change.
        const searchResultsDisposable = searchAddon.onDidChangeResults((results) => {
          callbacksRef.current.onSearchResults?.(results);
        });

        // Error handling for addon loading
        try {
          terminal.loadAddon(fitAddon);
          terminal.loadAddon(searchAddon);
          terminal.loadAddon(webLinksAddon);
          terminal.open(element);
        } catch (error) {
          logger.error(`Failed to initialize terminal [${id}]:`, error);

          // Attempt recovery (tracked so it can't fire on a disposed terminal)
          recoveryTimerRef.current = setTimeout(() => {
            try {
              terminal.open(element);
              fitAddon.fit();
            } catch (retryError) {
              logger.error(`Terminal recovery failed [${id}]:`, retryError);
            }
          }, 100);
        }

        const resizeObserver = new ResizeObserver((entries) => {
          if (entries.length > 0) {
            const entry = entries[0];

            /*
             * A hidden terminal (display:none) reports a 0x0 box; fitting it would
             * shrink the PTY to its 2x1 minimum and clobber the other shells via the
             * shared resize handler, so skip until it is visible again.
             */
            if (entry.contentRect.width === 0 || entry.contentRect.height === 0) {
              return;
            }

            if (resizeFrameRef.current) {
              cancelAnimationFrame(resizeFrameRef.current);
            }

            resizeFrameRef.current = requestAnimationFrame(() => {
              try {
                fitAddon.fit();
                onTerminalResize?.(terminal.cols, terminal.rows);
              } catch (error) {
                logger.error(`Resize error [${id}]:`, error);
              }
            });
          }
        });

        resizeObserverRef.current = resizeObserver;
        resizeObserver.observe(element);

        logger.debug(`Attach [${id}]`);

        onTerminalReady?.(terminal);

        return () => {
          try {
            if (resizeFrameRef.current) {
              cancelAnimationFrame(resizeFrameRef.current);
              resizeFrameRef.current = undefined;
            }

            if (recoveryTimerRef.current) {
              clearTimeout(recoveryTimerRef.current);
              recoveryTimerRef.current = undefined;
            }

            resizeObserver.disconnect();
            searchResultsDisposable.dispose();
            terminal.dispose();
          } catch (error) {
            logger.error(`Cleanup error [${id}]:`, error);
          }
        };
      }, []);

      useEffect(() => {
        const terminal = terminalRef.current;

        if (!terminal) {
          return;
        }

        // we render a transparent cursor in case the terminal is readonly
        terminal.options.theme = getTerminalTheme(readonly ? { cursor: '#00000000' } : {});

        terminal.options.disableStdin = readonly;
      }, [theme, readonly]);

      useImperativeHandle(ref, () => {
        return {
          reloadStyles: () => {
            const terminal = terminalRef.current;

            if (terminal) {
              terminal.options.theme = getTerminalTheme(readonly ? { cursor: '#00000000' } : {});
            }
          },
          getTerminal: () => {
            return terminalRef.current;
          },
          clear: () => {
            terminalRef.current?.clear();
          },
          findNext: (term: string, options?: { incremental?: boolean }) => {
            return (
              searchAddonRef.current?.findNext(term, {
                incremental: options?.incremental,
                decorations: getSearchDecorations(),
              }) ?? false
            );
          },
          findPrevious: (term: string) => {
            return searchAddonRef.current?.findPrevious(term, { decorations: getSearchDecorations() }) ?? false;
          },
          clearSearch: () => {
            searchAddonRef.current?.clearDecorations();
          },
          fit: () => {
            fitAddonRef.current?.fit();
          },
        };
      }, [readonly]);

      /*
       * On a phone, tapping the terminal left `document.activeElement` on this
       * container: xterm's hidden input (`.xterm-helper-textarea`, opacity 0 at
       * z-index -5) never took focus, so no keystroke ever reached the PTY and
       * iOS never raised its keyboard. The socket was healthy the whole time —
       * only `hello` frames were ever sent — which is why the terminal looked
       * connected but accepted nothing.
       *
       * `onPointerDown` covers mouse, touch and pen with one handler, and runs
       * before focus settles. Purely behavioural: no markup, class or layout
       * change, so the frozen mobile terminal layout is untouched. A read-only
       * terminal is not focused — it takes no input by design.
       */
      return (
        <div
          className={className}
          ref={terminalElementRef}
          onPointerDown={() => {
            if (!readonly) {
              terminalRef.current?.focus();
            }
          }}
        />
      );
    },
  ),
);
