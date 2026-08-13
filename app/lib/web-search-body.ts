/**
 * Streaming body collector for the web-search SSRF-guarded fetch.
 *
 * Extracted from `app/routes/api.web-search.ts` so the cap-and-settle behaviour
 * can be unit-tested directly against a fake response stream (the route's real
 * `httpGetOnce` can only reach a localhost test server by going through the SSRF
 * guard, which blocks loopback — so the streaming logic was otherwise untestable).
 *
 * Contract: collect `data` chunks up to `maxBytes`. The moment the running total
 * exceeds the cap, destroy the stream and resolve `{ kind: 'too-large' }` — a
 * bare `res.destroy()` emits neither 'end' nor 'error', so without an explicit
 * settle here the awaiting caller would hang until the request timeout fires.
 */

import type { EventEmitter } from 'node:events';

/** Minimal shape of the parts of `http.IncomingMessage` this collector uses. */
export interface ReadableResponseLike extends EventEmitter {
  destroy(error?: Error): void;
}

export interface CollectBodyResult {
  kind: 'body' | 'too-large';
  buffer: Buffer;
}

/**
 * Reads a response stream into a single Buffer, enforcing `maxBytes`.
 *
 * Resolves exactly once:
 *  - `{ kind: 'body', buffer }` on normal 'end'
 *  - `{ kind: 'too-large', buffer }` the instant the cap is exceeded
 * Rejects if the stream errors, or closes before settling (torn-down socket).
 */
export function collectCappedBody(res: ReadableResponseLike, maxBytes: number): Promise<CollectBodyResult> {
  return new Promise<CollectBodyResult>((resolve, reject) => {
    const chunks: Buffer[] = [];

    let total = 0;
    let settled = false;

    const settle = (result: CollectBodyResult) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(result);
    };

    res.on('data', (chunk: Buffer) => {
      total += chunk.length;

      if (total > maxBytes) {
        res.destroy();

        /*
         * `res.destroy()` (no error) emits neither 'end' nor 'error', so we must
         * settle here or the awaiting caller hangs until the request timeout.
         */
        settle({ kind: 'too-large', buffer: Buffer.alloc(0) });

        return;
      }

      chunks.push(chunk);
    });

    res.on('end', () => settle({ kind: 'body', buffer: Buffer.concat(chunks) }));

    /*
     * Final safety net: a stream that closes without 'end' or 'error' (e.g. a
     * torn-down socket) must not leave the Promise dangling.
     */
    res.on('close', () => {
      if (!settled) {
        reject(Object.assign(new Error('Response stream closed before completion'), { code: 'STREAM_CLOSED' }));
      }
    });

    res.on('error', reject);
  });
}
