import type { CommandEvent, RuntimeAdapter, TerminalSession } from '@vibecore/runtime-contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoltShell, newShellProcess } from './shell';
import type { ITerminal } from '~/types/terminal';

vi.mock('~/lib/stores/qrCodeStore', () => ({ expoUrlAtom: { set: vi.fn() } }));
vi.mock('~/utils/debugLogger', () => ({ captureTerminalLog: vi.fn() }));

/**
 * A hand-driven TerminalSession whose `events` async-iterable yields whatever
 * we `emit()` into it. This lets a test reproduce the chunk-by-chunk delivery
 * (including OSC markers split across two `data` events) that the real remote
 * runtime exhibits.
 */
class FakeSession implements TerminalSession {
  id = 'sess-1';
  processId = 'proc-1';
  cols = 80;
  rows = 15;

  written: string[] = [];

  #queue: CommandEvent[] = [];
  #waiters: Array<(r: IteratorResult<CommandEvent>) => void> = [];
  #ended = false;

  write(data: string) {
    this.written.push(data);
  }

  resize() {}
  kill() {}

  /** Push a stdout chunk to consumers of `events`. */
  emit(data: string) {
    const event: CommandEvent = { type: 'stdout', data, timestamp: new Date().toISOString() };
    const waiter = this.#waiters.shift();

    if (waiter) {
      waiter({ value: event, done: false });
    } else {
      this.#queue.push(event);
    }
  }

  end() {
    this.#ended = true;

    while (this.#waiters.length) {
      this.#waiters.shift()!({ value: undefined as any, done: true });
    }
  }

  events: AsyncIterable<CommandEvent> = {
    [Symbol.asyncIterator]: () => ({
      next: () => {
        const queued = this.#queue.shift();

        if (queued) {
          return Promise.resolve({ value: queued, done: false });
        }

        if (this.#ended) {
          return Promise.resolve({ value: undefined as any, done: true });
        }

        return new Promise<IteratorResult<CommandEvent>>((resolve) => this.#waiters.push(resolve));
      },
    }),
  };
}

function makeTerminal(): ITerminal & { inputs: string[] } {
  const handlers: Array<(data: string) => void> = [];

  return {
    cols: 80,
    rows: 15,
    inputs: [],
    reset() {},
    write() {},
    onData(cb: (data: string) => void) {
      handlers.push(cb);

      return { dispose() {} } as any;
    },
    input(data: string) {
      this.inputs.push(data);

      for (const h of handlers) {
        h(data);
      }
    },
  };
}

async function flush() {
  // Let queued microtasks (the events loop pumping chunks) run.
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

async function newReadyShell() {
  const session = new FakeSession();

  const runtime = {
    openTerminal: vi.fn().mockResolvedValue(session),
  } as unknown as RuntimeAdapter;

  const terminal = makeTerminal();

  const shell = new BoltShell();
  const initPromise = shell.init(runtime, terminal);

  // Complete the interactive handshake so init() resolves.
  await flush();
  session.emit('\x1b]654;interactive\x07');
  await initPromise;

  return { shell, session, terminal };
}

/*
 * jsh emits `exit=<code>:<pid>`. BoltShell.waitTillOscCode extracts the `<code>`
 * group as `exitCode`. For the split-marker (bug 1) and single-consumer abort
 * (bug 2) tests we set code === pid so the assertion is unambiguous; a dedicated
 * test below uses a distinct PID to lock in that the code group (not the PID) is
 * read.
 */
const EXIT = (code: number) => `\x1b]654;exit=${code}:${code}\x07`;
const PROMPT = '\x1b]654;prompt\x07';

describe('BoltShell.waitTillOscCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects an exit marker that arrives in a single chunk', async () => {
    const { shell, session } = await newReadyShell();

    const wait = shell.waitTillOscCode('exit');
    await flush();
    session.emit('build done\n' + EXIT(0));

    const result = await wait;
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('build done');
  });

  it('reads the exit code group, not the PID group, when code !== pid', async () => {
    const { shell, session } = await newReadyShell();

    const wait = shell.waitTillOscCode('exit');
    await flush();

    /*
     * Marker carries the documented `exit=<code>:<pid>` contract with a real,
     * distinct PID. A successful command (exit 0) running as PID 1234 must
     * report exitCode 0, never the PID.
     */
    session.emit('all good\n\x1b]654;exit=0:1234\x07');

    const result = await wait;
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('all good');
  });

  it('detects an exit marker SPLIT across two data events (bug 1)', async () => {
    const { shell, session } = await newReadyShell();

    const marker = EXIT(7);
    const splitAt = Math.floor(marker.length / 2);

    const wait = shell.waitTillOscCode('exit');
    await flush();

    // The marker straddles two chunks: neither half matches on its own.
    session.emit('npm ERR! oops\n' + marker.slice(0, splitAt));
    await flush();
    session.emit(marker.slice(splitAt) + 'trailing');

    // Without the buffer-based match this never resolves (loop hangs forever).
    const result = await Promise.race([
      wait,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('waitTillOscCode hung on split marker')), 1000),
      ),
    ]);

