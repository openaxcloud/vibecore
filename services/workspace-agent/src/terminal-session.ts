import { spawn, type ChildProcess } from 'node:child_process';

/*
 * Real, persistent terminal sessions for the workspace agent.
 *
 * Each session owns a long-lived shell process, so working directory, exported
 * environment and shell history all persist across commands the way a real
 * terminal does. Sessions are addressable by id so a client that drops its
 * WebSocket can reattach to the same shell (with recent scrollback replayed)
 * instead of losing its state.
 *
 * Two backends:
 *  - node-pty (preferred): a true PTY. Interactive programs, line editing,
 *    echo, resize and Ctrl+C-as-SIGINT all work because the kernel pty + shell
 *    handle them. Loaded lazily and optionally — if the native module is not
 *    present the agent transparently falls back.
 *  - process-group shell (fallback): a piped shell spawned as its own process
 *    group so Ctrl+C can be delivered to the foreground command via SIGINT to
 *    the group. No pseudo-terminal, so there is no kernel echo/line-editing,
 *    but commands run, output streams, and cwd/env/history still persist.
 */

export interface TerminalBackend {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  interrupt(): void;
  onData(listener: (chunk: string) => void): void;
  onExit(listener: (exitCode: number) => void): void;
  kill(signal?: NodeJS.Signals): void;
  readonly mode: 'pty' | 'pipe';
}

export interface TerminalSpawnOptions {
  shell: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  cols: number;
  rows: number;
}

// node-pty is an optional (native) dependency. Resolve it once; cache null on
// failure so we don't repeatedly pay the import cost when it isn't installed.
// The specifier is hidden behind an indirect import so the build doesn't fail
// when the module is absent — presence is a pure runtime concern.
const importOptional = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<any>;

let ptyModulePromise: Promise<any | null> | undefined;

async function loadPtyModule(): Promise<any | null> {
  if (ptyModulePromise === undefined) {
    ptyModulePromise = importOptional('node-pty')
      .then((mod) => (mod as { default?: unknown }).default ?? mod)
      .catch(() => null);
  }

  return ptyModulePromise;
}

function createPtyBackend(pty: any, options: TerminalSpawnOptions): TerminalBackend {
  const proc = pty.spawn(options.shell, [], {
    name: 'xterm-256color',
    cols: options.cols,
    rows: options.rows,
    cwd: options.cwd,
    env: options.env,
  });

  return {
    mode: 'pty',
    write: (data) => proc.write(data),
    resize: (cols, rows) => {
      try {
        proc.resize(Math.max(1, cols), Math.max(1, rows));
      } catch {
        // resizing a dead pty throws; ignore.
      }
    },
    interrupt: () => proc.write('\x03'),
    onData: (listener) => proc.onData(listener),
    onExit: (listener) => proc.onExit((event: { exitCode: number }) => listener(event.exitCode ?? 0)),
    kill: (signal) => {
      try {
        proc.kill(signal);
      } catch {
        // already gone
      }
    },
  };
}

