import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TerminalSessionManager, type TerminalSession } from './terminal-session.js';

// These tests exercise the no-PTY fallback backend (node-pty is not installed
// in CI), which is the harder path to get right: a persistent process-group
// shell with cwd/env/history persistence and group-SIGINT for Ctrl+C.

async function collectUntil(
  session: TerminalSession,
  predicate: (buffer: string) => boolean,
  timeoutMs = 5_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = session.scrollback();

    if (predicate(buffer)) {
      resolve(buffer);
      return;
    }

    const detach = session.attach((chunk) => {
      buffer += chunk;

      if (predicate(buffer)) {
        detach();
        resolve(buffer);
      }
    });

    const timer = setTimeout(() => {
      detach();
      reject(new Error(`timeout; buffer so far:\n${buffer}`));
    }, timeoutMs);

    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  });
}

describe('TerminalSessionManager (fallback shell)', () => {
  const managers: TerminalSessionManager[] = [];

  afterEach(() => {
    for (const manager of managers.splice(0)) {
      manager.disposeAll();
    }
  });

  async function newManager() {
    const cwd = await mkdtemp(join(tmpdir(), 'vc-term-'));
    const manager = new TerminalSessionManager({ cwd, reattachGraceMs: 50 });
    managers.push(manager);

    return manager;
  }

  it('persists exported environment across commands in one session', async () => {
    const manager = await newManager();
    const session = await manager.getOrCreate('s1');

    session.write('export VC_TOKEN=persisted-value\n');
    session.write('echo "[$VC_TOKEN]"\n');

    const output = await collectUntil(session, (buffer) => buffer.includes('[persisted-value]'));
    expect(output).toContain('[persisted-value]');
  });

  it('keeps sessions independent', async () => {
    const manager = await newManager();
    const a = await manager.getOrCreate('a');
    const b = await manager.getOrCreate('b');

    a.write('export ONLY_IN_A=yes\n');
    a.write('echo a=[$ONLY_IN_A]\n');
    b.write('echo b=[$ONLY_IN_A]\n');

    expect(await collectUntil(a, (buffer) => buffer.includes('a=[yes]'))).toContain('a=[yes]');
    expect(await collectUntil(b, (buffer) => buffer.includes('b=[]'))).toContain('b=[]');
    expect(manager.size).toBe(2);
  });

  it('reattaches to a running session and replays scrollback', async () => {
    const manager = await newManager();
    const session = await manager.getOrCreate('keep');

    session.write('echo marker-line\n');
    await collectUntil(session, (buffer) => buffer.includes('marker-line'));

    // Reattaching with the same id returns the same live shell with history.
    const same = await manager.getOrCreate('keep');
    expect(same).toBe(session);
    expect(same.scrollback()).toContain('marker-line');
  });

  it('survives SIGINT: interrupt cancels the foreground command, not the shell', async () => {
    const manager = await newManager();
    const session = await manager.getOrCreate('sig');

    // Start a long sleep, then interrupt it.
    session.write('sleep 30\n');
    await new Promise((resolve) => setTimeout(resolve, 300));
    session.interrupt();

    // The shell must still be alive and able to run the next command.
    session.write('echo recovered-after-sigint\n');
    const output = await collectUntil(session, (buffer) => buffer.includes('recovered-after-sigint'), 10_000);
    expect(output).toContain('recovered-after-sigint');
    expect(manager.has('sig')).toBe(true);
  }, 15_000);

  it('disposes a session and frees its slot', async () => {
    const manager = await newManager();
    await manager.getOrCreate('temp');
    expect(manager.has('temp')).toBe(true);

    manager.dispose('temp');
    expect(manager.has('temp')).toBe(false);
    expect(manager.size).toBe(0);
  });

  it('uses the pipe backend when node-pty is unavailable', async () => {
    const manager = await newManager();
    const session = await manager.getOrCreate('mode');
    expect(session.backend.mode).toBe('pipe');
  });
});
