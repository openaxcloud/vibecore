import { describe, expect, it, vi } from 'vitest';
import { bindTerminalInput, disposeTerminalInput } from './shell-input-binding';
import type { ITerminal } from '~/types/terminal';

/**
 * Fake xterm-like terminal whose `onData` returns an IDisposable, exactly like
 * the real `@xterm/xterm` Terminal. xterm APPENDS listeners; it never replaces
 * them, so every registered handler fires on each keystroke until disposed.
 */
function createFakeTerminal() {
  const handlers: Array<(data: string) => void> = [];

  const terminal = {
    cols: 80,
    rows: 24,
    reset: vi.fn(),
    write: vi.fn(),
    input: vi.fn(),
    onData: (cb: (data: string) => void) => {
      handlers.push(cb);

      return {
        dispose: () => {
          const index = handlers.indexOf(cb);

          if (index !== -1) {
            handlers.splice(index, 1);
          }
        },
      };
    },
  } as unknown as ITerminal;

  const emit = (data: string) => {
    for (const handler of [...handlers]) {
      handler(data);
    }
  };

  return { terminal, emit, handlerCount: () => handlers.length };
}

describe('bindTerminalInput', () => {
  it('routes input to the registered handler', () => {
    const { terminal, emit } = createFakeTerminal();
    const received: string[] = [];

    bindTerminalInput(terminal, (data) => received.push(data));
    emit('a');

    expect(received).toEqual(['a']);
  });

  it('disposes the previous handler when re-bound on the same terminal (no duplicate dispatch)', () => {
    const { terminal, emit, handlerCount } = createFakeTerminal();
    const first = vi.fn();
    const second = vi.fn();

    bindTerminalInput(terminal, first);
    bindTerminalInput(terminal, second);

    // Only one live listener — the stale one was disposed on re-bind.
    expect(handlerCount()).toBe(1);

    emit('x');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith('x');
  });

  it('does not leak listeners across many restarts', () => {
    const { terminal, emit, handlerCount } = createFakeTerminal();
    const handlers = Array.from({ length: 5 }, () => vi.fn());

    for (const handler of handlers) {
      bindTerminalInput(terminal, handler);
    }

    expect(handlerCount()).toBe(1);

    emit('k');

    // Each keystroke fires exactly once, on the live handler only.
    handlers.slice(0, -1).forEach((handler) => expect(handler).not.toHaveBeenCalled());
    expect(handlers[handlers.length - 1]).toHaveBeenCalledTimes(1);
  });

  it('keeps separate bindings for distinct terminals', () => {
    const a = createFakeTerminal();
    const b = createFakeTerminal();
    const handlerA = vi.fn();
    const handlerB = vi.fn();

    bindTerminalInput(a.terminal, handlerA);
    bindTerminalInput(b.terminal, handlerB);

    a.emit('1');
    b.emit('2');

    expect(handlerA).toHaveBeenCalledExactlyOnceWith('1');
    expect(handlerB).toHaveBeenCalledExactlyOnceWith('2');
  });

  it('dispose() via returned handle stops dispatch and clears the binding', () => {
    const { terminal, emit, handlerCount } = createFakeTerminal();
    const handler = vi.fn();

    const binding = bindTerminalInput(terminal, handler);
    binding.dispose();

    expect(handlerCount()).toBe(0);

    emit('q');

    expect(handler).not.toHaveBeenCalled();
  });

  it('disposeTerminalInput is a no-op when nothing is bound', () => {
    const { terminal } = createFakeTerminal();

    expect(() => disposeTerminalInput(terminal)).not.toThrow();
  });
});