function createPipeBackend(options: TerminalSpawnOptions): TerminalBackend {
  // `detached: true` makes the child a process-group leader so we can deliver a
  // signal to the whole group (the shell + whatever it is currently running).
  const child: ChildProcess = spawn(options.shell, [], {
    cwd: options.cwd,
    env: { ...options.env, COLUMNS: String(options.cols), LINES: String(options.rows) },
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Install a *caught* (no-op) SIGINT handler in the shell. A caught signal is
  // reset to its default disposition in exec'd children, so a Ctrl+C delivered
  // to the whole process group kills the foreground command (default action)
  // while the shell itself survives — the same end-result as a PTY's job
  // control, without a controlling terminal.
  child.stdin?.write("trap ':' INT\n");

  const dataListeners: Array<(chunk: string) => void> = [];
  const exitListeners: Array<(exitCode: number) => void> = [];

  const emit = (chunk: Buffer) => {
    const text = chunk.toString();

    for (const listener of dataListeners) {
      listener(text);
    }
  };

  child.stdout?.on('data', emit);
  child.stderr?.on('data', emit);
  child.on('exit', (code) => {
    for (const listener of exitListeners) {
      listener(code ?? 0);
    }
  });

  const signalGroup = (signal: NodeJS.Signals) => {
    if (child.pid === undefined) {
      return;
    }

    try {
      // Negative pid → the process group.
      process.kill(-child.pid, signal);
    } catch {
      try {
        child.kill(signal);
      } catch {
        // already gone
      }
    }
  };

  return {
    mode: 'pipe',
    write: (data) => {
      child.stdin?.write(data);
    },
    resize: (cols, rows) => {
      // No pty to resize; keep COLUMNS/LINES roughly informative for new
      // children by exporting through the shell.
      child.stdin?.write(`export COLUMNS=${Math.max(1, cols)} LINES=${Math.max(1, rows)}\n`);
    },
    interrupt: () => signalGroup('SIGINT'),
    onData: (listener) => {
      dataListeners.push(listener);
    },
    onExit: (listener) => {
      exitListeners.push(listener);
    },
    kill: (signal = 'SIGTERM') => signalGroup(signal),
  };
}

export async function createTerminalBackend(options: TerminalSpawnOptions): Promise<TerminalBackend> {
  const pty = await loadPtyModule();

  if (pty && typeof pty.spawn === 'function') {
    try {
      return createPtyBackend(pty, options);
    } catch {
      // fall through to the pipe backend on any spawn failure
    }
  }

  return createPipeBackend(options);
}

export interface TerminalSession {
  readonly id: string;
  readonly backend: TerminalBackend;
  /** Recent output kept so a reattaching client can repaint its screen. */
  scrollback(): string;
  attach(listener: (chunk: string) => void): () => void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  interrupt(): void;
  dispose(signal?: NodeJS.Signals): void;
}

export interface TerminalSessionManagerOptions {
  shell?: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /** Max bytes of scrollback retained per session. */
  scrollbackBytes?: number;
  /** How long a detached session stays alive awaiting reattach. */
  reattachGraceMs?: number;
  maxSessions?: number;
}

/*
 * Owns the live sessions for one workspace agent. Sessions survive a client
 * disconnect for `reattachGraceMs` so a flaky network doesn't kill the user's
 * shell; an explicit kill or the grace timeout disposes it.
 */
export class TerminalSessionManager {
  private readonly sessions = new Map<string, InternalSession>();
  private readonly shell: string;
  private readonly cwd: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly scrollbackBytes: number;
  private readonly reattachGraceMs: number;
  private readonly maxSessions: number;

  constructor(options: TerminalSessionManagerOptions) {
    this.shell = options.shell ?? process.env.SHELL ?? '/bin/bash';
    this.cwd = options.cwd;
    this.env = options.env ?? process.env;
    this.scrollbackBytes = options.scrollbackBytes ?? 256 * 1024;
    this.reattachGraceMs = options.reattachGraceMs ?? 5 * 60 * 1000;
    this.maxSessions = options.maxSessions ?? 16;
  }

  get size() {
    return this.sessions.size;
  }

  has(id: string) {
    return this.sessions.has(id);
  }

  async getOrCreate(
    id: string,
    spawn: { cols?: number; rows?: number } = {},
  ): Promise<TerminalSession> {
    const existing = this.sessions.get(id);

    if (existing) {
      if (existing.disposeTimer) {
        clearTimeout(existing.disposeTimer);
        existing.disposeTimer = undefined;
      }

      return existing.handle;
    }

    if (this.sessions.size >= this.maxSessions) {
      throw new Error('Too many terminal sessions');
    }

    const backend = await createTerminalBackend({
      shell: this.shell,
      cwd: this.cwd,
      env: this.env,
      cols: spawn.cols ?? 80,
      rows: spawn.rows ?? 24,
    });

    const internal: InternalSession = {
      listeners: new Set(),
      buffer: '',
      disposeTimer: undefined,
      handle: undefined as unknown as TerminalSession,
    };

    backend.onData((chunk) => {
      internal.buffer = (internal.buffer + chunk).slice(-this.scrollbackBytes);

      for (const listener of internal.listeners) {
        listener(chunk);
      }
    });

    backend.onExit(() => {
      this.sessions.delete(id);
    });

    const handle: TerminalSession = {
      id,
      backend,
      scrollback: () => internal.buffer,
      attach: (listener) => {
        internal.listeners.add(listener);

        return () => {
          internal.listeners.delete(listener);

          // Last viewer left: keep the shell alive briefly for reattach.
          if (internal.listeners.size === 0 && !internal.disposeTimer) {
            internal.disposeTimer = setTimeout(() => {
              this.dispose(id);
            }, this.reattachGraceMs);

            if (typeof internal.disposeTimer.unref === 'function') {
              internal.disposeTimer.unref();
            }
          }
        };
      },
      write: (data) => backend.write(data),
      resize: (cols, rows) => backend.resize(cols, rows),
      interrupt: () => backend.interrupt(),
      dispose: (signal) => this.dispose(id, signal),
    };

    internal.handle = handle;
    this.sessions.set(id, internal);

    return handle;
  }

  dispose(id: string, signal: NodeJS.Signals = 'SIGTERM') {
    const internal = this.sessions.get(id);

    if (!internal) {
      return;
    }

    if (internal.disposeTimer) {
      clearTimeout(internal.disposeTimer);
    }

    this.sessions.delete(id);
    internal.handle.backend.kill(signal);
  }

  disposeAll() {
    for (const id of [...this.sessions.keys()]) {
      this.dispose(id);
    }
  }
}

interface InternalSession {
  listeners: Set<(chunk: string) => void>;
  buffer: string;
  disposeTimer: ReturnType<typeof setTimeout> | undefined;
  handle: TerminalSession;
}
