import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { collectCappedBody, type ReadableResponseLike } from './web-search-body';

/** Fake `http.IncomingMessage`-ish stream: an EventEmitter with `destroy`. */
class FakeResponse extends EventEmitter implements ReadableResponseLike {
  destroyed = false;
  destroyError?: Error;

  destroy(error?: Error): void {
    this.destroyed = true;
    this.destroyError = error;
  }
}

describe('collectCappedBody', () => {
  it('resolves with the concatenated body on normal end', async () => {
    const res = new FakeResponse();
    const promise = collectCappedBody(res, 1024);

    res.emit('data', Buffer.from('hello '));
    res.emit('data', Buffer.from('world'));
    res.emit('end');

    const result = await promise;
    expect(result.kind).toBe('body');
    expect(result.buffer.toString('utf8')).toBe('hello world');
  });

  it('settles with too-large the instant the cap is exceeded (regression: no hang)', async () => {
    const res = new FakeResponse();
    const promise = collectCappedBody(res, 8);

    // First chunk is under the cap; second pushes total over it.
    res.emit('data', Buffer.from('1234'));
    res.emit('data', Buffer.from('56789')); // total = 9 > 8

    /*
     * The bug was that the overflow branch called res.destroy() but never
     * resolved, so this await would hang forever. It must resolve here, BEFORE
     * any 'end' event (which a destroyed stream never emits).
     */
    const result = await promise;
    expect(result.kind).toBe('too-large');
    expect(res.destroyed).toBe(true);
  });

  it('does not double-settle if events arrive after the cap is hit', async () => {
    const res = new FakeResponse();
    const promise = collectCappedBody(res, 4);

    res.emit('data', Buffer.from('toolong')); // 7 > 4 → too-large

    const result = await promise;
    expect(result.kind).toBe('too-large');

    // Late events must be no-ops (the underlying Promise can only settle once).
    expect(() => {
      res.emit('end');
      res.emit('close');
      res.emit('error', new Error('late'));
    }).not.toThrow();

    // Re-awaiting yields the same already-settled value.
    await expect(promise).resolves.toMatchObject({ kind: 'too-large' });
  });

  it('rejects when the stream errors before settling', async () => {
    const res = new FakeResponse();
    const promise = collectCappedBody(res, 1024);

    const boom = new Error('socket reset');
    res.emit('error', boom);

    await expect(promise).rejects.toBe(boom);
  });

  it('rejects when the stream closes before settling (torn-down socket)', async () => {
    const res = new FakeResponse();
    const promise = collectCappedBody(res, 1024);

    res.emit('close');

    await expect(promise).rejects.toMatchObject({ code: 'STREAM_CLOSED' });
  });

  it('a close after a normal end does not reject', async () => {
    const res = new FakeResponse();
    const promise = collectCappedBody(res, 1024);

    res.emit('data', Buffer.from('ok'));
    res.emit('end');
    res.emit('close'); // sockets emit close after end — must stay resolved

    await expect(promise).resolves.toMatchObject({ kind: 'body' });
  });

  it('rejects (never hangs) only via real signals — sanity timeout guard', async () => {
    vi.useFakeTimers();

    const res = new FakeResponse();
    const promise = collectCappedBody(res, 2);

    res.emit('data', Buffer.from('xyz')); // over cap immediately

    await expect(promise).resolves.toMatchObject({ kind: 'too-large' });

    vi.useRealTimers();
  });
});