    expect(result.exitCode).toBe(7);
    expect(result.output).toContain('npm ERR! oops');
  });

  it('parses a prompt marker split across chunks', async () => {
    const { shell, session } = await newReadyShell();

    const wait = shell.waitTillOscCode('prompt');
    await flush();
    session.emit(PROMPT.slice(0, 5));
    await flush();
    session.emit(PROMPT.slice(5));

    const result = await Promise.race([
      wait,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('hung on split prompt')), 1000)),
    ]);
    expect(result).toBeDefined();
  });
});

describe('newShellProcess jsh handshake (bug 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const TIMEOUT = (label: string) =>
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(label)), 1000));

  it('resolves once the interactive OSC marker arrives', async () => {
    const session = new FakeSession();
    const runtime = { openTerminal: vi.fn().mockResolvedValue(session) } as unknown as RuntimeAdapter;

    const pending = newShellProcess(runtime, makeTerminal());
    await flush();
    session.emit('\x1b]654;interactive\x07');

    const result = await Promise.race([pending, TIMEOUT('newShellProcess never resolved after interactive marker')]);
    expect(result).toBe(session);
  });

  it('resolves (does not hang) when the session ends WITHOUT an interactive marker', async () => {
    const session = new FakeSession();
    const runtime = { openTerminal: vi.fn().mockResolvedValue(session) } as unknown as RuntimeAdapter;

    const pending = newShellProcess(runtime, makeTerminal());
    await flush();

    /*
     * Simulate jsh crashing / the PTY exiting immediately on a degraded
     * workspace: some output streams, then the event queue closes before the
     * `interactive` handshake is ever seen. The awaited jshReady promise must
     * still settle instead of hanging forever.
     */
    session.emit('jsh: command not found\n');
    await flush();
    session.end();

    const result = await Promise.race([
      pending,
      TIMEOUT('newShellProcess hung forever when handshake never completed'),
    ]);
    expect(result).toBe(session);
  });

  it('does not await the handshake for a non-jsh command', async () => {
    const session = new FakeSession();
    const runtime = { openTerminal: vi.fn().mockResolvedValue(session) } as unknown as RuntimeAdapter;

    // A plain shell command (useJshOsc === false) returns without waiting.
    const result = await Promise.race([
      newShellProcess(runtime, makeTerminal(), '/bin/bash'),
      TIMEOUT('newShellProcess awaited handshake for a non-jsh command'),
    ]);
    expect(result).toBe(session);
  });
});

