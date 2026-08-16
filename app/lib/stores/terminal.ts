import type { RuntimeAdapter, TerminalSession } from '@vibecore/runtime-contract';
import { atom, type WritableAtom } from 'nanostores';
import { buildResizePlan, type TerminalSessionEntry } from './terminal-resize';
import { formatTerminalSpawnFailure } from '~/lib/i18n/catalogs/client-visible-errors';
import type { ITerminal } from '~/types/terminal';
import { newBoltShellProcess, newShellProcess } from '~/utils/shell';
import { coloredText } from '~/utils/terminal';

function terminalFailureDiagnostic(error: unknown): { name: string; code?: string } | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const code = (error as Error & { code?: unknown }).code;

  return {
    name: error.name,
    ...(typeof code === 'string' && code.length > 0 ? { code } : {}),
  };
}

export class TerminalStore {
  #runtime: RuntimeAdapter;
  #terminals: Array<{ terminal: ITerminal; process: TerminalSession }> = [];
  #boltTerminal = newBoltShellProcess();

  showTerminal: WritableAtom<boolean> = import.meta.hot?.data?.showTerminal ?? atom(true);

  constructor(runtime: RuntimeAdapter) {
    this.#runtime = runtime;

    if (import.meta.hot?.data) {
      import.meta.hot.data.showTerminal = this.showTerminal;
    }
  }

  setRuntime(runtime: RuntimeAdapter) {
    this.#runtime = runtime;
    this.#terminals.forEach(({ process }) => {
      try {
        process.kill();
      } catch {
        // terminal cleanup is best-effort when switching project workspaces
      }
    });
    this.#terminals = [];

    try {
      this.#boltTerminal.process?.kill();
    } catch {
      // terminal cleanup is best-effort when switching project workspaces
    }

    this.#boltTerminal = newBoltShellProcess();
  }
  get boltTerminal() {
    return this.#boltTerminal;
  }

  toggleTerminal(value?: boolean) {
    this.showTerminal.set(value !== undefined ? value : !this.showTerminal.get());
  }
  async attachBoltTerminal(terminal: ITerminal) {
    try {
      await this.#boltTerminal.init(this.#runtime, terminal);
    } catch (error: unknown) {
      console.warn('Managed terminal shell could not be started', terminalFailureDiagnostic(error));
      terminal.write(`${coloredText.red(formatTerminalSpawnFailure('managed'))}\n\n`);

      return;
    }
  }

  async restartBoltTerminal(terminal: ITerminal) {
    try {
      this.#boltTerminal.process?.kill();
    } catch {
      // terminal cleanup is best-effort when restarting the managed shell
    }

    this.#boltTerminal = newBoltShellProcess();
    await this.attachBoltTerminal(terminal);
  }

  async attachTerminal(terminal: ITerminal, command?: string) {
    /*
     * Capture the runtime at call entry. If a project switch (setRuntime) lands
     * while the shell is spawning, the freshly-spawned process is bound to the
     * OLD runtime; pushing it would track a shell against the wrong workspace and
     * leak it. Kill it and bail if the runtime changed under us.
     */
    const runtimeAtStart = this.#runtime;

    try {
      /*
       * Pane-stable key: the panes array is rebuilt from index 0 on every mount,
       * so pane N always presents the same id and reattaches to its own shell
       * across reloads — instead of leaving the previous one orphaned.
       */
      const sessionKey = `user-${this.#terminals.length}`;
      const shellProcess = await newShellProcess(runtimeAtStart, terminal, command, sessionKey);

      if (this.#runtime !== runtimeAtStart) {
        try {
          shellProcess.kill();
        } catch {
          // best-effort teardown of the now-orphaned shell
        }

        return;
      }

      this.#terminals.push({ terminal, process: shellProcess });
    } catch (error: unknown) {
      console.warn('Terminal shell could not be started', terminalFailureDiagnostic(error));
      terminal.write(`${coloredText.red(formatTerminalSpawnFailure('shell'))}\n\n`);

      return;
    }
  }

  onTerminalResize(cols: number, rows: number) {
    /*
     * In split view two terminals of different pixel widths are visible at once,
     * and each fires its own resize event with its own geometry. Broadcasting a
     * single (cols,rows) to every PTY let the last event win and clobber the other
     * pane — its remote shell got the wrong width and wrapped/truncated output.
     * Resize each PTY to ITS OWN terminal's measured geometry; the event's
     * (cols,rows) is only a fallback for a terminal that has not yet fit().
     *
     * The bolt terminal (tab 0) is the PRIMARY managed shell — where the AI runs
     * commands and the dev server / install / build run — so it is included here
     * with its own measured geometry too.
     */
    const sessions: TerminalSessionEntry[] = [...this.#terminals];
    const boltTerminal = this.#boltTerminal.terminal;
    const boltProcess = this.#boltTerminal.process;

    if (boltTerminal && boltProcess) {
      sessions.push({ terminal: boltTerminal, process: boltProcess });
    }

    /*
     * resize() is fire-and-forget and may return a rejected promise when a remote
     * PTY socket is not OPEN (mid-reconnect). Swallow it so a resize during a flap
     * never surfaces as an unhandled rejection. Promise.resolve tolerates the
     * `void | Promise<void>` return of the RuntimeContract resize signature.
     */
    for (const target of buildResizePlan(sessions, cols, rows)) {
      void Promise.resolve(target.process.resize(target.cols, target.rows)).catch(() => undefined);
    }
  }

  async detachTerminal(terminal: ITerminal) {
    const terminalIndex = this.#terminals.findIndex((t) => t.terminal === terminal);

    if (terminalIndex !== -1) {
      const { process } = this.#terminals[terminalIndex];

      try {
        process.kill();
      } catch (error) {
        console.warn('Failed to kill terminal process:', error);
      }
      this.#terminals.splice(terminalIndex, 1);
    }
  }

  async restartTerminal(terminal: ITerminal, command?: string) {
    await this.detachTerminal(terminal);
    await this.attachTerminal(terminal, command);
  }
}
