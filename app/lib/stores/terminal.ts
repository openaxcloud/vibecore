import type { RuntimeAdapter, TerminalSession } from '@vibecore/runtime-contract';
import { atom, type WritableAtom } from 'nanostores';
import type { ITerminal } from '~/types/terminal';
import { newBoltShellProcess, newShellProcess } from '~/utils/shell';
import { coloredText } from '~/utils/terminal';

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
    } catch (error: any) {
      terminal.write(coloredText.red('Failed to spawn bolt shell\n\n') + error.message);
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
      const shellProcess = await newShellProcess(runtimeAtStart, terminal, command);

      if (this.#runtime !== runtimeAtStart) {
        try {
          shellProcess.kill();
        } catch {
          // best-effort teardown of the now-orphaned shell
        }

        return;
      }

      this.#terminals.push({ terminal, process: shellProcess });
    } catch (error: any) {
      terminal.write(coloredText.red('Failed to spawn shell\n\n') + error.message);
      return;
    }
  }

  onTerminalResize(cols: number, rows: number) {
    /*
     * The bolt terminal (tab 0) is the PRIMARY managed shell — where the AI runs
     * commands and the dev server / install / build run. It was excluded here, so
     * its remote PTY kept the default 80x24 and wrapped/truncated output. Resize
     * it too, alongside the user-spawned shells.
     */
    this.#boltTerminal.process?.resize(cols, rows);

    for (const { process } of this.#terminals) {
      process.resize(cols, rows);
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
