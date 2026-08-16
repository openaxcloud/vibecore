import type { RuntimeAdapter, TerminalSession } from '@vibecore/runtime-contract';
import { atom } from 'nanostores';
import { withResolvers } from './promises';
import { runSettlingReady } from './shell-init';
import { bindTerminalInput } from './shell-input-binding';
import { createInteractiveInputGate } from './shell-interactive-gate';
import { normalizeShellCommand } from './shell-normalizer';
import { stripInternalOscMarkers } from './terminal-output';
import { expoUrlAtom } from '~/lib/stores/qrCodeStore';
import type { ITerminal } from '~/types/terminal';

export async function newShellProcess(
  runtime: RuntimeAdapter,
  terminal: ITerminal,
  command = '/bin/jsh',
  sessionKey?: string,
) {
  const useJshOsc = command === '/bin/jsh';

  const session = await runtime.openTerminal({
    command,
    ...(useJshOsc ? { args: ['--osc'] } : {}),
    terminal: {
      cols: terminal.cols ?? 80,
      rows: terminal.rows ?? 15,
    },
    ...(sessionKey ? { sessionKey } : {}),
  });

  const jshReady = withResolvers<void>();

  const inputGate = createInteractiveInputGate({
    write: (data) => session.write(data),
    initiallyOpen: !useJshOsc,
  });

  void (async () => {
    try {
      for await (const event of session.events) {
        const data = event.data ?? '';

        if (!data) {
          continue;
        }

        if (useJshOsc && !inputGate.isOpen) {
          inputGate.observeOutput(data);

          if (inputGate.isOpen) {
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
    } finally {
      /*
       * The session can end WITHOUT ever emitting the `interactive` OSC marker:
       * jsh crashes on a degraded/502 workspace, the PTY exits immediately
       * (command-not-found), or the runtime-remote event queue closes before the
       * handshake completes. In that case `jshReady` was never resolved, so the
       * `await jshReady.promise` below would hang forever and newShellProcess()
       * would never settle. The session has already streamed (and closed), so
       * treat handshake-not-seen as closed/ready and release the awaiter.
       * resolve() is idempotent — a no-op once the marker has already resolved it.
       */
      jshReady.resolve();
    }
  })();

  bindTerminalInput(terminal, (data) => {
    inputGate.send(data);

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

  /*
   * Cancellation handle for the currently-running waitTillOscCode loop. Only a
   * single loop may consume the shared output queue at a time. When a new
   * execution aborts a previous one, we must terminate the prior loop before
   * starting a fresh wait — otherwise both loops drain #readOutput() and each
   * sees only a subset of the chunks (interleaved / missed OSC markers).
   */
  #activeWaitCancel: (() => void) | undefined;

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

      /*
       * There is exactly ONE managed shell per workspace, so a constant key is
       * the right stable identity: reopening the IDE reattaches to the running
       * dev server instead of spawning a rival shell on the same port.
       */
      sessionKey: 'managed',
      terminal: {
        cols: terminal.cols ?? 80,
        rows: terminal.rows ?? 15,
      },

      /*
       * The always-on managed shell (dev server / installs / agent commands).
       * Flagged so the API does not charge it against `terminals.concurrent` —
       * otherwise on the free tier (limit 1) it occupies the only slot and every
       * user-opened terminal is 429'd on connect, flapping forever.
       */
      managed: true,
    });

    const inputGate = createInteractiveInputGate({ write: (data) => session.write(data) });

    void (async () => {
      for await (const event of session.events) {
        const data = event.data ?? '';

        if (!data) {
          continue;
        }

        inputGate.observeOutput(data);

        terminal.write(stripInternalOscMarkers(data));
        this.#pushOutput(data);
        this.#watchExpoUrl(data);
      }

      this.#pushOutput(undefined);
    })();

    bindTerminalInput(terminal, (data) => {
      inputGate.send(data);
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
     * Terminate the previous execution's waitTillOscCode loop before we start a
     * new one. action-runner's abort() only cancels the agent action — it does
     * NOT stop the prior getCurrentExecutionResult() → waitTillOscCode('exit')
     * loop, which is still pending and still draining the shared #readOutput()
     * queue. If we start the 'prompt' wait below while that loop lives, both
     * consumers split the chunk stream and each can miss its OSC marker or
     * mis-parse the exit code. Cancelling first restores the single-consumer
     * invariant. We then drain its (now-settled) promise so state is clean.
     */
    if (state?.active) {
      this.#cancelActiveWait();

      if (state.executionPrms) {
        await state.executionPrms;
      }
    }

    /*
     * interrupt the current execution
     *  this.#shellInputStream?.write('\x03');
     */
    this.terminal.input('\x03');
    await this.waitTillOscCode('prompt');

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

    /*
     * Register this loop as the sole active consumer of the output queue. If a
     * previous loop was still registered (it should have been cancelled by the
     * caller) we cancel it defensively to preserve the single-consumer
     * invariant. `cancelled` is flipped by #cancelActiveWait, which also wakes a
     * pending #readOutput() by resolving its waiter with `undefined`.
     */
    if (this.#activeWaitCancel) {
      this.#cancelActiveWait();
    }

    let cancelled = false;
    let wakeWaiter: ((value: string | undefined) => void) | undefined;

    const cancel = () => {
      cancelled = true;

      // Wake a read that is currently parked, if any.
      const idx = wakeWaiter ? this.#outputWaiters.indexOf(wakeWaiter) : -1;

      if (idx !== -1) {
        this.#outputWaiters.splice(idx, 1);
      }

      wakeWaiter?.(undefined);
      wakeWaiter = undefined;
    };
    this.#activeWaitCancel = cancel;

    // Regex for Expo URL
    const expoUrlRegex = /(exp:\/\/[^\s]+)/;

    try {
      while (true) {
        const value = await this.#readOutput((resolve) => {
          wakeWaiter = resolve;
        });
        wakeWaiter = undefined;

        if (cancelled || value === undefined) {
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

        /*
         * Check for a command-completion / prompt marker.
         *
         * The OSC marker (`\x1b]654;exit=code:pid\x07`, `\x1b]654;prompt\x07`)
         * can be split across two `data` events (see terminal-output.ts). Matching
         * the per-chunk `text` misses a straddling marker, so the loop never sees
         * `osc === waitCode` and hangs until the session ends. Match against the
         * accumulated `buffer` instead and slice off the consumed bytes so the
         * same marker is not re-matched on the next iteration.
         */
        const oscMatch = buffer.match(/\x1b\]654;([^\x07=]+)=?((-?\d+):(\d+))?\x07/);

        if (oscMatch) {
          /*
           * The marker payload is `exit=<code>:<pid>` (see terminal-session.ts).
           * Regex groups: 1=osc name, 2=`<code>:<pid>`, 3=`<code>`, 4=`<pid>`.
           * Bind to group 3 (the exit code) — group 4 is the PID and must not be
           * read as the exit code, otherwise a runtime that emits a distinct PID
           * reports successful (exit 0) commands as failures.
           */
          const [full, osc, , exitStr] = oscMatch;

          // Drop everything up to and including the matched marker from the buffer.
          const matchEnd = (oscMatch.index ?? 0) + full.length;
          buffer = buffer.slice(matchEnd);

          if (osc === 'exit') {
            /*
             * A truncated/split exit marker can match `osc === 'exit'` with the
             * `=code:pid` group absent, leaving `exitStr` undefined → parseInt(NaN).
             * A NaN exit code defeats every `exitCode !== 0` check downstream, so
             * fall back to 0 when the code is missing/unparseable.
             */
            const parsed = parseInt(exitStr ?? '', 10);
            exitCode = Number.isNaN(parsed) ? 0 : parsed;
          }

          if (osc === waitCode) {
            break;
          }
        }
      }
    } finally {
      /*
       * Deregister so a later cancel/loop does not act on a finished wait. Only
       * clear if no newer loop has already replaced our handle.
       */
      if (this.#activeWaitCancel === cancel) {
        this.#activeWaitCancel = undefined;
      }
    }

    return { output: fullOutput, exitCode };
  }

  /*
   * Terminate the currently-active waitTillOscCode loop (if any) so a new loop
   * can become the sole consumer of the output queue. See #activeWaitCancel.
   */
  #cancelActiveWait() {
    const cancel = this.#activeWaitCancel;
    this.#activeWaitCancel = undefined;
    cancel?.();
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

  #readOutput(register?: (resolve: (value: string | undefined) => void) => void) {
    const value = this.#outputQueue.shift();

    if (value !== undefined) {
      return Promise.resolve(value);
    }

    return new Promise<string | undefined>((resolve) => {
      this.#outputWaiters.push(resolve);

      /*
       * Hand the parked resolver back to the caller so a cancel can wake (and
       * deregister) this specific read instead of consuming an unrelated chunk.
       */
      register?.(resolve);
    });
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