describe('newShellProcess input reaches the PTY (BUG-TERM-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Le trou de couverture qui a laissé passer BUG-TERM-001 : aucun test ne
   * suivait une frappe depuis `terminal.onData` jusqu'à `session.write`. Le
   * terminal pouvait donc rester ouvert, afficher son invite, et avaler
   * silencieusement chaque touche.
   */
  it('forwards a keystroke to the session once the handshake arrived', async () => {
    const session = new FakeSession();
    const runtime = { openTerminal: vi.fn().mockResolvedValue(session) } as unknown as RuntimeAdapter;
    const terminal = makeTerminal();

    const ready = newShellProcess(runtime, terminal);
    await flush();
    session.emit('\x1b]654;interactive\x07');
    await ready;

    terminal.input('ls\n');

    expect(session.written).toEqual(['ls\n']);
  });

  /**
   * Cas réel de reattach : `interactive` n'est PAS le premier marqueur du chunk.
   * L'ancienne détection ne lisait que le premier et restait fermée à jamais.
   */
  it('forwards input when interactive is not the FIRST marker of the chunk', async () => {
    const session = new FakeSession();
    const runtime = { openTerminal: vi.fn().mockResolvedValue(session) } as unknown as RuntimeAdapter;
    const terminal = makeTerminal();

    const ready = newShellProcess(runtime, terminal);
    await flush();
    session.emit('\x1b]654;exit=0:0\x07\x1b]654;prompt\x07\x1b]654;interactive\x07/workspace $ ');
    await ready;

    terminal.input('whoami\n');

    expect(session.written).toEqual(['whoami\n']);
  });

  /** Marqueur coupé entre deux frames WebSocket. */
  it('forwards input when the interactive marker is SPLIT across two chunks', async () => {
    const session = new FakeSession();
    const runtime = { openTerminal: vi.fn().mockResolvedValue(session) } as unknown as RuntimeAdapter;
    const terminal = makeTerminal();

    const ready = newShellProcess(runtime, terminal);
    await flush();
    session.emit('\x1b]654;inter');
    await flush();
    session.emit('active\x07/workspace $ ');
    await ready;

    terminal.input('pwd\n');

    expect(session.written).toEqual(['pwd\n']);
  });

  /** Garantie centrale : une frappe reçue AVANT le marqueur n'est pas perdue. */
  it('queues a keystroke typed before the handshake and flushes it after', async () => {
    const session = new FakeSession();
    const runtime = { openTerminal: vi.fn().mockResolvedValue(session) } as unknown as RuntimeAdapter;
    const terminal = makeTerminal();

    const ready = newShellProcess(runtime, terminal);
    await flush();

    terminal.input('echo tot\n');
    expect(session.written).toEqual([]);

    session.emit('\x1b]654;interactive\x07');
    await ready;

    expect(session.written).toEqual(['echo tot\n']);
  });
});

describe('BoltShell.executeCommand abort (bug 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('terminates the prior exit-wait loop so only one consumer drains the queue', async () => {
    const { shell, session } = await newReadyShell();

    // Start a long-running command; its exit marker never arrives.
    const first = shell.executeCommand('run-1', 'sleep 999');
    await flush();
    session.emit('starting long task...\n');
    await flush();

    // While it's still active, fire a second command. This aborts the first.
    const abortSpy = vi.fn();
    const secondPromise = shell.executeCommand('run-2', 'echo hi', abortSpy);
    await flush();

    /*
     * The abort sends \x03 and waits for a prompt. Deliver the prompt SPLIT
     * across two events. If the old exit-loop were still consuming the queue,
     * one of these halves would be stolen and the prompt would never be matched.
     */
    session.emit(PROMPT.slice(0, 4));
    await flush();
    session.emit(PROMPT.slice(4));
    await flush();

    // The first (aborted) command must have settled — its loop was cancelled.
    const firstResult = await Promise.race([
      first,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('first executeCommand never settled after abort')), 1000),
      ),
    ]);
    expect(firstResult).toBeDefined();

    /*
     * Now feed the second command's real output + exit. Only one consumer
     * should read it, so it must arrive intact.
     */
    session.emit('hi\n');
    await flush();
    session.emit(EXIT(0));

    const second = await Promise.race([
      secondPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('second executeCommand hung (output split between two loops)')), 1000),
      ),
    ]);

    expect(second).toBeDefined();
    expect(second!.exitCode).toBe(0);
    expect(second!.output).toContain('hi');
  });
});
