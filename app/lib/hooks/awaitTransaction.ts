/**
 * Wraps an IndexedDB transaction in a Promise that settles when the
 * transaction terminates.
 *
 * An IndexedDB transaction can finish in three ways:
 *  - `complete` — every request succeeded (resolve)
 *  - `error`    — an unhandled request error bubbled up (reject)
 *  - `abort`    — the transaction was aborted, e.g. QuotaExceededError or a
 *                 constraint abort that bypasses a per-request preventDefault
 *                 (reject)
 *
 * Wiring only `oncomplete`/`onerror` is a latent hang: an aborted transaction
 * fires `abort` but NOT `error`, so a Promise that lacks `onabort` never
 * settles. This helper always wires all three so callers can safely `await` it.
 */
export function awaitTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'));
  });
}
