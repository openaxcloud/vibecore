import type { RuntimeAdapter, TerminalSession } from '@vibecore/runtime-contract';
import { atom } from 'nanostores';
import { withResolvers } from './promises';
import { runSettlingReady } from './shell-init';
import { bindTerminalInput } from './shell-input-binding';
import { normalizeShellCommand } from './shell-normalizer';
import { stripInternalOscMarkers } from './terminal-output';
import { expoUrlAtom } from '~/lib/stores/qrCodeStore';
import type { ITerminal } from '~/types/terminal';

export async function newShellProcess(runtime: RuntimeAdapter, terminal: ITerminal, command = '/bin/jsh') {
  const useJshOsc = command === '/bin/jsh';

  const session = await runtime.openTerminal({
    command,
    ...(useJshOsc ? { args: ['--osc'] } : {}),
    terminal: {
      cols: terminal.cols ?? 80,
      rows: terminal.rows ?? 15,
    },
  });

  const jshReady = withResolvers<void>();

  let isInteractive = !useJshOsc;

  void (async () => {
    for await (const event of session.events) {
      const data = event.data ?? '';

      if (!data) {
        continue;
      }

      if (useJshOsc && !isInteractive) {
        const [, osc] = data.match(/\x1b\]654;([^\x07]+)\x07/) || [];

        if (osc === 'interactive') {
          isInteractive = true;
          jshReady.resolve();
        }
      }

      /*
       * jsh's internal `\x1b]654;…\x07` markers are part of the host
       * handshake, not user-visible output. xterm.js usually swallows
       * unknown OSC silently but leaks the trailing bytes (`]`, payload
       * fragments) when the sequence straddles two data events. Strip
       * them at ingest so the user never sees `]]]]]]]]` runs.
       */
      const displayData = stripInternalOscMarkers(data);

      try {
        terminal.write(displayData);
      } catch {
        /*
         * The terminal can be disposed (component unmounted) while the remote
         * session is still streaming. Writing to a disposed xterm throws; since
         * this loop is fire-and-forget, an unhandled throw becomes an unhandled
         * rejection. Stop consuming once the sink is gone.
         */
        break;
      }

      try {
        import('~/utils/debugLogger')
          .then(({ captureTerminalLog }) => {
            const cleanData = data.replace(/\x1b\[[0-9;]*[mG]/g, '').trim();

            if (cleanData) {
              captureTerminalLog(cleanData, 'output');
            }
          })
          .catch(() => {
            // Ignore if debug logger is not available
          });
      } catch {
        // Ignore errors in debug logging
      }
    }
  })();

  bindTerminalInput(terminal, (data) => {
    if (isInteractive) {
      session.write(data);

      try {
        import('~/utils/debugLogger')
          .then(({ captureTerminalLog }) => {
            const cleanData = data.replace(/\x1b\[[0-9;]*[A-Z]/g, '').trim();

            if (cleanData && cleanData !== '\r' && cleanData !== '\n') {
              captureTerminalLog(cleanData, 'input');
            }
          })
          .catch(() => {
            // Ignore if debug logger is not available
          });
      } catch {
        // Ignore errors in debug logging
      }
    }
  });

  if (useJshOsc) {
    await jshReady.promise;
  }

  return session;
}

export type ExecutionResult = { output: string; exitCode: number } | undefined;

export class BoltShell {
  #initialized: (() => void) | undefined;
  #readyPromise: Promise<void>;
  #runtime: RuntimeAdapter | undefined;
  #terminal: ITerminal | undefined;
  #process: TerminalSession | undefined;
  executionState = atom<
    { sessionId: string; active: boolean; executionPrms?: Promise<any>; abort?: () => void } | undefined
  >();
  #outputQueue: string[] = [];
  #outputWaiters: Array<(value: string | undefined) => void> = [];

  constructor() {
    this.#readyPromise = new Promise((resolve) => {
      this.#initialized = resolve;
    });
  }

  ready() {
    return this.#readyPromise;
  }

  async init(runtime: RuntimeAdapter, terminal: ITerminal) {
    this.#runtime = runtime;
    this.#terminal = terminal;

    /*
     * Settle ready() even when spawn fails. If newBoltShellProcess() rejects
     * (workspace 502 / WORKSPACE_NOT_STARTED, missing-workspace guard) or the
     * interactive handshake never completes, the throw must still release the
     * readiness promise — otherwise action-runner's `await shell.ready()`
     * blocks forever and the agent can never run a command. runSettlingReady
     * re-throws so terminal.ts can still write the error to xterm.
     */
    await runSettlingReady(
      async () => {
        this.#process = await this.newBoltShellProcess(runtime, terminal);
        await this.waitTillOscCode('interactive');
      },
      () => this.#initialized?.(),
    );
  }

  async newBoltShellProcess(runtime: RuntimeAdapter, terminal: ITerminal) {
    const session = await runtime.openTerminal({
      command: '/bin/jsh',
      args: ['--osc'],
      terminal: {
        cols: terminal.cols ?? 80,
        rows: terminal.rows ?? 15,
      },
    });

    let isInteractive = false;

    void (async () => {
      for await (const event of session.events) {
        const data = event.data ?? '';

        if (!data) {
          continue;
        }

        if (!isInteractive) {
          const [, osc] = data.match(/\x1b\]654;([^\x07]+)\x07/) || [];

          if (osc === 'interactive') {
            isInteractive = true;
          }
        }

        terminal.write(stripInternalOscMarkers(data));
        this.#pushOutput(data);
        this.#watchExpoUrl(data);
      }

      this.#pushOutput(undefined);
    })();

    bindTerminalInput(terminal, (data) => {
      if (isInteractive) {
        session.write(data);
      }
    });

    return session;
  }

  #expoBuffer = '';

  #watchExpoUrl(data: string) {
    this.#expoBuffer += data;

    const expoUrlRegex = /(exp:\/\/[^\s]+)/;
    const expoUrlMatch = this.#expoBuffer.match(expoUrlRegex);

    if (expoUrlMatch) {
      const cleanUrl = expoUrlMatch[1]
        .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
        .replace(/[^\x20-\x7E]+$/g, '');
      expoUrlAtom.set(cleanUrl);
      this.#expoBuffer = this.#expoBuffer.slice(this.#expoBuffer.indexOf(expoUrlMatch[1]) + expoUrlMatch[1].length);
    }

    if (this.#expoBuffer.length > 2048) {
      this.#expoBuffer = this.#expoBuffer.slice(-2048);
    }
  }

  get terminal() {
    return this.#terminal;
  }

  get process() {
    return this.#process;
  }

  async executeCommand(sessionId: string, command: string, abort?: () => void): Promise<ExecutionResult> {
    if (!this.process || !this.terminal) {
      return undefined;
    }

    const state = this.executionState.get();

    if (state?.active && state.abort) {
      state.abort();
    }

    /*
     * interrupt the current execution
     *  this.#shellInputStream?.write('\x03');
     */
    this.terminal.input('\x03');
    await this.waitTillOscCode('prompt');

    if (state && state.executionPrms) {
      await state.executionPrms;
    }

    /*
     * Defensively normalize known jsh/BusyBox quirks (e.g. obsolete
     * `head -20` flag form) before injecting the command into the terminal.
     * See app/utils/shell-normalizer.ts.
     */
    const normalizedCommand = normalizeShellCommand(command.trim());

    //start a new execution
    this.terminal.input(normalizedCommand + '\n');

    //wait for the execution to finish
    const executionPromise = this.getCurrentExecutionResult();
    this.executionState.set({ sessionId, active: true, executionPrms: executionPromise, abort });

    const resp = await executionPromise;
    this.executionState.set({ sessionId, active: false });

    if (resp) {
      try {
        resp.output = cleanTerminalOutput(resp.output);
      } catch (error) {
        console.log('failed to format terminal output', error);
      }
    }

    return resp;
  }

  async getCurrentExecutionResult(): Promise<ExecutionResult> {
    const { output, exitCode } = await this.waitTillOscCode('exit');
    return { output, exitCode };
  }

  onQRCodeDetected?: (qrCode: string) => void;

  async waitTillOscCode(waitCode: string) {
    let fullOutput = '';
    let exitCode: number = 0;
    let buffer = ''; // <-- Add a buffer to accumulate output

    if (!this.#process) {
      return { output: fullOutput, exitCode };
    }

    // Regex for Expo URL
    const expoUrlRegex = /(exp:\/\/[^\s]+)/;

    while (true) {
      const value = await this.#readOutput();

      if (value === undefined) {
        break;
      }

      const text = value || '';
      fullOutput += text;
      buffer += text; // <-- Accumulate in buffer

      // Extract Expo URL from buffer and set store
      const expoUrlMatch = buffer.match(expoUrlRegex);

      if (expoUrlMatch) {
        // Remove any trailing ANSI escape codes or non-printable characters
        const cleanUrl = expoUrlMatch[1]
          .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
          .replace(/[^\x20-\x7E]+$/g, '');
        expoUrlAtom.set(cleanUrl);

        // Remove everything up to and including the URL from the buffer to avoid duplicate matches
        buffer = buffer.slice(buffer.indexOf(expoUrlMatch[1]) + expoUrlMatch[1].length);
      }

      // Check if command completion signal with exit code
      const [, osc, , , code] = text.match(/\x1b\]654;([^\x07=]+)=?((-?\d+):(\d+))?\x07/) || [];

      if (osc === 'exit') {
        /*
         * A truncated/split exit marker can match `osc === 'exit'` with the
         * `=code:pid` group absent, leaving `code` undefined → parseInt(NaN).
         * A NaN exit code defeats every `exitCode !== 0` check downstream, so
         * fall back to 0 when the code is missing/unparseable.
         */
        const parsed = parseInt(code ?? '', 10);
        exitCode = Number.isNaN(parsed) ? 0 : parsed;
      }

      if (osc === waitCode) {
        break;
      }
    }

    return { output: fullOutput, exitCode };
  }

  #pushOutput(value: string | undefined) {
    const waiter = this.#outputWaiters.shift();

    if (waiter) {
      waiter(value);
      return;
    }

    if (value !== undefined) {
      this.#outputQueue.push(value);
    }
  }

  #readOutput() {
    const value = this.#outputQueue.shift();

    if (value !== undefined) {
      return Promise.resolve(value);
    }

    return new Promise<string | undefined>((resolve) => this.#outputWaiters.push(resolve));
  }
}

