import { describe, expect, it } from 'vitest';
import { awaitTransaction } from '~/lib/hooks/awaitTransaction';

/**
 * Minimal fake of the IDBTransaction surface awaitTransaction touches.
 * Lets us drive each terminal event and assert how the promise settles.
 */
function makeFakeTransaction(error: DOMException | null = null) {
  const tx = {
    oncomplete: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onabort: null as (() => void) | null,
    error,
  };

  return tx as unknown as IDBTransaction & {
    oncomplete: (() => void) | null;
    onerror: (() => void) | null;
    onabort: (() => void) | null;
    error: DOMException | null;
  };
}

describe('awaitTransaction', () => {
  it('resolves when the transaction completes', async () => {
    const tx = makeFakeTransaction();
    const promise = awaitTransaction(tx);

    tx.oncomplete?.();

    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects when the transaction errors', async () => {
    const err = new DOMException('boom', 'UnknownError');
    const tx = makeFakeTransaction(err);
    const promise = awaitTransaction(tx);

    tx.onerror?.();

    await expect(promise).rejects.toBe(err);
  });

  /*
   * Regression: an aborted transaction fires `abort` but NOT `error`. Without an
   * onabort handler the awaited promise hangs forever (the reset-chats undo bug).
   */
  it('rejects when the transaction aborts (does not hang)', async () => {
    const err = new DOMException('quota', 'QuotaExceededError');
    const tx = makeFakeTransaction(err);
    const promise = awaitTransaction(tx);

    tx.onabort?.();

    await expect(promise).rejects.toBe(err);
  });

  it('rejects with a fallback error when aborting without tx.error', async () => {
    const tx = makeFakeTransaction(null);
    const promise = awaitTransaction(tx);

    tx.onabort?.();

    await expect(promise).rejects.toThrow('Transaction aborted');
  });

  it('wires all three terminal handlers', () => {
    const tx = makeFakeTransaction();
    awaitTransaction(tx);

    expect(typeof tx.oncomplete).toBe('function');
    expect(typeof tx.onerror).toBe('function');
    expect(typeof tx.onabort).toBe('function');
  });
});
