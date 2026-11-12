import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureRuntimeSocketInput } from './runtime-socket-input.js';

function setup() {
  const socket = Object.assign(new EventEmitter(), { close: vi.fn() });
  const input = captureRuntimeSocketInput(socket);

  return { socket, input };
}

afterEach(() => vi.useRealTimers());

describe('pre-authorization runtime socket input', () => {
  it('holds ordered input until explicitly activated', () => {
    const { socket, input } = setup();
    const send = vi.fn();
    socket.emit('message', Buffer.from('hello'));
    socket.emit('message', Buffer.from('stdin'));
    expect(send).not.toHaveBeenCalled();
    input.activate(send);
    socket.emit('message', Buffer.from('later'));
    expect(send.mock.calls).toEqual([['hello'], ['stdin'], ['later']]);
    input.dispose();
  });

  it('discards input on denied authorization and removes listeners', () => {
    const { socket, input } = setup();
    socket.emit('message', Buffer.from('must not execute'));
    input.dispose();

    const send = vi.fn();
    input.activate(send);
    expect(send).not.toHaveBeenCalled();
    expect(socket.listenerCount('message')).toBe(0);
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it('bounds buffered bytes and messages and never forwards overflow', () => {
    for (const messages of [[Buffer.alloc(256 * 1024 + 1)], Array.from({ length: 1001 }, () => Buffer.from('x'))]) {
      const { socket, input } = setup();

      for (const message of messages) {
        socket.emit('message', message);
      }

      const send = vi.fn();
      input.activate(send);
      expect(input.closed).toBe(true);
      expect(send).not.toHaveBeenCalled();
      expect(socket.close).toHaveBeenCalledTimes(1);
    }
  });

  it('expires a stalled authorization without forwarding', () => {
    vi.useFakeTimers();

    const { socket, input } = setup();
    socket.emit('message', Buffer.from('hello'));
    vi.advanceTimersByTime(30_000);
    expect(input.closed).toBe(true);

    const send = vi.fn();
    input.activate(send);
    expect(send).not.toHaveBeenCalled();
  });

  it('handles close while quota admission is pending and late cleanup registration', () => {
    const { socket, input } = setup();
    const release = vi.fn();
    socket.emit('close');
    input.onClose(release);
    input.dispose();
    expect(release).toHaveBeenCalledTimes(1);
    expect(input.closed).toBe(true);
  });

  it('closes safely when upstream send fails', () => {
    const { socket, input } = setup();
    socket.emit('message', Buffer.from('hello'));
    input.activate(() => {
      throw new Error('upstream unavailable');
    });
    expect(input.closed).toBe(true);
    expect(socket.close).toHaveBeenCalledTimes(1);
  });
});