/**
 * Cleans and formats terminal output while preserving structure and paths
 * Handles ANSI, OSC, and various terminal control sequences
 */
export function cleanTerminalOutput(input: string): string {
  // Step 1: Remove OSC sequences (including those with parameters)
  const removeOsc = input
    .replace(/\x1b\](\d+;[^\x07\x1b]*|\d+[^\x07\x1b]*)\x07/g, '')
    .replace(/\](\d+;[^\n]*|\d+[^\n]*)/g, '');

  // Step 2: Remove ANSI escape sequences and color codes more thoroughly
  const removeAnsi = removeOsc
    // Remove all escape sequences with parameters
    .replace(/\u001b\[[\?]?[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\[[\?]?[0-9;]*[a-zA-Z]/g, '')
    // Remove color codes
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    // Clean up any remaining escape characters
    .replace(/\u001b/g, '')
    .replace(/\x1b/g, '');

  // Step 3: Clean up carriage returns and newlines
  const cleanNewlines = removeAnsi
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  // Step 4: Add newlines at key breakpoints while preserving paths
  const formatOutput = cleanNewlines
    // Preserve prompt line
    .replace(/^([~\/][^\n❯]+)❯/m, '$1\n❯')
    // Add newline before command output indicators
    .replace(/(?<!^|\n)>/g, '\n>')
    // Add newline before error keywords without breaking paths
    .replace(/(?<!^|\n|\w)(error|failed|warning|Error|Failed|Warning):/g, '\n$1:')
    // Add newline before 'at' in stack traces without breaking paths
    .replace(/(?<!^|\n|\/)(at\s+(?!async|sync))/g, '\nat ')
    // Ensure 'at async' stays on same line
    .replace(/\bat\s+async/g, 'at async')
    // Add newline before npm error indicators
    .replace(/(?<!^|\n)(npm ERR!)/g, '\n$1');

  // Step 5: Clean up whitespace while preserving intentional spacing
  const cleanSpaces = formatOutput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');

  // Step 6: Final cleanup
  return cleanSpaces
    .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with double newlines
    .replace(/:\s+/g, ': ') // Normalize spacing after colons
    .replace(/\s{2,}/g, ' ') // Remove multiple spaces
    .replace(/^\s+|\s+$/g, '') // Trim start and end
    .replace(/\u0000/g, ''); // Remove null characters
}

export function newBoltShellProcess() {
  return new BoltShell();
}
