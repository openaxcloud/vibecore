/**
 * Serializes async work by key: calls sharing a key run strictly one-at-a-time
 * (FIFO), while calls with different keys run concurrently. Used to stop two
 * multi-agent lanes from applying a patch to the SAME file (package.json,
 * index.html) at once — the interleave that made the remote diverge from the
 * base a lane computed against, surfacing as "Remote file changed since it was
 * loaded" instead of a clean merge.
 *
 * Mirrors the per-path chaining already used by FilesStore.saveFile, extracted
 * so the patch-apply pipeline can reuse it and so the ordering guarantee is
 * unit-testable in isolation.
 */
export class KeyedMutex {
  #tails = new Map<string, Promise<unknown>>();

  /**
   * Run `task` after any in-flight task for `key` settles. Returns `task`'s
   * result (or rejection) — a failing task never blocks the queue: the next
   * task chains on completion regardless of outcome.
   */
  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.#tails.get(key) ?? Promise.resolve();

    const run = previous.then(
      () => task(),
      () => task(),
    );

    // Track a non-throwing tail so a rejection doesn't poison later chaining.
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.#tails.set(key, tail);

    try {
      return await run;
    } finally {
      // Only clear if we're still the newest tail (no one queued behind us).
      if (this.#tails.get(key) === tail) {
        this.#tails.delete(key);
      }
    }
  }
}
