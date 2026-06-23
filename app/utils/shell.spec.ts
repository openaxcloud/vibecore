import type { CommandEvent, RuntimeAdapter, TerminalSession } from '@vibecore/runtime-contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoltShell } from './shell';
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
 * jsh emits `exit=<code>:<pid>`. BoltShell.waitTillOscCode extracts the final
 * numeric group of the marker as `exitCode` (preserved upstream behavior), so
 * to keep these tests focused on split-marker detection (bug 1) and single-
 * consumer aborting (bug 2) we set code === pid, making the parsed exit code
 * unambiguous regardless of which group is read.
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
